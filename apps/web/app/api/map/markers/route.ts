import { NextResponse } from 'next/server';
import { UnminedCustomMarkerProvider } from '@yct/adapters';
import type { EntityTranslationRecord, MapMarkerSnapshot } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { roadNameTranslationEntityId } from '../../../../lib/entity-translation-keys';
import { isMapRoadGeometryMarker } from '../../../../lib/map-road-geometry';
import {
  buildEntityTranslationMap,
  entityTranslationKey,
  listEntityTranslations,
} from '../../../../lib/entity-translation-store';
import { readTransitLinePoiMarkers } from '../../../../lib/map-transit-line-markers';
import { enrichMapMarkerPlaceRelations } from '../../../../lib/map-place-relations';
import { applyLegacyMapMarkerOverrides } from '../../../../lib/legacy-map-marker-override-store';
import { readPoiCategories } from '../../../../lib/poi-categories';
import { listPublishedPublicPoiSubmissions } from '../../../../lib/poi-submission-store';
import { readRuntimeConfig, type RuntimeConfig } from '../../../../lib/runtime-config';
import { createTimedCache } from '../../../../lib/server-cache';
import { readTransitOverview } from '../../../../lib/transit-data';
import {
  buildVisualRoadGraph,
  resolveVisualRoute,
} from '../../../../lib/transit-line-visual-routing';
import {
  isTransitLineDirectionIncluded,
  type TransitLineTravelDirection,
} from '../../../../lib/transit-line-direction';
import { isTransitPoiMarkerCompatibleWithStation } from '../../../../lib/transit-station-mode';
import type {
  TransitLineStopSummary,
  TransitOverview,
  TransitLineSummary,
} from '../../../../lib/legacy-transit';

const providerMarkerSnapshotCache = createTimedCache<MapMarkerSnapshot>(60 * 1000);

