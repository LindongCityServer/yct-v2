import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export type PlayerPresence = 'online' | 'offline';
export type PlayerLocationSourceStatus = 'ready' | 'not_configured' | 'unavailable';

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
  /** 每次写入递增，便于排查多实例并发写入与丢失更新。 */
  revision: number;
  sourceId: string;
  lastAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
  sourceStatus?: PlayerLocationSourceStatus;
  latencyMs?: number;
  unavailableReason?: 'map_unavailable' | 'external_offline';
  externalOfflineConfirmedAt?: string;
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
  previousSourceStatus?: PlayerLocationSourceStatus;
}

export interface PlayerLocationAttemptResult extends PlayerLocationMergeResult {}

const sourceId = 'bdslm-player-markers';
const emptySnapshot: PlayerLocationSnapshot = {
  version: 1,
  revision: 0,
  sourceId,
  locations: [],
};

let mutationQueue: Promise<void> = Promise.resolve();

export async function readPlayerLocationSnapshot(): Promise<PlayerLocationSnapshot> {
  return readSnapshot();
}

export async function recordPlayerLocationAttempt(input: {
  attemptedAt: string;
  sourceStatus: PlayerLocationSourceStatus;
  latencyMs?: number;
  unavailableReason?: PlayerLocationSnapshot['unavailableReason'];
  externalOfflineConfirmedAt?: string;
  /** 地图探测失败时只更新元数据，不改写玩家在线状态。 */
  preservePresence?: boolean;
}): Promise<PlayerLocationAttemptResult> {
  return enqueueMutation(() =>
    withStoreLock(async () => {
      const snapshot = await readSnapshot();
      const presenceChanges: PlayerPresenceChange[] = [];
      const locations = snapshot.locations.map((previous) => {
        if (
          input.preservePresence ||
          input.sourceStatus !== 'unavailable' ||
          previous.presence === 'offline'
        ) {
          return previous;
        }
        const current: PlayerLocationRecord = {
          ...previous,
          presence: 'offline',
          observedAt: input.attemptedAt,
          offlineSince: input.attemptedAt,
        };
        presenceChanges.push({ current, previousPresence: previous.presence });
        return current;
      });
      const nextSnapshot: PlayerLocationSnapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        locations,
        externalOfflineConfirmedAt:
          input.externalOfflineConfirmedAt ?? snapshot.externalOfflineConfirmedAt,
        // A map outage must not erase an unresolved external-offline observation.
        // A later successful merge clears it after recovery or its hold timeout.
        unavailableReason:
          snapshot.unavailableReason === 'external_offline'
            ? 'external_offline'
            : input.unavailableReason,
        lastAttemptAt: input.attemptedAt,
        sourceStatus: input.sourceStatus,
        latencyMs: input.latencyMs,
      };
      await writeSnapshot(nextSnapshot);
      return {
        snapshot: nextSnapshot,
        previousSourceStatus: snapshot.sourceStatus,
        changed: presenceChanges.length > 0,
        presenceChanges,
      };
    }),
  );
}

export async function mergePlayerLocationObservation(input: {
  observedAt: string;
  latencyMs: number;
  locations: PlayerLocationObservation[];
}): Promise<PlayerLocationMergeResult> {
  let result: PlayerLocationMergeResult | undefined;

  await enqueueMutation(() =>
    withStoreLock(async () => {
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
        revision: snapshot.revision + 1,
        sourceId,
        lastAttemptAt: input.observedAt,
        lastSuccessfulSyncAt: input.observedAt,
        sourceStatus: 'ready',
        latencyMs: input.latencyMs,
        locations: nextLocations.sort((left, right) =>
          left.playerKey.localeCompare(right.playerKey),
        ),
      };
      await writeSnapshot(nextSnapshot);
      result = {
        snapshot: nextSnapshot,
        changed,
        presenceChanges,
        previousSourceStatus: snapshot.sourceStatus,
      };
    }),
  );

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

// 多实例可能同时读改写同一个 JSON 文件；用跨进程排他的锁文件包住整段读改写，
// 这是当前文件存储形态下最轻量的原子化方案（同机多进程有效，进程崩溃后靠陈旧锁超时恢复）。
const lockRetryMs = 25;
const lockTimeoutMs = 2_000;
const lockStaleMs = 10_000;

async function withStoreLock<T>(mutation: () => Promise<T>): Promise<T> {
  const storePath = resolveStorePath();
  const lockPath = `${storePath}.lock`;
  await mkdir(path.dirname(storePath), { recursive: true });
  const deadline = Date.now() + lockTimeoutMs;
  while (true) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, 'wx');
      return await mutation();
    } catch (error) {
      if (!isLockConflictError(error)) throw error;
      await clearStaleLock(lockPath);
      if (Date.now() >= deadline) {
        throw new Error(`玩家位置快照写入被其他实例占用超过 ${lockTimeoutMs}ms。`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, lockRetryMs));
    } finally {
      if (handle) {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
      }
    }
  }
}

function isLockConflictError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EEXIST',
  );
}

async function clearStaleLock(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > lockStaleMs) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // 锁已释放或暂时不可读，交给下一轮重试。
  }
}

async function readSnapshot(): Promise<PlayerLocationSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as PlayerLocationSnapshot;
    return {
      version: 1,
      revision: normalizeRevision(parsed.revision),
      sourceId,
      lastAttemptAt: normalizeOptionalText(parsed.lastAttemptAt),
      lastSuccessfulSyncAt: normalizeOptionalText(parsed.lastSuccessfulSyncAt),
      sourceStatus: normalizeSourceStatus(parsed.sourceStatus),
      latencyMs: normalizeLatency(parsed.latencyMs),
      externalOfflineConfirmedAt:
        normalizeOptionalText(parsed.externalOfflineConfirmedAt) ??
        (parsed.unavailableReason === 'external_offline'
          ? normalizeOptionalText(parsed.lastAttemptAt)
          : undefined),
      unavailableReason:
        parsed.unavailableReason === 'map_unavailable' ||
        parsed.unavailableReason === 'external_offline'
          ? parsed.unavailableReason
          : undefined,
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
  const directory = path.dirname(storePath);
  const content = `${JSON.stringify(snapshot, null, 2)}\n`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, storePath);
      return;
    } catch (error) {
      if (!isMissingPathError(error) || attempt === 2) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT',
  );
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

function normalizeSourceStatus(
  value: PlayerLocationSourceStatus | undefined,
): PlayerLocationSourceStatus | undefined {
  return value === 'ready' || value === 'not_configured' || value === 'unavailable'
    ? value
    : undefined;
}

function normalizeLatency(value: number | undefined): number | undefined {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.round(Number(value)) : undefined;
}

function normalizeRevision(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
}
