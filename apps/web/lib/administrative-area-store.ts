import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AdministrativeArea } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface AdministrativeAreaStoreSnapshot {
  version: 1;
  areas: AdministrativeArea[];
}

const emptySnapshot: AdministrativeAreaStoreSnapshot = { version: 1, areas: [] };

export async function listAdministrativeAreas(): Promise<AdministrativeArea[]> {
  return [...(await readSnapshot()).areas].sort(compareAreas);
}

export async function listPublishedAdministrativeAreas(): Promise<AdministrativeArea[]> {
  return (await listAdministrativeAreas()).filter((area) => area.status === 'published');
}

export async function findAdministrativeArea(id: string): Promise<AdministrativeArea | undefined> {
  return (await readSnapshot()).areas.find((area) => area.id === id);
}

export async function saveAdministrativeArea(area: AdministrativeArea): Promise<void> {
  const snapshot = await readSnapshot();
  await writeSnapshot({
    version: 1,
    areas: [...snapshot.areas.filter((item) => item.id !== area.id), area].sort(compareAreas),
  });
}

async function readSnapshot(): Promise<AdministrativeAreaStoreSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<AdministrativeAreaStoreSnapshot>;
    return { version: 1, areas: Array.isArray(parsed.areas) ? parsed.areas : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: AdministrativeAreaStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const configured = readRuntimeConfig().administrativeAreaStorePath;
  return path.isAbsolute(configured)
    ? configured
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function compareAreas(left: AdministrativeArea, right: AdministrativeArea): number {
  return left.level.localeCompare(right.level) || left.code.localeCompare(right.code, 'zh-CN');
}
