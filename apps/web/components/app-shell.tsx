'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  readTripReminderState,
  tripReminderStateChangedEventName,
} from '../lib/client-trip-reminders';

export type PrimaryNavKey = 'operations' | 'map' | 'travel' | 'services';
export type AppShellVariant = 'default' | 'map';

const navItems = [
  { key: 'operations', label: '运营', icon: 'article', href: '/' },
  { key: 'map', label: '探索', icon: 'map', href: '/map' },
  { key: 'travel', label: '出行', icon: 'directions_bus', href: '/travel' },
  { key: 'services', label: '服务', icon: 'apps', href: '/services' },
] as const;

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
  variant = 'default',
  children,
}: Readonly<{
  active?: PrimaryNavKey;
  pageTitle?: string;
  variant?: AppShellVariant;
  children: ReactNode;
}>) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(true);
  const [topbarNotice, setTopbarNotice] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatusResponse | null>(null);
  const [localPendingSyncCount, setLocalPendingSyncCount] = useState(0);
  const noticeTimer = useRef<number | null>(null);

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

    void loadAccountStatus();

    return () => {
      cancelled = true;
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
  const accountBadge = mergeTopbarBadge(accountStatus?.badge, localPendingSyncCount);

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
          aria-label={navOpen ? '收起主导航' : '展开主导航'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((current) => !current)}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <Link className="brand" href={appPath('/')} aria-label="雨城通首页">
          <img
            className="brand-logo brand-logo-wordmark"
            src={appPath('/icons/yct-logo-wordmark.svg')}
            alt="雨城通"
          />
          <img
            className="brand-logo brand-logo-symbol"
            src={appPath('/icons/yct-logo.svg')}
            alt="雨城通"
          />
        </Link>
        {pageTitle ? <span className="topbar-page-title">{pageTitle}</span> : null}
        <div className="topbar-actions">
          <button
            className="pill-button"
            type="button"
            onClick={() => showTopbarNotice('乘车码需要登录后使用')}
          >
            <span className="material-symbols-outlined">qr_code_2</span>
            <span>乘车码</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="搜索"
            onClick={openGlobalSearch}
          >
            <span className="material-symbols-outlined">search</span>
          </button>
          <Link
            className={accountButtonClassName(accountStatus, accountBadge)}
            href={appPath('/account')}
            aria-label={accountButtonAriaLabel(accountStatus, accountBadge)}
            title={accountButtonAriaLabel(accountStatus, accountBadge)}
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
          <aside className="rail" aria-label="主导航">
            {navItems.map((item) => (
              <Link
                className={active === item.key ? 'rail-item is-active' : 'rail-item'}
                href={appPath(item.href)}
                key={item.key}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
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

      <nav className="bottom-nav" aria-label="主导航">
        {navItems.map((item) => (
          <Link
            className={active === item.key ? 'bottom-nav-item is-active' : 'bottom-nav-item'}
            href={appPath(item.href)}
            key={item.key}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
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
): string {
  if (!status) {
    const badgeText = badge.kind === 'none' ? '' : `，${badge.label}`;
    return `账号设置${badgeText}`;
  }

  const statusText: Record<AccountStatusResponse['accountStatus'], string> = {
    not_configured: '临东通未配置',
    anonymous: '未登录',
    active: status.username ? `已登录：${status.username}` : '已登录',
    readonly: status.username ? `只读账号：${status.username}` : '只读账号',
    unavailable: '账号状态暂不可用',
  };
  const badgeText = badge.kind === 'none' ? '' : `，${badge.label}`;
  return `账号设置：${statusText[status.accountStatus]}${badgeText}`;
}

function mergeTopbarBadge(
  accountBadge: AccountStatusResponse['badge'] | undefined,
  localPendingSyncCount: number,
): TopbarBadgeSummary {
  const accountCount = accountBadge?.kind === 'count' ? accountBadge.count : 0;
  const count = accountCount + localPendingSyncCount;
  const labels = [
    accountBadge && accountBadge.kind !== 'none' ? accountBadge.label : undefined,
    localPendingSyncCount > 0 ? `${localPendingSyncCount} 个本地行程待同步` : undefined,
  ].filter((label): label is string => Boolean(label));

  if (count > 0) {
    return {
      kind: 'count',
      count,
      label: labels.join('，') || `${count} 个待处理事项`,
    };
  }

  if (accountBadge?.kind === 'dot') {
    return accountBadge;
  }

  return {
    kind: 'none',
    count: 0,
    label: '无待办',
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
  backHref = '/',
  legalVariant = 'none',
  children,
}: Readonly<{
  title: string;
  backHref?: string;
  legalVariant?: 'none' | 'mobile' | 'always';
  children: ReactNode;
}>) {
  return (
    <main className="secondary-shell">
      <header className="topbar secondary-topbar">
        <Link className="icon-button" href={appPath(backHref)} aria-label="返回">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="secondary-title">{title}</h1>
        <div className="secondary-actions" />
      </header>
      <section className="secondary-content">{children}</section>
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
  return (
    <footer className={['site-legal', className].filter(Boolean).join(' ')}>
      <p>本站部分代码使用人工智能技术生成，上述地名、组织名均为虚构。</p>
      <p>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          辽ICP备2021004959号-1
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=21100502000117"
          target="_blank"
          rel="noreferrer"
        >
          辽公网安备21100502000117号
        </a>
      </p>
    </footer>
  );
}
