'use client';

import { useEffect } from 'react';
import {
  resolveConfiguredEmbedHostOrigins,
  type EmbeddedHostAdapter,
} from '../../lib/embedded-host-adapters';

/**
 * FluentOS 宿主适配器。
 *
 * FluentOS 的 Developer Center 要求 PWA **必须**声明 `storage.local`：只有获批该权限的
 * PWA 才会在 iframe sandbox 里拿到 `allow-same-origin`（`pwa-loader.js:365`），
 * 而没有真实来源就谈不上 Cookie 会话。
 *
 * 与之配套的义务是实现下面的存储握手，让「设置 > 应用程序」能统计真实占用，
 * 并在卸载 App 时清空本站来源的浏览器存储。未实现握手的 PWA 虽然仍可卸载，
 * 但站点数据会残留。
 *
 * 这套协议是 FluentOS 专属约定，其它网页桌面宿主没有对应要求，因此它留在本文件里，
 * 不进通用层。协议见 FluentOS 官方 `docs/DEVELOPER_GUIDE.md` §9。
 */

const messageSource = 'FluentOS';
const storageRequestType = 'fluentos:storage-request';
const storageResponseType = 'fluentos:storage-response';
const storageProtocolVersion = 2;

/** FluentOS 官方部署地址；可用 NEXT_PUBLIC_YCT_EMBED_HOST_ORIGINS 覆盖。 */
const defaultFluentOsOrigins = ['https://yoyopan1115.github.io'];

export const fluentOsEmbeddedHost: EmbeddedHostAdapter = {
  id: 'fluentos',
  resolveOrigins: () =>
    resolveConfiguredEmbedHostOrigins(
      process.env.NEXT_PUBLIC_YCT_EMBED_HOST_ORIGINS,
      defaultFluentOsOrigins,
    ),
};

type StorageAction = 'probe' | 'measure' | 'clear';

interface FluentOsStorageRequest {
  source?: string;
  type?: string;
  version?: number;
  requestId?: string;
  appId?: string;
  action?: StorageAction;
}

export function FluentOsStorageBridge() {
  useEffect(() => {
    const allowedOrigins = fluentOsEmbeddedHost.resolveOrigins();

    const handleMessage = async (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const request = (event.data ?? {}) as FluentOsStorageRequest;
      if (request.source !== messageSource) {
        return;
      }
      if (request.type !== storageRequestType) {
        return;
      }
      if (request.version !== storageProtocolVersion) {
        return;
      }

      // event.source 的静态类型是 Window | MessagePort | ServiceWorker，
      // 只有 Window 形态的 postMessage 才有 targetOrigin 参数，这里显式收敛。
      const source = event.source as Window | null;

      const respond = (payload: Record<string, unknown>) => {
        try {
          source?.postMessage(
            {
              type: storageResponseType,
              version: storageProtocolVersion,
              requestId: request.requestId,
              appId: request.appId,
              ...payload,
            },
            event.origin,
          );
        } catch (_) {
          // 宿主窗口可能已关闭，忽略。
        }
      };

      try {
        let bytes = 0;
        if (request.action === 'probe') {
          bytes = 0;
        } else if (request.action === 'measure') {
          bytes = await measureBrowserStorage();
        } else if (request.action === 'clear') {
          await clearBrowserStorage();
        } else {
          return;
        }
        respond({ ok: true, bytes });
      } catch (error) {
        respond({ ok: false, error: String((error as Error)?.message ?? error) });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return null;
}

/** 统计本站来源的浏览器存储占用：取 localStorage 实测值与浏览器估算值的较大者。 */
async function measureBrowserStorage(): Promise<number> {
  let localStorageBytes = 0;
  try {
    const encoder = new TextEncoder();
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? '';
      localStorageBytes += encoder.encode(key + (localStorage.getItem(key) ?? '')).byteLength;
    }
  } catch (_) {
    localStorageBytes = 0;
  }

  let originUsage = 0;
  try {
    const estimate = await navigator.storage?.estimate?.();
    originUsage = Number.isFinite(estimate?.usage) ? Number(estimate?.usage) : 0;
  } catch (_) {
    originUsage = 0;
  }

  return Math.max(localStorageBytes, originUsage);
}

async function clearBrowserStorage(): Promise<void> {
  // 先给应用一个自我收尾的机会（例如关闭长持有的 IndexedDB 连接）。
  window.dispatchEvent(new CustomEvent('fluentos:before-storage-clear'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (_) {
    // 隐私模式下可能被拒，继续清理其余存储。
  }

  if (globalThis.caches) {
    await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  }

  const indexedDbFactory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };
  if (!indexedDbFactory.databases) {
    throw new Error('当前浏览器无法枚举 IndexedDB');
  }
  await Promise.all(
    (await indexedDbFactory.databases())
      .filter((item) => Boolean(item.name))
      .map((item) => deleteDatabase(item.name as string)),
  );

  const storageManager = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (storageManager?.getDirectory) {
    const root = await storageManager.getDirectory();
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
    }
  }

  if (navigator.serviceWorker?.getRegistrations) {
    await Promise.all(
      (await navigator.serviceWorker.getRegistrations()).map((registration) =>
        registration.unregister(),
      ),
    );
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`无法删除 IndexedDB：${name}`));
    request.onblocked = () => reject(new Error(`IndexedDB 仍被占用：${name}`));
  });
}
