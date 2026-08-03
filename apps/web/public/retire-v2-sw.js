self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('yct-'))
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        clients.map((client) => {
          const url = new URL(client.url);
          if (url.pathname === '/v2' || url.pathname.startsWith('/v2/')) {
            url.pathname = url.pathname.slice('/v2'.length) || '/';
            return client.navigate(url.href);
          }
          return undefined;
        }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
