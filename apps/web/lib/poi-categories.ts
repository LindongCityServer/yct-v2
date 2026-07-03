import {
  buildPoiCategoriesFromIconFileNames,
  groupPoiIconsByCategory,
  UnminedCustomMarkerProvider,
} from '@yct/adapters';
import type { PoiCategory } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

const poiCategoryCache = createTimedCache<PoiCategory[]>(5 * 60 * 1000);

export async function readPoiCategories(): Promise<PoiCategory[]> {
  const config = readRuntimeConfig();
  const cacheKey = [
    config.unminedMapBaseUrl,
    config.markerBdslmTimeoutMs,
    config.poiIconCandidates.map((item) => `${item.categoryHint}:${item.fileName}`).join(','),
  ].join('|');

  return poiCategoryCache.read(cacheKey, () => readPoiCategoriesUncached(config));
}

async function readPoiCategoriesUncached(
  config: ReturnType<typeof readRuntimeConfig>,
): Promise<PoiCategory[]> {
  const mappings = groupPoiIconsByCategory(config.poiIconCandidates);

  if (mappings.length > 0) {
    return mappings.map((mapping, index) => ({
      id: mapping.categoryId,
      name: mapping.categoryId,
      iconMapping: mapping,
      acceptsPublicSubmissions: true,
      sortOrder: index * 10,
    }));
  }

  const provider = new UnminedCustomMarkerProvider({
    id: 'unmined-custom-markers',
    name: 'uNmINeD 静态标记',
    baseUrl: config.unminedMapBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });
  const snapshot = await provider.fetchMarkers('default');
  return buildPoiCategoriesFromIconFileNames(
    snapshot.markers
      .map((marker) => marker.iconFileName)
      .filter((fileName): fileName is string => Boolean(fileName)),
  );
}

export function findPoiCategory(
  categories: PoiCategory[],
  categoryId: string,
): PoiCategory | undefined {
  return categories.find((category) => category.id === categoryId);
}
