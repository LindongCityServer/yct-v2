import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { YctEvent } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export type EventOutboxStatus = 'queued' | 'dispatched' | 'failed';

export interface EventOutboxRecord {
  eventId: string;
  type: YctEvent['type'];
  event: YctEvent;
  status: EventOutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  failedAt?: string;
  lastErrorMessage?: string;
}

interface EventOutboxSnapshot {
  version: 1;
  records: EventOutboxRecord[];
}

const emptySnapshot: EventOutboxSnapshot = {
  version: 1,
  records: [],
};

export async function queueOutboxEvent(event: YctEvent): Promise<EventOutboxRecord> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const existing = snapshot.records.find((record) => record.eventId === event.eventId);
  if (existing) {
    return existing;
  }

  const record: EventOutboxRecord = {
    eventId: event.eventId,
    type: event.type,
    event,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  await writeSnapshot({
    version: 1,
    records: [...snapshot.records, record],
  });
  return record;
}

export async function listPendingOutboxEvents(limit = 50): Promise<EventOutboxRecord[]> {
  const snapshot = await readSnapshot();
  return snapshot.records
    .filter((record) => record.status === 'queued' || record.status === 'failed')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, limit);
}

export async function markOutboxEventDispatched(
  eventId: string,
): Promise<EventOutboxRecord | null> {
  const dispatchedAt = new Date().toISOString();
  return updateOutboxRecord(eventId, (record) => ({
    ...record,
    status: 'dispatched',
    attempts: record.attempts + 1,
    updatedAt: dispatchedAt,
    dispatchedAt,
    failedAt: undefined,
    lastErrorMessage: undefined,
  }));
}

export async function markOutboxEventFailed(input: {
  eventId: string;
  errorMessage: string;
}): Promise<EventOutboxRecord | null> {
  const failedAt = new Date().toISOString();
  return updateOutboxRecord(input.eventId, (record) => ({
    ...record,
    status: 'failed',
    attempts: record.attempts + 1,
    updatedAt: failedAt,
    failedAt,
    lastErrorMessage: input.errorMessage,
  }));
}

async function updateOutboxRecord(
  eventId: string,
  updater: (record: EventOutboxRecord) => EventOutboxRecord,
): Promise<EventOutboxRecord | null> {
  const snapshot = await readSnapshot();
  const existing = snapshot.records.find((record) => record.eventId === eventId);
  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await writeSnapshot({
    version: 1,
    records: snapshot.records.map((record) => (record.eventId === eventId ? updated : record)),
  });
  return updated;
}

async function readSnapshot(): Promise<EventOutboxSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as EventOutboxSnapshot;
    return {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: EventOutboxSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.eventOutboxStorePath)
    ? config.eventOutboxStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.eventOutboxStorePath);
}
