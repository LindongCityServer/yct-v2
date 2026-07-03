import { NextResponse } from 'next/server';
import { BdslmMarkerProvider, UnminedCustomMarkerProvider } from '@yct/adapters';
import type { MapMarkerSnapshot } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { readTransitLinePoiMarkers } from '../../../../lib/map-transit-line-markers';
import { readPoiCategories } from '../../../../lib/poi-categories';
import { listPublishedPublicPoiSubmissions } from '../../../../lib/poi-submission-store';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { createTimedCache } from '../../../../lib/server-cache';

const providerMarkerSnapshotCache = createTimedCache<MapMarkerSnapshot>(60 * 1000);

export async function GET() {
  const config = readRuntimeConfig();
  const categories = await readPoiCategories().catch(() => []);
  const publishedPoiSubmissions = await listPublishedPublicPoiSubmissions();
  const transitLinePoiMarkers = await readTransitLinePoiMarkers().catch(() => []);

  try {
    const provider = config.markerBdslmBaseUrl
      ? new BdslmMarkerProvider({
          id: 'bdslm-markers',
          name: 'BDSLM 标记点',
          baseUrl: config.markerBdslmBaseUrl,
          fetchTimeoutMs: config.markerBdslmTimeoutMs,
        })
      : new UnminedCustomMarkerProvider({
          id: 'unmined-custom-markers',
          name: 'uNmINeD 静态标记',
          baseUrl: config.unminedMapBaseUrl,
          fetchTimeoutMs: config.markerBdslmTimeoutMs,
        });

    const snapshot = await providerMarkerSnapshotCache.read(
      [
        provider.id,
        config.markerBdslmBaseUrl ?? config.unminedMapBaseUrl,
        config.markerBdslmTimeoutMs,
      ].join('|'),
      async () =>
        groupRoadEndpointMarkers(
          normalizeMarkerSnapshotText(await provider.fetchMarkers('default')),
        ),
    );
    const mergedSnapshot = normalizeMarkerSnapshotText(
      mergeLocalMapMarkers(snapshot, publishedPoiSubmissions, categories, transitLinePoiMarkers),
    );

    return NextResponse.json({
      meta: createApiMeta(
        'ready',
        config.markerBdslmBaseUrl
          ? [
              localPoiMessage(publishedPoiSubmissions.length),
              transitLinePoiMessage(transitLinePoiMarkers.length),
            ]
              .filter(Boolean)
              .join(' ')
          : [
              '当前读取 map.shangxiaoguan.top 的静态标记快照。',
              localPoiMessage(publishedPoiSubmissions.length),
              transitLinePoiMessage(transitLinePoiMarkers.length),
            ]
              .filter(Boolean)
              .join(' '),
      ),
      snapshot: mergedSnapshot,
    });
  } catch (error) {
    const localSnapshot = normalizeMarkerSnapshotText(
      mergeLocalMapMarkers(
        {
          fetchedAt: new Date().toISOString(),
          markers: [],
        },
        publishedPoiSubmissions,
        categories,
        transitLinePoiMarkers,
      ),
    );
    if (localSnapshot.markers.length > 0) {
      return NextResponse.json({
        meta: createApiMeta(
          'ready',
          `外部标记源暂不可用，当前仅显示 ${localSnapshot.markers.length} 个本地地图对象。`,
        ),
        snapshot: localSnapshot,
      });
    }

    return NextResponse.json(
      {
        meta: createApiMeta(
          'unavailable',
          error instanceof Error ? error.message : '标记点源暂不可用。',
        ),
        snapshot: {
          fetchedAt: new Date().toISOString(),
          markers: [],
        } satisfies MapMarkerSnapshot,
      },
      { status: 502 },
    );
  }
}

type Marker = MapMarkerSnapshot['markers'][number];

