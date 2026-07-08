'use client';

import type {
  ApiListResponse,
  OperationsFeedItem,
  OperationsStrongReminderItem,
} from '@yct/contracts';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
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
}: Readonly<{
  feed: ApiListResponse<OperationsFeedItem>;
  reminders: ApiListResponse<OperationsStrongReminderItem>;
}>) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const now = useMemo(() => Date.now(), []);
  const activeReminders = reminders.items;

  const activeLabel = useMemo(
    () =>
      t(categories.find((category) => category.key === activeCategory)?.labelKey ?? 'operations.category.all'),
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
  const bannerItem = useMemo(() => pickFeaturedOperationsItem(sortedItems, now), [now, sortedItems]);

  const emptyText =
    activeCategory === 'all'
      ? t('operations.emptyAll')
      : t('operations.emptyCategory', { category: activeLabel });

  return (
    <div className="content-stack" aria-labelledby="operations-title">
      <section className="hero-panel" aria-label={t('operations.featuredAria')}>
        {bannerItem ? (
          <Link
            className="hero-feature-link"
            href={appPath(`/operations/${encodeURIComponent(bannerItem.id)}`)}
            style={buildHeroFallbackStyle(bannerItem)}
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
      </section>

      <section className="reminder-panel" aria-label={t('operations.remindersAria')}>
        <div className="section-heading">
          <h2>{t('operations.strongReminder')}</h2>
          <span className="muted">
            {activeReminders.length > 0
              ? t('operations.itemCount', { count: activeReminders.length })
              : t('operations.noStrongReminder')}
          </span>
        </div>
        {activeReminders.length > 0 ? <ReminderList items={activeReminders} /> : null}
      </section>

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

function ReminderList({ items }: Readonly<{ items: OperationsStrongReminderItem[] }>) {
  return (
    <div className="operations-reminder-list">
      {items.map((item) => (
        <ReminderCard item={item} key={item.id} />
      ))}
    </div>
  );
}

function ReminderCard({ item }: Readonly<{ item: OperationsStrongReminderItem }>) {
  const className = ['operations-reminder-item', `tone-${item.tone}`].join(' ');
  const windowText = item.displayEndDate
    ? `有效至 ${item.displayEndDate}`
    : item.displayStartDate
      ? `开始于 ${item.displayStartDate}`
      : undefined;
  const icon = iconForReminderTone(item.tone);
  const content = (
    <>
      <div className="operations-reminder-copy">
        <div className="operations-reminder-meta">
          {item.label ? <span className="operations-reminder-label">{item.label}</span> : null}
          {windowText ? <span className="muted">{windowText}</span> : null}
        </div>
        <strong>{item.title}</strong>
        {item.summary ? <p>{item.summary}</p> : null}
      </div>
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
    </>
  );

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

function iconForReminderTone(tone: OperationsStrongReminderItem['tone']): string {
  switch (tone) {
    case 'metro':
      return 'subway';
    case 'bus':
    case 'coach':
      return 'directions_bus';
    case 'tram':
      return 'tram';
    case 'ferry':
      return 'directions_boat';
    case 'flight':
      return 'flight_takeoff';
    case 'railway':
      return 'train';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'crisis_alert';
    default:
      return 'notifications_active';
  }
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
  const bannerCandidates = items.filter((item) => item.showInBanner).sort(compareBannerPriority);
  return bannerCandidates.find((item) => !isExpiredItem(item, now)) ?? bannerCandidates[0] ?? items[0];
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
