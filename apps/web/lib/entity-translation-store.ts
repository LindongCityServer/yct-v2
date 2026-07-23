import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EntityTranslationRecord,
  LocalizedLabelMap,
  TranslatableEntityKind,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface EntityTranslationStoreSnapshot {
  version: 1;
  items: EntityTranslationRecord[];
}

const emptySnapshot: EntityTranslationStoreSnapshot = { version: 1, items: [] };

export async function listEntityTranslations(): Promise<EntityTranslationRecord[]> {
  return (await readSnapshot()).items;
}

export async function findEntityTranslation(
  entityKind: TranslatableEntityKind,
  entityId: string,
): Promise<EntityTranslationRecord | undefined> {
  return (await readSnapshot()).items.find(
    (item) => item.entityKind === entityKind && item.entityId === entityId,
  );
}

export async function upsertEntityTranslation(input: {
  entityKind: TranslatableEntityKind;
  entityId: string;
  sourceText: string;
  localizedLabels: LocalizedLabelMap;
  actorId: string;
}): Promise<EntityTranslationRecord> {
  const snapshot = await readSnapshot();
  const updatedAt = new Date().toISOString();
  const record: EntityTranslationRecord = {
    entityKind: input.entityKind,
    entityId: input.entityId,
    sourceText: input.sourceText,
    localizedLabels: normalizeLocalizedLabels(input.localizedLabels),
    updatedBy: input.actorId,
    updatedAt,
  };
  const nextItems = snapshot.items.filter(
    (item) => item.entityKind !== input.entityKind || item.entityId !== input.entityId,
  );
  if (Object.keys(record.localizedLabels).length > 0) {
    nextItems.push(record);
  }
  await writeSnapshot({
    version: 1,
    items: nextItems.sort(compareTranslations),
  });
  return record;
}

export function buildEntityTranslationMap(
  items: EntityTranslationRecord[],
): Map<string, LocalizedLabelMap> {
  return new Map(
    items.map((item) => [
      entityTranslationKey(item.entityKind, item.entityId),
      item.localizedLabels,
    ]),
  );
}

export function entityTranslationKey(kind: TranslatableEntityKind, id: string): string {
  return `${kind}\u0000${id}`;
}

function normalizeLocalizedLabels(labels: LocalizedLabelMap): LocalizedLabelMap {
  const traditional = labels['zh-Hant']?.trim();
  const english = labels.en?.trim();
  return {
    ...(traditional ? { 'zh-Hant': traditional } : {}),
    ...(english ? { en: english } : {}),
  };
}

function compareTranslations(
  left: EntityTranslationRecord,
  right: EntityTranslationRecord,
): number {
  return (
    left.entityKind.localeCompare(right.entityKind) ||
    left.sourceText.localeCompare(right.sourceText, 'zh-CN') ||
    left.entityId.localeCompare(right.entityId)
  );
}

async function readSnapshot(): Promise<EntityTranslationStoreSnapshot> {
  try {
    const parsed = JSON.parse(
      await readFile(resolveStorePath(), 'utf8'),
    ) as Partial<EntityTranslationStoreSnapshot>;
    return { version: 1, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: EntityTranslationStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const configured = readRuntimeConfig().entityTranslationStorePath;
  return path.isAbsolute(configured)
    ? configured
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
