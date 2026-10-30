'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { appBasePath, appPath } from '../lib/app-paths';

type ProgressiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /**
   * 可选的自定义低清占位图。不传时自动走 Next 图片优化器生成分级快照。
   */
  placeholderSrc?: string;
  /** 是否在低清快照阶段显示右上角加载图标；头像等小图可关闭。 */
  showStatus?: boolean;
  src: string;
};

// 每一级都是上一级的两倍；取最后 3 档时，第一级天然是第二级的一半。
const ladderWidths = [32, 64, 128, 256, 512, 1024];
const maxLadderLevels = 3;
const maxPreviewWidth = 1024;
// 与 next.config.mjs 的 images.remotePatterns 保持同步；未命中的远程图不做 LQIP。
const allowedRemoteHosts = ['minotar.net', 'mc-heads.net', 'shangxiaoguan.top'];

/**
 * 内容图片的多级 LQIP 渐进加载：
 *
 * 1. 先用 32px 快照占位，并立即显示；
 * 2. 图片接近视口后，按渲染尺寸依次预加载 1–2 档中间分辨率（128 / 256 / 384 / 640 / 1080）；
 *   每一档就绪后就替换背景层，缩小“32px 直接跳原图”的落差；
 * 3. 原图始终通过原生 loading/decoding 正常加载，解码完成后覆盖背景层。
 *
 * 不做“加载完成后再降低模糊度”的动画；低清层只负责加载期间的可见性。
 * 只用于内容图，图标、地图瓦片、二维码、电报纸/物料模板不要使用。
 */
export function ProgressiveImage({
  className,
  decoding = 'async',
  loading,
  onError,
  onLoad,
  placeholderSrc,
  showStatus = true,
  src,
  style,
  ...props
}: Readonly<ProgressiveImageProps>) {
  const imageRef = useRef<HTMLImageElement>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState<{ src: string; url?: string }>(() => ({
    src,
    url: placeholderSrc,
  }));

  const loaded = loadedSrc === src;
  // SSR 阶段没有渲染尺寸，先给自定义占位或中性底色；挂载后再换成阶梯的第一档。
  const initialPlaceholder = placeholderSrc;
  const commitLoaded = () => {
    loadedSrcRef.current = src;
    setLoadedSrc(src);
  };
  // src 切换时不要短暂沿用上一张图的高清占位。
  const placeholderUrl = loaded
    ? undefined
    : placeholder.src === src
      ? placeholder.url
      : initialPlaceholder;

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return undefined;
    }

    if (loadedSrcRef.current === src) {
      return undefined;
    }

    // 命中缓存的图片不会再触发 load，挂载后同步一次并跳过分级预加载。
    if (image.complete && image.naturalWidth > 0) {
      loadedSrcRef.current = src;
      setLoadedSrc(src);
      return undefined;
    }

    const widths = resolveLadderWidths(image);
    // 挂载后立即显示阶梯第一档（此时渲染尺寸已知），避免 SSR 的 32px 直接跳大图。
    setPlaceholder({
      src,
      url: placeholderSrc ?? buildOptimizerSrc(src, widths[0]),
    });

    let cancelled = false;
    let index = 1;

    const loadNext = () => {
      if (cancelled || index >= widths.length || loadedSrcRef.current === src) {
        return;
      }

      const width = widths[index++];
      const nextUrl = buildOptimizerSrc(src, width);
      if (!nextUrl) {
        loadNext();
        return;
      }

      const preloader = new Image();
      preloader.decoding = 'async';
      preloader.onload = () => {
        if (cancelled || loadedSrcRef.current === src) {
          return;
        }
        setPlaceholder({ src, url: nextUrl });
        loadNext();
      };
      preloader.onerror = () => {
        if (!cancelled) {
          loadNext();
        }
      };
      preloader.src = nextUrl;
    };

    let observer: IntersectionObserver | undefined;
    const start = () => {
      observer?.disconnect();
      observer = undefined;
      loadNext();
    };

    if (loading === 'lazy' && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            start();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(image);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [loading, placeholderSrc, src]);

  return (
    <>
      <img
        {...props}
        ref={imageRef}
        className={['yct-progressive-image', loaded ? 'is-loaded' : '', className]
          .filter(Boolean)
          .join(' ')}
        decoding={decoding}
        loading={loading}
        src={src}
        style={
          placeholderUrl
            ? {
                ...style,
                backgroundImage: `url("${placeholderUrl}")`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
              }
            : style
        }
        onError={(event) => {
          commitLoaded();
          onError?.(event);
        }}
        onLoad={(event) => {
          const image = event.currentTarget;
          // 等浏览器真正解码完再移除低清层，避免高分辨率图尚未上屏时闪一下底色。
          if (typeof image.decode === 'function') {
            void image.decode().then(commitLoaded).catch(commitLoaded);
          } else {
            commitLoaded();
          }
          onLoad?.(event);
        }}
      />
      {showStatus && placeholderUrl ? (
        <span className="yct-progressive-status" aria-hidden="true">
          <span className="material-symbols-outlined">progress_activity</span>
        </span>
      ) : null}
    </>
  );
}