function groupRoadEndpointMarkers(snapshot: MapMarkerSnapshot): MapMarkerSnapshot {
  const roadGroups = new Map<string, Marker[]>();

  for (const marker of snapshot.markers) {
    if (!isRoadEndpointSourceMarker(marker)) {
      continue;
    }

    const key = normalizeMarkerLabelText(marker.label);
    if (!key) {
      continue;
    }

    const group = roadGroups.get(key) ?? [];
    group.push(marker);
    roadGroups.set(key, group);
  }

  const endpointMarkers: Marker[] = Array.from(roadGroups.entries())
    .filter(([, markers]) => markers.length > 1)
    .map(([label, markers]): Marker => ({
      id: `road-endpoints-${stableMarkerId(label)}`,
      label,
      categoryId: 'road',
      geometry: {
        type: 'MultiPoint',
        coordinates: dedupeCoordinates(
          markers
            .filter(
              (
                marker,
              ): marker is Marker & { geometry: Extract<Marker['geometry'], { type: 'Point' }> } =>
                marker.geometry.type === 'Point',
            )
            .map((marker) => marker.geometry.coordinates),
        ),
      },
      iconFileName: markers.find((marker) => marker.iconFileName)?.iconFileName,
    }))
    .filter(
      (marker) => marker.geometry.type === 'MultiPoint' && marker.geometry.coordinates.length > 1,
    );

  return {
    ...snapshot,
    markers: [...snapshot.markers, ...endpointMarkers],
  };
}

function normalizeMarkerSnapshotText(snapshot: MapMarkerSnapshot): MapMarkerSnapshot {
  return {
    ...snapshot,
    markers: snapshot.markers.map((marker) => ({
      ...marker,
      label: normalizeMarkerLabelText(marker.label),
      description: marker.description
        ? normalizeMarkerDescriptionText(marker.description)
        : marker.description,
    })),
  };
}

function normalizeMarkerLabelText(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜]+/g, '')
    .trim();
}

function normalizeMarkerDescriptionText(value: string): string {
  return value.replace(/\u3000/g, '').trim();
}

function isRoadEndpointSourceMarker(
  marker: Marker,
): marker is Marker & { geometry: Extract<Marker['geometry'], { type: 'Point' }> } {
  if (marker.geometry.type !== 'Point') {
    return false;
  }

  const iconBaseName = getMarkerIconBaseName(marker.iconFileName);
  return (
    marker.categoryId === 'road' ||
    iconBaseName === 'road' ||
    iconBaseName === 'roadpoint' ||
    iconBaseName === 'highway-s1' ||
    iconBaseName === 'toll-gate'
  );
}

function getMarkerIconBaseName(fileName: string | undefined): string {
  return (
    fileName
      ?.trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? ''
  );
}

function dedupeCoordinates(coordinates: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set<string>();
  const deduped: Array<[number, number]> = [];

  for (const coordinate of coordinates) {
    const key = `${coordinate[0]}:${coordinate[1]}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(coordinate);
  }

  return deduped;
}

function stableMarkerId(value: string): string {
  return (
    encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, '-').slice(0, 120) || 'unnamed'
  );
}

function mergeLocalMapMarkers(
  snapshot: MapMarkerSnapshot,
  submissions: Awaited<ReturnType<typeof listPublishedPublicPoiSubmissions>>,
  categories: Awaited<ReturnType<typeof readPoiCategories>>,
  transitLineMarkers: Marker[],
): MapMarkerSnapshot {
  const localMarkers: Marker[] = submissions.map((submission) => {
    const category = categories.find((item) => item.id === submission.categoryId);
    return {
      id: `poi-${submission.id}`,
      label: submission.title,
      categoryId: submission.categoryId,
      description: submission.description,
      href: submission.href,
      imageUrl: submission.imageUrl,
      geometry: submission.geometry,
      iconFileName: category?.iconMapping.defaultIconFileName,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    markers: [...snapshot.markers, ...localMarkers, ...transitLineMarkers],
  };
}

function localPoiMessage(count: number): string | undefined {
  return count > 0 ? `已合并 ${count} 个本地已发布公开 POI。` : undefined;
}

function transitLinePoiMessage(count: number): string | undefined {
  return count > 0 ? `已合并 ${count} 个线路型 POI。` : undefined;
}
