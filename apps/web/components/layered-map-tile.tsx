'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

interface LayeredMapTileProps {
  className: string;
  fallbackUrl?: string | null;
  freshUrl?: string | null;
  loading?: 'eager' | 'lazy';
  style?: CSSProperties;
  tileKey: string;
}

/**
 * 先显示可用的静态瓦片，再以同源代理请求较新瓦片。
 * 代理返回透明占位瓦片时会通过 X-YCT-Tile-Empty 标记失败，继续保留静态底图。
 */
export function LayeredMapTile({
  className,
  fallbackUrl,
  freshUrl,
  loading = 'lazy',
  style,
  tileKey,
}: Readonly<LayeredMapTileProps>) {
  const [freshObjectUrl, setFreshObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    setFreshObjectUrl(null);
    if (!freshUrl || freshUrl === fallbackUrl) {
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    let cancelled = false;

    void fetch(freshUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const emptyReason = response.headers.get('X-YCT-Tile-Empty');
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || emptyReason || !contentType.toLowerCase().startsWith('image/')) {
          throw new Error('fresh tile unavailable');
        }

        return response.blob();
      })
      .then((blob) => {
        if (!blob.type.toLowerCase().startsWith('image/')) {
          throw new Error('fresh tile is not an image');
        }

        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
          return;
        }

        setFreshObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setFreshObjectUrl(null);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fallbackUrl, freshUrl, tileKey]);

  return (
    <>
      {fallbackUrl ? (
        <img
          alt=""
          className={`${className} is-fallback`}
          draggable={false}
          loading={loading}
          src={fallbackUrl}
          style={style}
        />
      ) : null}
      {freshObjectUrl ? (
        <img
          alt=""
          className={`${className} is-fresh`}
          draggable={false}
          loading="eager"
          src={freshObjectUrl}
          style={style}
        />
      ) : null}
    </>
  );
}
