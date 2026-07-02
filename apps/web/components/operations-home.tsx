'use client';

import type { ApiListResponse, OperationsFeedItem } from '@yct/contracts';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { TitleWithBreaks } from './title-with-breaks';

const categories = [
  { key: 'all', label: '全部', icon: 'select_check_box', tone: 'primary' },
  { key: '通知公告', label: '通知公告', icon: 'campaign', tone: 'primary' },
  { key: '运营信息', label: '运营信息', icon: 'article', tone: 'primary' },
  { key: '地铁运营', label: '地铁运营', icon: 'subway', tone: 'metro' },
  { key: '公交运营', label: '公交运营', icon: 'directions_bus', tone: 'bus' },
  { key: '有轨运营', label: '有轨运营', icon: 'tram', tone: 'tram' },
  { key: '网站公告', label: '网站公告', icon: 'web', tone: 'primary' },
] as const;

type CategoryKey = (typeof categories)[number]['key'];

export function OperationsHome({ feed }: Readonly<{ feed: ApiListResponse<OperationsFeedItem> }>) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const now = useMemo(() => Date.now(), []);

  const activeLabel = useMemo(
    () => categories.find((category) => category.key === activeCategory)?.label ?? '全部',
    [activeCategory],
  );

  const sortedItems = useMemo(() => [...feed.items].sort(comparePublishedAtDesc), [feed.items]);
  const filteredItems = useMemo(
    () =>
      sortedItems.filter((item) => activeCategory === 'all' || item.categoryId === activeCategory),
    [activeCategory, sortedItems],
  );
  const currentItems = filteredItems.filter((item) => !isExpiredItem(item, now));
  const expiredItems = filteredItems.filter((item) => isExpiredItem(item, now));
  const bannerItem =
    sortedItems.find((item) => item.showInBanner && !isExpiredItem(item, now)) ??
    sortedItems.find((item) => item.showInBanner) ??
    sortedItems[0];

  const emptyText =
    activeCategory === 'all' ? (feed.meta.message ?? '暂无运营信息') : `暂无${activeLabel}运营信息`;

  return (
    <div className="content-stack" aria-labelledby="operations-title">
      <section className="hero-panel" aria-label="重点资讯">
        {bannerItem ? (
          <Link
            className="hero-feature-link"
            href={appPath(`/operations/${encodeURIComponent(bannerItem.id)}`)}
            style={buildHeroBackgroundStyle(bannerItem)}
          >
            <div className="hero-copy">
              <p className="eyebrow">{bannerItem.categoryId}</p>
              <h1 id="operations-title" className="hero-title">
                <TitleWithBreaks title={bannerItem.title} segments={bannerItem.titleSegments} />
              </h1>
            </div>
          </Link>
        ) : (
          <div className="hero-copy">
            <p className="eyebrow">运营信息</p>
            <h1 id="operations-title">运营信息</h1>
            <p className="empty-copy">{feed.meta.message ?? '暂无已发布重点资讯'}</p>
          </div>
        )}
      </section>

      <section className="reminder-panel" aria-label="行程提醒">
        <div className="section-heading">
          <h2>强提醒</h2>
          <span className="muted">暂无行程提醒</span>
        </div>
      </section>

      <section className="feed-panel" aria-label="运营信息列表">
        <div className="category-strip" aria-label="运营信息分类">
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
                <span>{category.label}</span>
              </button>
            );
          })}
        </div>
        {currentItems.length > 0 || expiredItems.length > 0 ? (
          <>
            {currentItems.length > 0 ? <FeedList items={currentItems} /> : null}
            {expiredItems.length > 0 ? (
              <details className="expired-feed-group">
                <summary>
                  <span>过期消息</span>
                  <span className="muted">{expiredItems.length} 条</span>
                </summary>
                <FeedList items={expiredItems} />
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

function buildHeroBackgroundStyle(item: OperationsFeedItem): CSSProperties | undefined {
  if (item.coverImageUrl) {
    return {
      backgroundImage: `linear-gradient(to top, rgba(17, 24, 23, 0.78), rgba(17, 24, 23, 0.28) 54%, rgba(17, 24, 23, 0.04)), url("${item.coverImageUrl}")`,
    };
  }

  if (item.coverColor) {
    return { backgroundColor: item.coverColor };
  }

  return undefined;
}

function FeedList({ items }: Readonly<{ items: OperationsFeedItem[] }>) {
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
            {item.coverImageUrl ? null : (
              <span className="material-symbols-outlined">
                {item.coverColor ? 'article' : 'image'}
              </span>
            )}
          </div>
          <div className="feed-item-copy">
            <div className="feed-item-meta">
              <span>{item.categoryId}</span>
              {item.displayDate ? <span>{item.displayDate}</span> : null}
              {item.displayExpireDate ? <span>有效至 {item.displayExpireDate}</span> : null}
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
  if (item.coverImageUrl) {
    return { backgroundImage: `url("${item.coverImageUrl}")` };
  }

  if (item.coverColor) {
    return { backgroundColor: item.coverColor };
  }

  return undefined;
}

function comparePublishedAtDesc(left: OperationsFeedItem, right: OperationsFeedItem): number {
  return toTime(right.publishedAt) - toTime(left.publishedAt);
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
