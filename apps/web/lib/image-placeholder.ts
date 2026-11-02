import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

/**
 * 低清占位图（LQIP）服务端生成与缓存。
 *
 * 为什么不直接用 Next 的 /_next/image：
 * - 优化器对上游抓图固定 7 秒超时，线上大图（数 MB 的 PNG）经常直接 500；
 * - 冷缓存时要先取完整原图，低清层反而晚于原图出现。
 *
 * 这里只做 32/64/96/128 四档、只读本地文件，并把结果按“文件路径 + mtime + 大小 + 宽度”
 * 缓存在磁盘上，避免每次首访重新解码原图。缓存目录默认放在部署根 .yct-data 下。
 */

// sharp 是原生模块，交给 Node 运行期按真实 node_modules 解析；
// 静态 import 会被 Turbopack 改写成带哈希的外部模块名，在 next dev 下解析失败。
const requireFromHere = createRequire(import.meta.url);

const placeholderWidths = new Set([32, 64, 96, 128]);
const maxSourceBytes = 24 * 1024 * 1024;
const maxInputPixels = 100_000_000;
const placeholderCacheDirectoryName = '.yct-data/image-placeholders';

export interface ImagePlaceholder {
  bytes: Buffer;
  contentType: 'image/webp';
}

export async function readImagePlaceholder(input: {
  url: string;
  width: number;
}): Promise<ImagePlaceholder | undefined> {
  const width = normalizePlaceholderWidth(input.width);
  if (!width) {
    return undefined;
  }

  const sourcePath = resolveLocalImagePath(input.url);
  if (!sourcePath) {
    return undefined;
  }

  try {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > maxSourceBytes) {
      return undefined;
    }

    const cacheKey = createHash('sha256')
      .update(
        `${sourcePath}\u0000${Math.round(sourceStat.mtimeMs)}\u0000${sourceStat.size}\u0000${width}`,
      )
      .digest('hex');
    const cacheDirectory = resolvePlaceholderCacheDirectory();
    const cachePath = path.join(cacheDirectory, `${cacheKey}.webp`);
    const cached = await readFile(cachePath).catch(() => undefined);
    if (cached) {
      return { bytes: cached, contentType: 'image/webp' };
    }

    const sharp = requireFromHere('sharp') as typeof import('sharp');
    const bytes = await sharp(sourcePath, {
      limitInputPixels: maxInputPixels,
      sequentialRead: true,
    })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();

    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, bytes);
    return { bytes, contentType: 'image/webp' };
  } catch {
    return undefined;
  }
}

/**
 * 上传或迁移完成后的预热入口：生成前端首档常用的 32/64 两档。
 * 失败不影响主流程，后续首次访问仍会按需生成。
 */
export async function warmImagePlaceholderByPublicPath(publicPath: string): Promise<void> {
  for (const width of [32, 64]) {
    await readImagePlaceholder({ url: publicPath, width }).catch(() => undefined);
  }
}

function normalizePlaceholderWidth(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const width = Math.round(value);
  return placeholderWidths.has(width) ? width : undefined;
}

function resolveLocalImagePath(url: string): string | undefined {
  if (!url.startsWith('/') || url.startsWith('//')) {
    return undefined;
  }

  let pathname: string;
  try {
    pathname = new URL(url, 'https://yct.local').pathname;
  } catch {
    return undefined;
  }

  const decoded = safeDecodeURIComponent(pathname);
  if (!decoded || decoded.includes('\u0000')) {
    return undefined;
  }

  const publicRoot = resolveWebPublicRoot();
  if (decoded.startsWith('/legacy-assets/')) {
    return resolveInside(
      path.join(publicRoot, 'legacy-assets'),
      decoded.slice('/legacy-assets/'.length),
    );
  }

  const config = readRuntimeConfig();
  if (decoded.startsWith('/content-assets/')) {
    return resolveInside(
      resolveConfiguredPath(config.contentAssetUploadDir),
      decoded.slice('/content-assets/'.length),
    );
  }

  if (decoded.startsWith('/api/map/poi-submission-images/')) {
    return resolveInside(
      resolveConfiguredPath(config.poiSubmissionImageUploadDir),
      decoded.slice('/api/map/poi-submission-images/'.length),
    );
  }

  return undefined;
}

function resolveInside(root: string, relativePath: string): string | undefined {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    return undefined;
  }

  return target;
}

function resolveConfiguredPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function resolveWebPublicRoot(): string {
  const cwdPublicRoot = path.join(process.cwd(), 'public');
  if (existsSync(cwdPublicRoot)) {
    return cwdPublicRoot;
  }

  // Next standalone 的 cwd 是 apps/web；构建脚本的 cwd 可能是仓库根。
  return path.join(process.cwd(), 'apps', 'web', 'public');
}

function resolvePlaceholderCacheDirectory(): string {
  const configured = process.env.YCT_IMAGE_PLACEHOLDER_CACHE_DIR?.trim();
  const runtimeRoot = process.env.YCT_RUNTIME_ROOT?.trim();
  const target = configured || placeholderCacheDirectoryName;

  if (path.isAbsolute(target)) {
    return target;
  }
  if (runtimeRoot) {
    return path.resolve(runtimeRoot, target);
  }

  return path.join(process.cwd(), target);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
