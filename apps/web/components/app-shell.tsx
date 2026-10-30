'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { flushAnalyticsQueue, trackAnalyticsEvent } from '../lib/analytics/client';
import { appPath } from '../lib/app-paths';
import { BrandSymbol, BrandWordmark } from './brand-logo';
import { publishLoginRequired, publishLoginRequiredForResponse } from '../lib/client-auth-events';
import {
  readAssistantEntryPreference,
  subscribeAssistantEntryPreferenceChanged,
} from '../lib/client-assistant-entry-preference';
import { publishGlobalSearchRequested } from '../lib/client-global-search-events';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import {
  publishMapNavigationLayoutChanged,
  subscribeAppNavigationToggleRequested,
  subscribeMapRoutePanelVisibilityChanged,
  subscribeMapSidebarOverlayChanged,
} from '../lib/client-map-ui-events';
import { ticketOrderStateChangedEventName } from '../lib/client-ticket-orders';
import { publishToastRequested } from '../lib/client-toast-events';
import {
  readTripReminderState,
  tripReminderStateChangedEventName,
} from '../lib/client-trip-reminders';
import { ProgressiveImage } from './progressive-image';
import { SmartQaGlyph } from './smart-qa-icon';
import {
  MobileActionRailProvider,
  useMobileActionRail,
  type MobileActionRailItem,
} from './mobile-action-rail';

export type PrimaryNavKey = 'operations' | 'map' | 'travel' | 'services';
export type AppShellVariant = 'default' | 'map';

const navItems = [
  { key: 'operations', labelKey: 'nav.operations', icon: 'article', href: '/' },
  { key: 'map', labelKey: 'nav.map', icon: 'map', href: '/map' },
  { key: 'travel', labelKey: 'nav.travel', icon: 'directions_bus', href: '/travel' },
  { key: 'services', labelKey: 'nav.services', icon: 'apps', href: '/services' },
] as const;

type Translate = ReturnType<typeof useI18n>['t'];

interface AccountStatusResponse {
  accountStatus: 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
  username?: string;
  avatarUrl?: string | null;
  isLocalAdmin?: boolean;
  badge: {
    kind: 'none' | 'count' | 'dot';
    count: number;
    label: string;
  };
  admin?: {
    pendingReviewCount: number;
  };
}

interface TopbarBadgeSummary {
  kind: 'none' | 'count' | 'dot';
  count: number;
  label: string;
}

interface RideCodeResponse {
  actionUrl?: string;
  message?: string;
}

type AppShellProps = Readonly<{
  active?: PrimaryNavKey;
  pageTitle?: string;
  pageTitleKey?: CommonMessageKey;
  variant?: AppShellVariant;
  /** 独立问一问页面自身就是入口，不再显示问一问按钮。 */
  hideAssistantEntry?: boolean;
  children: ReactNode;
}>;

export function AppShell(props: AppShellProps) {
  return (
    <MobileActionRailProvider>
      <AppShellFrame {...props} />
    </MobileActionRailProvider>
  );
}

