'use client';

import { useEffect, useMemo, useState } from 'react';

interface AdminServiceEntry {
  id: string;
  title: string;
  description?: string;
  categoryId: 'operations' | 'server_sites' | 'toolbox' | 'other';
  icon: string;
  href: string;
  openMode: 'same_tab' | 'new_tab';
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';
  sortOrder: number;
  publishedAt?: string;
}

const categoryOptions: Array<{ value: AdminServiceEntry['categoryId']; label: string }> = [
  { value: 'operations', label: '运营及周边' },
  { value: 'server_sites', label: '服务器网站' },
  { value: 'toolbox', label: '工具箱' },
  { value: 'other', label: '其他服务' },
];

export function AdminServicesPanel() {
  const [entries, setEntries] = useState<AdminServiceEntry[]>([]);
  const [statusText, setStatusText] = useState('正在读取服务入口');
  const [isBusy, setIsBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<AdminServiceEntry['categoryId']>('toolbox');
  const [icon, setIcon] = useState('apps');
  const [href, setHref] = useState('');
  const [sortOrder, setSortOrder] = useState(500);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (left, right) =>
          left.categoryId.localeCompare(right.categoryId) ||
          left.sortOrder - right.sortOrder ||
          left.title.localeCompare(right.title, 'zh-CN'),
      ),
    [entries],
  );

  const loadEntries = async () => {
    const response = await fetch('/api/admin/services/entries', { cache: 'no-store' });
    const data = (await response.json()) as { items?: AdminServiceEntry[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '服务入口后台暂不可用');
      return;
    }

    setEntries(data.items ?? []);
    setStatusText(data.items?.length ? `已读取 ${data.items.length} 个服务入口` : '暂无服务入口');
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const createDraft = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/admin/services/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || undefined,
          categoryId,
          icon,
          href,
          openMode: 'new_tab',
          sortOrder,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '创建服务入口失败');
        return;
      }

      setTitle('');
      setDescription('');
      setIcon('apps');
      setHref('');
      setSortOrder(500);
      setStatusText('服务入口草稿已创建');
      await loadEntries();
    } finally {
      setIsBusy(false);
    }
  };

  const runAction = async (
    entryId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish',
  ) => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? `/api/admin/services/entries/${encodeURIComponent(entryId)}/submit`
          : action === 'publish'
            ? `/api/admin/services/entries/${encodeURIComponent(entryId)}/publish`
            : `/api/admin/services/entries/${encodeURIComponent(entryId)}/review`;
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
      await loadEntries();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-services-title">
      <div className="section-heading">
        <h1 id="admin-services-title">服务入口管理</h1>
        <span className="muted">{statusText}</span>
      </div>

      <section className="admin-editor" aria-label="创建服务入口">
        <label>
          <span>名称</span>
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <label>
          <span>分类</span>
          <select
            value={categoryId}
            onChange={(event) =>
              setCategoryId(event.currentTarget.value as AdminServiceEntry['categoryId'])
            }
          >
            {categoryOptions.map((category) => (
              <option value={category.value} key={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>图标</span>
          <input value={icon} onChange={(event) => setIcon(event.currentTarget.value)} />
        </label>
        <label>
          <span>排序</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.currentTarget.value))}
          />
        </label>
        <label className="admin-editor-markdown">
          <span>链接</span>
          <input value={href} onChange={(event) => setHref(event.currentTarget.value)} />
        </label>
        <label className="admin-editor-markdown">
          <span>说明</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
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
          <span>创建服务入口</span>
        </button>
      </section>

      <div className="admin-content-list" aria-label="服务入口记录">
        {sortedEntries.map((entry) => (
          <article className="admin-content-item" key={entry.id}>
            <div>
              <strong>{entry.title}</strong>
              <p className="muted">
                {categoryLabel(entry.categoryId)} · {statusLabel(entry.status)} · {entry.href}
              </p>
            </div>
            {entry.id.startsWith('default-') ? (
              <span className="muted">默认入口</span>
            ) : (
              <div className="admin-content-actions">
                <button
                  type="button"
                  disabled={isBusy || entry.status !== 'draft'}
                  onClick={() => runAction(entry.id, 'submit')}
                >
                  提交
                </button>
                <button
                  type="button"
                  disabled={isBusy || entry.status !== 'pending_review'}
                  onClick={() => runAction(entry.id, 'approve')}
                >
                  通过
                </button>
                <button
                  type="button"
                  disabled={isBusy || entry.status !== 'pending_review'}
                  onClick={() => runAction(entry.id, 'reject')}
                >
                  驳回
                </button>
                <button
                  type="button"
                  disabled={isBusy || entry.status !== 'approved'}
                  onClick={() => runAction(entry.id, 'publish')}
                >
                  发布
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function categoryLabel(categoryId: AdminServiceEntry['categoryId']): string {
  return categoryOptions.find((category) => category.value === categoryId)?.label ?? '其他服务';
}

function statusLabel(status: AdminServiceEntry['status']): string {
  const labels: Record<AdminServiceEntry['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };

  return labels[status];
}
