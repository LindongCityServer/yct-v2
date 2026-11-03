'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { appBasePath, appPath } from '../lib/app-paths';
import { buildProgressiveImageOptimizerSrc } from '../lib/progressive-image-source';

type ProgressiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /**
   * 首屏前景图的最大展示宽度。设置后前景图改走 Next 优化器，避免直接下载原图；
   * 来源不可优化时仍回退到原始地址。
   */
  maxDisplayWidth?: number;
  /**
   * 可选的自定义低清占位图。不传时使用站内低清占位接口生成 32px 快照。
   */
  placeholderSrc?: string;
  /** 是否在低清快照阶段显示右上角加载图标；头像等小图可关闭。 */
  showStatus?: boolean;
  /**
   * 越靠后的轮播项先不请求低清快照，等真正激活后再加载。
   * 首页 hero 一次会渲染多张，全部提前请求会把优化器与带宽打满。
   */
  deferPlaceholder?: boolean;
  src: string;
};

// 每一级都是上一级的两倍；取最后 3 档时，第一级天然是第二级的一半。
const ladderWidths = [32, 64, 128, 256, 512, 1024];
const maxLadderLevels = 3;
const maxPreviewWidth = 1024;
// 低清首档固定用 32px，保证占位请求本身足够小、生成足够快。
const firstPlaceholderWidth = 32;

/**
 * 内容图片的多级 LQIP 渐进加载：
 *
 * 1. 先用 32px 快照占位，并立即显示；
 * 2. 图片接近视口后，按渲染尺寸依次预加载 1–2 档中间分辨率（128 / 256 / 384 / 640 / 1080）；
 *   每一档就绪后就替换背景层，缩小“32px 直接跳原图”的落差；
 * 3. 原图始终通过原生 loading/decoding 正常加载，解码完成后覆盖背景层。
 *
 * 低清首档走站内 /api/image-placeholder，直接读本地文件并缓存，避免 Next 优化器
 * 在冷缓存时为生成缩略图去抓完整原图（大图会 7 秒超时并直接 500）。
 * 中间档仍走 Next 优化器；任意一档失败后立即停止，不连续触发多次超时请求。
 */
export function ProgressiveImage({
  className,
  decoding = 'async',
  deferPlaceholder = false,
  loading,
  maxDisplayWidth,
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

  // 前景图使用展示宽度的优化图；无法优化时保持原图，避免出现必然 400 的请求。
  const optimizerSrc = maxDisplayWidth
    ? buildProgressiveImageOptimizerSrc(src, maxDisplayWidth)
    : undefined;
  // 优化器运行时失败（域名未放行、上游超时等）时退回原图重试一次，避免主图直接破图。
  const [optimizerFallbackSrc, setOptimizerFallbackSrc] = useState<string | null>(null);
  const foregroundSrc =
    optimizerFallbackSrc === src ? src : (optimizerSrc ?? src);
  const loaded = loadedSrc === foregroundSrc;
  // SSR 阶段没有渲染尺寸，先给自定义占位或中性底色；挂载后再换成阶梯的第一档。
  const initialPlaceholder = placeholderSrc;
  const commitLoaded = () => {
    loadedSrcRef.current = foregroundSrc;
    setLoadedSrc(foregroundSrc);
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

    if (loadedSrcRef.current === foregroundSrc) {
      return undefined;
    }

    // 命中缓存的图片不会再触发 load，挂载后同步一次并跳过分级预加载。
    if (image.complete && image.naturalWidth > 0) {
      loadedSrcRef.current = foregroundSrc;
      setLoadedSrc(foregroundSrc);
      return undefined;
    }

    // 非激活轮播项等激活后（deferPlaceholder 变为 false）再请求低清快照。
    if (deferPlaceholder) {
      return undefined;
    }

    const widths = resolveLadderWidths(image);
    let cancelled = false;
    let observer: IntersectionObserver | undefined;

    const startLadder = () => {
      let index = 0;
      const loadNext = () => {
        if (cancelled || index >= widths.length || loadedSrcRef.current === foregroundSrc) {
          return;
        }

        const width = widths[index++];
        const nextUrl = buildProgressiveImageOptimizerSrc(src, width);
        if (!nextUrl) {
          return;
        }

        const preloader = new Image();
        preloader.decoding = 'async';
        preloader.onload = () => {
          if (cancelled || loadedSrcRef.current === foregroundSrc) {
            return;
          }
          setPlaceholder({ src, url: nextUrl });
          loadNext();
        };
        preloader.onerror = () => {
          // 任意一档失败就停止；继续请求只会让同一张图反复触发服务端超时。
        };
        preloader.src = nextUrl;
      };

      loadNext();
    };

    const loadFirstPlaceholder = () => {
      const firstUrl = placeholderSrc ?? buildPlaceholderSrc(src, firstPlaceholderWidth);
      if (!firstUrl) {
        startLadder();
        return;
      }

      const first = new Image();
      first.decoding = 'async';
      first.onload = () => {
        if (cancelled || loadedSrcRef.current === foregroundSrc) {
          return;
        }
        setPlaceholder({ src, url: firstUrl });
        startLadder();
      };
      first.onerror = () => {
        // 占位不可用时保留原图加载，不再尝试中间档，避免连续失败请求。
        if (!cancelled) {
          setPlaceholder({ src, url: undefined });
        }
      };
      first.src = firstUrl;
    };

    const start = () => {
      observer?.disconnect();
      observer = undefined;
      loadFirstPlaceholder();
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
  }, [deferPlaceholder, foregroundSrc, loading, placeholderSrc, src]);

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
        src={foregroundSrc}
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
          // 优化地址失败时先退回原图重试；原图也失败才按加载失败处理。
          if (optimizerSrc && foregroundSrc !== src && optimizerFallbackSrc !== src) {
            setOptimizerFallbackSrc(src);
            return;
          }
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
    (width) =>
      width > firstPlaceholderWidth && width <= Math.min(targetWidth * 0.9, maxPreviewWidth),
  );

  return eligible.slice(-maxLadderLevels);
}

/**
 * 低清首档：走站内占位接口，服务端直接读本地文件并缓存。
 */
function buildPlaceholderSrc(src: string, width: number): string | undefined {
  if (!src.startsWith('/') || src.startsWith('//')) {
    return undefined;
  }
  if (/\.svg(?:[?#]|$)/i.test(src) || src.includes('/_next/image')) {
    return undefined;
  }

  const params = new URLSearchParams({
    url: toOptimizerSource(src),
    w: String(width),
  });
  return appPath(`/api/image-placeholder?${params.toString()}`);
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
