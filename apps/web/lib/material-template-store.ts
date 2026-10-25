import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialTemplateRecord, MaterialTemplateVersion } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';
import { systemMaterialTemplateRecords } from './system-material-templates';

interface MaterialTemplateStoreSnapshot {
  version: 1;
  records: MaterialTemplateRecord[];
}

const emptySnapshot: MaterialTemplateStoreSnapshot = { version: 1, records: [] };
const retiredSystemTemplateIds = new Set([
  'system_material_road_sign',
  'system_material_address_sign',
  'system_material_bus_stop',
]);

export async function listMaterialTemplateRecords(): Promise<MaterialTemplateRecord[]> {
  const snapshot = await readSnapshot();
  const snapshotById = new Map(snapshot.records.map((record) => [record.id, record]));
  const systemIds = new Set(systemMaterialTemplateRecords.map((record) => record.id));
  return [
    ...systemMaterialTemplateRecords.map((record) =>
      pickSystemTemplateRecord(record, snapshotById.get(record.id)),
    ),
    ...snapshot.records.filter((record) => !systemIds.has(record.id)),
  ]
    .filter((record) => !retiredSystemTemplateIds.has(record.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * 代码内置模板改版后需要覆盖运行时快照：
 * 优先比较已发布版本号，版本号相同或更低时再比较内容；内容不同就用代码种子，
 * 并把版本号接在快照之后，避免历史版本号回退。
 */
function pickSystemTemplateRecord(
  seedRecord: MaterialTemplateRecord,
  snapshotRecord: MaterialTemplateRecord | undefined,
): MaterialTemplateRecord {
  if (!snapshotRecord) {
    return seedRecord;
  }
  const seedVersion = findPublishedMaterialTemplateVersion(seedRecord);
  const snapshotVersion = findPublishedMaterialTemplateVersion(snapshotRecord);
  if (!seedVersion || !snapshotVersion) {
    return snapshotRecord;
  }
  if (seedVersion.version > snapshotVersion.version) {
    return seedRecord;
  }
  if (isSameTemplateVersionContent(seedVersion, snapshotVersion)) {
    return snapshotRecord;
  }
  return {
    ...seedRecord,
    versions: seedRecord.versions.map((version) =>
      version.status === 'published'
        ? { ...version, version: snapshotVersion.version + 1 }
        : version,
    ),
  };
}

function isSameTemplateVersionContent(
  left: MaterialTemplateVersion,
  right: MaterialTemplateVersion,
): boolean {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.family === right.family &&
    left.source === right.source &&
    JSON.stringify(left.fields) === JSON.stringify(right.fields) &&
    JSON.stringify(left.defaultCanvas) === JSON.stringify(right.defaultCanvas)
  );
}

export async function findMaterialTemplateRecord(
  templateId: string,
): Promise<MaterialTemplateRecord | undefined> {
  return (await listMaterialTemplateRecords()).find((record) => record.id === templateId);
}

export async function writeMaterialTemplateRecord(record: MaterialTemplateRecord): Promise<void> {
  const snapshot = await readSnapshot();
  const nextRecords = [...snapshot.records.filter((item) => item.id !== record.id), record];
  await writeSnapshot({ version: 1, records: nextRecords });
}

export function createMaterialTemplateRecord(input: {
  title: string;
  description?: string;
  family: MaterialTemplateVersion['family'];
  source: string;
  fields: MaterialTemplateVersion['fields'];
  typographyProfile?: MaterialTemplateVersion['typographyProfile'];
  defaultCanvas: MaterialTemplateVersion['defaultCanvas'];
  actorId: string;
}): MaterialTemplateRecord {
  const now = new Date().toISOString();
  return {
    id: `material_template_${randomUUID()}`,
    versions: [
      {
        version: 1,
        status: 'draft',
        title: input.title,
        description: input.description,
        family: input.family,
        source: input.source,
        fields: input.fields,
        typographyProfile: input.typographyProfile,
        defaultCanvas: input.defaultCanvas,
        createdBy: input.actorId,
        createdAt: now,
      },
    ],
  };
}

export function findMaterialTemplateVersion(
  record: MaterialTemplateRecord,
  version: number,
): MaterialTemplateVersion | undefined {
  return record.versions.find((item) => item.version === version);
}

export function findPublishedMaterialTemplateVersion(
  record: MaterialTemplateRecord,
): MaterialTemplateVersion | undefined {
  return record.versions
    .filter((item) => item.status === 'published')
    .sort((left, right) => right.version - left.version)[0];
}

async function readSnapshot(): Promise<MaterialTemplateStoreSnapshot> {
  const storePath = resolveStorePath();
  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as MaterialTemplateStoreSnapshot;
    return { version: 1, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialTemplateStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.materialTemplateStorePath)
    ? config.materialTemplateStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.materialTemplateStorePath);
}
