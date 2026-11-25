import type {
  MaterialCanvasConfig,
  MaterialTransitNetworkSnapshot,
  MaterialTransitStationProfile,
} from '@yct/contracts';

const DATABASE_NAME = 'yct-material-offline-v1';
const STORE_NAME = 'drafts';
const FALLBACK_STORAGE_KEY = 'yct.materialOfflineDrafts.v1';

export type MaterialOfflineDraftSyncStatus = 'local' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface MaterialOfflineDraftTransitSelection {
  stationMarkerId?: string;
  importedStationNodeId?: string;
  direction?: 'east' | 'west' | 'north' | 'south';
  lineIds?: string[];
  projectLineKey?: string;
  projectNodeId?: string;
  terminalRole?: 'origin' | 'terminal' | '';
  /**
   * 线路图换乘字段的来源：`true` 表示用户手改过，恢复时原样保留；
   * 缺省 / `false` 表示自动推导，恢复时按「数据源 + 线路 + RMP 快照」重建。
   */
  transferLinesManual?: boolean;
}

export interface MaterialOfflineDraftRecord {
  localDraftId: string;
  studioId: string;
  templateId: string;
  templateVersion: number;
  input: Record<string, string>;
  canvas: MaterialCanvasConfig;
  mode: 'manual' | 'server';
  transitNetworkSource: 'server' | 'rmp';
  importedTransitNetwork?: MaterialTransitNetworkSnapshot;
  /** 自定义线网的车站资料；本机草稿也要能回填出口/结构。 */
  stationProfiles?: MaterialTransitStationProfile[];
  /** 上次套用的车站 / 方向 / 线路，用于「模板库」预填。 */
  transitSelection?: MaterialOfflineDraftTransitSelection;
  createdAt: string;
  updatedAt: string;
  syncStatus: MaterialOfflineDraftSyncStatus;
  serverDraftId?: string;
  errorMessage?: string;
}

export function createMaterialOfflineDraftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `local_material_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function readLatestMaterialOfflineDraft(
  studioId: string,
): Promise<MaterialOfflineDraftRecord | undefined> {
  if (!isBrowser()) {
    return undefined;
  }

  try {
    const records = await readIndexedRecords();
    return records
      .filter((record) => record.studioId === studioId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  } catch {
    return readFallbackRecords()
      .filter((record) => record.studioId === studioId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }
}

/** 指定模板最近一次的本机草稿：切换模板时用来恢复该模板上次的编辑内容。 */
export async function readMaterialOfflineDraftForTemplate(
  studioId: string,
  templateId: string,
): Promise<MaterialOfflineDraftRecord | undefined> {
  if (!isBrowser()) {
    return undefined;
  }
  const pick = (records: MaterialOfflineDraftRecord[]) =>
    records
      .filter((record) => record.studioId === studioId && record.templateId === templateId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  try {
    return pick(await readIndexedRecords());
  } catch {
    return pick(readFallbackRecords());
  }
}

export async function upsertMaterialOfflineDraft(
  record: MaterialOfflineDraftRecord,
): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  try {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('本机草稿保存失败。'));
        transaction.onabort = () => reject(transaction.error ?? new Error('本机草稿保存失败。'));
      });
    } finally {
      database.close();
    }
  } catch {
    const records = readFallbackRecords();
    writeFallbackRecords([
      ...records.filter((item) => item.localDraftId !== record.localDraftId),
      record,
    ]);
  }
}

async function readIndexedRecords(): Promise<MaterialOfflineDraftRecord[]> {
  const database = await openDatabase();
  return new Promise<MaterialOfflineDraftRecord[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      database.close();
      resolve(Array.isArray(request.result) ? request.result : []);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('本机草稿读取失败。'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowser() || !('indexedDB' in window)) {
    return Promise.reject(new Error('当前浏览器不支持 IndexedDB。'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'localDraftId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机草稿数据库打开失败。'));
    request.onblocked = () => reject(new Error('本机草稿数据库被占用。'));
  });
}

function readFallbackRecords(): MaterialOfflineDraftRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FALLBACK_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as MaterialOfflineDraftRecord[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackRecords(records: MaterialOfflineDraftRecord[]): void {
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 浏览器存储空间不足时保留当前页面状态，下一次仍可继续尝试保存。
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}
