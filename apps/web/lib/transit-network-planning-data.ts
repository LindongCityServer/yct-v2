import { UnminedCustomMarkerProvider } from '@yct/adapters';
import type { MapGeometry, MapMarkerSnapshot, TransportMode } from '@yct/contracts';
import type { TransitLineStopSummary } from './legacy-transit';
import { listPublishedPublicPoiSubmissions } from './poi-submission-store';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';
import { isTransitPoiMarkerCompatibleWithStation } from './transit-station-mode';

type TransitMode = Exclude<TransportMode, 'walk'>;
type Marker = MapMarkerSnapshot['markers'][number];

export interface TransitNetworkPlanningPoint {
  id: string;
  label: string;
  categoryId?: string;
  coordinates: [number, number];
}

export interface TransitNetworkPlanningData {
  points: TransitNetworkPlanningPoint[];
  sourceMessage: string;
  staticSourceAvailable: boolean;
}

const planningDataCache = createTimedCache<TransitNetworkPlanningData>(5 * 60 * 1000);

const stationCategoriesByMode: Record<TransitMode, string[]> = {
  metro: ['metro-station', 'metro-entrance'],
  tram: ['tram-station'],
  bus: ['bus-stop'],
  coach: ['coach-station'],
  ferry: ['ferry-port'],
  railway: ['railway-station'],
  custom: [],
};

const genericStationCategories = new Set([
  'metro-station',
  'metro-entrance',
  'tram-station',
  'bus-stop',
  'coach-station',
  'ferry-port',
  'railway-station',
  'airport',
]);

export async function readTransitNetworkPlanningData(): Promise<TransitNetworkPlanningData> {
  const config = readRuntimeConfig();
  const cacheKey = [
    config.unminedMapBaseUrl,
    config.markerBdslmTimeoutMs,
    config.poiSubmissionStorePath,
  ].join('|');
  return planningDataCache.read(cacheKey, () => readTransitNetworkPlanningDataUncached());
}

export function resolveTransitStationCoordinate(
  data: TransitNetworkPlanningData,
  input: {
    mode: TransitMode;
    stop: TransitLineStopSummary;
  },
): [number, number] | undefined {
  const markerIds = new Set(input.stop.stationMarkerIds ?? []);
  if (markerIds.size > 0) {
    const boundPoint = data.points.find(
      (point) =>
        markerIds.has(point.id) && isTransitPoiMarkerCompatibleWithStation(point, [input.mode]),
    );
    if (boundPoint) {
      return boundPoint.coordinates;
    }
  }

  const stationName = normalizeMarkerLabel(input.stop.stationName);
  const candidates = data.points.filter(
    (point) => normalizeMarkerLabel(point.label) === stationName,
  );
  const best = candidates
    .map((point) => ({ point, score: scoreStationPoint(point, input.mode) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0];
  return best?.point.coordinates;
}

async function readTransitNetworkPlanningDataUncached(): Promise<TransitNetworkPlanningData> {
  const config = readRuntimeConfig();
  const provider = new UnminedCustomMarkerProvider({
    id: 'transit-network-health-markers',
    name: '线网健康度地点快照',
    baseUrl: config.unminedMapBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });
  const [staticResult, localResult] = await Promise.allSettled([
    provider.fetchMarkers('default'),
    listPublishedPublicPoiSubmissions(),
  ]);
  const staticMarkers = staticResult.status === 'fulfilled' ? staticResult.value.markers : [];
  const localSubmissions = localResult.status === 'fulfilled' ? localResult.value : [];
  const staticPoints = staticMarkers.flatMap(markerToPlanningPoint);
  const localPoints = localSubmissions.flatMap((submission) => {
    const coordinates = geometryCenter(submission.geometry);
    return coordinates
      ? [
          {
            id: `poi-${submission.id}`,
            label: submission.title,
            categoryId: submission.categoryId,
            coordinates,
          },
        ]
      : [];
  });
  const sourceParts = [
    staticResult.status === 'fulfilled'
      ? `外部静态地图 ${staticPoints.length} 个地点`
      : '外部静态地图不可用',
    `本地已发布地点 ${localPoints.length} 个`,
  ];

  return {
    points: [...staticPoints, ...localPoints],
    sourceMessage: sourceParts.join('，'),
    staticSourceAvailable: staticResult.status === 'fulfilled',
  };
}

function markerToPlanningPoint(marker: Marker): TransitNetworkPlanningPoint[] {
  const coordinates = geometryCenter(marker.geometry);
  if (!coordinates) {
    return [];
  }
  return [
    {
      id: marker.id,
      label: marker.label,
      categoryId: marker.categoryId,
      coordinates,
    },
  ];
}

function geometryCenter(geometry: MapGeometry): [number, number] | undefined {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'Rectangle':
      return [
        (geometry.bounds.minX + geometry.bounds.maxX) / 2,
        (geometry.bounds.minZ + geometry.bounds.maxZ) / 2,
      ];
    case 'MultiPoint':
    case 'LineString':
      return averageCoordinates(geometry.coordinates);
    case 'MultiRectangle':
      return averageCoordinates(
        geometry.rectangles.map((rectangle) => [
          (rectangle.minX + rectangle.maxX) / 2,
          (rectangle.minZ + rectangle.maxZ) / 2,
        ]),
      );
    case 'Polygon':
      return averageCoordinates(geometry.coordinates.flat());
    case 'MultiPolygon':
      return averageCoordinates(geometry.coordinates.flat(2));
  }
}

function averageCoordinates(coordinates: Array<[number, number]>): [number, number] | undefined {
  if (coordinates.length === 0) {
    return undefined;
  }
  const [x, z] = coordinates.reduce(
    (total, coordinate) => [total[0] + coordinate[0], total[1] + coordinate[1]],
    [0, 0],
  );
  return [x / coordinates.length, z / coordinates.length];
}

function scoreStationPoint(point: TransitNetworkPlanningPoint, mode: TransitMode): number {
  const categoryId = point.categoryId?.toLowerCase() ?? '';
  if (stationCategoriesByMode[mode].includes(categoryId)) {
    return 100;
  }
  if (genericStationCategories.has(categoryId)) {
    return 0;
  }
  if (categoryId === 'road') {
    return 0;
  }
  return 0;
}

function normalizeMarkerLabel(value: string): string {
  return value
    .replace(/[\s\u3000|｜]+/g, '')
    .trim()
    .toLocaleLowerCase('zh-CN');
}
