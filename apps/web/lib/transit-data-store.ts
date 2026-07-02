import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TransitDataRevision, TransitDataRevisionStatus } from '@yct/contracts';
import type { LegacyTransitSnapshot } from './legacy-transit';
import { readRuntimeConfig } from './runtime-config';

interface TransitDataStoreSnapshot {
  version: 1;
  revisions: TransitDataRevision[];
}

const datasetId = 'default-transit';

const emptySnapshot: TransitDataStoreSnapshot = {
  version: 1,
  revisions: [],
};

export async function listTransitDataRevisions(): Promise<TransitDataRevision[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.revisions].sort((left, right) =>
    right.importedAt.localeCompare(left.importedAt),
  );
}

export async function findTransitDataRevision(
  revisionId: string,
): Promise<TransitDataRevision | undefined> {
  const revisions = await listTransitDataRevisions();
  return revisions.find((revision) => revision.revisionId === revisionId);
}

export async function findPublishedTransitDataRevision(): Promise<TransitDataRevision | undefined> {
  const revisions = await listTransitDataRevisions();
  return revisions.find((revision) => revision.status === 'published');
}

export async function createTransitDataRevision(input: {
  snapshot: LegacyTransitSnapshot;
  actorId: string;
  validation: TransitDataRevision['validation'];
}): Promise<TransitDataRevision> {
  const storeSnapshot = await readSnapshot();
  const now = new Date().toISOString();
  const revision: TransitDataRevision = {
    revisionId: `transit_revision_${randomUUID()}`,
    datasetId,
    profileId: 'default',
    status: input.validation.errorCount > 0 ? 'validation_failed' : 'imported',
    sourceProviderId: input.snapshot.sourceProviderId,
    sourcePath: input.snapshot.sourcePath,
    sourceFiles: input.snapshot.sourceFiles,
    summary: input.snapshot.summary,
    lines: input.snapshot.lines,
    stations: input.snapshot.stations,
    validation: input.validation,
    importedBy: input.actorId,
    importedAt: now,
  };

  await writeSnapshot({
    ...storeSnapshot,
    revisions: [revision, ...storeSnapshot.revisions],
  });
  return revision;
}

export async function updateTransitDataRevision(
  revisionId: string,
  updater: (revision: TransitDataRevision) => TransitDataRevision,
): Promise<TransitDataRevision | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.revisions.find((revision) => revision.revisionId === revisionId);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  await writeSnapshot({
    ...snapshot,
    revisions: snapshot.revisions.map((revision) =>
      revision.revisionId === revisionId ? updated : revision,
    ),
  });
  return updated;
}

export async function publishTransitDataRevisionAtomically(
  revisionId: string,
  updater: (revision: TransitDataRevision) => TransitDataRevision,
): Promise<TransitDataRevision | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.revisions.find((revision) => revision.revisionId === revisionId);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  const supersededAt = updated.publishedAt ?? new Date().toISOString();
  await writeSnapshot({
    ...snapshot,
    revisions: snapshot.revisions.map((revision) => {
      if (revision.revisionId === revisionId) {
        return updated;
      }

      if (revision.datasetId === updated.datasetId && revision.status === 'published') {
        return withTransitDataRevisionStatus(revision, 'superseded', { supersededAt });
      }

      return revision;
    }),
  });
  return updated;
}

export function withTransitDataRevisionStatus(
  revision: TransitDataRevision,
  status: TransitDataRevisionStatus,
  patch: Partial<TransitDataRevision> = {},
): TransitDataRevision {
  return {
    ...revision,
    ...patch,
    status,
  };
}

async function readSnapshot(): Promise<TransitDataStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TransitDataStoreSnapshot;
    return {
      version: 1,
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: TransitDataStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.transitDataStorePath)
    ? config.transitDataStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.transitDataStorePath);
}
