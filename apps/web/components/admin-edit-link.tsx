'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

interface AccountStatusResponse {
  admin?: { role: 'admin' | 'super_admin' };
}

let cachedAdminAccess: boolean | undefined;
let cachedAdminAccessAt = 0;
let pendingAdminAccess: Promise<boolean> | undefined;

export function AdminEditLink({
  href,
  label,
  labelKey = 'admin.edit',
  compact = false,
}: Readonly<{
  href: string;
  label?: string;
  labelKey?: CommonMessageKey;
  compact?: boolean;
}>) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(cachedAdminAccess === true);
  const renderedLabel = label ?? t(labelKey);

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
      aria-label={renderedLabel}
      title={renderedLabel}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        edit
      </span>
      {compact ? null : <span>{renderedLabel}</span>}
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
