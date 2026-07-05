import { NextRequest, NextResponse } from 'next/server';
import {
  buildUnminedTileTemplate,
  fillMapTileTemplate,
  type MapTileProxySource,
} from '../../../../lib/map-tile-templates';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export const dynamic = 'force-dynamic';

const tileCoordinatePattern = /^-?\d+$/;
const imageContentTypePattern = /^image\//i;
const transparentTileSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"></svg>';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const source = readTileSource(searchParams.get('source'));
  const z = readTileCoordinate(searchParams.get('z'));
  const x = readTileCoordinate(searchParams.get('x'));
  const y = readTileCoordinate(searchParams.get('y'));
  const xd = readTileCoordinate(searchParams.get('xd')) ?? x;
  const yd = readTileCoordinate(searchParams.get('yd')) ?? y;

  if (!source || !z || !x || !y || !xd || !yd) {
    return NextResponse.json(
      { meta: { status: 'error', message: '瓦片代理参数无效。' } },
      { status: 400 },
    );
  }

  const template = resolveSourceTemplate(source);
  if (!template) {
    return NextResponse.json(
      { meta: { status: 'not_configured', message: '瓦片代理源尚未配置。' } },
      { status: 404 },
    );
  }

  const upstreamUrl = fillMapTileTemplate(template, { z, x, y, xd, yd });

  try {
    const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });
    if (upstreamResponse.status === 404 || upstreamResponse.status === 204) {
      return createTransparentTileResponse('not-found');
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return createTransparentTileResponse(`upstream-${upstreamResponse.status}`);
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'image/jpeg';
    if (!imageContentTypePattern.test(contentType)) {
      return createTransparentTileResponse('invalid-content-type');
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: createTileResponseHeaders(contentType, upstreamResponse.headers),
    });
  } catch {
    return createTransparentTileResponse('upstream-unavailable');
  }
}

function readTileSource(value: string | null): MapTileProxySource | null {
  if (value === 'fresh-http' || value === 'safe-https-static' || value === 'unmined-static') {
    return value;
  }

  return null;
}

function readTileCoordinate(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized || !tileCoordinatePattern.test(normalized)) {
    return null;
  }

  return normalized;
}

function resolveSourceTemplate(source: MapTileProxySource): string | null {
  const config = readRuntimeConfig();

  if (source === 'fresh-http') {
    return config.tileFreshHttpTemplate ?? null;
  }

  if (source === 'safe-https-static') {
    return config.tileSafeHttpsStaticTemplate ?? null;
  }

  if (source === 'unmined-static') {
    return config.unminedMapBaseUrl ? buildUnminedTileTemplate(config.unminedMapBaseUrl) : null;
  }

  return null;
}

function createTileResponseHeaders(
  contentType: string,
  upstreamHeaders?: Headers,
  emptyReason?: string,
): Headers {
  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'Content-Type': contentType,
  });

  const etag = upstreamHeaders?.get('etag');
  if (etag) {
    headers.set('ETag', etag);
  }

  const lastModified = upstreamHeaders?.get('last-modified');
  if (lastModified) {
    headers.set('Last-Modified', lastModified);
  }

  if (emptyReason) {
    headers.set('X-YCT-Tile-Empty', emptyReason);
  }

  return headers;
}

function createTransparentTileResponse(emptyReason: string): Response {
  return new Response(transparentTileSvg, {
    status: 200,
    headers: createTileResponseHeaders('image/svg+xml; charset=utf-8', undefined, emptyReason),
  });
}
