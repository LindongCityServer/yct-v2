import {
  buildPoiCategoriesFromIconFileNames,
  groupPoiIconsByCategory,
  UnminedCustomMarkerProvider,
} from '@yct/adapters';
import type { PoiCategory } from '@yct/contracts';
import { listPoiCategoryProfiles } from './poi-category-profile-store';
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

export function clearPoiCategoryCache(): void {
  poiCategoryCache.clear();
}

async function readPoiCategoriesUncached(
  config: ReturnType<typeof readRuntimeConfig>,
): Promise<PoiCategory[]> {
  const mappings = groupPoiIconsByCategory(config.poiIconCandidates);

  let baseCategories: PoiCategory[];

  if (mappings.length > 0) {
    baseCategories = mappings.map((mapping, index) => ({
      id: mapping.categoryId,
      name: mapping.categoryId,
      iconMapping: mapping,
      acceptsPublicSubmissions: true,
      sortOrder: index * 10,
    }));
  } else {
    const provider = new UnminedCustomMarkerProvider({
      id: 'unmined-custom-markers',
      name: 'uNmINeD 静态标记',
      baseUrl: config.unminedMapBaseUrl,
      fetchTimeoutMs: config.markerBdslmTimeoutMs,
    });
    const snapshot = await provider.fetchMarkers('default');
    baseCategories = buildPoiCategoriesFromIconFileNames(
      snapshot.markers
        .map((marker) => marker.iconFileName)
        .filter((fileName): fileName is string => Boolean(fileName)),
    );
  }

  const profileCategories = await listPoiCategoryProfiles().catch(() => []);
  return mergePoiCategoryProfiles(ensureRequiredMapCategories(baseCategories), profileCategories);
}

function ensureRequiredMapCategories(categories: PoiCategory[]): PoiCategory[] {
  const result = [...categories];
  const iconFileNames = Array.from(
    new Set(categories.flatMap((category) => category.iconMapping.iconFileNames)),
  );
  const addCategory = (id: string, name: string, preferredIcons: string[], sortOrder: number) => {
    if (result.some((category) => category.id === id)) {
      return;
    }
    const availableIcons = preferredIcons.filter((fileName) => iconFileNames.includes(fileName));
    const defaultIconFileName = availableIcons[0] ?? preferredIcons[0] ?? '';
    result.push({
      id,
      name,
      acceptsPublicSubmissions: true,
      sortOrder,
      iconMapping: {
        categoryId: id,
        defaultIconFileName,
        iconFileNames: availableIcons.length > 0 ? availableIcons : [defaultIconFileName],
      },
    });
  };

  addCategory('pedestrian-path', '通道 / 步行路', ['way-in.png', 'road.png'], 15);
  addCategory('ordinary-entrance', '普通出入口', ['way-in.png', 'way-out.png'], 35);
  return result;
}

export function findPoiCategory(
  categories: PoiCategory[],
  categoryId: string,
): PoiCategory | undefined {
  return categories.find((category) => category.id === categoryId);
}

function mergePoiCategoryProfiles(
  baseCategories: PoiCategory[],
  profileCategories: PoiCategory[],
): PoiCategory[] {
  const merged = new Map(baseCategories.map((category) => [category.id, category] as const));

  for (const profile of profileCategories) {
    const base = merged.get(profile.id);
    merged.set(profile.id, {
      ...base,
      ...profile,
      iconMapping: {
        categoryId: profile.id,
        defaultIconFileName: profile.iconMapping.defaultIconFileName,
        iconFileNames: Array.from(new Set(profile.iconMapping.iconFileNames)),
      },
    });
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'),
  );
}
