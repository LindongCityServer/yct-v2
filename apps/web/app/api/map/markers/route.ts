import { NextResponse } from 'next/server';
import { BdslmMarkerProvider, UnminedCustomMarkerProvider } from '@yct/adapters';
import type { MapMarkerSnapshot } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { readTransitLinePoiMarkers } from '../../../../lib/map-transit-line-markers';
import { applyLegacyMapMarkerOverrides } from '../../../../lib/legacy-map-marker-override-store';
import { readPoiCategories } from '../../../../lib/poi-categories';
import { listPublishedPublicPoiSubmissions } from '../../../../lib/poi-submission-store';
import { readRuntimeConfig, type RuntimeConfig } from '../../../../lib/runtime-config';
import { createTimedCache } from '../../../../lib/server-cache';
import { readTransitOverview } from '../../../../lib/transit-data';
import type { TransitOverview, TransitLineSummary } from '../../../../lib/legacy-transit';

const providerMarkerSnapshotCache = createTimedCache<MapMarkerSnapshot>(60 * 1000);

export async function GET() {
  const config = readRuntimeConfig();
  const iconBaseUrl = config.unminedMapBaseUrl;
  const [categories, publishedPoiSubmissions, transitLinePoiMarkers, transitOverview] =
    await Promise.all([
      readPoiCategories().catch(() => []),
      listPublishedPublicPoiSubmissions(),
      readTransitLinePoiMarkers().catch(() => []),
      readTransitOverview().catch(() => null),
    ]);

  try {
    const [staticSnapshot, playerSnapshot] = await Promise.all([
      readStaticMarkerSnapshot(config),
      readPlayerMarkerSnapshot(config),
    ]);
    const staticSnapshotWithOverrides = await applyLegacyMapMarkerOverrides(staticSnapshot);
    const resolvedTransitLineMarkers = resolveTransitLineMarkerCoordinates(
      transitLinePoiMarkers,
      transitOverview,
      staticSnapshotWithOverrides,
    );
    const snapshot = mergeMarkerSnapshots(staticSnapshotWithOverrides, playerSnapshot);
    const mergedSnapshot = normalizeMarkerSnapshotText(
      mergeLocalMapMarkers(
        snapshot,
        publishedPoiSubmissions,
        categories,
        resolvedTransitLineMarkers,
      ),
    );

    return NextResponse.json({
      meta: createApiMeta(
        'ready',
        [
          '当前读取 map.shangxiaoguan.top 的静态地点标记快照。',
          config.markerBdslmBaseUrl
            ? playerSnapshot
              ? `已合并 ${playerSnapshot.markers.length} 个实时玩家位置。`
              : '实时玩家位置暂不可用。'
            : undefined,
          localPoiMessage(publishedPoiSubmissions.length),
          transitLinePoiMessage(resolvedTransitLineMarkers.length),
        ]
          .filter(Boolean)
          .join(' '),
      ),
      snapshot: mergedSnapshot,
      iconBaseUrl,
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
        iconBaseUrl,
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
        iconBaseUrl,
      },
      { status: 502 },
    );
  }
}

type Marker = MapMarkerSnapshot['markers'][number];

async function readStaticMarkerSnapshot(config: RuntimeConfig): Promise<MapMarkerSnapshot> {
  const provider = new UnminedCustomMarkerProvider({
    id: 'unmined-custom-markers',
    name: 'uNmINeD 静态标记',
    baseUrl: config.unminedMapBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });

  return providerMarkerSnapshotCache.read(
    [provider.id, config.unminedMapBaseUrl, config.markerBdslmTimeoutMs].join('|'),
    async () =>
      groupRoadEndpointMarkers(normalizeMarkerSnapshotText(await provider.fetchMarkers('default'))),
  );
}