function AppShellFrame({
  active,
  pageTitle,
  pageTitleKey,
  variant = 'default',
  hideAssistantEntry = false,
  children,
}: AppShellProps) {
  const router = useRouter();
  const mobileActionRail = useMobileActionRail();
  const [navOpen, setNavOpen] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatusResponse | null>(null);
  const [localPendingSyncCount, setLocalPendingSyncCount] = useState(0);
  const [mapRoutePanelVisible, setMapRoutePanelVisible] = useState(false);
  const [mapSidebarOverlayVisible, setMapSidebarOverlayVisible] = useState(false);
  const [rideCodeLoading, setRideCodeLoading] = useState(false);
  const [assistantEnabled, setAssistantEnabled] = useState(
    () => readAssistantEntryPreference().enabled,
  );
  const { locale, t } = useI18n();

  useEffect(() => {
    return subscribeAppNavigationToggleRequested(() => setNavOpen((current) => !current));
  }, []);

  useEffect(() => {
    setAssistantEnabled(readAssistantEntryPreference().enabled);
    return subscribeAssistantEntryPreferenceChanged((preference) =>
      setAssistantEnabled(preference.enabled),
    );
  }, []);

  useEffect(() => {
    if (variant !== 'map') {
      setMapRoutePanelVisible(false);
      return undefined;
    }

    return subscribeMapRoutePanelVisibilityChanged(({ visible }) =>
      setMapRoutePanelVisible(visible),
    );
  }, [variant]);

  useEffect(() => {
    if (variant !== 'map') {
      setMapSidebarOverlayVisible(false);
      return undefined;
    }

    return subscribeMapSidebarOverlayChanged(({ visible }) => setMapSidebarOverlayVisible(visible));
  }, [variant]);

  useEffect(() => {
    if (variant !== 'map') {
      return;
    }

    publishMapNavigationLayoutChanged({ expanded: navOpen });
  }, [navOpen, variant]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountStatus() {
      try {
        const response = await fetch(appPath('/api/account/status'), { cache: 'no-store' });
        const data = (await response.json()) as AccountStatusResponse;
        if (!cancelled) {
          setAccountStatus(data);
        }
      } catch {
        if (!cancelled) {
          setAccountStatus({
            accountStatus: 'unavailable',
            badge: {
              kind: 'dot',
              count: 0,
              label: '账号状态暂不可用',
            },
          });
        }
      }
    }

    const handleAccountStatusChanged = () => {
      void loadAccountStatus();
    };

    void loadAccountStatus();
    window.addEventListener(ticketOrderStateChangedEventName, handleAccountStatusChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(ticketOrderStateChangedEventName, handleAccountStatusChanged);
    };
  }, []);

  useEffect(() => {
    const syncLocalBadge = () => {
      try {
        setLocalPendingSyncCount(readTripReminderState().summary.localOnly);
      } catch {
        setLocalPendingSyncCount(0);
      }
    };

    syncLocalBadge();
    window.addEventListener(tripReminderStateChangedEventName, syncLocalBadge);
    window.addEventListener('storage', syncLocalBadge);

    return () => {
      window.removeEventListener(tripReminderStateChangedEventName, syncLocalBadge);
      window.removeEventListener('storage', syncLocalBadge);
    };
  }, []);

  const showTopbarNotice = (message: string) => {
    publishToastRequested({
      dedupeKey: 'topbar-operation',
      message,
      tone: 'warning',
    });
  };

  const openGlobalSearch = () => {
    publishGlobalSearchRequested();
  };
  const openRideCode = async () => {
    if (rideCodeLoading) {
      return;
    }

    if (accountStatus?.accountStatus !== 'active') {
      publishLoginRequired({ message: t('quickAction.rideCodeLoginRequired') });
      return;
    }

    setRideCodeLoading(true);
    try {
      const response = await fetch(appPath('/api/account/ride-code'), {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = (await response.json()) as RideCodeResponse;
      if (
        publishLoginRequiredForResponse(response, {
          message: t('quickAction.rideCodeLoginRequired'),
        })
      ) {
        return;
      }
      if (!response.ok || !payload.actionUrl) {
        showTopbarNotice(payload.message ?? t('quickAction.rideCodeUnavailable'));
        return;
      }
      trackAnalyticsEvent('feature.used', {
        feature: 'ridecode.session',
        surface: 'quick_action',
      });
      // 马上离开本站，先冲刷队列，避免事件随页面卸载丢失。
      flushAnalyticsQueue(true);
      window.location.assign(payload.actionUrl);
    } catch {
      showTopbarNotice(t('quickAction.rideCodeUnavailable'));
    } finally {
      setRideCodeLoading(false);
    }
  };
  const accountBadge = mergeTopbarBadge(accountStatus?.badge, localPendingSyncCount, t);
  const renderedPageTitle = pageTitleKey ? t(pageTitleKey) : pageTitle;
  const useSymbolBrand =
    active === 'map' ||
    active === 'travel' ||
    active === 'services' ||
    (active === 'operations' && locale === 'en');
  const topbarPageTitle =
    active === 'operations' && locale === 'en' && !renderedPageTitle
      ? 'Yuchengtong'
      : renderedPageTitle;

  // 侧边操作栏条目：顶部工具栏 → 底部主导航，均为纯图标按钮。
  const railActions = useMemo<MobileActionRailItem[]>(
    () => [
      {
        id: 'rail-top-ride-code',
        group: 'top',
        order: 10,
        priority: 40,
        label: t('quickAction.rideCode'),
        icon: rideCodeLoading ? 'progress_activity' : 'qr_code_2',
        busy: rideCodeLoading,
        onClick: () => void openRideCode(),
      },
      ...(assistantEnabled && !hideAssistantEntry
        ? [
            {
              id: 'rail-top-search',
              group: 'top' as const,
              order: 20,
              priority: 45,
              label: t('globalSearch.action.open'),
              icon: 'search',
              iconNode: <SmartQaGlyph size={22} />,
              onClick: openGlobalSearch,
            },
          ]
        : []),
      {
        id: 'rail-top-account',
        group: 'top',
        order: 30,
        priority: 50,
        label: accountButtonAriaLabel(accountStatus, accountBadge, t),
        icon: accountIcon(accountStatus?.accountStatus, accountStatus?.isLocalAdmin),
        href: appPath('/account'),
        badge:
          accountBadge.kind === 'count'
            ? formatBadgeCount(accountBadge.count)
            : accountBadge.kind === 'dot'
              ? '•'
              : undefined,
      },
      ...navItems.map<MobileActionRailItem>((item, index) => ({
        id: `rail-tab-${item.key}`,
        group: 'tabs',
        order: index,
        priority: 100,
        label: t(item.labelKey),
        icon: item.icon,
        href: appPath(item.href),
        active: active === item.key,
      })),
    ],
    [
      accountBadge,
      accountStatus,
      active,
      assistantEnabled,
      hideAssistantEntry,
      locale,
      openGlobalSearch,
      openRideCode,
      rideCodeLoading,
      t,
    ],
  );

  useEffect(() => {
    if (!mobileActionRail) {
      return;
    }
    mobileActionRail.registerItems('app-shell', mobileActionRail.enabled ? railActions : []);
  }, [mobileActionRail, railActions]);

  return (
    <main
      className={[
        'app-shell',
        variant === 'map' ? 'is-map-shell' : '',
        navOpen ? '' : 'is-nav-collapsed',
        variant === 'map' && mapRoutePanelVisible ? 'has-map-route-panel' : '',
        variant === 'map' && mapSidebarOverlayVisible ? 'has-map-sidebar-overlay' : '',
        mobileActionRail?.enabled ? 'has-mobile-action-rail' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-mobile-action-rail-side={mobileActionRail?.enabled ? mobileActionRail.side : undefined}
    >
      <header className="topbar">
        <TopbarMaterialLayers />
        <button
          className="icon-button desktop-menu"
          type="button"
          aria-label={navOpen ? t('nav.collapse') : t('nav.expand')}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((current) => !current)}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <Link
          className={useSymbolBrand ? 'brand is-symbol-brand' : 'brand is-wordmark-brand'}
          href={appPath('/')}
          aria-label={t('brand.home')}
        >
          <BrandWordmark className="brand-logo brand-logo-wordmark" />
          <BrandSymbol className="brand-logo brand-logo-symbol" />
        </Link>
        {topbarPageTitle ? (
          <button
            type="button"
            className="topbar-page-title"
            aria-label={`${topbarPageTitle} · ${t('map.explore.action')}`}
            onClick={() =>
              router.push(
                appPath(
                  `/map?lucky=${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
                ),
                { scroll: false },
              )
            }
          >
            {topbarPageTitle}
          </button>
        ) : null}
        <div className="topbar-actions">
          <button
            className="pill-button"
            type="button"
            aria-busy={rideCodeLoading}
            disabled={rideCodeLoading}
            onClick={() => void openRideCode()}
          >
            <span className="material-symbols-outlined">
              {rideCodeLoading ? 'progress_activity' : 'qr_code_2'}
            </span>
            <span>{t('quickAction.rideCode')}</span>
          </button>
          {!mobileActionRail?.enabled && assistantEnabled && !hideAssistantEntry ? (
            <button
              className="icon-button"
              type="button"
              aria-label={t('globalSearch.action.open')}
              onClick={openGlobalSearch}
            >
              <SmartQaGlyph size={22} />
            </button>
          ) : null}
          <Link
            className={accountButtonClassName(accountStatus, accountBadge)}
            href={appPath('/account')}
            aria-label={accountButtonAriaLabel(accountStatus, accountBadge, t)}
            title={accountButtonAriaLabel(accountStatus, accountBadge, t)}
          >
            {accountStatus?.avatarUrl ? (
              <ProgressiveImage
                className="topbar-account-avatar"
                src={accountStatus.avatarUrl}
                alt=""
                showStatus={false}
              />
            ) : (
              <span className="material-symbols-outlined">
                {accountIcon(accountStatus?.accountStatus, accountStatus?.isLocalAdmin)}
              </span>
            )}
            {accountBadge.kind === 'count' ? (
              <span className="account-badge" aria-hidden="true">
                {formatBadgeCount(accountBadge.count)}
              </span>
            ) : null}
            {accountBadge.kind === 'dot' ? (
              <span className="account-badge is-dot" aria-hidden="true" />
            ) : null}
          </Link>
        </div>
      </header>

      <div className="workspace">
        <div className="sidebar-stack">
          <aside className="rail" aria-label={t('nav.label')}>
            {navItems.map((item) => (
              <Link
                className={active === item.key ? 'rail-item is-active' : 'rail-item'}
                href={appPath(item.href)}
                key={item.key}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </Link>
            ))}
          </aside>
          <SiteLegal className="site-legal-sidebar" />
        </div>

        <section className="content">
          {children}
          {variant !== 'map' ? <SiteLegal className="site-legal-content-fallback" /> : null}
        </section>
      </div>

      <nav className="bottom-nav" aria-label={t('nav.label')}>
        {navItems.map((item) => (
          <Link
            className={active === item.key ? 'bottom-nav-item is-active' : 'bottom-nav-item'}
            href={appPath(item.href)}
            key={item.key}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

function accountButtonClassName(
  status: AccountStatusResponse | null,
  badge: TopbarBadgeSummary,
): string {
  return [
    'account-button',
    status?.accountStatus === 'active' ? 'is-authenticated' : '',
    status?.accountStatus === 'readonly' ? 'is-readonly' : '',
    status?.accountStatus === 'unavailable' || status?.accountStatus === 'not_configured'
      ? 'is-attention'
      : '',
    badge.kind !== 'none' ? 'has-badge' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function accountButtonAriaLabel(
  status: AccountStatusResponse | null,
  badge: TopbarBadgeSummary,
  t: Translate,
): string {
  if (!status) {
    const badgeText = badge.kind === 'none' ? '' : `，${badge.label}`;
    return `${t('account.settings')}${badgeText}`;
  }

  const statusText: Record<AccountStatusResponse['accountStatus'], string> = {
    not_configured: t('account.status.notConfigured'),
    anonymous: t('account.status.anonymous'),
    active: status.username ? `${t('status.loggedIn')}：${status.username}` : t('status.loggedIn'),
    readonly: status.username
      ? `${t('account.status.readonly')}：${status.username}`
      : t('account.status.readonly'),
    unavailable: t('account.status.unavailable'),
  };
  const badgeText = badge.kind === 'none' ? '' : `，${badge.label}`;
  return `${t('account.settings')}：${statusText[status.accountStatus]}${badgeText}`;
}

function mergeTopbarBadge(
  accountBadge: AccountStatusResponse['badge'] | undefined,
  localPendingSyncCount: number,
  t: Translate,
): TopbarBadgeSummary {
  const accountCount = accountBadge?.kind === 'count' ? accountBadge.count : 0;
  const count = accountCount + localPendingSyncCount;
  const labels = [
    accountBadge && accountBadge.kind !== 'none' ? accountBadge.label : undefined,
    localPendingSyncCount > 0
      ? t('sync.localTripsPending', { count: localPendingSyncCount })
      : undefined,
  ].filter((label): label is string => Boolean(label));

  if (count > 0) {
    return {
      kind: 'count',
      count,
      label: labels.join('，') || t('status.pendingItems', { count }),
    };
  }

  if (accountBadge?.kind === 'dot') {
    return accountBadge;
  }

  return {
    kind: 'none',
    count: 0,
    label: t('status.noPending'),
  };
}

function accountIcon(
  status: AccountStatusResponse['accountStatus'] | undefined,
  isLocalAdmin?: boolean,
): string {
  if (isLocalAdmin) {
    return 'admin_panel_settings';
  }

  if (status === 'readonly') {
    return 'manage_accounts';
  }

  if (status === 'unavailable' || status === 'not_configured') {
    return 'error';
  }

  return 'account_circle';
}

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

type SecondaryShellProps = Readonly<{
  title: string;
  titleKey?: CommonMessageKey;
  backHref?: string;
  desktopBackHref?: string;
  desktopNavigation?: ReactNode;
  secondaryActions?: ReactNode;
  legalVariant?: 'none' | 'mobile' | 'always';
  children: ReactNode;
}>;

export function SecondaryShell(props: SecondaryShellProps) {
  return (
    <MobileActionRailProvider>
      <SecondaryShellFrame {...props} />
    </MobileActionRailProvider>
  );
}

function SecondaryShellFrame({
  title,
  titleKey,
  backHref = '/',
  desktopBackHref,
  desktopNavigation,
  secondaryActions,
  legalVariant = 'none',
  children,
}: SecondaryShellProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const mobileActionRail = useMobileActionRail();
  const [assistantPreference, setAssistantPreference] = useState(readAssistantEntryPreference);

  useEffect(() => {
    const sync = () => setAssistantPreference(readAssistantEntryPreference());
    sync();
    return subscribeAssistantEntryPreferenceChanged(setAssistantPreference);
  }, []);

  // 管理后台的二级页面不再保留问一问入口，后台操作页面不面向普通问答。
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  const adminBasePath = appPath('/admin');
  const isAdminSecondaryPage =
    normalizedPathname !== adminBasePath && normalizedPathname.startsWith(`${adminBasePath}/`);

  const showAssistantEntry =
    assistantPreference.enabled && assistantPreference.allPages && !isAdminSecondaryPage;
  const assistantInRail = showAssistantEntry && Boolean(mobileActionRail?.enabled);

  const railActions = useMemo<MobileActionRailItem[]>(
    () =>
      mobileActionRail?.enabled
        ? [
            {
              id: 'rail-back',
              group: 'back',
              order: 0,
              priority: 100,
              label: t('nav.back'),
              icon: 'arrow_back',
              href: appPath(backHref),
            },
            ...(assistantInRail
              ? [
                  {
                    id: 'rail-assistant',
                    group: 'page' as const,
                    order: 10,
                    priority: 45,
                    label: t('globalSearch.action.open'),
                    icon: 'search',
                    iconNode: <SmartQaGlyph size={22} />,
                    onClick: () => publishGlobalSearchRequested(),
                  },
                ]
              : []),
          ]
        : [],
    [assistantInRail, backHref, mobileActionRail?.enabled, t],
  );

  useEffect(() => {
    if (!mobileActionRail) {
      return;
    }
    mobileActionRail.registerItems('secondary-shell', railActions);
  }, [mobileActionRail, railActions]);

  const showAssistantInHeader = showAssistantEntry && !assistantInRail;
  const mergedSecondaryActions =
    showAssistantInHeader || secondaryActions ? (
      <>
        {showAssistantInHeader ? (
          <button
            className="icon-button secondary-assistant-entry"
            type="button"
            aria-label={t('globalSearch.action.open')}
            onClick={() => publishGlobalSearchRequested()}
          >
            <SmartQaGlyph size={22} />
          </button>
        ) : null}
        {secondaryActions}
      </>
    ) : undefined;

  return (
    <main
      className={['secondary-shell', mobileActionRail?.enabled ? 'has-mobile-action-rail' : '']
        .filter(Boolean)
        .join(' ')}
      data-mobile-action-rail-side={mobileActionRail?.enabled ? mobileActionRail.side : undefined}
    >
      <SecondaryPageHeader
        backHref={backHref}
        desktopBackHref={desktopBackHref}
        secondaryActions={mergedSecondaryActions}
        title={title}
        titleKey={titleKey}
      />
      <section
        className={
          desktopNavigation ? 'secondary-content has-desktop-navigation' : 'secondary-content'
        }
      >
        {desktopNavigation ? (
          <>
            <div className="secondary-desktop-navigation">{desktopNavigation}</div>
            <div className="secondary-page-content">{children}</div>
          </>
        ) : (
          children
        )}
      </section>
      {legalVariant !== 'none' ? (
        <SiteLegal
          className={[
            'site-legal-secondary',
            legalVariant === 'mobile' ? 'site-legal-mobile-only' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
    </main>
  );
}

function TopbarMaterialLayers() {
  return (
    <span className="topbar-material-layers" aria-hidden="true">
      <span className="topbar-material-layer is-strong" />
      <span className="topbar-material-layer is-medium" />
      <span className="topbar-material-layer is-soft" />
    </span>
  );
}

function SiteLegal({ className = '' }: Readonly<{ className?: string }>) {
  const { t } = useI18n();
  const releaseVersion = process.env.NEXT_PUBLIC_YCT_RELEASE_VERSION ?? '2.0.0';

  return (
    <footer className={['site-legal', className].filter(Boolean).join(' ')}>
      <p>{t('siteLegal.disclaimer')}</p>
      <p>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {t('siteLegal.icp')}
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=21100502000117"
          target="_blank"
          rel="noreferrer"
        >
          {t('siteLegal.police')}
        </a>
        <Link href={appPath('/services/changelog')} className="site-legal-version">
          {t('siteLegal.version', { version: releaseVersion })}
        </Link>
      </p>
    </footer>
  );
}

export function SecondaryPageHeader({
  backHref,
  backLabel,
  desktopBackHref,
  onBack,
  secondaryActions,
  title,
  titleKey,
}: Readonly<{
  backHref: string;
  backLabel?: string;
  desktopBackHref?: string;
  onBack?: () => void;
  secondaryActions?: ReactNode;
  title: string;
  titleKey?: CommonMessageKey;
}>) {
  const { t } = useI18n();
  const renderedTitle = titleKey ? t(titleKey) : title;
  const accessibleBackLabel = backLabel ?? t('nav.back');
  const backClassName = desktopBackHref ? 'icon-button secondary-back-mobile' : 'icon-button';

  return (
    <header className="topbar secondary-topbar">
      <TopbarMaterialLayers />
      {onBack ? (
        <button
          className={backClassName}
          type="button"
          aria-label={accessibleBackLabel}
          onClick={onBack}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      ) : (
        <Link className={backClassName} href={appPath(backHref)} aria-label={accessibleBackLabel}>
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
      )}
      {desktopBackHref ? (
        <Link
          className="icon-button secondary-back-desktop"
          href={appPath(desktopBackHref)}
          aria-label={accessibleBackLabel}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
      ) : null}
      <h1 className="secondary-title">{renderedTitle}</h1>
      <div className="secondary-actions">{secondaryActions}</div>
    </header>
  );
}
