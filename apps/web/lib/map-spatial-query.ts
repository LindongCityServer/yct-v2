import type { LocaleCode, MapMarkerSnapshot } from '@yct/contracts';
import {
  findAlongChainMarkerMatches,
  findNearbyMarkerMatches,
  getGeometryCenter,
  getGeometryCoordinates,
  isCoordinateInsideRegionGeometry,
  type MapCoordinate,
} from './map-spatial';
import { getMarkerCategoryLabel } from './map-marker-categories';
import { readPublicMapMarkerSnapshot } from './map-marker-public-snapshot-store';
import { readPoiCategories } from './poi-categories';

export type SpatialMarker = MapMarkerSnapshot['markers'][number];

export interface SpatialMarkerContext {
  markers: SpatialMarker[];
  fetchedAt?: string;
  categoryNames: Map<string, string>;
  locale: LocaleCode;
}

export interface SpatialPlaceItem {
  id: string;
  label: string;
  categoryId?: string;
  categoryLabel?: string;
  address?: string;
  description?: string;
  href?: string;
  /** 到中心点或线路中心线的垂距，单位地图格。 */
  distance: number;
  /** 沿线搜索时，从线路起点算起的里程，单位地图格。 */
  mileage?: number;
}

export interface NearbyQueryResult {
  anchor: { id?: string; label?: string; coordinate: MapCoordinate };
  radius: number;
  items: SpatialPlaceItem[];
}

export interface AlongLineQueryResult {
  line: { id: string; label: string; chainLength: number };
  corridor: number;
  fromMileage: number;
  toMileage: number;
  items: SpatialPlaceItem[];
}

/** 读取最近一次公开地图快照并建立分类名索引，供 API 与问一问共用。 */
export async function readSpatialMarkerContext(
  locale: LocaleCode = 'zh-CN',
): Promise<SpatialMarkerContext | undefined> {
  const [snapshot, categories] = await Promise.all([
    readPublicMapMarkerSnapshot(),
    readPoiCategories().catch(() => []),
  ]);
  if (!snapshot) {
    return undefined;
  }

  return {
    markers: snapshot.snapshot.markers,
    fetchedAt: snapshot.snapshot.fetchedAt,
    categoryNames: new Map((categories ?? []).map((category) => [category.id, category.name])),
    locale,
  };
}

export function findSpatialMarker(
  markers: SpatialMarker[],
  input: { markerId?: string; label?: string; categoryIds?: string[] },
): SpatialMarker | undefined {
  const markerId = input.markerId?.trim();
  if (markerId) {
    const matched = markers.find((marker) => marker.id === markerId);
    if (matched) {
      return matched;
    }
  }

  const label = input.label?.trim();
  if (!label) {
    return undefined;
  }

  const normalized = label.toLocaleLowerCase();
  const candidates = markers.filter(
    (marker) =>
      marker.label.toLocaleLowerCase() === normalized ||
      Object.values(marker.localizedLabels ?? {}).some(
        (localized) => localized.toLocaleLowerCase() === normalized,
      ),
  );
  return input.categoryIds && input.categoryIds.length > 0
    ? (candidates.find((marker) => input.categoryIds?.includes(marker.categoryId ?? '')) ??
        candidates[0])
    : candidates[0];
}

/** 周边搜索：锚点可以是具体地点，也可以是区域对象（区域内/区域外）。 */
export function queryNearbyMarkers(
  context: SpatialMarkerContext,
  input: {
    anchor: SpatialMarker;
    radius: number;
    categories?: string[];
    scope?: 'all' | 'inside' | 'outside';
    limit?: number;
  },
): NearbyQueryResult | undefined {
  const center = getGeometryCenter(input.anchor.geometry);
  if (!center) {
    return undefined;
  }

  const matches = findNearbyMarkerMatches(context.markers, {
    center,
    radius: input.radius,
    excludeIds: [input.anchor.id],
    filter: (marker) =>
      marker.categoryId !== 'player' && matchesSpatialCategory(marker, input.categories, context),
    limit: input.limit ?? 50,
  });

  const scope = input.scope ?? 'all';
  const anchorGeometry = input.anchor.geometry;
  const scoped =
    scope === 'all'
      ? matches
      : matches.filter(({ marker }) => {
          const markerCenter = getGeometryCenter(marker.geometry);
          if (!markerCenter) {
            return false;
          }
          const inside = isCoordinateInsideRegionGeometry(markerCenter, anchorGeometry);
          return inside === (scope === 'inside');
        });

  return {
    anchor: { id: input.anchor.id, label: input.anchor.label, coordinate: center },
    radius: input.radius,
    items: scoped.map(({ marker, distance }) => toSpatialPlaceItem(marker, context, { distance })),
  };
}

