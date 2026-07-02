'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface AdminContentRecord {
  contentId: string;
  revision: {
    id: string;
    title: string;
    categoryId: string;
    markdown: string;
    status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';
    publishedAt?: string;
    reviewReason?: string;
  };
  metadata: {
    excerpt?: string;
    showInBanner: boolean;
    coverColor?: string;
    coverImageUrl?: string;
    expiresAt?: string;
  };
  updatedAt: string;
}

const categories = ['通知公告', '运营信息', '地铁运营', '公交运营', '有轨运营', '网站公告'];

export function AdminOperationsPanel() {
  const [records, setRecords] = useState<AdminContentRecord[]>([]);
  const [statusText, setStatusText] = useState('正在读取内容记录');
  const [isBusy, setIsBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0] ?? '运营信息');
  const [excerpt, setExcerpt] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [showInBanner, setShowInBanner] = useState(false);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [records],
  );

  const loadRecords = async () => {
    const response = await fetch(appPath('/api/admin/operations/contents'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: AdminContentRecord[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '内容后台暂不可用');
      return;
    }

    setRecords(data.items ?? []);
    setStatusText(
      data.items?.length ? `已读取 ${data.items.length} 条内容记录` : '暂无后台内容记录',
    );
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const createDraft = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/operations/contents'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          categoryId,
          excerpt: excerpt || undefined,
          markdown,
          showInBanner,
          assetIds: [],
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '创建草稿失败');
        return;
      }

      setTitle('');
      setExcerpt('');
      setMarkdown('');
      setShowInBanner(false);
      setStatusText('草稿已创建');
      await loadRecords();
    } finally {
      setIsBusy(false);
    }
  };

  const runAction = async (
    contentId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish',
  ) => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/submit`)
          : action === 'publish'
            ? appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/publish`)
            : appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/review`);
      const body =
        action === 'approve'
          ? { decision: 'approved' }
          : action === 'reject'
            ? { decision: 'rejected', reason: '后台退回' }
            : action === 'publish'
              ? { mode: 'immediate' }
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
      await loadRecords();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      className="module-panel admin-operations-panel"
      aria-labelledby="admin-operations-title"
    >
      <div className="section-heading">
        <h1 id="admin-operations-title">内容管理</h1>
        <span className="muted">{statusText}</span>
      </div>

      <section className="admin-editor" aria-label="创建内容草稿">
        <label>
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <label>
          <span>分类</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)}>
            {categories.map((category) => (
              <option value={category} key={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>摘要</span>
          <input value={excerpt} onChange={(event) => setExcerpt(event.currentTarget.value)} />
        </label>
        <label className="admin-editor-markdown">
          <span>Markdown 正文</span>
          <textarea value={markdown} onChange={(event) => setMarkdown(event.currentTarget.value)} />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showInBanner}
            onChange={(event) => setShowInBanner(event.currentTarget.checked)}
          />
          <span>作为首页重点资讯候选</span>
        </label>
        <button
          className="secondary-action-button is-primary"
          type="button"
          disabled={isBusy}
          onClick={createDraft}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          <span>创建草稿</span>
        </button>
      </section>

      <div className="admin-content-list" aria-label="内容记录">
        {sortedRecords.map((record) => (
          <article className="admin-content-item" key={record.contentId}>
            <div>
              <strong>{record.revision.title}</strong>
              <p className="muted">
                {record.revision.categoryId} · {statusLabel(record.revision.status)}
                {record.revision.publishedAt
                  ? ` · ${record.revision.publishedAt.slice(0, 10)}`
                  : ''}
              </p>
            </div>
            <div className="admin-content-actions">
              <button
                type="button"
                disabled={isBusy || record.revision.status !== 'draft'}
                onClick={() => runAction(record.contentId, 'submit')}
              >
                提交
              </button>
              <button
                type="button"
                disabled={isBusy || record.revision.status !== 'pending_review'}
                onClick={() => runAction(record.contentId, 'approve')}
              >
                通过
              </button>
              <button
                type="button"
                disabled={isBusy || record.revision.status !== 'pending_review'}
                onClick={() => runAction(record.contentId, 'reject')}
              >
                驳回
              </button>
              <button
                type="button"
                disabled={isBusy || record.revision.status !== 'approved'}
                onClick={() => runAction(record.contentId, 'publish')}
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

function statusLabel(status: AdminContentRecord['revision']['status']): string {
  const labels: Record<AdminContentRecord['revision']['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };

  return labels[status];
}
