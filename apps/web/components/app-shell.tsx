'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { ticketOrderStateChangedEventName } from '../lib/client-ticket-orders';
import {
  readTripReminderState,
  tripReminderStateChangedEventName,
} from '../lib/client-trip-reminders';

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

export function AppShell({
  active,
  pageTitle,
  pageTitleKey,
  variant = 'default',
  children,
}: Readonly<{
  active?: PrimaryNavKey;
  pageTitle?: string;
  pageTitleKey?: CommonMessageKey;
  variant?: AppShellVariant;
  children: ReactNode;
}>) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(true);
  const [topbarNotice, setTopbarNotice] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatusResponse | null>(null);
  const [localPendingSyncCount, setLocalPendingSyncCount] = useState(0);
  const noticeTimer = useRef<number | null>(null);
  const { locale, t } = useI18n();

  useEffect(
    () => () => {
      if (noticeTimer.current) {
        window.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

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
    if (noticeTimer.current) {
      window.clearTimeout(noticeTimer.current);
    }
    setTopbarNotice(message);
    noticeTimer.current = window.setTimeout(() => setTopbarNotice(null), 2400);
  };

  const openGlobalSearch = () => {
    router.push(appPath('/search'));
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

  return (
    <main
      className={[
        'app-shell',
        variant === 'map' ? 'is-map-shell' : '',
        navOpen ? '' : 'is-nav-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
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
          <img
            className="brand-logo brand-logo-wordmark"
            src={appPath('/icons/yct-logo-wordmark.svg')}
            alt={locale === 'en' ? 'Yuchengtong' : '雨城通'}
          />
          <img
            className="brand-logo brand-logo-symbol"
            src={appPath('/icons/yct-logo.svg')}
            alt={locale === 'en' ? 'Yuchengtong' : '雨城通'}
          />
        </Link>
        {topbarPageTitle ? <span className="topbar-page-title">{topbarPageTitle}</span> : null}
        <div className="topbar-actions">
          <button
            className="pill-button"
            type="button"
            onClick={() => showTopbarNotice(t('quickAction.rideCodeLoginRequired'))}
          >
            <span className="material-symbols-outlined">qr_code_2</span>
            <span>{t('quickAction.rideCode')}</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={t('search.open')}
            onClick={openGlobalSearch}
          >
            <span className="material-symbols-outlined">search</span>
          </button>
          <Link
            className={accountButtonClassName(accountStatus, accountBadge)}
            href={appPath('/account')}
            aria-label={accountButtonAriaLabel(accountStatus, accountBadge, t)}
            title={accountButtonAriaLabel(accountStatus, accountBadge, t)}
          >
            {accountStatus?.avatarUrl ? (
              <img className="topbar-account-avatar" src={accountStatus.avatarUrl} alt="" />
            ) : (
              <span className="material-symbols-outlined">
                {accountIcon(accountStatus?.accountStatus)}
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
        {topbarNotice ? (
          <div className="topbar-notice" role="status">
            {topbarNotice}
          </div>
        ) : null}
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

function accountIcon(status: AccountStatusResponse['accountStatus'] | undefined): string {
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

export function SecondaryShell({
  title,
  titleKey,
  backHref = '/',
  desktopBackHref,
  desktopNavigation,
  legalVariant = 'none',
  children,
}: Readonly<{
  title: string;
  titleKey?: CommonMessageKey;
  backHref?: string;
  desktopBackHref?: string;
  desktopNavigation?: ReactNode;
  legalVariant?: 'none' | 'mobile' | 'always';
  children: ReactNode;
}>) {
  const { t } = useI18n();
  const renderedTitle = titleKey ? t(titleKey) : title;

  return (
    <main className="secondary-shell">
      <header className="topbar secondary-topbar">
        <Link
          className={desktopBackHref ? 'icon-button secondary-back-mobile' : 'icon-button'}
          href={appPath(backHref)}
          aria-label={t('nav.back')}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        {desktopBackHref ? (
          <Link
            className="icon-button secondary-back-desktop"
            href={appPath(desktopBackHref)}
            aria-label={t('nav.back')}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        ) : null}
        <h1 className="secondary-title">{renderedTitle}</h1>
        <div className="secondary-actions" />
      </header>
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

function SiteLegal({ className = '' }: Readonly<{ className?: string }>) {
  const { t } = useI18n();

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
      </p>
    </footer>
  );
}
