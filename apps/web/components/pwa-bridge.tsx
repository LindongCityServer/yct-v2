'use client';

import { useEffect } from 'react';
import { appPath } from '../lib/app-paths';

export function PwaBridge() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter(
                (registration) => new URL(registration.scope).origin === window.location.origin,
              )
              .map((registration) => registration.unregister()),
          ),
        )
        .catch(() => undefined);

      if ('caches' in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((key) => key.startsWith('yct-')).map((key) => caches.delete(key)),
            ),
          )
          .catch(() => undefined);
      }

      return;
    }

    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return;
    }

    let cancelled = false;

    navigator.serviceWorker
      .register(appPath('/sw.js'), {
        scope: appPath('/'),
      })
      .then((registration) => {
        if (cancelled) {
          return;
        }

        registration.update().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
