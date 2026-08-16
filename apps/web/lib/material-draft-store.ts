import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialDraft } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface MaterialDraftStoreSnapshot {
  version: 1;
  drafts: MaterialDraft[];
}

const emptySnapshot: MaterialDraftStoreSnapshot = { version: 1, drafts: [] };

export async function listMaterialDrafts(): Promise<MaterialDraft[]> {
  return (await readSnapshot()).drafts.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export async function findMaterialDraft(draftId: string): Promise<MaterialDraft | undefined> {
  return (await readSnapshot()).drafts.find((draft) => draft.id === draftId);
}

export async function findMaterialDraftByClientDraftId(
  actorId: string,
  clientDraftId: string,
): Promise<MaterialDraft | undefined> {
  return (await readSnapshot()).drafts.find(
    (draft) => draft.createdBy === actorId && draft.clientDraftId === clientDraftId,
  );
}

export async function writeMaterialDraft(draft: MaterialDraft): Promise<void> {
  const snapshot = await readSnapshot();
  await writeSnapshot({
    version: 1,
    drafts: [...snapshot.drafts.filter((item) => item.id !== draft.id), draft],
  });
}

async function readSnapshot(): Promise<MaterialDraftStoreSnapshot> {
  const storePath = resolveStorePath();
  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as MaterialDraftStoreSnapshot;
    return { version: 1, drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialDraftStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.materialDraftStorePath)
    ? config.materialDraftStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.materialDraftStorePath);
}
