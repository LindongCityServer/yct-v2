'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentPropsWithoutRef,
} from 'react';
import { appPath } from '../lib/app-paths';

interface MaterialSymbolProps extends ComponentPropsWithoutRef<'span'> {
  name: string;
  preview?: boolean;
}

const readyAssetPaths = new Set<string>();
const pendingAssetLoads = new Map<string, Promise<boolean>>();

// 本地字体子集未收录、但 public/material-symbols/outlined 里有静态 SVG 的图标。
// 优先用静态 SVG 兜底，避免 ligature 退化成普通文字。
const staticAssetFallbackNames = new Set(['wc']);

export function MaterialSymbol({
  name,
  preview = false,
  className,
  style,
  ...props
}: MaterialSymbolProps) {
  const normalizedName = useMemo(() => normalizeName(name), [name]);
  const primaryAssetPath = useMemo(() => {
    if (!normalizedName) {
      return '';
    }
    return preview
      ? appPath(`/api/admin/material-symbols/preview?name=${encodeURIComponent(normalizedName)}`)
      : appPath(`/api/material-symbols/${encodeURIComponent(normalizedName)}`);
  }, [normalizedName, preview]);
  const staticFallbackPath = useMemo(() => {
    if (!normalizedName || !staticAssetFallbackNames.has(normalizedName)) {
      return '';
    }
    return appPath(`/material-symbols/outlined/${encodeURIComponent(normalizedName)}.svg`);
  }, [normalizedName]);
  const assetCandidates = useMemo(
    () =>
      (staticFallbackPath ? [staticFallbackPath, primaryAssetPath] : [primaryAssetPath]).filter(
        Boolean,
      ),
    [primaryAssetPath, staticFallbackPath],
  );
  const [resolvedAssetPath, setResolvedAssetPath] = useState(
    () => assetCandidates.find((path) => readyAssetPaths.has(path)) ?? '',
  );
  // wc 等静态兜底图标直接在 SSR/首屏用蒙版渲染，不依赖 effect 加载结果。
  const effectiveAssetPath = staticFallbackPath || resolvedAssetPath;

  useEffect(() => {
    if (staticFallbackPath) {
      return undefined;
    }
    const cachedPath = assetCandidates.find((path) => readyAssetPaths.has(path));
    setResolvedAssetPath(cachedPath ?? '');
    if (cachedPath || assetCandidates.length === 0) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(
      () => {
        void loadFirstAvailableAsset(assetCandidates).then((path) => {
          if (active) {
            setResolvedAssetPath(path ?? '');
          }
        });
      },
      preview ? 250 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [assetCandidates, preview, staticFallbackPath]);

  const assetStyle: CSSProperties = effectiveAssetPath
    ? {
        backgroundColor: 'currentColor',
        height: '1em',
        WebkitMaskImage: `url(${effectiveAssetPath})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskImage: `url(${effectiveAssetPath})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        width: '1em',
      }
    : {};

  return (
    <span
      {...props}
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      data-material-symbol-mask={effectiveAssetPath ? '' : undefined}
      style={{ ...style, ...(effectiveAssetPath ? { width: '1em', height: '1em' } : {}) }}
    >
      {/* 蒙版只裁剪内层图形，让外层的可读性阴影完整显示。 */}
      {effectiveAssetPath ? (
        <span aria-hidden="true" style={{ ...assetStyle, display: 'block' }} />
      ) : (
        name
      )}
    </span>
  );
}

async function loadFirstAvailableAsset(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (await loadAsset(path)) {
      return path;
    }
  }
  return undefined;
}

function normalizeName(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_]{1,80}$/u.test(normalized) ? normalized : undefined;
}

function loadAsset(assetPath: string): Promise<boolean> {
  if (readyAssetPaths.has(assetPath)) {
    return Promise.resolve(true);
  }

  const pending = pendingAssetLoads.get(assetPath);
  if (pending) {
    return pending;
  }

  const request = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = assetPath;
  }).then((ready) => {
    pendingAssetLoads.delete(assetPath);
    if (ready) {
      readyAssetPaths.add(assetPath);
    }
    return ready;
  });
  pendingAssetLoads.set(assetPath, request);
  return request;
}
