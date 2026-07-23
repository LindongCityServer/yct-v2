import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export type PlayerPresence = 'online' | 'offline';

export interface PlayerLocationRecord {
  playerKey: string;
  playerName: string;
  x: number;
  z: number;
  presence: PlayerPresence;
  firstSeenAt: string;
  observedAt: string;
  lastSeenAt: string;
  offlineSince?: string;
}

export interface PlayerLocationSnapshot {
  version: 1;
  sourceId: string;
  lastAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
  locations: PlayerLocationRecord[];
}

export interface PlayerLocationObservation {
  playerName: string;
  x: number;
  z: number;
}

export interface PlayerPresenceChange {
  current: PlayerLocationRecord;
  previousPresence: PlayerPresence | 'unknown';
}

export interface PlayerLocationMergeResult {
  snapshot: PlayerLocationSnapshot;
  changed: boolean;
  presenceChanges: PlayerPresenceChange[];
}

const sourceId = 'bdslm-player-markers';
const emptySnapshot: PlayerLocationSnapshot = {
  version: 1,
  sourceId,
  locations: [],
};

let mutationQueue: Promise<void> = Promise.resolve();

export async function readPlayerLocationSnapshot(): Promise<PlayerLocationSnapshot> {
  return readSnapshot();
}

export async function recordPlayerLocationAttempt(attemptedAt: string): Promise<void> {
  await enqueueMutation(async () => {
    const snapshot = await readSnapshot();
    await writeSnapshot({ ...snapshot, lastAttemptAt: attemptedAt });
  });
}

export async function mergePlayerLocationObservation(input: {
  observedAt: string;
  locations: PlayerLocationObservation[];
}): Promise<PlayerLocationMergeResult> {
  let result: PlayerLocationMergeResult | undefined;

  await enqueueMutation(async () => {
    const snapshot = await readSnapshot();
    const previousByKey = new Map(
      snapshot.locations.map((location) => [location.playerKey, location]),
    );
    const observedByKey = new Map(
      input.locations.map((location) => [normalizePlayerKey(location.playerName), location]),
    );
    const presenceChanges: PlayerPresenceChange[] = [];
    let changed = false;
    const nextLocations: PlayerLocationRecord[] = [];

    for (const [playerKey, observed] of observedByKey) {
      const previous = previousByKey.get(playerKey);
      const current: PlayerLocationRecord = {
        playerKey,
        playerName: observed.playerName.trim(),
        x: observed.x,
        z: observed.z,
        presence: 'online',
        firstSeenAt: previous?.firstSeenAt ?? input.observedAt,
        observedAt: input.observedAt,
        lastSeenAt: input.observedAt,
      };
      if (
        !previous ||
        previous.presence !== 'online' ||
        previous.playerName !== current.playerName ||
        previous.x !== current.x ||
        previous.z !== current.z
      ) {
        changed = true;
      }
      if (!previous || previous.presence !== 'online') {
        presenceChanges.push({
          current,
          previousPresence: previous?.presence ?? 'unknown',
        });
      }
      nextLocations.push(current);
    }

    for (const previous of snapshot.locations) {
      if (observedByKey.has(previous.playerKey)) {
        continue;
      }
      const current: PlayerLocationRecord =
        previous.presence === 'offline'
          ? previous
          : {
              ...previous,
              presence: 'offline',
              observedAt: input.observedAt,
              offlineSince: input.observedAt,
            };
      if (previous.presence !== 'offline') {
        changed = true;
        presenceChanges.push({ current, previousPresence: previous.presence });
      }
      nextLocations.push(current);
    }

    const nextSnapshot: PlayerLocationSnapshot = {
      version: 1,
      sourceId,
      lastAttemptAt: input.observedAt,
      lastSuccessfulSyncAt: input.observedAt,
      locations: nextLocations.sort((left, right) => left.playerKey.localeCompare(right.playerKey)),
    };
    await writeSnapshot(nextSnapshot);
    result = { snapshot: nextSnapshot, changed, presenceChanges };
  });

  if (!result) {
    throw new Error('玩家位置快照合并未完成。');
  }
  return result;
}

export function normalizePlayerKey(playerName: string): string {
  return playerName.trim().toLocaleLowerCase();
}

async function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const current = mutationQueue.then(mutation, mutation);
  mutationQueue = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

async function readSnapshot(): Promise<PlayerLocationSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as PlayerLocationSnapshot;
    return {
      version: 1,
      sourceId,
      lastAttemptAt: normalizeOptionalText(parsed.lastAttemptAt),
      lastSuccessfulSyncAt: normalizeOptionalText(parsed.lastSuccessfulSyncAt),
      locations: Array.isArray(parsed.locations)
        ? parsed.locations.filter(isPlayerLocationRecord)
        : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PlayerLocationSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, storePath);
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.playerLocationStorePath)
    ? config.playerLocationStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.playerLocationStorePath);
}

function isPlayerLocationRecord(value: PlayerLocationRecord): boolean {
  return Boolean(
    value &&
    typeof value.playerKey === 'string' &&
    typeof value.playerName === 'string' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z) &&
    (value.presence === 'online' || value.presence === 'offline') &&
    typeof value.firstSeenAt === 'string' &&
    typeof value.observedAt === 'string' &&
    typeof value.lastSeenAt === 'string',
  );
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
