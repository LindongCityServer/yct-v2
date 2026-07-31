'use client';

import { useEffect } from 'react';
import { appPath } from '../lib/app-paths';
import { publishLoginRequired } from '../lib/client-auth-events';

interface AccountStatusResponse {
  accountStatus?: 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
}

export function AdminLoginRequiredGuard() {
  useEffect(() => {
    let cancelled = false;

    void fetch(appPath('/api/account/status'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          return undefined;
        }
        return (await response.json()) as AccountStatusResponse;
      })
      .then((status) => {
        if (
          !cancelled &&
          (status?.accountStatus === 'anonymous' || status?.accountStatus === 'readonly')
        ) {
          publishLoginRequired();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
