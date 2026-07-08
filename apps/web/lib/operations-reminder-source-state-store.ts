import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface OperationsReminderSourceState {
  sourceKey: string;
  signature?: string;
  candidateCount: number;
  sourceStatus: 'ready' | 'not_configured' | 'unavailable';
  message?: string;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastRefreshRequestedAt?: string;
}

interface OperationsReminderSourceStateSnapshot {
  version: 1;
  sources: OperationsReminderSourceState[];
}

const emptySnapshot: OperationsReminderSourceStateSnapshot = {
  version: 1,
  sources: [],
};

export async function readOperationsReminderSourceState(
  sourceKey: string,
): Promise<OperationsReminderSourceState | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.sources.find((item) => item.sourceKey === sourceKey);
}

export async function listOperationsReminderSourceStates(): Promise<OperationsReminderSourceState[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.sources].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

export async function upsertOperationsReminderSourceState(
  state: OperationsReminderSourceState,
): Promise<OperationsReminderSourceState> {
  const snapshot = await readSnapshot();
  const existing = snapshot.sources.find((item) => item.sourceKey === state.sourceKey);
  const next = normalizeState(state);

  await writeSnapshot({
    ...snapshot,
    sources: existing
      ? snapshot.sources.map((item) => (item.sourceKey === state.sourceKey ? next : item))
      : [...snapshot.sources, next],
  });

  return next;
}

async function readSnapshot(): Promise<OperationsReminderSourceStateSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as OperationsReminderSourceStateSnapshot;
    return {
      version: 1,
      sources: Array.isArray(parsed.sources) ? parsed.sources.map(normalizeState) : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: OperationsReminderSourceStateSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizeState(state: OperationsReminderSourceState): OperationsReminderSourceState {
  return {
    sourceKey: state.sourceKey.trim(),
    signature: normalizeOptionalText(state.signature),
    candidateCount: Number.isFinite(state.candidateCount) ? Math.max(0, Math.trunc(state.candidateCount)) : 0,
    sourceStatus: state.sourceStatus,
    message: normalizeOptionalText(state.message),
    lastCheckedAt: normalizeOptionalText(state.lastCheckedAt),
    lastChangedAt: normalizeOptionalText(state.lastChangedAt),
    lastRefreshRequestedAt: normalizeOptionalText(state.lastRefreshRequestedAt),
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.operationsReminderSourceStateStorePath)
    ? config.operationsReminderSourceStateStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.operationsReminderSourceStateStorePath);
}