export async function GET() {
  const config = readRuntimeConfig();
  const iconBaseUrl = config.unminedMapBaseUrl;
  const [
    categories,
    publishedPoiSubmissions,
    transitLinePoiMarkers,
    transitOverview,
    entityTranslations,
  ] = await Promise.all([
    readPoiCategories().catch(() => []),
    listPublishedPublicPoiSubmissions(),
    readTransitLinePoiMarkers().catch(() => []),
    readTransitOverview().catch(() => null),
    listEntityTranslations(),
  ]);

  try {
    const staticSnapshot = await readStaticMarkerSnapshot(config);
    const staticSnapshotWithOverrides = await applyLegacyMapMarkerOverrides(staticSnapshot);
    const routingMarkerSnapshot = mergeLocalMapMarkers(
      staticSnapshotWithOverrides,
      publishedPoiSubmissions,
      categories,
      [],
    );
    const resolvedTransitLineMarkers = resolveTransitLineMarkerCoordinates(
      transitLinePoiMarkers,
      transitOverview,
      routingMarkerSnapshot,
    );
    const mergedSnapshot = applyMapMarkerTranslations(
      enrichMapMarkerPlaceRelations(
        normalizeMarkerSnapshotText(
          mergeLocalMapMarkers(
            staticSnapshotWithOverrides,
            publishedPoiSubmissions,
            categories,
            resolvedTransitLineMarkers,
          ),
        ),
      ),
      entityTranslations,
    );

    return NextResponse.json({
      meta: createApiMeta(
        'ready',
        [
          '当前读取 map.shangxiaoguan.top 的静态地点标记快照。',
          '玩家位置由独立实时位置接口提供。',
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
    const localSnapshot = applyMapMarkerTranslations(
      enrichMapMarkerPlaceRelations(
        normalizeMarkerSnapshotText(
          mergeLocalMapMarkers(
            {
              fetchedAt: new Date().toISOString(),
              markers: [],
            },
            publishedPoiSubmissions,
            categories,
            transitLinePoiMarkers,
          ),
        ),
      ),
      entityTranslations,
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

function applyMapMarkerTranslations(
  snapshot: MapMarkerSnapshot,
  translations: EntityTranslationRecord[],
): MapMarkerSnapshot {
  const translationMap = buildEntityTranslationMap(translations);
  return {
    ...snapshot,
    markers: snapshot.markers.map((marker) => {
      const lineId = marker.id.startsWith('transit-line-')
        ? marker.id.slice('transit-line-'.length)
        : undefined;
      const localizedLabels =
        translationMap.get(entityTranslationKey('map_marker', marker.id)) ??
        (lineId ? translationMap.get(entityTranslationKey('transit_line', lineId)) : undefined) ??
        (isMapRoadGeometryMarker(marker)
          ? translationMap.get(
              entityTranslationKey('map_marker', roadNameTranslationEntityId(marker.label)),
            )
          : undefined);
      return localizedLabels ? { ...marker, localizedLabels } : marker;
    }),
  };
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
  const markerById = new Map(markerSnapshot.markers.map((marker) => [marker.id, marker]));
  const roadGraph = buildVisualRoadGraph(markerSnapshot.markers);

  return markers.map((marker) => {
    if (marker.categoryId !== 'transit-line' || marker.geometry.type !== 'MultiPoint') {
      return marker;
    }

    const lineId = marker.id.replace(/^transit-line-/, '');
    const line = lineById.get(lineId);
    if (!line) {
      return marker;
    }

    const controlCoordinates = collectTransitLineControlCoordinates(
      line,
      'forward',
      stationCoordinateIndex,
      markerById,
    );
    if (controlCoordinates.length < 2) {
      return marker;
    }
    const routeMode =
      line.routeMode ?? (line.mode === 'bus' || line.mode === 'coach' ? 'road' : 'straight');
    const resolution = resolveVisualRoute(controlCoordinates, routeMode, roadGraph);
    const coordinates = resolution.coordinates;

    return {
      ...marker,
      geometry: {
        type: 'MultiPoint',
        coordinates,
      },
      description: describeTransitLineCoordinates(
        marker.description,
        coordinates.length,
        routeMode,
        resolution.unresolvedSegmentCount,
      ),
    };
  });
}

function collectTransitLineControlCoordinates(
  line: TransitLineSummary,
  direction: TransitLineTravelDirection,
  index: Map<string, Marker[]>,
  markerById: Map<string, Marker>,
): Array<[number, number]> {
  const stopByStationId = new Map(
    line.stationStops.flatMap((stop) =>
      stop.stationSourceId ? [[stop.stationSourceId, stop] as const] : [],
    ),
  );
  const appendStopCoordinate = (
    coordinates: Array<[number, number]>,
    stop: TransitLineStopSummary | undefined,
  ) => {
    const coordinate = stop ? findStationCoordinate(stop, line, index, markerById) : undefined;
    if (coordinate) {
      coordinates.push(coordinate);
    }
  };

  if (line.routeNodes?.length) {
    const coordinates: Array<[number, number]> = [];
    const directionalNodes = line.routeNodes.filter((node) => {
      if (!isTransitLineDirectionIncluded(node.direction, direction)) {
        return false;
      }
      if (node.kind === 'waypoint') {
        return true;
      }
      return isTransitLineDirectionIncluded(
        stopByStationId.get(node.stationSourceId)?.oneWay,
        direction,
      );
    });
    if (direction === 'reverse') {
      directionalNodes.reverse();
    }
    for (const node of directionalNodes) {
      if (node.kind === 'waypoint') {
        coordinates.push([node.x, node.z]);
      } else {
        appendStopCoordinate(coordinates, stopByStationId.get(node.stationSourceId));
      }
    }
    if (coordinates.length >= 2) {
      return dedupeConsecutiveCoordinates(coordinates);
    }
  }

  const pathBySegment = new Map<
    string,
    { path: NonNullable<typeof line.segmentPaths>[number]; reverse: boolean }
  >();
  for (const path of line.segmentPaths ?? []) {
    pathBySegment.set(`${path.fromStationSourceId}\u0000${path.toStationSourceId}`, {
      path,
      reverse: false,
    });
    pathBySegment.set(`${path.toStationSourceId}\u0000${path.fromStationSourceId}`, {
      path,
      reverse: true,
    });
  }
  const directionalStops = line.stationStops
    .filter((stop) => isTransitLineDirectionIncluded(stop.oneWay, direction))
    .sort((left, right) => left.sequence - right.sequence);
  if (direction === 'reverse') {
    directionalStops.reverse();
  }
  const coordinates: Array<[number, number]> = [];
  for (const [stopIndex, stop] of directionalStops.entries()) {
    appendStopCoordinate(coordinates, stop);
    const nextStop = directionalStops[stopIndex + 1];
    if (!stop.stationSourceId || !nextStop?.stationSourceId) {
      continue;
    }
    const configuredPath = pathBySegment.get(
      `${stop.stationSourceId}\u0000${nextStop.stationSourceId}`,
    );
    const waypoints = (configuredPath?.path.waypoints ?? []).filter((waypoint) =>
      isTransitLineDirectionIncluded(waypoint.direction, direction),
    );
    if (configuredPath?.reverse) {
      waypoints.reverse();
    }
    for (const waypoint of waypoints) {
      coordinates.push([waypoint.x, waypoint.z]);
    }
  }
  return dedupeConsecutiveCoordinates(coordinates);
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
  stop: TransitLineStopSummary,
  line: TransitLineSummary,
  index: Map<string, Marker[]>,
  markerById: Map<string, Marker>,
): [number, number] | undefined {
  const isCompatiblePointMarker = (
    marker: Marker,
  ): marker is Marker & { geometry: Extract<Marker['geometry'], { type: 'Point' }> } =>
    marker.geometry.type === 'Point' &&
    isTransitPoiMarkerCompatibleWithStation(marker, [line.mode]);
  const boundMarker = (stop.stationMarkerIds ?? [])
    .flatMap((markerId) => {
      const marker = markerById.get(markerId);
      return marker ? [marker] : [];
    })
    .find(isCompatiblePointMarker);
  if (boundMarker) {
    return boundMarker.geometry.coordinates;
  }
  const matched = (index.get(normalizeMarkerLabelText(stop.stationName)) ?? [])
    .filter(isCompatiblePointMarker)
    .sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'))[0];
  return matched?.geometry.coordinates;
}

function describeTransitLineCoordinates(
  description: string | undefined,
  coordinateCount: number,
  routeMode: 'road' | 'straight',
  unresolvedSegmentCount: number,
): string {
  const coordinateText =
    routeMode === 'road'
      ? `道路投影 ${coordinateCount} 个点${unresolvedSegmentCount > 0 ? `，${unresolvedSegmentCount} 段回退直线` : ''}`
      : `折线连接 ${coordinateCount} 个点`;
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

function dedupeConsecutiveCoordinates(
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
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
      imageUrls: submission.imageUrls,
      imageUrl: submission.imageUrl,
      geometry:
        submission.categoryId === 'road' && submission.geometry.type === 'LineString'
          ? { type: 'MultiPoint', coordinates: submission.geometry.coordinates }
          : submission.geometry,
      iconFileName: submission.iconFileName ?? category?.iconMapping.defaultIconFileName,
      parentMarkerId: submission.parentMarkerId,
      floorLabel: submission.floorLabel,
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
