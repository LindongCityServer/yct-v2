'use client';

import type { MapGeometry, PoiSubmission, PoiSubmissionStatus } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

export function AdminPoiPanel() {
  const [submissions, setSubmissions] = useState<PoiSubmission[]>([]);
  const [statusText, setStatusText] = useState('正在读取 POI 投稿');
  const [isBusy, setIsBusy] = useState(false);

  const sortedSubmissions = useMemo(
    () =>
      [...submissions].sort(
        (left, right) =>
          (right.submittedAt ?? right.reviewedAt ?? right.publishedAt ?? '').localeCompare(
            left.submittedAt ?? left.reviewedAt ?? left.publishedAt ?? '',
          ) || left.title.localeCompare(right.title, 'zh-CN'),
      ),
    [submissions],
  );

  const loadSubmissions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-submissions'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: PoiSubmission[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 后台暂不可用');
      return;
    }

    setSubmissions(data.items ?? []);
    setStatusText(data.items?.length ? `已读取 ${data.items.length} 条 POI 投稿` : '暂无 POI 投稿');
  };

  useEffect(() => {
    void loadSubmissions();
  }, []);

  const runAction = async (poiId: string, action: 'approve' | 'reject' | 'publish') => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'publish'
          ? appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}/publish`)
          : appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}/review`);
      const body =
        action === 'approve'
          ? { decision: 'approved' }
          : action === 'reject'
            ? { decision: 'rejected', reason: '后台退回' }
            : {};
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '操作失败');
        return;
      }

      setStatusText('操作已完成');
      await loadSubmissions();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-poi-title">
      <div className="section-heading">
        <h1 id="admin-poi-title">POI 投稿审核</h1>
        <span className="muted">{statusText}</span>
      </div>

      <div className="admin-content-list" aria-label="POI 投稿记录">
        {sortedSubmissions.map((submission) => (
          <article className="admin-content-item" key={submission.id}>
            <div>
              <strong>{submission.title}</strong>
              <p className="muted">
                {submission.categoryId} · {statusLabel(submission.status)} ·{' '}
                {geometryLabel(submission.geometry)}
              </p>
              <p className="muted">
                投稿人：{submission.submittedBy}
                {submission.submittedAt ? ` · ${formatDate(submission.submittedAt)}` : ''}
                {submission.reviewReason ? ` · ${submission.reviewReason}` : ''}
              </p>
            </div>
            <div className="admin-content-actions">
              <button
                type="button"
                disabled={isBusy || submission.status !== 'pending_review'}
                onClick={() => runAction(submission.id, 'approve')}
              >
                通过
              </button>
              <button
                type="button"
                disabled={isBusy || submission.status !== 'pending_review'}
                onClick={() => runAction(submission.id, 'reject')}
              >
                驳回
              </button>
              <button
                type="button"
                disabled={isBusy || submission.status !== 'approved'}
                onClick={() => runAction(submission.id, 'publish')}
              >
                发布
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status: PoiSubmissionStatus): string {
  const labels: Record<PoiSubmissionStatus, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };

  return labels[status];
}

function geometryLabel(geometry: MapGeometry): string {
  if (geometry.type === 'Point') {
    return `点 ${Math.round(geometry.coordinates[0])}, ${Math.round(geometry.coordinates[1])}`;
  }

  if (geometry.type === 'MultiPoint') {
    return `点组 ${geometry.coordinates.length} 点`;
  }

  if (geometry.type === 'LineString') {
    return `线 ${geometry.coordinates.length} 点`;
  }

  if (geometry.type === 'MultiRectangle') {
    return `矩形组 ${geometry.rectangles.length} 个`;
  }

  return geometry.type;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
