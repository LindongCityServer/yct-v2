'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { useMobileActionRail, type MobileActionRailItem } from './mobile-action-rail';
import { ButtonLink, IconLink } from './ui/button';

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
  registerInMobileRail = false,
}: Readonly<{
  href: string;
  label?: string;
  labelKey?: CommonMessageKey;
  compact?: boolean;
  /** 作为二级页标题栏按钮时，开启侧边操作栏后改由侧栏注册。 */
  registerInMobileRail?: boolean;
}>) {
  const { t } = useI18n();
  const mobileActionRail = useMobileActionRail();
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

  const railItems = useMemo<MobileActionRailItem[]>(
    () =>
      visible && registerInMobileRail && mobileActionRail?.enabled
        ? [
            {
              id: `rail-admin-edit-${href}`,
              group: 'top',
              order: 80,
              priority: 46,
              label: renderedLabel,
              icon: 'edit',
              href: appPath(href),
            },
          ]
        : [],
    [href, mobileActionRail?.enabled, registerInMobileRail, renderedLabel, visible],
  );

  useEffect(() => {
    if (!mobileActionRail || !registerInMobileRail) {
      return;
    }
    mobileActionRail.registerItems(`admin-edit-${href}`, railItems);
  }, [href, mobileActionRail, railItems, registerInMobileRail]);

  if (!visible) return null;

  if (registerInMobileRail && mobileActionRail?.enabled) {
    return null;
  }

  if (compact) {
    return (
      <IconLink
        className="admin-edit-link"
        href={appPath(href)}
        label={renderedLabel}
        icon="edit"
      />
    );
  }

  return (
    <ButtonLink
      variant="secondary"
      className="admin-edit-link"
      href={appPath(href)}
      icon="edit"
      aria-label={renderedLabel}
      title={renderedLabel}
    >
      {renderedLabel}
    </ButtonLink>
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
