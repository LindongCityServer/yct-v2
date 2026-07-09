import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PoiCategory } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface PoiCategoryProfileSnapshot {
  version: 1;
  categories: PoiCategory[];
}

const emptySnapshot: PoiCategoryProfileSnapshot = {
  version: 1,
  categories: [],
};

export async function listPoiCategoryProfiles(): Promise<PoiCategory[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.categories].sort(comparePoiCategories);
}

export async function replacePoiCategoryProfiles(categories: PoiCategory[]): Promise<PoiCategory[]> {
  const normalized = normalizeCategories(categories);
  await writeSnapshot({
    version: 1,
    categories: normalized,
  });
  return normalized;
}

function normalizeCategories(categories: PoiCategory[]): PoiCategory[] {
  const byId = new Map<string, PoiCategory>();
  for (const category of categories) {
    byId.set(category.id, {
      ...category,
      iconMapping: {
        categoryId: category.id,
        defaultIconFileName: category.iconMapping.defaultIconFileName,
        iconFileNames: Array.from(new Set(category.iconMapping.iconFileNames)),
      },
    });
  }

  return Array.from(byId.values()).sort(comparePoiCategories);
}

function comparePoiCategories(left: PoiCategory, right: PoiCategory): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN');
}

async function readSnapshot(): Promise<PoiCategoryProfileSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PoiCategoryProfileSnapshot;
    return {
      version: 1,
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PoiCategoryProfileSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.poiCategoryProfileStorePath)
    ? config.poiCategoryProfileStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.poiCategoryProfileStorePath);
}
