import type { ApiListResponse, TransitServiceNotice } from '@yct/contracts';

export function TransitServiceNoticePanel({
  notices,
}: Readonly<{
  notices: ApiListResponse<TransitServiceNotice>;
}>) {
  const now = Date.now();
  const activeNotices = notices.items.filter((notice) => !isExpiredNotice(notice, now));
  const expiredNotices = notices.items.filter((notice) => isExpiredNotice(notice, now));

  if (activeNotices.length === 0 && expiredNotices.length === 0) {
    return null;
  }

  return (
    <section className="transit-notice-panel" aria-labelledby="transit-notice-title">
      <div className="section-heading">
        <h2 id="transit-notice-title">客运提醒</h2>
        <span className="muted">{activeNotices.length} 条当前提醒</span>
      </div>
      {activeNotices.length > 0 ? <NoticeList notices={activeNotices} /> : null}
      {expiredNotices.length > 0 ? (
        <details className="expired-transit-notice-group">
          <summary>
            <span>历史客运提醒</span>
            <span className="muted">{expiredNotices.length} 条</span>
          </summary>
          <NoticeList notices={expiredNotices} />
        </details>
      ) : null}
    </section>
  );
}

function NoticeList({ notices }: Readonly<{ notices: TransitServiceNotice[] }>) {
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
            <span className="muted">{formatNoticePeriod(notice)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function isExpiredNotice(notice: TransitServiceNotice, now: number): boolean {
  return notice.endsAt ? new Date(notice.endsAt).getTime() < now : false;
}

function formatNoticePeriod(notice: TransitServiceNotice): string {
  if (notice.startsAt && notice.endsAt) {
    return `${formatDateTime(notice.startsAt)} 至 ${formatDateTime(notice.endsAt)}`;
  }

  return notice.periodText;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}
