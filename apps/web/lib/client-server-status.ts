import type { ApiItemResponse, OperationsServerStatus } from '@yct/contracts';
import { appPath } from './app-paths';

/**
 * 服务器状态在客户端的唯一数据源。
 *
 * 顶栏胶囊、移动侧边栏和首页状态面板都订阅这里，
 * 避免同一个接口被多个组件各自轮询。页面隐藏时不发请求，
 * 重新可见时立即刷新；所有订阅者卸载后停止计时器。
 */
export type ServerStatusDisplayState = 'loading' | 'online' | 'offline' | 'unknown';

export interface ServerStatusSnapshot {
  displayState: ServerStatusDisplayState;
  response?: ApiItemResponse<OperationsServerStatus>;
  checkedAt?: string;
}

export interface ServerStatusPanelVisibilityPayload {
  /** 首页的服务器状态面板是否完整出现在可视区域内。 */
  fullyVisible: boolean;
}

export const serverStatusChangedEventName = 'yct:server-status-changed';
export const serverStatusPanelVisibilityChangedEventName =
  'yct:server-status-panel-visibility-changed';

/** 与首页既有的刷新节奏保持一致。 */
const refreshIntervalMs = 15_000;
/** 超过三个刷新周期没有成功结果时，不再把旧状态当作当前状态。 */
const staleAfterMs = refreshIntervalMs * 3;

let cachedResponse: ApiItemResponse<OperationsServerStatus> | undefined;
let lastSuccessAt = 0;
let hasRequested = false;
let inFlight = false;
let subscriberCount = 0;
let intervalId: number | undefined;
let visibilityListenerBound = false;

function buildSnapshot(now = Date.now()): ServerStatusSnapshot {
  const item = cachedResponse?.item;
  let displayState: ServerStatusDisplayState;

  if (!item) {
    displayState = hasRequested ? 'unknown' : 'loading';
  } else if (item.availability === 'unknown') {
    displayState = 'unknown';
  } else if (lastSuccessAt > 0 && now - lastSuccessAt > staleAfterMs) {
    // 接口连续失败时保留的旧状态已经过期，不能继续显示为在线或离线。
    displayState = 'unknown';
  } else {
    displayState = item.availability;
  }

  return {
    displayState,
    response: cachedResponse,
    checkedAt: item?.checkedAt,
  };
}

export function readServerStatusSnapshot(): ServerStatusSnapshot {
  return buildSnapshot();
}

function publishServerStatus(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ServerStatusSnapshot>(serverStatusChangedEventName, {
      detail: buildSnapshot(),
    }),
  );
}

/** 首页把服务端首屏结果写入缓存，避免挂载后立即重复请求。 */
export function seedServerStatus(response: ApiItemResponse<OperationsServerStatus>): void {
  if (!response.item) {
    return;
  }

  const incomingCheckedAt = Date.parse(response.item.checkedAt);
  const currentCheckedAt = cachedResponse?.item
    ? Date.parse(cachedResponse.item.checkedAt)
    : Number.NaN;
  if (
    Number.isFinite(currentCheckedAt) &&
    (!Number.isFinite(incomingCheckedAt) || incomingCheckedAt <= currentCheckedAt)
  ) {
    return;
  }

  cachedResponse = response;
  lastSuccessAt = Number.isFinite(incomingCheckedAt)
    ? Math.min(incomingCheckedAt, Date.now())
    : Date.now();
  hasRequested = true;
  publishServerStatus();
}

async function refreshServerStatus(): Promise<void> {
  if (typeof window === 'undefined' || inFlight) {
    return;
  }
  if (document.visibilityState === 'hidden') {
    return;
  }

  inFlight = true;
  try {
    const response = await fetch(appPath('/api/operations/server-status'), {
      cache: 'no-store',
    });
    if (response.ok) {
      const payload = (await response.json()) as ApiItemResponse<OperationsServerStatus>;
      if (payload.item) {
        cachedResponse = payload;
        lastSuccessAt = Date.now();
      }
    }
  } catch {
    // 保留最近一次明确状态；超过 staleAfterMs 后由 buildSnapshot 降级为未知。
  } finally {
    inFlight = false;
    hasRequested = true;
    publishServerStatus();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && subscriberCount > 0) {
    void refreshServerStatus();
  }
}

function startPolling(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (intervalId === undefined) {
    intervalId = window.setInterval(() => void refreshServerStatus(), refreshIntervalMs);
  }
  if (!visibilityListenerBound) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerBound = true;
  }
}

function stopPolling(): void {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId);
    intervalId = undefined;
  }
  if (visibilityListenerBound) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerBound = false;
  }
}

export function subscribeServerStatus(
  listener: (snapshot: ServerStatusSnapshot) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<ServerStatusSnapshot>).detail ?? readServerStatusSnapshot());
  };

  subscriberCount += 1;
  startPolling();
  window.addEventListener(serverStatusChangedEventName, handleEvent);
  listener(readServerStatusSnapshot());

  const shouldRefreshImmediately = Date.now() - lastSuccessAt >= refreshIntervalMs;
  if (shouldRefreshImmediately) {
    void refreshServerStatus();
  }

  return () => {
    window.removeEventListener(serverStatusChangedEventName, handleEvent);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      stopPolling();
    }
  };
}

/** 首页状态面板根据自身与视口的相交比例上报，顶栏胶囊据此决定是否显示。 */
export function publishServerStatusPanelVisibility(
  payload: ServerStatusPanelVisibilityPayload,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ServerStatusPanelVisibilityPayload>(
      serverStatusPanelVisibilityChangedEventName,
      { detail: payload },
    ),
  );
}

export function subscribeServerStatusPanelVisibility(
  listener: (payload: ServerStatusPanelVisibilityPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    listener(
      (event as CustomEvent<ServerStatusPanelVisibilityPayload>).detail ?? { fullyVisible: false },
    );
  };

  window.addEventListener(serverStatusPanelVisibilityChangedEventName, handleEvent);
  return () => window.removeEventListener(serverStatusPanelVisibilityChangedEventName, handleEvent);
}