async function readPlayerMarkerSnapshot(config: RuntimeConfig): Promise<MapMarkerSnapshot | null> {
  if (!config.markerBdslmBaseUrl) {
    return null;
  }

  const provider = new BdslmMarkerProvider({
    id: 'bdslm-player-markers',
    name: 'BDSLM 实时玩家位置',
    baseUrl: config.markerBdslmBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });

  return providerMarkerSnapshotCache
    .read(
      [provider.id, config.markerBdslmBaseUrl, config.markerBdslmTimeoutMs].join('|'),
      async () => normalizeMarkerSnapshotText(await provider.fetchMarkers('default')),
    )
    .catch(() => null);
}

function mergeMarkerSnapshots(
  staticSnapshot: MapMarkerSnapshot,
  playerSnapshot: MapMarkerSnapshot | null,
): MapMarkerSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    markers: [...staticSnapshot.markers, ...(playerSnapshot?.markers ?? [])],
  };
}

function resolveTransitLineMarkerCoordinates(
  markers: Marker[],
  overview: TransitOverview | null,
  markerSnapshot: MapMarkerSnapshot,
): Marker[] {
  if (!overview) {
    return markers;
  }

  const lineById = new Map(overview.lines.map((line) => [line.id, line]));
  const stationCoordinateIndex = buildStationCoordinateIndex(markerSnapshot.markers);

  return markers.map((marker) => {
    if (
      marker.categoryId !== 'transit-line' ||
      marker.geometry.type !== 'MultiPoint' ||
      marker.geometry.coordinates.length > 1
    ) {
      return marker;
    }

    const lineId = marker.id.replace(/^transit-line-/, '');
    const line = lineById.get(lineId);
    if (!line) {
      return marker;
    }

    const coordinates = dedupeCoordinates(
      line.stationNames
        .map((stationName) => findStationCoordinate(stationName, line, stationCoordinateIndex))
        .filter((coordinate): coordinate is [number, number] => Boolean(coordinate)),
    );

    if (coordinates.length < 2) {
      return marker;
    }

    return {
      ...marker,
      geometry: {
        type: 'MultiPoint',
        coordinates,
      },
      description: describeTransitLineCoordinates(marker.description, coordinates.length),
    };
  });
}

function buildStationCoordinateIndex(markers: Marker[]): Map<string, Marker[]> {
  const index = new Map<string, Marker[]>();

  for (const marker of markers) {
    if (marker.geometry.type !== 'Point') {
      continue;
    }

    const key = normalizeMarkerLabelText(marker.label);
    if (!key) {
      continue;
    }

    const group = index.get(key) ?? [];
    group.push(marker);
    index.set(key, group);
  }

  return index;
}

