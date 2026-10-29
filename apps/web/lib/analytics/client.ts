'use client';

import { appBasePath, appPath } from '../app-paths';
import { analyticsLimits, type AnalyticsEventName } from './schema';

const clientStorageKey = 'shxg_cid';
const sessionStorageKey = 'shxg_session';
const sessionIdleMs = 30 * 60 * 1000;
const flushBatchSize = 20;
const flushDelayMs = 5000;
const maxQueueSize = 200;

interface QueuedEvent {
  event_id: string;
  event_name: string;
  session_id: string;
  occurred_at: string;
  client_id?: string;
  route?: string;
  locale?: string;
  embed_host?: string;
  release?: string;
  properties?: Record<string, unknown>;
}

interface StoredSession {
  sessionId: string;
  lastActiveAt: number;
}

let activeSession: StoredSession | undefined;
let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 是否允许上报。
 *
 * 默认只在生产构建上报，避免开发环境污染真实指标；
 * 需要本地联调时设置 NEXT_PUBLIC_YCT_ANALYTICS_DEBUG=true。
 */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (process.env.NEXT_PUBLIC_YCT_ANALYTICS_DEBUG === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

/** 校验或建立会话，返回会话标识与是否为新建会话。 */
export function ensureAnalyticsSession(): { sessionId: string; isNew: boolean } {
  const now = Date.now();
  const stored = readStoredSession();

  if (stored && now - stored.lastActiveAt < sessionIdleMs) {
    const next = { ...stored, lastActiveAt: now };
    activeSession = next;
    writeStoredSession(next);
    return { sessionId: next.sessionId, isNew: false };
  }

  const created: StoredSession = { sessionId: createId(), lastActiveAt: now };
  activeSession = created;
  writeStoredSession(created);
  return { sessionId: created.sessionId, isNew: true };
}

export function trackAnalyticsEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  const { sessionId } = ensureAnalyticsSession();
  queue.push({
    event_id: createId(),
    event_name: name,
    session_id: sessionId,
    occurred_at: new Date().toISOString(),
    client_id: readClientId(),
    route: currentRoute(),
    locale: document.documentElement.lang || undefined,
    embed_host: window.self !== window.top ? 'embedded' : undefined,
    release: process.env.NEXT_PUBLIC_YCT_RELEASE_VERSION,
    properties: normalizeProperties(properties),
  });

  if (queue.length > maxQueueSize) {
    queue = queue.slice(-maxQueueSize);
  }

  scheduleFlush();
}

/** 立即冲刷队列。页面隐藏时传 true 走 sendBeacon，保证卸载后仍能送达。 */
export function flushAnalyticsQueue(useBeacon: boolean): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }

  if (!isAnalyticsEnabled() || queue.length === 0) {
    return;
  }

  const batch = queue.splice(0, analyticsLimits.maxBatchSize);
  const payload = JSON.stringify({ events: batch });
  const url = appPath('/api/analytics/collect');

  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) {
      return;
    }
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {
    // 失败批次退回队首，依靠 event_id 幂等重试。
    queue = [...batch, ...queue].slice(-maxQueueSize);
  });
}

/** 去掉部署前缀后的路由，确保不同 basePath 下指标口径一致。 */
export function normalizeAnalyticsRoute(pathname: string): string {
  if (!appBasePath) {
    return pathname || '/';
  }

  if (pathname === appBasePath) {
    return '/';
  }

  if (pathname.startsWith(`${appBasePath}/`)) {
    return pathname.slice(appBasePath.length);
  }

  return pathname || '/';
}

function currentRoute(): string {
  return normalizeAnalyticsRoute(window.location.pathname);
}

function scheduleFlush(): void {
  if (queue.length >= flushBatchSize) {
    flushAnalyticsQueue(false);
    return;
  }

  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    flushAnalyticsQueue(false);
  }, flushDelayMs);
}

function normalizeProperties(
  properties?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!properties) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(properties);
    if (new TextEncoder().encode(serialized).length > analyticsLimits.maxPropertiesBytes) {
      return undefined;
    }
    return properties;
  } catch {
    return undefined;
  }
}

function readClientId(): string {
  try {
    const existing = localStorage.getItem(clientStorageKey);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) {
      return existing;
    }
  } catch {
    // 存储不可用时退化为会话内标识。
  }

  const created = createId();
  try {
    localStorage.setItem(clientStorageKey, created);
  } catch {
    // 忽略写入失败。
  }
  return created;
}

function readStoredSession(): StoredSession | undefined {
  if (activeSession) {
    return activeSession;
  }

  try {
    const raw = sessionStorage.getItem(sessionStorageKey);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed?.sessionId === 'string' &&
      parsed.sessionId.length >= 8 &&
      typeof parsed.lastActiveAt === 'number'
    ) {
      activeSession = parsed;
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function writeStoredSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
  } catch {
    // 忽略写入失败，内存态仍然可用。
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
