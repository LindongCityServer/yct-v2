import type { TelegraphDraftInput } from './telegraph-domain';

const DATABASE_NAME = 'yct-telegraph-v1';
const STORE_NAME = 'history';
const FALLBACK_KEY = 'yct.telegraph.history.v1';
const MAX_HISTORY = 30;

export interface TelegraphHistoryRecord {
  id: string;
  draft: TelegraphDraftInput;
  serialNumber: string;
  generatedAt: string;
  updatedAt: string;
}

export async function listTelegraphHistory(): Promise<TelegraphHistoryRecord[]> {
  if (typeof window === 'undefined') return [];
  try {
    const database = await openDatabase();
    const records = await new Promise<TelegraphHistoryRecord[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error('读取电报历史失败。'));
    });
    database.close();
    return records
      .map(normalizeHistoryRecord)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return readFallback();
  }
}

export async function saveTelegraphHistory(record: TelegraphHistoryRecord): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('保存电报历史失败。'));
    });
    database.close();
    const records = await listTelegraphHistory();
    if (records.length > MAX_HISTORY) {
      await Promise.all(records.slice(MAX_HISTORY).map((item) => deleteTelegraphHistory(item.id)));
    }
  } catch {
    const records = [record, ...readFallback().filter((item) => item.id !== record.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_HISTORY);
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
  }
}

export async function deleteTelegraphHistory(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('删除电报历史失败。'));
    });
    database.close();
  } catch {
    window.localStorage.setItem(
      FALLBACK_KEY,
      JSON.stringify(readFallback().filter((item) => item.id !== id)),
    );
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('浏览器不支持 IndexedDB。'));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开电报历史失败。'));
  });
}

function readFallback(): TelegraphHistoryRecord[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(FALLBACK_KEY) ?? '[]');
    return Array.isArray(value) ? value.map(normalizeHistoryRecord) : [];
  } catch {
    return [];
  }
}

function normalizeHistoryRecord(record: TelegraphHistoryRecord): TelegraphHistoryRecord {
  const legacy = (record.draft ?? {}) as Partial<TelegraphDraftInput> & {
    recipientAddress?: string;
    recipientName?: string;
  };
  const recipientInfo =
    typeof legacy.recipientInfo === 'string'
      ? legacy.recipientInfo
      : [legacy.recipientAddress, legacy.recipientName]
          .filter((value): value is string => Boolean(value?.trim()))
          .join('');
  return {
    ...record,
    draft: {
      province: legacy.province ?? '',
      city: legacy.city ?? '',
      county: legacy.county ?? '',
      district: legacy.district ?? '',
      recipientInfo,
      body: legacy.body ?? '',
      senderName: legacy.senderName ?? '',
      senderAddress: legacy.senderAddress ?? '',
    },
  };
}
