import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LdpassClientSessionResponse, YctUserLink } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface YctUserLinkSnapshot {
  version: 1;
  links: YctUserLink[];
}

const emptySnapshot: YctUserLinkSnapshot = {
  version: 1,
  links: [],
};

type ActiveLdpassUser = NonNullable<LdpassClientSessionResponse['user']>;

export async function listYctUserLinks(): Promise<YctUserLink[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.links].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function findYctUserLinkByLdpassUserId(
  ldpassUserId: string,
): Promise<YctUserLink | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.links.find((link) => link.ldpassUserId === ldpassUserId);
}

export async function upsertYctUserLinkFromLdpassUser(
  user: ActiveLdpassUser,
  loginAt = new Date().toISOString(),
): Promise<{ link: YctUserLink; created: boolean }> {
  const snapshot = await readSnapshot();
  const existing = snapshot.links.find((link) => link.ldpassUserId === user.id);

  if (existing) {
    const updated: YctUserLink = {
      ...existing,
      usernameSnapshot: user.username,
      emailSnapshot: normalizeOptionalString(user.email),
      serverAccountVerifiedSnapshot: user.serverAccountVerified,
      updatedAt: loginAt,
      lastLoginAt: loginAt,
    };
    await writeSnapshot({
      ...snapshot,
      links: snapshot.links.map((link) => (link.id === existing.id ? updated : link)),
    });
    return { link: updated, created: false };
  }

  const created: YctUserLink = {
    id: createYctUserLinkId(user.id),
    ldpassUserId: user.id,
    usernameSnapshot: user.username,
    emailSnapshot: normalizeOptionalString(user.email),
    serverAccountVerifiedSnapshot: user.serverAccountVerified,
    createdAt: loginAt,
    updatedAt: loginAt,
    lastLoginAt: loginAt,
  };

  await writeSnapshot({
    ...snapshot,
    links: [...snapshot.links, created],
  });
  return { link: created, created: true };
}

function createYctUserLinkId(ldpassUserId: string): string {
  return `yct_user_${ldpassUserId}`;
}

async function readSnapshot(): Promise<YctUserLinkSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as YctUserLinkSnapshot;
    return {
      version: 1,
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: YctUserLinkSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.yctUserLinkStorePath)
    ? config.yctUserLinkStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.yctUserLinkStorePath);
}

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
