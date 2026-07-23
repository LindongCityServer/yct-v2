import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface PoiCategoryIconMetadataRecord {
  fileName: string;
  displayName: string;
  updatedBy: string;
  updatedAt: string;
}

interface PoiCategoryIconMetadataSnapshot {
  version: 1;
  items: PoiCategoryIconMetadataRecord[];
}

const emptySnapshot: PoiCategoryIconMetadataSnapshot = { version: 1, items: [] };

export async function listPoiCategoryIconMetadata(): Promise<PoiCategoryIconMetadataRecord[]> {
  return (await readSnapshot()).items;
}

export async function upsertPoiCategoryIconMetadata(
  record: PoiCategoryIconMetadataRecord,
): Promise<PoiCategoryIconMetadataRecord> {
  const snapshot = await readSnapshot();
  const items = snapshot.items.filter((item) => item.fileName !== record.fileName);
  items.push(record);
  await writeSnapshot({
    version: 1,
    items: items.sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN')),
  });
  return record;
}

export async function deletePoiCategoryIconMetadata(fileName: string): Promise<void> {
  const snapshot = await readSnapshot();
  const items = snapshot.items.filter((item) => item.fileName !== fileName);
  if (items.length !== snapshot.items.length) {
    await writeSnapshot({ version: 1, items });
  }
}

export function normalizePoiCategoryIconMetadataKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300 || /[\u0000-\u001f]/.test(trimmed)) {
    return null;
  }

  const pathMatch = /\/api\/map\/poi-icons\/([^/?#]+)/.exec(trimmed);
  if (!pathMatch?.[1]) {
    return trimmed;
  }

  try {
    return decodeURIComponent(pathMatch[1]);
  } catch {
    return null;
  }
}

async function readSnapshot(): Promise<PoiCategoryIconMetadataSnapshot> {
  try {
    const parsed = JSON.parse(
      await readFile(resolveStorePath(), 'utf8'),
    ) as Partial<PoiCategoryIconMetadataSnapshot>;
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PoiCategoryIconMetadataSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const configuredPath = readRuntimeConfig().poiCategoryIconMetadataStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}
