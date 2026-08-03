'use client';

import type {
  ApiItemResponse,
  ApiListResponse,
  OperationsFeedItem,
  OperationsServerStatus,
  OperationsStrongReminderItem,
} from '@yct/contracts';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { TitleWithBreaks } from './title-with-breaks';

const categories = [
  { key: 'all', labelKey: 'operations.category.all', icon: 'select_check_box', tone: 'primary' },
  { key: '通知公告', labelKey: 'operations.category.notice', icon: 'campaign', tone: 'primary' },
  { key: '运营信息', labelKey: 'operations.category.updates', icon: 'article', tone: 'primary' },
  { key: '地铁运营', labelKey: 'operations.category.metro', icon: 'subway', tone: 'metro' },
  { key: '公交运营', labelKey: 'operations.category.bus', icon: 'directions_bus', tone: 'bus' },
  { key: '有轨运营', labelKey: 'operations.category.tram', icon: 'tram', tone: 'tram' },
  { key: '网站公告', labelKey: 'operations.category.site', icon: 'web', tone: 'primary' },
] as const;

const operationsSocialLinks = [
  {
    href: 'https://afdian.com/a/LindongCityServer',
    iconFile: 'afdian.png',
    labelKey: 'operations.social.afdian',
  },
  {
    href: 'https://jq.qq.com/?_wv=1027&k=2ohkcKQI',
    iconFile: 'qq.png',
    labelKey: 'operations.social.qq',
  },
  {
    href: 'https://space.bilibili.com/106279202',
    iconFile: 'bilibili.png',
    labelKey: 'operations.social.bilibili',
  },
  {
    href: 'https://wiki.shangxiaoguan.top/images/d/d2/%E4%B8%B4%E4%B8%9C%E5%BE%AE%E5%BF%97.png',
    iconFile: 'wechat.png',
    labelKey: 'operations.social.wechat',
  },
  {
    href: 'https://pd.qq.com/g/58ocn0s744',
    iconFile: 'qq_pd.png',
    labelKey: 'operations.social.qqChannel',
  },
] as const;

type CategoryKey = (typeof categories)[number]['key'];
type Translate = ReturnType<typeof useI18n>['t'];

const categoryLabelKeyById = new Map<string, CommonMessageKey>(
  categories
    .filter((category) => category.key !== 'all')
    .map((category) => [category.key, category.labelKey]),
);

