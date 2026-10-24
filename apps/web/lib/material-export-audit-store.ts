import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialExportAuditRecord } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface MaterialExportAuditStoreSnapshot {
  version: 1;
  records: MaterialExportAuditRecord[];
}

const emptySnapshot: MaterialExportAuditStoreSnapshot = { version: 1, records: [] };
/** 预览出图很频繁，只保留最近一段记录，避免 JSON 仓储无限增长。 */
const maximumAuditRecordCount = 1000;

export async function listMaterialExportAuditRecords(): Promise<MaterialExportAuditRecord[]> {
  return (await readSnapshot()).records.sort((left, right) =>
    right.requestedAt.localeCompare(left.requestedAt),
  );
}

export async function appendMaterialExportAuditRecord(
  record: MaterialExportAuditRecord,
): Promise<void> {
  const snapshot = await readSnapshot();
  await writeSnapshot({
    version: 1,
    records: [...snapshot.records, record].slice(-maximumAuditRecordCount),
  });
}

async function readSnapshot(): Promise<MaterialExportAuditStoreSnapshot> {
  const storePath = resolveStorePath();
  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as MaterialExportAuditStoreSnapshot;
    return { version: 1, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialExportAuditStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.materialExportAuditStorePath)
    ? config.materialExportAuditStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.materialExportAuditStorePath);
}