/**
 * 根据图片实际渲染宽度，从 32/64/128/256/512/1024 里取最后 3 档。
 * 因为每一档都是上一档的两倍，第一档天然是第二档的一半。
 */
function resolveLadderWidths(image: HTMLImageElement): number[] {
  const renderedWidth = image.clientWidth || image.getBoundingClientRect().width || 640;
  const targetWidth = Math.min(
    Math.max(renderedWidth * (window.devicePixelRatio || 1), ladderWidths[0]),
    2048,
  );
  const eligible = ladderWidths.filter(
    (width) => width <= Math.min(targetWidth * 0.9, maxPreviewWidth),
  );

  return (eligible.length ? eligible : [ladderWidths[0]]).slice(-maxLadderLevels);
}

function buildOptimizerSrc(src: string, width: number): string | undefined {
  if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('//')) {
    return undefined;
  }
  if (/\.svg(?:[?#]|$)/i.test(src) || src.includes('/_next/image')) {
    return undefined;
  }
  if (!src.startsWith('/') && !/^https?:\/\//i.test(src)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(src) && !isAllowedRemoteImage(src)) {
    return undefined;
  }

  const params = new URLSearchParams({
    // 优化器在应用内部按“自己的 origin + url”取图，因此本地路径要去掉外部 basePath。
    url: toOptimizerSource(src),
    w: String(width),
    q: '75',
  });
  // 运行时上传的图片由反向代理直接托管，不在 Node 的 public 目录里；
  // 优化器按相对路径抓取只会拿到 404 HTML（线上表现为 400），必须改用同源绝对地址。
  const sameOriginSrc = toSameOriginAbsoluteSrc(src);
  if (sameOriginSrc) {
    params.set('url', sameOriginSrc);
  }
  return appPath(`/_next/image?${params.toString()}`);
}

/**
 * 站内相对路径转同源绝对地址。
 * 仅当当前站点域名在优化器白名单内时启用，否则退回相对路径，避免优化器拒绝请求。
 */
function toSameOriginAbsoluteSrc(src: string): string | undefined {
  if (!src.startsWith('/') || typeof window === 'undefined') {
    return undefined;
  }

  const absolute = new URL(src, window.location.origin).href;
  return isAllowedRemoteImage(absolute) ? absolute : undefined;
}

function toOptimizerSource(src: string): string {
  if (
    src.startsWith('/') &&
    appBasePath &&
    (src === appBasePath || src.startsWith(`${appBasePath}/`))
  ) {
    return src.slice(appBasePath.length) || '/';
  }

  return src;
}

function isAllowedRemoteImage(src: string): boolean {
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
