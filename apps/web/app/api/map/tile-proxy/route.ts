import { NextRequest, NextResponse } from 'next/server';
import {
  createHistoryTileEmptyResponse,
  createHistoryTileHeaders,
  isHistoryTileInCoverage,
  parseMapHistoryVersions,
} from '../../../../lib/map-history';
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
  const z = readTileCoordinate(searchParams.get('z'));
  const x = readTileCoordinate(searchParams.get('x'));
  const y = readTileCoordinate(searchParams.get('y'));
  const xd = readTileCoordinate(searchParams.get('xd')) ?? x;
  const yd = readTileCoordinate(searchParams.get('yd')) ?? y;
  const versionParam = searchParams.get('version');

  // version 一旦出现就必须按历史版本处理：非法或已下架也不能回退到当前瓦片。
  if (versionParam !== null) {
    if (!z || !x || !y || !xd || !yd) {
      return createHistoryTileEmptyResponse(null, 'invalid-coordinate');
    }
    return respondHistoryTile(versionParam, { z, x, y, xd, yd });
  }

  const source = readTileSource(searchParams.get('source'));
  if (!source || !z || !x || !y || !xd || !yd) {
    return NextResponse.json(
      {
        meta: {
          status: 'error',
          message: '瓦片请求缺少有效参数：需要 source、z、x、y（可选 xd、yd）。',
        },
      },
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

const historyVersionIdPattern = /^[a-z0-9-]{1,64}$/;

async function respondHistoryTile(
  versionParam: string,
  coordinates: { z: string; x: string; y: string; xd: string; yd: string },
): Promise<Response> {
  const versionId = versionParam.trim();
  if (!historyVersionIdPattern.test(versionId)) {
    return createHistoryTileEmptyResponse(null, 'invalid-version');
  }

  const version = parseMapHistoryVersions(readRuntimeConfig().tileHistoryVersions).versions.find(
    (item) => item.id === versionId,
  );
  if (!version) {
    return createHistoryTileEmptyResponse(versionId, 'unknown-version');
  }
  if (version.status === 'archived') {
    return createHistoryTileEmptyResponse(versionId, 'archived-version');
  }

  // 手工构造 URL 也必须遵守版本声明的缩放与覆盖范围，避免代理被用来抓取上游任意瓦片。
  const tileZoom = Number(coordinates.z);
  const tileX = Number(coordinates.x);
  const tileZ = Number(coordinates.y);
  if (!Number.isSafeInteger(tileZoom) || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileZ)) {
    return createHistoryTileEmptyResponse(versionId, 'invalid-coordinate');
  }
  const minZoom = Math.min(version.zoomRange.minZoom, version.zoomRange.maxZoom);
  const maxZoom = Math.max(version.zoomRange.minZoom, version.zoomRange.maxZoom);
  if (tileZoom < minZoom || tileZoom > maxZoom) {
    return createHistoryTileEmptyResponse(versionId, 'zoom-out-of-range');
  }
  if (!isHistoryTileInCoverage(tileX, tileZ, tileZoom, version.coverage)) {
    return createHistoryTileEmptyResponse(versionId, 'out-of-coverage');
  }

  const upstreamUrl = fillMapTileTemplate(version.tileTemplate, coordinates);

  try {
    const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });
    if (upstreamResponse.status === 404 || upstreamResponse.status === 204) {
      return createHistoryTileEmptyResponse(versionId, 'not-found');
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return createHistoryTileEmptyResponse(versionId, `upstream-${upstreamResponse.status}`);
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'image/png';
    if (!imageContentTypePattern.test(contentType)) {
      return createHistoryTileEmptyResponse(versionId, 'invalid-content-type');
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: createHistoryTileHeaders(versionId, {
        contentType,
        upstreamEtag: upstreamResponse.headers.get('etag'),
      }),
    });
  } catch {
    return createHistoryTileEmptyResponse(versionId, 'upstream-unavailable');
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
