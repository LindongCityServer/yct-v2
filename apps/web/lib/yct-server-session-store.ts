import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LdpassClientSessionResponse, YctAccountSessionSnapshot } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';
import { yctSessionMaxAgeSeconds } from './yct-session';

export interface StoredYctServerSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  ldpassSession: LdpassClientSessionResponse;
  snapshot: YctAccountSessionSnapshot;
}

interface YctServerSessionStoreSnapshot {
  version: 1;
  sessions: StoredYctServerSession[];
}

const emptySnapshot: YctServerSessionStoreSnapshot = {
  version: 1,
  sessions: [],
};

let mutationQueue: Promise<void> = Promise.resolve();

export async function createYctServerSession(input: {
  ldpassSession: LdpassClientSessionResponse;
  snapshot: YctAccountSessionSnapshot;
}): Promise<StoredYctServerSession> {
  return mutateStore((store, now) => {
    const createdAt = now.toISOString();
    const session: StoredYctServerSession = {
      id: randomBytes(32).toString('base64url'),
      createdAt,
      expiresAt: new Date(now.getTime() + yctSessionMaxAgeSeconds * 1000).toISOString(),
      ldpassSession: input.ldpassSession,
      snapshot: input.snapshot,
    };
    return {
      result: session,
      snapshot: {
        version: 1,
        sessions: [...store.sessions.filter((item) => !isExpired(item, now)), session],
      },
    };
  });
}

export async function readYctServerSession(
  sessionId: string | undefined,
): Promise<StoredYctServerSession | undefined> {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) {
    return undefined;
  }

  const now = new Date();
  const snapshot = await readStoreSnapshot();
  const session = snapshot.sessions.find((item) => item.id === normalizedSessionId);
  return session && !isExpired(session, now) ? session : undefined;
}

export async function deleteYctServerSession(sessionId: string | undefined): Promise<void> {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) {
    return;
  }

  await mutateStore((store, now) => ({
    result: undefined,
    snapshot: {
      version: 1,
      sessions: store.sessions.filter(
        (item) => item.id !== normalizedSessionId && !isExpired(item, now),
      ),
    },
  }));
}

async function mutateStore<TResult>(
  mutation: (
    snapshot: YctServerSessionStoreSnapshot,
    now: Date,
  ) => { result: TResult; snapshot: YctServerSessionStoreSnapshot },
): Promise<TResult> {
  const operation = mutationQueue.then(async () => {
    const current = await readStoreSnapshot();
    const next = mutation(current, new Date());
    await writeStoreSnapshot(next.snapshot);
    return next.result;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function readStoreSnapshot(): Promise<YctServerSessionStoreSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<YctServerSessionStoreSnapshot>;
    return {
      version: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeStoreSnapshot(snapshot: YctServerSessionStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const configuredPath = readRuntimeConfig().yctSessionStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}

function isExpired(session: StoredYctServerSession, now: Date): boolean {
  const expiresAt = Date.parse(session.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}