function findStationCoordinate(
  stationName: string,
  line: TransitLineSummary,
  index: Map<string, Marker[]>,
): [number, number] | undefined {
  const candidates = index.get(normalizeMarkerLabelText(stationName)) ?? [];
  const best = candidates
    .filter(
      (marker): marker is Marker & { geometry: Extract<Marker['geometry'], { type: 'Point' }> } =>
        marker.geometry.type === 'Point',
    )
    .map((marker) => ({
      marker,
      score: getStationCoordinateScore(marker, line),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0];

  return best?.marker.geometry.coordinates;
}

function getStationCoordinateScore(
  marker: Marker & { geometry: Extract<Marker['geometry'], { type: 'Point' }> },
  line: TransitLineSummary,
): number {
  const categoryId = marker.categoryId?.toLowerCase() ?? '';
  const iconBaseName = getMarkerIconBaseName(marker.iconFileName);
  const source = `${categoryId} ${iconBaseName}`;

  if (line.mode === 'metro' && source.includes('metro')) {
    return 100;
  }

  if (line.mode === 'tram' && (source.includes('tram') || source.includes('rail'))) {
    return 95;
  }

  if (line.mode === 'bus' && (source.includes('bus') || source.includes('stop'))) {
    return 90;
  }

  if (line.mode === 'coach' && (source.includes('coach') || source.includes('bus'))) {
    return 90;
  }

  if (line.mode === 'railway' && (source.includes('railway') || source.includes('station'))) {
    return 90;
  }

  if (source.includes('station') || source.includes('stop')) {
    return 60;
  }

  if (categoryId === 'road' || iconBaseName === 'road' || iconBaseName === 'roadpoint') {
    return 0;
  }

  return 20;
}

function describeTransitLineCoordinates(
  description: string | undefined,
  coordinateCount: number,
): string {
  const coordinateText = `站点坐标直连 ${coordinateCount} 个点`;
  if (!description) {
    return coordinateText;
  }

  const parts = description.split(' · ');
  if (parts.length >= 3) {
    return [...parts.slice(0, 2), coordinateText].join(' · ');
  }

  return `${description} · ${coordinateText}`;
}

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
        coordinates: orderRoadCoordinates(
          dedupeCoordinates(
            markers
              .filter(
                (
                  marker,
                ): marker is Marker & {
                  geometry: Extract<Marker['geometry'], { type: 'Point' }>;
                } => marker.geometry.type === 'Point',
              )
              .map((marker) => marker.geometry.coordinates),
          ),
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
    markers: snapshot.markers.map((marker) => {
      const label = normalizeMarkerLabelText(marker.label);
      const secondary = parseSecondaryMarkerLabel(label);
      return {
        ...marker,
        label,
        parentLabel: marker.parentLabel ?? secondary?.parentLabel,
        secondaryLabel: marker.secondaryLabel ?? secondary?.secondaryLabel,
        description: marker.description
          ? normalizeMarkerDescriptionText(marker.description)
          : marker.description,
      };
    }),
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

function parseSecondaryMarkerLabel(
  value: string,
): { parentLabel: string; secondaryLabel: string } | undefined {
  const [parentLabel, secondaryLabel] = value.split('-', 2).map((item) => item.trim());
  if (!parentLabel || !secondaryLabel) {
    return undefined;
  }

  return {
    parentLabel,
    secondaryLabel,
  };
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

function orderRoadCoordinates(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length < 3) {
    return coordinates;
  }

  const remaining = [...coordinates];
  const xValues = remaining.map(([x]) => x);
  const zValues = remaining.map(([, z]) => z);
  const preferX =
    Math.max(...xValues) - Math.min(...xValues) >= Math.max(...zValues) - Math.min(...zValues);
  const firstIndex = remaining.reduce((bestIndex, coordinate, index) => {
    const best = remaining[bestIndex];
    if (!best) {
      return index;
    }
    const coordinateAxis = preferX ? coordinate[0] : coordinate[1];
    const bestAxis = preferX ? best[0] : best[1];
    return coordinateAxis < bestAxis ? index : bestIndex;
  }, 0);
  const first = remaining.splice(firstIndex, 1)[0];
  const ordered = first ? [first] : [];

  while (remaining.length > 0) {
    const previous = ordered.at(-1);
    if (!previous) {
      break;
    }
    const nearestIndex = remaining.reduce((bestIndex, coordinate, index) => {
      const best = remaining[bestIndex];
      return !best ||
        squaredCoordinateDistance(previous, coordinate) < squaredCoordinateDistance(previous, best)
        ? index
        : bestIndex;
    }, 0);
    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

function squaredCoordinateDistance(left: [number, number], right: [number, number]): number {
  const deltaX = left[0] - right[0];
  const deltaZ = left[1] - right[1];
  return deltaX * deltaX + deltaZ * deltaZ;
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
      geometry:
        submission.categoryId === 'road' && submission.geometry.type === 'LineString'
          ? { type: 'MultiPoint', coordinates: submission.geometry.coordinates }
          : submission.geometry,
      iconFileName: submission.iconFileName ?? category?.iconMapping.defaultIconFileName,
      parentMarkerId: submission.parentMarkerId,
      boundRegionMarkerIds: submission.boundRegionMarkerIds,
      openingHours: submission.openingHours,
      address: submission.address,
      addressRoadMarkerId: submission.addressRoadMarkerId,
      facilities: submission.facilities,
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
