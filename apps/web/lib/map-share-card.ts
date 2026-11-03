import { appBasePath } from './app-paths';

/** 与 next.config.mjs 的 images.remotePatterns 保持同步。 */
const shareImageAllowedRemoteHosts = ['minotar.net', 'mc-heads.net', 'shangxiaoguan.top'];

/** 分享卡片简介的最大展示长度（按 Unicode 码点计，含结尾省略号）。 */
export const mapShareDescriptionMaxLength = 180;

export interface MapShareImageSourceOptions {
  basePath?: string;
  origin?: string;
}

/**
 * 分享图使用的站内优化地址。
 * 只接受可被 `/_next/image` 处理且不污染导出画布的来源；无法优化时返回 undefined，
 * 调用方应直接不展示配图，而不是渲染一张会失败或被跨域污染的图片。
 */
export function buildShareImagePreviewSrc(
  src: string,
  options: MapShareImageSourceOptions = {},
): string | undefined {
  if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('//')) {
    return undefined;
  }
  if (/\.svg(?:[?#]|$)/i.test(src) || src.includes('/_next/image')) {
    return undefined;
  }
  if (!src.startsWith('/') && !/^https?:\/\//i.test(src)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(src) && !isAllowedShareImageRemoteHost(src)) {
    return undefined;
  }

  const basePath = options.basePath ?? appBasePath;
  const optimizerSource = stripBasePath(src, basePath);
  let source = optimizerSource;
  // content-assets 由反向代理托管，不在 Node 的 public 目录；必须用同源绝对地址，
  // 否则优化器会拿到 404。无法确认同源域名时宁可不展示。
  if (optimizerSource.startsWith('/content-assets/')) {
    const absolute = resolveSameOriginAllowedSrc(optimizerSource, options.origin);
    if (!absolute) {
      return undefined;
    }
    source = absolute;
  }

  const params = new URLSearchParams({ url: source, w: '1024', q: '75' });
  const pathname = `/_next/image?${params.toString()}`;
  return basePath ? `${basePath}${pathname}` : pathname;
}

function stripBasePath(src: string, basePath: string): string {
  if (src.startsWith('/') && basePath && (src === basePath || src.startsWith(`${basePath}/`))) {
    return src.slice(basePath.length) || '/';
  }

  return src;
}

function resolveSameOriginAllowedSrc(src: string, origin: string | undefined): string | undefined {
  const resolvedOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (!resolvedOrigin) {
    return undefined;
  }

  try {
    const absolute = new URL(src, resolvedOrigin).href;
    return isAllowedShareImageRemoteHost(absolute) ? absolute : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedShareImageRemoteHost(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return shareImageAllowedRemoteHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * 分享卡片简介：折叠空白、去掉首尾空格，超长时截断并以省略号结尾。
 * 结果只包含纯文本，调用方按普通文本区块渲染，不再包胶囊。
 */
export function buildMapShareDescription(raw: string | null | undefined): string | undefined {
  const normalized = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  const characters = Array.from(normalized);
  if (characters.length <= mapShareDescriptionMaxLength) {
    return normalized;
  }

  return `${characters
    .slice(0, mapShareDescriptionMaxLength - 1)
    .join('')
    .trimEnd()}…`;
}
