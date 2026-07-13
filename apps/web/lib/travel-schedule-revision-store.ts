import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  TravelScheduleQueryResult,
  TravelScheduleRevision,
  TravelScheduleRevisionStatus,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface TravelScheduleRevisionStoreSnapshot {
  version: 1;
  revisions: TravelScheduleRevision[];
}

const scheduleServiceId = 'default-travel-schedules';

const emptySnapshot: TravelScheduleRevisionStoreSnapshot = {
  version: 1,
  revisions: [],
};

export async function listTravelScheduleRevisions(): Promise<TravelScheduleRevision[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.revisions].sort((left, right) =>
    right.importedAt.localeCompare(left.importedAt),
  );
}

export async function findTravelScheduleRevision(
  revisionId: string,
): Promise<TravelScheduleRevision | undefined> {
  const revisions = await listTravelScheduleRevisions();
  return revisions.find((revision) => revision.revisionId === revisionId);
}

export async function findPublishedTravelScheduleRevision(): Promise<
  TravelScheduleRevision | undefined
> {
  const revisions = await listTravelScheduleRevisions();
  return revisions.find((revision) => revision.status === 'published');
}

export async function createTravelScheduleRevision(input: {
  actorId: string;
  sourceProviderId: string;
  snapshot: TravelScheduleQueryResult;
  validation: TravelScheduleRevision['validation'];
}): Promise<TravelScheduleRevision> {
  const storeSnapshot = await readSnapshot();
  const now = new Date().toISOString();
  const revision: TravelScheduleRevision = {
    revisionId: `travel_schedule_revision_${randomUUID()}`,
    scheduleServiceId,
    profileId: 'default',
    status: input.validation.errorCount > 0 ? 'validation_failed' : 'imported',
    sourceProviderId: input.sourceProviderId,
    sourceFiles: input.snapshot.sourceFiles,
    services: input.snapshot.services,
    trips: input.snapshot.trips,
    serviceNotices: input.snapshot.serviceNotices,
    stationOptions: input.snapshot.stationOptions,
    notice: input.snapshot.notice,
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

export async function updateTravelScheduleRevision(
  revisionId: string,
  updater: (revision: TravelScheduleRevision) => TravelScheduleRevision,
): Promise<TravelScheduleRevision | undefined> {
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

export async function publishTravelScheduleRevisionAtomically(
  revisionId: string,
  updater: (revision: TravelScheduleRevision) => TravelScheduleRevision,
): Promise<TravelScheduleRevision | undefined> {
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

      if (
        revision.scheduleServiceId === updated.scheduleServiceId &&
        revision.status === 'published'
      ) {
        return withTravelScheduleRevisionStatus(revision, 'superseded', { supersededAt });
      }

      return revision;
    }),
  });
  return updated;
}

export function withTravelScheduleRevisionStatus(
  revision: TravelScheduleRevision,
  status: TravelScheduleRevisionStatus,
  patch: Partial<TravelScheduleRevision> = {},
): TravelScheduleRevision {
  return {
    ...revision,
    ...patch,
    status,
  };
}

async function readSnapshot(): Promise<TravelScheduleRevisionStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TravelScheduleRevisionStoreSnapshot;
    return {
      version: 1,
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: TravelScheduleRevisionStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.travelScheduleRevisionStorePath)
    ? config.travelScheduleRevisionStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.travelScheduleRevisionStorePath);
}
