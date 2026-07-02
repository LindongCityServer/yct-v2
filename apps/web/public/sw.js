const YCT_SW_VERSION = '2026-07-03-01';
const YCT_SHELL_CACHE = `yct-shell-${YCT_SW_VERSION}`;
const YCT_RUNTIME_CACHE = `yct-runtime-${YCT_SW_VERSION}`;
const YCT_DATA_CACHE = `yct-data-${YCT_SW_VERSION}`;
const YCT_CACHE_PREFIX = 'yct-';
const YCT_DISABLE_ON_LOCAL_DEV = ['localhost', '127.0.0.1', '::1'].includes(self.location.hostname);
const YCT_BASE_PATH = inferBasePath();

const YCT_CORE_URLS = [
  '/',
  '/travel',
  '/travel/schedules',
  '/travel/screen',
  '/services',
  '/map',
  '/offline',
  '/manifest.webmanifest',
  '/icons/yct-icon-192.png',
  '/icons/yct-icon-512.png',
  '/icons/yct-icon-maskable.png',
  '/icons/yct-logo.svg',
  '/icons/yct-logo-wordmark.svg',
];

const YCT_DATA_PATHS = new Set([
  '/api/operations/feed',
  '/api/services/entries',
  '/api/settings/bootstrap',
  '/api/map/markers',
  '/api/map/poi-categories',
  '/api/map/tile-providers',
  '/api/map/unmined-regions',
  '/api/transit/overview',
  '/api/transit/screen',
  '/api/transit/service-notices',
  '/api/transit/station-details',
  '/api/travel/schedules',
]);

self.addEventListener('install', (event) => {
  if (YCT_DISABLE_ON_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    warmAppShell().then(() => {
      self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  if (YCT_DISABLE_ON_LOCAL_DEV) {
    event.waitUntil(
      deleteYctCaches()
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister()),
    );
    return;
  }

  event.waitUntil(
    deleteYctCaches(new Set([YCT_SHELL_CACHE, YCT_RUNTIME_CACHE, YCT_DATA_CACHE])).then(() =>
      self.clients.claim(),
    ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'YCT_WARM_APP_SHELL') {
    event.waitUntil(warmAppShell());
  }
});

self.addEventListener('fetch', (event) => {
  if (YCT_DISABLE_ON_LOCAL_DEV) {
    return;
  }

  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, YCT_SHELL_CACHE));
    return;
  }

  const appPath = toAppPath(url);

  if (YCT_DATA_PATHS.has(appPath)) {
    event.respondWith(staleWhileRevalidate(request, YCT_DATA_CACHE));
    return;
  }

  if (isRecentContentPath(url)) {
    event.respondWith(networkFirst(request, YCT_RUNTIME_CACHE));
  }
});

async function warmAppShell() {
  const cache = await caches.open(YCT_SHELL_CACHE);
  await Promise.all(
    YCT_CORE_URLS.map(async (url) => {
      const scopedUrl = fromAppPath(url);
      try {
        const response = await fetch(scopedUrl, { cache: 'reload' });
        if (response.ok) {
          await cache.put(scopedUrl, response);
        }
      } catch {
        // 单个预热失败不影响整体安装。
      }
    }),
  );
}

async function deleteYctCaches(keepKeys = new Set()) {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(YCT_CACHE_PREFIX) && !keepKeys.has(key))
      .map((key) => caches.delete(key)),
  );
}

async function handleNavigation(request, url) {
  if (isSensitivePath(url)) {
    try {
      return await fetch(request);
    } catch {
      return (await caches.match(fromAppPath('/offline'))) || Response.error();
    }
  }

  const cacheName = isRecentContentPath(url) ? YCT_RUNTIME_CACHE : YCT_SHELL_CACHE;
  return networkFirst(request, cacheName, fromAppPath('/offline'));
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (fallbackUrl ? await caches.match(fallbackUrl) : undefined) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await fetchPromise) || Response.error();
}

function isStaticAsset(url) {
  const appPath = toAppPath(url);
  return (
    appPath.startsWith('/_next/static/') ||
    appPath.startsWith('/icons/') ||
    appPath === '/manifest.webmanifest'
  );
}

function isRecentContentPath(url) {
  const appPath = toAppPath(url);
  return (
    isRecentTravelPath(appPath) || isRecentMapPath(appPath) || appPath.startsWith('/operations/')
  );
}

function isRecentTravelPath(appPath) {
  return (
    appPath === '/travel/schedules' ||
    appPath === '/travel/screen' ||
    appPath.startsWith('/travel/stations/') ||
    /^\/travel\/[^/]+$/.test(appPath)
  );
}

function isRecentMapPath(appPath) {
  return appPath.startsWith('/map/lines/');
}

function isSensitivePath(url) {
  const appPath = toAppPath(url);
  return (
    appPath.startsWith('/account') ||
    appPath.startsWith('/admin') ||
    appPath.startsWith('/auth') ||
    appPath.startsWith('/api/auth') ||
    appPath.startsWith('/api/admin')
  );
}

function inferBasePath() {
  const pathname = new URL(self.location.href).pathname;
  const marker = '/sw.js';
  if (!pathname.endsWith(marker)) {
    return '';
  }

  const basePath = pathname.slice(0, -marker.length).replace(/\/+$/g, '');
  return basePath === '/' ? '' : basePath;
}

function toAppPath(url) {
  const pathname = url.pathname;
  if (!YCT_BASE_PATH) {
    return pathname;
  }

  if (pathname === YCT_BASE_PATH) {
    return '/';
  }

  if (pathname.startsWith(`${YCT_BASE_PATH}/`)) {
    return pathname.slice(YCT_BASE_PATH.length) || '/';
  }

  return pathname;
}

function fromAppPath(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (YCT_BASE_PATH && (cleanPath === YCT_BASE_PATH || cleanPath.startsWith(`${YCT_BASE_PATH}/`))) {
    return cleanPath;
  }

  return YCT_BASE_PATH ? `${YCT_BASE_PATH}${cleanPath}` : cleanPath;
}
