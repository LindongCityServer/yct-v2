import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readImagePlaceholder } from '../apps/web/lib/image-placeholder';

/**
 * 为存量图片预热低清占位（32/64 两档）。
 *
 * 展示端通过 /api/image-placeholder 按需生成并缓存；这个脚本用于部署前把已有
 * legacy-assets、content-assets 和 POI 投稿图片先跑一遍，避免首访才解码大图。
 *
 * 用法：
 *   pnpm images:placeholders
 */

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const placeholderWidths = [32, 64];

const sources = [
  { directory: path.join('apps', 'web', 'public', 'legacy-assets'), prefix: '/legacy-assets' },
  { directory: path.join('apps', 'web', 'public', 'content-assets'), prefix: '/content-assets' },
  {
    directory: path.join('.yct-data', 'poi-submission-images'),
    prefix: '/api/map/poi-submission-images',
  },
];

let total = 0;
let warmed = 0;
let skipped = 0;
let failed = 0;

for (const source of sources) {
  const directory = path.resolve(process.cwd(), source.directory);
  const files = await collectImageFiles(directory);
  if (files.length === 0) {
    console.log(`${source.directory}: 没有图片`);
    continue;
  }

  console.log(`${source.directory}: ${files.length} 张图片`);
  for (const filePath of files) {
    total += 1;
    const relativePath = path.relative(directory, filePath).split(path.sep).join('/');
    const publicPath = `${source.prefix}/${relativePath}`;

    let results = 0;
    for (const width of placeholderWidths) {
      const placeholder = await readImagePlaceholder({ url: publicPath, width });
      if (placeholder) {
        results += 1;
      }
    }

    if (results === 0) {
      failed += 1;
      console.warn(`  跳过（无法生成）：${publicPath}`);
    } else if (results < placeholderWidths.length) {
      skipped += 1;
    } else {
      warmed += 1;
    }
  }
}

console.log(`完成：共 ${total} 张，成功 ${warmed} 张，部分失败 ${skipped} 张，失败 ${failed} 张。`);

if (failed > 0) {
  process.exitCode = 1;
}

async function collectImageFiles(directory: string): Promise<string[]> {
  try {
    const directoryStat = await stat(directory);
    if (!directoryStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectImageFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
}
