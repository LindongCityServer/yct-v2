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

export function MaterialSymbol({
  name,
  preview = false,
  className,
  style,
  ...props
}: MaterialSymbolProps) {
  const normalizedName = useMemo(() => normalizeName(name), [name]);
  const assetPath = useMemo(() => {
    if (!normalizedName) {
      return '';
    }
    return preview
      ? appPath(`/api/admin/material-symbols/preview?name=${encodeURIComponent(normalizedName)}`)
      : appPath(`/api/material-symbols/${encodeURIComponent(normalizedName)}`);
  }, [normalizedName, preview]);
  const [assetReady, setAssetReady] = useState(() => readyAssetPaths.has(assetPath));

  useEffect(() => {
    setAssetReady(readyAssetPaths.has(assetPath));
    if (!assetPath) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(
      () => {
        void loadAsset(assetPath).then((ready) => {
          if (active) {
            setAssetReady(ready);
          }
        });
      },
      preview ? 250 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [assetPath, preview]);

  const assetStyle: CSSProperties = assetReady
    ? {
        backgroundColor: 'currentColor',
        height: '1em',
        WebkitMaskImage: `url(${assetPath})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskImage: `url(${assetPath})`,
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
      style={{ ...style, ...assetStyle }}
    >
      {assetReady ? '' : name}
    </span>
  );
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
