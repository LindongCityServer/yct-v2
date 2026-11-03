import { appBasePath } from './app-paths';

/** 与 next.config.mjs 的 images.remotePatterns 保持同步；未命中的远程图不做优化。 */
export const progressiveImageAllowedRemoteHosts = [
  'minotar.net',
  'mc-heads.net',
  'shangxiaoguan.top',
] as const;

export interface ProgressiveImageSourceOptions {
  /** 站点 basePath；默认取构建期的 NEXT_PUBLIC_YCT_BASE_PATH。 */
  basePath?: string;
  /** 当前站点 origin；浏览器内默认取 window.location.origin。 */
  origin?: string;
  allowedRemoteHosts?: readonly string[];
}

export function isProgressiveImageRemoteAllowed(
  src: string,
  allowedRemoteHosts: readonly string[] = progressiveImageAllowedRemoteHosts,
): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return allowedRemoteHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * 生成 Next 图片优化器地址。来源不在白名单、SVG、data/blob 或已是优化地址时返回 undefined，
 * 调用方应回退到原始地址，避免向优化器发出必然失败的请求。
 */
export function buildProgressiveImageOptimizerSrc(
  src: string,
  width: number,
  options: ProgressiveImageSourceOptions = {},
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
  const allowedRemoteHosts = options.allowedRemoteHosts ?? progressiveImageAllowedRemoteHosts;
  if (/^https?:\/\//i.test(src) && !isProgressiveImageRemoteAllowed(src, allowedRemoteHosts)) {
    return undefined;
  }

  const basePath = options.basePath ?? appBasePath;
  // 优化器在应用内部按“自己的 origin + url”取图，因此本地路径要去掉外部 basePath。
  const optimizerSource = toOptimizerSource(src, basePath);
  let source = optimizerSource;
  // content-assets 由反向代理直接托管，不在 Node 的 public 目录里；优化器按相对路径
  // 抓取只会拿到 404 HTML（线上表现为 400），必须改用同源绝对地址。
  // 无法确认同源域名时返回 undefined，让调用方回退原图，而不是发一个必然失败的请求。
  // 其余站内路径（legacy-assets、应用内的图片路由）保持相对路径，让优化器走内部读取，
  // 避免为了一张缩略图再经公网域名绕一圈。
  if (optimizerSource.startsWith('/content-assets/')) {
    const sameOriginSrc = toSameOriginAbsoluteSrc(
      optimizerSource,
      options.origin,
      allowedRemoteHosts,
    );
    if (!sameOriginSrc) {
      return undefined;
    }
    source = sameOriginSrc;
  }

  const params = new URLSearchParams({ url: source, w: String(width), q: '75' });

  const pathname = `/_next/image?${params.toString()}`;
  return basePath ? `${basePath}${pathname}` : pathname;
}

/**
 * 站内相对路径转同源绝对地址。
 * 仅当当前站点域名在优化器白名单内时启用，否则退回相对路径，避免优化器拒绝请求。
 */
function toSameOriginAbsoluteSrc(
  src: string,
  origin: string | undefined,
  allowedRemoteHosts: readonly string[],
): string | undefined {
  if (!src.startsWith('/')) {
    return undefined;
  }

  const resolvedOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (!resolvedOrigin) {
    return undefined;
  }

  try {
    const absolute = new URL(src, resolvedOrigin).href;
    return isProgressiveImageRemoteAllowed(absolute, allowedRemoteHosts) ? absolute : undefined;
  } catch {
    return undefined;
  }
}

function toOptimizerSource(src: string, basePath: string): string {
  if (src.startsWith('/') && basePath && (src === basePath || src.startsWith(`${basePath}/`))) {
    return src.slice(basePath.length) || '/';
  }

  return src;
}
