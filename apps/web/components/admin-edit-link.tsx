'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface AccountStatusResponse {
  admin?: { role: 'admin' | 'super_admin' };
}

let cachedAdminAccess: boolean | undefined;
let cachedAdminAccessAt = 0;
let pendingAdminAccess: Promise<boolean> | undefined;

export function AdminEditLink({
  href,
  label = '编辑',
  compact = false,
}: Readonly<{
  href: string;
  label?: string;
  compact?: boolean;
}>) {
  const [visible, setVisible] = useState(cachedAdminAccess === true);

  useEffect(() => {
    let cancelled = false;
    void readAdminAccess().then((allowed) => {
      if (!cancelled) setVisible(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <a
      className={
        compact ? 'icon-action-button admin-edit-link' : 'secondary-action-button admin-edit-link'
      }
      href={appPath(href)}
      aria-label={label}
      title={label}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        edit
      </span>
      {compact ? null : <span>{label}</span>}
    </a>
  );
}

function readAdminAccess(): Promise<boolean> {
  if (cachedAdminAccess === true && Date.now() - cachedAdminAccessAt < 30_000) {
    return Promise.resolve(true);
  }
  if (pendingAdminAccess) return pendingAdminAccess;

  pendingAdminAccess = fetch(appPath('/api/account/status'), { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return false;
      const data = (await response.json()) as AccountStatusResponse;
      return Boolean(data.admin);
    })
    .catch(() => false)
    .then((allowed) => {
      cachedAdminAccess = allowed;
      cachedAdminAccessAt = Date.now();
      pendingAdminAccess = undefined;
      return allowed;
    });
  return pendingAdminAccess;
}
