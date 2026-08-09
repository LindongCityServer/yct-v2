import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MapShareLink } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface StoredMapShareLink extends MapShareLink {
  fingerprint: string;
}

interface MapShareLinkStoreSnapshot {
  version: 1;
  links: StoredMapShareLink[];
}

const emptySnapshot: MapShareLinkStoreSnapshot = { version: 1, links: [] };
let writeQueue = Promise.resolve();

export async function findMapShareLinkById(id: string): Promise<MapShareLink | undefined> {
  const snapshot = await readSnapshot();
  const link = snapshot.links.find((item) => item.id === id);
  return link ? toPublicLink(link) : undefined;
}

export async function findMapShareLinkByFingerprint(
  fingerprint: string,
): Promise<MapShareLink | undefined> {
  const snapshot = await readSnapshot();
  const link = snapshot.links.find((item) => item.fingerprint === fingerprint);
  return link ? toPublicLink(link) : undefined;
}

export async function saveMapShareLink(
  link: MapShareLink,
  fingerprint: string,
): Promise<{ created: boolean; link: MapShareLink }> {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot();
    const existingByFingerprint = snapshot.links.find((item) => item.fingerprint === fingerprint);
    if (existingByFingerprint) {
      return { created: false, link: toPublicLink(existingByFingerprint) };
    }
    const existing = snapshot.links.find((item) => item.id === link.id);
    if (existing) {
      throw new Error(`Map share link id collision: ${link.id}`);
    }
    await writeSnapshot({
      version: 1,
      links: [...snapshot.links, { ...link, fingerprint }],
    });
    return { created: true, link };
  });
}

function toPublicLink(link: StoredMapShareLink): MapShareLink {
  return {
    createdAt: link.createdAt,
    id: link.id,
    target: link.target,
  };
}

async function readSnapshot(): Promise<MapShareLinkStoreSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<MapShareLinkStoreSnapshot>;
    return {
      version: 1,
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MapShareLinkStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, storePath);
}

async function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function resolveStorePath(): string {
  const configuredPath = readRuntimeConfig().mapShareLinkStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}
