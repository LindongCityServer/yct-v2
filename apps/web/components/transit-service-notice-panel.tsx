'use client';

import type { ApiListResponse, TransitServiceNotice } from '@yct/contracts';
import { useI18n } from '../lib/client-i18n';

export function TransitServiceNoticePanel({
  notices,
}: Readonly<{
  notices: ApiListResponse<TransitServiceNotice>;
}>) {
  const { locale, t } = useI18n();
  const now = Date.now();
  const activeNotices = notices.items.filter((notice) => !isExpiredNotice(notice, now));
  const expiredNotices = notices.items.filter((notice) => isExpiredNotice(notice, now));

  if (activeNotices.length === 0 && expiredNotices.length === 0) {
    return null;
  }

  return (
    <section className="transit-notice-panel" aria-labelledby="transit-notice-title">
      <div className="section-heading">
        <h2 id="transit-notice-title">{t('transitServiceNotice.title')}</h2>
        <span className="muted">
          {t('transitServiceNotice.activeCount', { count: activeNotices.length })}
        </span>
      </div>
      {activeNotices.length > 0 ? <NoticeList notices={activeNotices} locale={locale} /> : null}
      {expiredNotices.length > 0 ? (
        <details className="expired-transit-notice-group">
          <summary>
            <span>{t('transitServiceNotice.history')}</span>
            <span className="muted">
              {t('transitServiceNotice.itemCount', { count: expiredNotices.length })}
            </span>
          </summary>
          <NoticeList notices={expiredNotices} locale={locale} />
        </details>
      ) : null}
    </section>
  );
}

function NoticeList({
  notices,
  locale,
}: Readonly<{ notices: TransitServiceNotice[]; locale: string }>) {
  const { t } = useI18n();
  return (
    <div className="transit-notice-list">
      {notices.map((notice) => (
        <article className="transit-notice-item" key={notice.id}>
          <span className="material-symbols-outlined" aria-hidden="true">
            campaign
          </span>
          <div>
            <h3>{notice.title}</h3>
            <p>{notice.reason}</p>
            <span className="muted">{formatNoticePeriod(notice, locale, t)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function isExpiredNotice(notice: TransitServiceNotice, now: number): boolean {
  return notice.endsAt ? new Date(notice.endsAt).getTime() < now : false;
}

function formatNoticePeriod(
  notice: TransitServiceNotice,
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (notice.startsAt && notice.endsAt) {
    return t('transitServiceNotice.periodRange', {
      start: formatDateTime(notice.startsAt, locale),
      end: formatDateTime(notice.endsAt, locale),
    });
  }

  return notice.periodText;
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}