/** 沿线搜索：按线路折线计算垂距与里程，支持里程区间筛选。 */
export function queryAlongLineMarkers(
  context: SpatialMarkerContext,
  input: {
    line: SpatialMarker;
    corridor?: number;
    fromMileage?: number;
    toMileage?: number;
    categories?: string[];
    limit?: number;
  },
): AlongLineQueryResult | undefined {
  const chain = getGeometryCoordinates(input.line.geometry);
  if (chain.length < 2) {
    return undefined;
  }

  const corridor = input.corridor ?? 300;
  const matches = findAlongChainMarkerMatches(context.markers, {
    chain,
    corridorDistance: corridor,
    fromMileage: input.fromMileage,
    toMileage: input.toMileage,
    excludeIds: [input.line.id],
    filter: (marker) =>
      marker.categoryId !== 'player' && matchesSpatialCategory(marker, input.categories, context),
    limit: input.limit ?? 80,
  });

  return {
    line: {
      id: input.line.id,
      label: input.line.label,
      chainLength: chain.length,
    },
    corridor,
    fromMileage: input.fromMileage ?? 0,
    toMileage: input.toMileage ?? Number.MAX_VALUE,
    items: matches.map(({ marker, distance, mileage }) =>
      toSpatialPlaceItem(marker, context, { distance, mileage }),
    ),
  };
}

export function matchesSpatialCategory(
  marker: SpatialMarker,
  categories: string[] | undefined,
  context: SpatialMarkerContext,
): boolean {
  if (!categories || categories.length === 0) {
    return true;
  }
  if (marker.categoryId === 'player') {
    return false;
  }

  const categoryLabel = getMarkerCategoryLabel(
    marker.categoryId,
    context.categoryNames,
    context.locale,
  );
  return categories.some((category) => {
    const normalized = category.trim().toLocaleLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      marker.categoryId?.toLocaleLowerCase() === normalized ||
      categoryLabel?.toLocaleLowerCase().includes(normalized) ||
      marker.label.toLocaleLowerCase().includes(normalized)
    );
  });
}

export function toSpatialPlaceItem(
  marker: SpatialMarker,
  context: SpatialMarkerContext,
  metrics: { distance: number; mileage?: number },
): SpatialPlaceItem {
  return {
    id: marker.id,
    label: marker.label,
    categoryId: marker.categoryId,
    categoryLabel: getMarkerCategoryLabel(marker.categoryId, context.categoryNames, context.locale),
    address: marker.address,
    description: marker.description,
    href: marker.href,
    distance: Math.round(metrics.distance),
    mileage: metrics.mileage === undefined ? undefined : Math.round(metrics.mileage),
  };
}

/** 线路型 POI（含道路投影点）是沿线搜索的锚点。 */
export function findTransitLineMarker(
  markers: SpatialMarker[],
  input: { lineId?: string; label?: string },
): SpatialMarker | undefined {
  const lineMarkers = markers.filter(
    (marker) => marker.categoryId === 'transit-line' && marker.geometry.type !== 'Point',
  );

  const lineId = input.lineId?.trim();
  if (lineId) {
    const byId = lineMarkers.find(
      (marker) => marker.id === `transit-line-${lineId}` || marker.id === lineId,
    );
    if (byId) {
      return byId;
    }
  }

  const label = input.label?.trim();
  if (!label) {
    return undefined;
  }
  const normalized = label.toLocaleLowerCase().replace(/[\s　]+/g, '');
  return lineMarkers.find((marker) => {
    const names = [
      marker.label,
      ...Object.values(marker.localizedLabels ?? {}),
      marker.secondaryLabel,
    ].filter((value): value is string => Boolean(value));
    return names.some((name) => name.toLocaleLowerCase().replace(/[\s　]+/g, '') === normalized);
  });
}
