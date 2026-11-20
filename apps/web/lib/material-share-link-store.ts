import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialShareLink, MaterialShareLinkRecord } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

/**
 * 存储层记录：在契约字段之外多存一个内容指纹（模板 + 版本 + 画布 + 字段的 sha256），
 * 用于「相同内容直接复用短 ID」，机器人重试不会刷出一堆重复记录。
 * 过期压缩成 stub 时指纹会被清掉，避免新分享复用已经失效的短 ID。
 */
export type StoredMaterialShareLink = MaterialShareLinkRecord & { fingerprint?: string };

interface MaterialShareLinkStoreSnapshot {
  version: 1;
  links: StoredMaterialShareLink[];
}

const emptySnapshot: MaterialShareLinkStoreSnapshot = { version: 1, links: [] };
let writeQueue = Promise.resolve();

export async function findMaterialShareLinkById(
  id: string,
): Promise<MaterialShareLinkRecord | undefined> {
  const snapshot = await readSnapshot();
  const link = snapshot.links.find((item) => item.id === id);
  return link ? toMaterialShareLinkRecord(link) : undefined;
}

/**
 * 按内容指纹找记录。同一份内容可能先后产生多条记录（例如旧记录被停用后重新分享），
 * 优先返回仍有效的完整记录，其次才回退到任意一条。
 */
export async function findMaterialShareLinkByFingerprint(
  fingerprint: string,
): Promise<MaterialShareLinkRecord | undefined> {
  const snapshot = await readSnapshot();
  const candidates = snapshot.links.filter((item) => item.fingerprint === fingerprint);
  const preferred = candidates.find((item) => item.status === 'active' && !isStub(item));
  const link = preferred ?? candidates[0];
  return link ? toMaterialShareLinkRecord(link) : undefined;
}

export async function listMaterialShareLinks(): Promise<MaterialShareLinkRecord[]> {
  const snapshot = await readSnapshot();
  return snapshot.links.map(toMaterialShareLinkRecord);
}

export type SaveMaterialShareLinkResult =
  { created: true; link: MaterialShareLink } | { created: false; link: MaterialShareLinkRecord };

export async function saveMaterialShareLink(
  link: MaterialShareLink,
  fingerprint: string,
): Promise<SaveMaterialShareLinkResult> {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot();
    // 停用 / 过期 stub 不参与复用：管理员停用的分享不能因为「再分享同样内容」而复活。
    const existingByFingerprint = snapshot.links.find(
      (item) => item.fingerprint === fingerprint && item.status === 'active' && !isStub(item),
    );
    if (existingByFingerprint) {
      return { created: false, link: toMaterialShareLinkRecord(existingByFingerprint) };
    }
    if (snapshot.links.some((item) => item.id === link.id)) {
      throw new Error(`Material share link id collision: ${link.id}`);
    }
    await writeSnapshot({
      version: 1,
      links: [...snapshot.links, { ...link, fingerprint }],
    });
    return { created: true, link };
  });
}

/** 读-改-写：更新必须走写锁，避免扫码计数合并时丢掉并发写入。 */
export async function updateMaterialShareLink(
  id: string,
  updater: (link: MaterialShareLinkRecord) => MaterialShareLinkRecord,
): Promise<MaterialShareLinkRecord | undefined> {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot();
    const index = snapshot.links.findIndex((item) => item.id === id);
    if (index < 0) {
      return undefined;
    }
    const current = snapshot.links[index]!;
    const record = toMaterialShareLinkRecord(current);
    const next = updater(record);
    if (next === record) {
      // 无变化（例如停用 / 过期的链接被扫码）不重写整个 JSON 文件。
      return next;
    }
    const stored: StoredMaterialShareLink = isStub(next)
      ? { ...next }
      : { ...next, fingerprint: current.fingerprint };
    const links = [...snapshot.links];
    links[index] = stored;
    await writeSnapshot({ version: 1, links });
    return next;
  });
}

/** 替换整批记录（过期压缩用）：同样在写锁内完成，保留其它写操作的原子性。 */
export async function updateMaterialShareLinkRecords<T>(
  mutator: (records: StoredMaterialShareLink[]) => {
    records: StoredMaterialShareLink[];
    result: T;
  },
): Promise<T> {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot();
    const { records, result } = mutator(snapshot.links);
    await writeSnapshot({ version: 1, links: records });
    return result;
  });
}

export async function removeMaterialShareLink(id: string): Promise<boolean> {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot();
    const links = snapshot.links.filter((item) => item.id !== id);
    if (links.length === snapshot.links.length) {
      return false;
    }
    await writeSnapshot({ version: 1, links });
    return true;
  });
}

function isStub(record: MaterialShareLinkRecord): boolean {
  return 'stub' in record;
}

function toMaterialShareLinkRecord(record: StoredMaterialShareLink): MaterialShareLinkRecord {
  const { fingerprint: _fingerprint, ...link } = record;
  return link;
}

function isStoredMaterialShareLink(value: unknown): value is StoredMaterialShareLink {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<StoredMaterialShareLink>;
  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.templateId === 'string'
  );
}

async function readSnapshot(): Promise<MaterialShareLinkStoreSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<MaterialShareLinkStoreSnapshot>;
    return {
      version: 1,
      links: Array.isArray(parsed.links) ? parsed.links.filter(isStoredMaterialShareLink) : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialShareLinkStoreSnapshot): Promise<void> {
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
  const configuredPath = readRuntimeConfig().materialShareLinkStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}
