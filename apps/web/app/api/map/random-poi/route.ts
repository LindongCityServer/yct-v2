import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { MapGeometry, MapMarkerSnapshot } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { appPath } from '../../../../lib/app-paths';
import { readPublicMapMarkerSnapshot } from '../../../../lib/map-marker-public-snapshot-store';
import { isExplorablePoi } from '../../../../lib/random-explore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Marker = MapMarkerSnapshot['markers'][number];

/**
 * 随机公开地点接口：供「手气不错」和随机地点分享图复用。
 * 只从公开标记读模型中抽取，未发布、无几何、道路与玩家标记都会被排除。
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const exclude = requestUrl.searchParams.get('exclude')?.trim() || undefined;
  const category = requestUrl.searchParams.get('category')?.trim() || undefined;

  const markers = await readMarkers(requestUrl.origin);
  if (!markers) {
    return NextResponse.json(
      { message: '暂时无法读取公开地点数据。' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const candidates = markers.filter(
    (marker) => isExplorablePoi(marker) && (!category || marker.categoryId === category),
  );
  // 只有数量足够时才排除上一次结果，避免仅剩一个地点时永远选不到它。
  const pool =
    exclude && candidates.length > 1
      ? candidates.filter((marker) => marker.id !== exclude)
      : candidates;
  if (pool.length === 0) {
    return NextResponse.json(
      { message: '暂无可随机探索的地点。' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }

  const marker = pool[randomInt(pool.length)];
  return NextResponse.json(
    {
      meta: createApiMeta('ready', `从 ${candidates.length} 个公开地点中随机抽取。`),
      poi: {
        id: marker.id,
        label: marker.label,
        categoryId: marker.categoryId,
        coordinates: getMarkerCenter(marker.geometry),
        description: marker.description,
        imageUrls: marker.imageUrls,
        imageUrl: marker.imageUrl,
        address: marker.address,
        openingHours: marker.openingHours,
        href: marker.href,
        sharePath: `${appPath('/map')}?m=${encodeURIComponent(marker.id)}`,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

async function readMarkers(origin: string): Promise<Marker[] | undefined> {
  const snapshot = await readPublicMapMarkerSnapshot();
  if (snapshot) {
    return snapshot.snapshot.markers;
  }

  // 公开快照由标记接口写入；首次访问时还没生成，回退到标记接口，避免随机接口依赖访问顺序。
  try {
    const response = await fetch(new URL(appPath('/api/map/markers'), origin), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = (await response.json()) as { snapshot?: MapMarkerSnapshot };
    return payload.snapshot?.markers;
  } catch {
    return undefined;
  }
}

function getMarkerCenter(geometry: MapGeometry): [number, number] | undefined {
  let coordinates: number[][] = [];
  if (geometry.type === 'Point') {
    coordinates = [geometry.coordinates];
  } else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    coordinates = geometry.coordinates;
  } else if (geometry.type === 'Polygon') {
    coordinates = geometry.coordinates.flat();
  } else if (geometry.type === 'MultiPolygon') {
    coordinates = geometry.coordinates.flat(2);
  } else {
    const bounds = geometry.type === 'Rectangle' ? [geometry.bounds] : geometry.rectangles;
    const points = bounds.flatMap((bound) => [
      [bound.minX, bound.minZ],
      [bound.maxX, bound.maxZ],
    ]);
    coordinates = points;
  }

  const valid = coordinates.filter(
    (coordinate): coordinate is [number, number] =>
      coordinate.length === 2 && coordinate.every(Number.isFinite),
  );
  if (valid.length === 0) {
    return undefined;
  }

  const [sumX, sumZ] = valid.reduce(([totalX, totalZ], [x, z]) => [totalX + x, totalZ + z], [0, 0]);
  return [sumX / valid.length, sumZ / valid.length];
}