export function OperationsHome({
  feed,
  reminders,
  serverStatus,
}: Readonly<{
  feed: ApiListResponse<OperationsFeedItem>;
  reminders: ApiListResponse<OperationsStrongReminderItem>;
  serverStatus: ApiItemResponse<OperationsServerStatus>;
}>) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [motionReduced, setMotionReduced] = useState(false);
  const [currentServerStatus, setCurrentServerStatus] = useState(serverStatus);
  const now = useMemo(() => Date.now(), []);
  const activeReminders = reminders.items;

  const activeLabel = useMemo(
    () =>
      t(
        categories.find((category) => category.key === activeCategory)?.labelKey ??
          'operations.category.all',
      ),
    [activeCategory, t],
  );

  const sortedItems = useMemo(() => [...feed.items].sort(comparePublishedAtDesc), [feed.items]);
  const filteredItems = useMemo(
    () =>
      sortedItems.filter((item) => activeCategory === 'all' || item.categoryId === activeCategory),
    [activeCategory, sortedItems],
  );
  const currentItems = filteredItems.filter((item) => !isExpiredItem(item, now));
  const expiredItems = filteredItems.filter((item) => isExpiredItem(item, now));
  const bannerItems = useMemo(
    () => selectFeaturedOperationsItems(sortedItems, now),
    [now, sortedItems],
  );
  const bannerItem = bannerItems[activeBannerIndex] ?? bannerItems[0];

  useEffect(() => {
    setActiveBannerIndex((current) => (current < bannerItems.length ? current : 0));
  }, [bannerItems.length]);

  useEffect(() => {
    if (carouselPaused || motionReduced || bannerItems.length < 2) {
      return undefined;
    }

    const timer = window.setInterval(
      () => setActiveBannerIndex((current) => (current + 1) % bannerItems.length),
      6_500,
    );
    return () => window.clearInterval(timer);
  }, [bannerItems.length, carouselPaused, motionReduced]);

  useEffect(() => {
    const root = document.documentElement;
    const systemMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      setMotionReduced(
        root.dataset.motion === 'reduced' ||
          (root.dataset.motion !== 'full' && systemMotionQuery.matches),
      );
    };
    const rootObserver = new MutationObserver(updateMotionPreference);

    updateMotionPreference();
    systemMotionQuery.addEventListener('change', updateMotionPreference);
    rootObserver.observe(root, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      systemMotionQuery.removeEventListener('change', updateMotionPreference);
      rootObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshServerStatus() {
      try {
        const response = await fetch(appPath('/api/operations/server-status'), {
          cache: 'no-store',
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ApiItemResponse<OperationsServerStatus>;
        if (!cancelled && payload.item) {
          setCurrentServerStatus(payload);
        }
      } catch {
        // 保留最近一次明确状态，下一轮轮询会继续尝试。
      }
    }

    const timer = window.setInterval(() => void refreshServerStatus(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const emptyText =
    activeCategory === 'all'
      ? t('operations.emptyAll')
      : t('operations.emptyCategory', { category: activeLabel });

  return (
    <div className="content-stack" aria-labelledby="operations-title">
      <section
        className={bannerItems.length > 1 ? 'hero-panel has-carousel' : 'hero-panel'}
        aria-label={t('operations.featuredAria')}
        onPointerEnter={() => setCarouselPaused(true)}
        onPointerLeave={() => setCarouselPaused(false)}
        onFocusCapture={() => setCarouselPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setCarouselPaused(false);
          }
        }}
      >
        {bannerItem ? (
          <Link
            className="hero-feature-link"
            href={appPath(`/operations/${encodeURIComponent(bannerItem.id)}`)}
            style={buildHeroFallbackStyle(bannerItem)}
            key={bannerItem.id}
          >
            {bannerItem.coverImageUrl ? (
              <img
                className="hero-feature-image"
                src={appPath(bannerItem.coverImageUrl)}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : null}
            <div className="hero-copy">
              <p className="eyebrow">{bannerItem.categoryId}</p>
              <h1 id="operations-title" className="hero-title">
                <TitleWithBreaks title={bannerItem.title} segments={bannerItem.titleSegments} />
              </h1>
            </div>
          </Link>
        ) : (
          <div className="hero-copy">
            <p className="eyebrow">{t('page.operations')}</p>
            <h1 id="operations-title">{t('page.operations')}</h1>
            <p className="empty-copy">{t('operations.emptyFeatured')}</p>
          </div>
        )}
        {bannerItems.length > 1 ? (
          <HeroCarouselControls
            activeIndex={activeBannerIndex}
            count={bannerItems.length}
            onSelect={setActiveBannerIndex}
            t={t}
          />
        ) : null}
      </section>

      <section className="reminder-panel" aria-label={t('operations.remindersAria')}>
        <div className="reminder-panel-layout">
          <span className="material-symbols-outlined reminder-panel-icon" aria-hidden="true">
            campaign
          </span>
          <div className="reminder-panel-marquee">
            {activeReminders.length > 0 ? (
              <ReminderTicker items={activeReminders} t={t} />
            ) : (
              <span className="reminder-panel-empty">{t('operations.noStrongReminder')}</span>
            )}
          </div>
        </div>
      </section>

      <ServerStatusPanel response={currentServerStatus} t={t} />

      <section className="feed-panel" aria-label={t('operations.feedAria')}>
        <div className="operations-feed-toolbar">
          <h2>{t('operations.latestTitle')}</h2>
          <nav className="operations-social-links" aria-label={t('operations.socialAria')}>
            {operationsSocialLinks.map((link) => (
              <a
                className="operations-social-link"
                href={link.href}
                target="_blank"
                rel="noreferrer"
                aria-label={t(link.labelKey)}
                title={t(link.labelKey)}
                key={link.href}
              >
                <img
                  src={appPath(`/icons/social/${link.iconFile}`)}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <span>{t(link.labelKey)}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="category-strip" aria-label={t('operations.categoryAria')}>
          {categories.map((category) => {
            const isActive = activeCategory === category.key;
            return (
              <button
                className={`category-chip tone-${category.tone}${isActive ? ' is-active' : ''}`}
                type="button"
                aria-pressed={isActive}
                key={category.key}
                onClick={() => setActiveCategory(category.key)}
              >
                <span className="material-symbols-outlined">{category.icon}</span>
                <span>{t(category.labelKey)}</span>
              </button>
            );
          })}
        </div>
        {currentItems.length > 0 || expiredItems.length > 0 ? (
          <>
            {currentItems.length > 0 ? <FeedList items={currentItems} t={t} /> : null}
            {expiredItems.length > 0 ? (
              <details className="expired-feed-group">
                <summary>
                  <span>{t('operations.expired')}</span>
                  <span className="muted">
                    {t('operations.itemCount', { count: expiredItems.length })}
                  </span>
                </summary>
                <FeedList items={expiredItems} t={t} />
              </details>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              inbox
            </span>
            <p>{emptyText}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function HeroCarouselControls({
  activeIndex,
  count,
  onSelect,
  t,
}: Readonly<{
  activeIndex: number;
  count: number;
  onSelect: (index: number) => void;
  t: Translate;
}>) {
  const selectRelative = (offset: number) => onSelect((activeIndex + offset + count) % count);

  return (
    <div className="hero-carousel-controls">
      <button
        className="hero-carousel-arrow"
        type="button"
        aria-label={t('operations.featuredPrevious')}
        title={t('operations.featuredPrevious')}
        onClick={() => selectRelative(-1)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          chevron_left
        </span>
      </button>
      <div className="hero-carousel-pages" aria-label={t('operations.featuredPages')}>
        {Array.from({ length: count }, (_, index) => (
          <button
            className={index === activeIndex ? 'is-active' : ''}
            type="button"
            aria-label={t('operations.featuredPage', { index: index + 1 })}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => onSelect(index)}
            key={index}
          />
        ))}
      </div>
      <button
        className="hero-carousel-arrow"
        type="button"
        aria-label={t('operations.featuredNext')}
        title={t('operations.featuredNext')}
        onClick={() => selectRelative(1)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </div>
  );
}

function ReminderTicker({
  items,
  t,
}: Readonly<{ items: OperationsStrongReminderItem[]; t: Translate }>) {
  const style = {
    '--operations-reminder-duration': `${Math.max(18, items.length * 11)}s`,
  } as CSSProperties;

  return (
    <div className="operations-reminder-marquee" style={style}>
      <div className="operations-reminder-track">
        <div className="operations-reminder-group">
          {items.map((item) => (
            <ReminderTickerItem item={item} key={item.id} t={t} />
          ))}
        </div>
        <div className="operations-reminder-group is-copy" aria-hidden="true">
          {items.map((item) => (
            <ReminderTickerItem duplicate item={item} key={item.id} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReminderTickerItem({
  duplicate = false,
  item,
  t,
}: Readonly<{
  duplicate?: boolean;
  item: OperationsStrongReminderItem;
  t: Translate;
}>) {
  const className = ['operations-reminder-ticker-item', `tone-${item.tone}`].join(' ');
  const windowText = item.displayEndDate
    ? t('operations.validUntil', { date: item.displayEndDate })
    : item.displayStartDate
      ? t('operations.startsAt', { date: item.displayStartDate })
      : undefined;
  const content = (
    <div className="operations-reminder-ticker-copy">
      {item.label ? <span className="operations-reminder-label">{item.label}</span> : null}
      <span className="operations-reminder-ticker-title">{item.title}</span>
      {item.summary ? <span>{item.summary}</span> : null}
      {windowText ? <span>{windowText}</span> : null}
    </div>
  );

  if (duplicate) {
    return <div className={className}>{content}</div>;
  }

  if (!item.href) {
    return <article className={className}>{content}</article>;
  }

  if (/^https?:\/\//i.test(item.href)) {
    return (
      <a className={className} href={item.href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link className={className} href={item.href}>
      {content}
    </Link>
  );
}

function ServerStatusPanel({
  response,
  t,
}: Readonly<{ response: ApiItemResponse<OperationsServerStatus>; t: Translate }>) {
  const status = response.item;
  const availability = status?.availability ?? 'unknown';
  const statusLabel =
    availability === 'online'
      ? t('operations.serverStatus.online')
      : availability === 'offline'
        ? t('operations.serverStatus.offline')
        : t('operations.serverStatus.unknown');

  return (
    <Link
      className={`server-status-panel is-${availability}`}
      href={appPath('/map?category=player')}
      aria-label={t('operations.serverStatusAria')}
      title={t('operations.serverStatus.openPlayers')}
    >
      <h2 className="server-status-title">{t('operations.serverStatus.title')}</h2>
      <div className="server-status-summary">
        <span className="server-status-indicator" aria-hidden="true" />
        {availability === 'online' ? (
          <>
            {status?.latencyMs !== undefined ? (
              <span className="server-status-latency">{status.latencyMs}ms</span>
            ) : (
              <span className="server-status-state">{statusLabel}</span>
            )}
            {status?.onlinePlayerCount !== undefined ? (
              <span
                className="server-status-player-count"
                title={t('operations.serverStatus.players')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  group
                </span>
                <span>{status.onlinePlayerCount}</span>
              </span>
            ) : null}
          </>
        ) : (
          <span className="server-status-state">{statusLabel}</span>
        )}
      </div>
    </Link>
  );
}

function formatOperationsCategoryLabel(categoryId: string, t: Translate): string {
  const labelKey = categoryLabelKeyById.get(categoryId);
  return labelKey ? t(labelKey) : categoryId;
}

function buildHeroFallbackStyle(item: OperationsFeedItem): CSSProperties | undefined {
  if (item.coverColor) {
    return { backgroundColor: item.coverColor };
  }

  return undefined;
}

function FeedList({ items, t }: Readonly<{ items: OperationsFeedItem[]; t: Translate }>) {
  return (
    <div className="operations-feed-list">
      {items.map((item) => (
        <Link
          className="operations-feed-item"
          href={appPath(`/operations/${encodeURIComponent(item.id)}`)}
          key={item.id}
        >
          <div
            className={item.coverImageUrl ? 'feed-item-cover has-image' : 'feed-item-cover'}
            aria-hidden="true"
            style={buildFeedCoverStyle(item)}
          >
            {item.coverImageUrl ? (
              <img
                src={appPath(item.coverImageUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
            ) : (
              <span className="material-symbols-outlined">
                {item.coverColor ? 'article' : 'image'}
              </span>
            )}
          </div>
          <div className="feed-item-copy">
            <div className="feed-item-meta">
              <span>{formatOperationsCategoryLabel(item.categoryId, t)}</span>
              {item.displayDate ? <span>{item.displayDate}</span> : null}
              {item.displayExpireDate ? (
                <span>{t('operations.validUntil', { date: item.displayExpireDate })}</span>
              ) : null}
            </div>
            <h2>
              <TitleWithBreaks title={item.title} segments={item.titleSegments} />
            </h2>
            {item.excerpt ? <p>{item.excerpt}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function buildFeedCoverStyle(item: OperationsFeedItem): CSSProperties | undefined {
  if (item.coverColor) {
    return { backgroundColor: item.coverColor };
  }

  return undefined;
}

function comparePublishedAtDesc(left: OperationsFeedItem, right: OperationsFeedItem): number {
  return toTime(right.publishedAt) - toTime(left.publishedAt);
}

function compareBannerPriority(left: OperationsFeedItem, right: OperationsFeedItem): number {
  const leftOrder = left.bannerSortOrder ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.bannerSortOrder ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return comparePublishedAtDesc(left, right);
}

export function pickFeaturedOperationsItem(
  items: OperationsFeedItem[],
  now: number,
): OperationsFeedItem | undefined {
  return selectFeaturedOperationsItems(items, now)[0];
}

export function selectFeaturedOperationsItems(
  items: OperationsFeedItem[],
  now: number,
): OperationsFeedItem[] {
  const activeBannerItems = items
    .filter((item) => item.showInBanner && !isExpiredItem(item, now))
    .sort(compareBannerPriority);
  if (activeBannerItems.length > 0) {
    return activeBannerItems;
  }

  const fallbackItem = items.find((item) => !isExpiredItem(item, now)) ?? items[0];
  return fallbackItem ? [fallbackItem] : [];
}

function isExpiredItem(item: OperationsFeedItem, now: number): boolean {
  const expiresAt = toTime(item.expiresAt);
  return expiresAt > 0 && expiresAt < now;
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
