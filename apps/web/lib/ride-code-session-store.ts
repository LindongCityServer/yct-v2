import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RideCodeSession, RideCodeSessionStatus } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface RideCodeSessionSnapshot {
  version: 1;
  sessions: RideCodeSession[];
}

const emptySnapshot: RideCodeSessionSnapshot = {
  version: 1,
  sessions: [],
};

const activeSessionStatuses = new Set<RideCodeSessionStatus>([
  'link_pending',
  'awaiting_authorization',
  'authorized',
  'entered',
]);

export async function createRideCodeSession(input: {
  id: string;
  ldpassUserId: string;
  playerName: string;
  maximumFareValue: string;
  createdAt: string;
}): Promise<RideCodeSession> {
  const snapshot = await readSnapshot();
  const session: RideCodeSession = {
    id: input.id,
    ldpassUserId: input.ldpassUserId,
    playerName: input.playerName,
    status: 'link_pending',
    maximumFareValue: input.maximumFareValue,
    processedDeviceEventIds: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  await writeSnapshot({
    ...snapshot,
    sessions: [...snapshot.sessions, session],
  });
  return session;
}

export async function findRideCodeSessionById(
  sessionId: string,
): Promise<RideCodeSession | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.sessions.find((session) => session.id === sessionId);
}

export async function findRideCodeSessionByDeviceEventId(
  deviceEventId: string,
): Promise<RideCodeSession | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.sessions.find((session) =>
    session.processedDeviceEventIds.includes(deviceEventId),
  );
}

export async function findActiveRideCodeSessionByPlayerName(
  playerName: string,
): Promise<RideCodeSession | undefined> {
  const normalizedPlayerName = normalizePlayerName(playerName);
  const snapshot = await readSnapshot();
  return snapshot.sessions
    .filter(
      (session) =>
        activeSessionStatuses.has(session.status) &&
        normalizePlayerName(session.playerName) === normalizedPlayerName,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export async function updateRideCodeSession(
  sessionId: string,
  updater: (session: RideCodeSession) => RideCodeSession,
): Promise<RideCodeSession | undefined> {
  const snapshot = await readSnapshot();
  const current = snapshot.sessions.find((session) => session.id === sessionId);
  if (!current) {
    return undefined;
  }

  const updated = updater(current);
  await writeSnapshot({
    ...snapshot,
    sessions: snapshot.sessions.map((session) => (session.id === sessionId ? updated : session)),
  });
  return updated;
}

export function isRideCodeSessionActive(session: RideCodeSession): boolean {
  return activeSessionStatuses.has(session.status);
}

export function normalizePlayerName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

async function readSnapshot(): Promise<RideCodeSessionSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as RideCodeSessionSnapshot;
    return {
      version: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: RideCodeSessionSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.rideCodeSessionStorePath)
    ? config.rideCodeSessionStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.rideCodeSessionStorePath);
}
