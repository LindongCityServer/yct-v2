import { UnminedCustomMarkerProvider } from '@yct/adapters';
import type { MapGeometry, MapMarkerSnapshot, MaterialTemplateField } from '@yct/contracts';
import { applyLegacyMapMarkerOverrides } from './legacy-map-marker-override-store';
import { listPublishedPublicPoiSubmissions } from './poi-submission-store';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

export interface MaterialLocationOption {
  id: string;
  label: string;
  categoryId: string;
  address?: string;
}

interface MaterialLocationEntry extends MaterialLocationOption {
  geometry: MapGeometry;
  description?: string;
}

const materialLocationCache = createTimedCache<MaterialLocationEntry[]>(60 * 1000);

export async function listMaterialLocations(): Promise<MaterialLocationOption[]> {
  const locations = await readMaterialLocations();
  return locations.map(({ id, label, categoryId, address }) => ({
    id,
    label,
    categoryId,
    address,
  }));
}

export async function resolveMaterialLocationInput(input: {
  locationId: string;
  fields: MaterialTemplateField[];
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const location = (await readMaterialLocations()).find((item) => item.id === input.locationId);
  if (!location) {
    throw new Error('所选服务器地点不存在或已下线。');
  }

  const roadName =
    location.categoryId === 'road' ? location.label : location.address || location.label;
  const candidates: Record<string, string> = {
    roadName,
    roadNameEn: '',
    direction: deriveRoadDirection(location.geometry),
    lineName: location.label,
    stationName: location.label,
    destinationName: location.description ?? location.address ?? '',
    operator: '',
  };
  return {
    values: Object.fromEntries(
      input.fields.map((field) => [field.key, candidates[field.key] ?? '']),
    ),
    sourceRef: `map_location:${location.id}`,
  };
}

async function readMaterialLocations(): Promise<MaterialLocationEntry[]> {
  const config = readRuntimeConfig();
  const cacheKey = [config.unminedMapBaseUrl, config.markerBdslmTimeoutMs].join('|');
  return materialLocationCache.read(cacheKey, async () => {
    const [staticMarkers, publishedPois] = await Promise.all([
      readStaticLocationMarkers().catch(() => []),
      listPublishedPublicPoiSubmissions(),
    ]);
    const entries = [
      ...staticMarkers.map((marker) => ({
        id: `marker:${marker.id}`,
        label: marker.label,
        categoryId: marker.categoryId ?? 'map-marker',
        geometry: marker.geometry,
        description: marker.description,
      })),
      ...publishedPois.map((poi) => ({
        id: `poi:${poi.id}`,
        label: poi.title,
        categoryId: poi.categoryId,
        address: poi.address,
        geometry: poi.geometry,
        description: poi.description,
      })),
    ]
      .filter((entry) => Boolean(entry.label.trim()))
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id),
      );
    return entries;
  });
}

async function readStaticLocationMarkers(): Promise<MapMarkerSnapshot['markers']> {
  const config = readRuntimeConfig();
  const provider = new UnminedCustomMarkerProvider({
    id: 'material-location-markers',
    name: '物料地点来源',
    baseUrl: config.unminedMapBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });
  const snapshot = await provider.fetchMarkers('default');
  return (await applyLegacyMapMarkerOverrides(snapshot)).markers.filter(
    (marker) => marker.categoryId !== 'player',
  );
}

function deriveRoadDirection(geometry: MapGeometry): string {
  const coordinates =
    geometry.type === 'LineString' || geometry.type === 'MultiPoint' ? geometry.coordinates : [];
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) {
    return '';
  }
  const deltaX = last[0] - first[0];
  const deltaZ = last[1] - first[1];
  if (Math.abs(deltaX) >= Math.abs(deltaZ)) {
    return deltaX >= 0 ? '西东' : '东西';
  }
  return deltaZ >= 0 ? '北南' : '南北';
}
