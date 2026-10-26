import { getAssistantProvider, type AssistantProviderId } from './assistant/providers';

export interface AssistantConfig {
  providerId: AssistantProviderId;
  model: string;
  apiKey: string;
}

export type AssistantConfigStorageResult = 'encrypted' | 'session' | 'none';

const encryptedStorageKey = 'yct.assistant.config.v2';
const legacySessionKey = 'yct.assistant.config.v1';
const databaseName = 'yct-assistant-secrets';
const databaseVersion = 1;
const keyStoreName = 'keys';
const configKeyId = 'assistant-config-key';

interface EncryptedPayload {
  version: 2;
  iv: string;
  data: string;
}

/**
 * Key 默认使用 AES-GCM 加密后写入 localStorage，CryptoKey 以不可导出方式存放在
 * IndexedDB。它不能防御同源 XSS，但能避免在 localStorage 里直接看到明文 Key。
 * 浏览器不支持 Web Crypto / IndexedDB 时退化为仅当前标签页有效的 sessionStorage。
 */
export async function readAssistantConfig(): Promise<AssistantConfig | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const encrypted = safeStorageGet('local', encryptedStorageKey);
  if (encrypted) {
    try {
      const config = await decryptConfig(encrypted);
      if (config) {
        return config;
      }
    } catch {
      safeStorageRemove('local', encryptedStorageKey);
    }
  }

  const legacy = safeStorageGet('session', legacySessionKey);
  if (legacy) {
    const config = normalizeConfig(parseJson(legacy));
    if (config) {
      void writeAssistantConfig(config);
      safeStorageRemove('session', legacySessionKey);
      return config;
    }
    safeStorageRemove('session', legacySessionKey);
  }

  return null;
}

export async function writeAssistantConfig(
  config: AssistantConfig,
): Promise<AssistantConfigStorageResult> {
  const normalized = normalizeConfig(config);
  if (!normalized || typeof window === 'undefined') {
    return 'none';
  }

  if (canUseEncryptedStorage()) {
    try {
      if (!safeStorageSet('local', encryptedStorageKey, await encryptConfig(normalized))) {
        throw new Error('storage unavailable');
      }
      safeStorageRemove('session', legacySessionKey);
      return 'encrypted';
    } catch {
      // 加密不可用时退回当前标签页，至少不让用户在本次会话里反复输入。
    }
  }

  return safeStorageSet('session', legacySessionKey, JSON.stringify(normalized))
    ? 'session'
    : 'none';
}

export async function clearAssistantConfig(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(encryptedStorageKey);
  window.sessionStorage.removeItem(legacySessionKey);
  try {
    const database = await openKeyDatabase();
    const transaction = database.transaction(keyStoreName, 'readwrite');
    await requestToPromise(transaction.objectStore(keyStoreName).delete(configKeyId));
    database.close();
  } catch {
    // 删除失败不影响前台清除；最坏情况下旧密文已经不可读。
  }
}

function normalizeConfig(value: unknown): AssistantConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<AssistantConfig>;
  const provider =
    typeof candidate.providerId === 'string'
      ? getAssistantProvider(candidate.providerId)
      : undefined;
  if (!provider) {
    return null;
  }

  const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : '';
  if (!apiKey || apiKey.length > 512) {
    return null;
  }

  const rawModel =
    typeof candidate.model === 'string' && candidate.model.trim()
      ? candidate.model.trim().slice(0, 120)
      : provider.defaultModel;
  const model = migrateLegacyModel(provider.id, rawModel);

  return {
    providerId: provider.id,
    model,
    apiKey,
  };
}

function migrateLegacyModel(providerId: AssistantProviderId, model: string): string {
  if (providerId !== 'deepseek') {
    return model;
  }

  if (model === 'deepseek-chat') {
    return 'deepseek-v4-flash';
  }
  if (model === 'deepseek-reasoner') {
    return 'deepseek-v4-pro';
  }
  return model;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function canUseEncryptedStorage(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    window.crypto?.subtle &&
    window.indexedDB &&
    typeof CryptoKey !== 'undefined',
  );
}

async function encryptConfig(config: AssistantConfig): Promise<string> {
  const key = await getOrCreateKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(config));
  const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const payload: EncryptedPayload = {
    version: 2,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(payload);
}

async function decryptConfig(value: string): Promise<AssistantConfig | null> {
  const payload = parseJson(value) as Partial<EncryptedPayload> | null;
  if (
    !payload ||
    payload.version !== 2 ||
    typeof payload.iv !== 'string' ||
    typeof payload.data !== 'string'
  ) {
    return null;
  }

  const key = await getStoredKey();
  if (!key) {
    return null;
  }

  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  return normalizeConfig(parseJson(new TextDecoder().decode(plain)));
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await getStoredKey();
  if (existing) {
    return existing;
  }

  const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const database = await openKeyDatabase();
  const transaction = database.transaction(keyStoreName, 'readwrite');
  await requestToPromise(transaction.objectStore(keyStoreName).put(key, configKeyId));
  database.close();
  return key;
}

async function getStoredKey(): Promise<CryptoKey | null> {
  try {
    const database = await openKeyDatabase();
    const transaction = database.transaction(keyStoreName, 'readonly');
    const stored = await requestToPromise(transaction.objectStore(keyStoreName).get(configKeyId));
    database.close();
    return stored instanceof CryptoKey ? stored : null;
  } catch {
    return null;
  }
}

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(keyStoreName)) {
        request.result.createObjectStore(keyStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

type StorageKind = 'local' | 'session';

function storage(kind: StorageKind): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

function safeStorageGet(kind: StorageKind, key: string): string | null {
  try {
    return storage(kind).getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(kind: StorageKind, key: string, value: string): boolean {
  try {
    storage(kind).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(kind: StorageKind, key: string): void {
  try {
    storage(kind).removeItem(key);
  } catch {
    // 忽略隐私模式或配额限制下的存储异常。
  }
}
