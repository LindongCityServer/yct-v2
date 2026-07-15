'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

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

type ServiceStatusFilter = AdminServiceEntry['status'] | 'all';
type ServiceCategoryFilter = AdminServiceEntry['categoryId'] | 'all';

interface ServiceEntryEditorState {
  title: string;
  description: string;
  categoryId: AdminServiceEntry['categoryId'];
  icon: string;
  href: string;
  openMode: AdminServiceEntry['openMode'];
  sortOrderValue: string;
}

const categoryOptions: Array<{ value: AdminServiceEntry['categoryId']; label: string }> = [
  { value: 'operations', label: '运营及周边' },
  { value: 'server_sites', label: '服务器网站' },
  { value: 'toolbox', label: '工具箱' },
  { value: 'other', label: '其他服务' },
];

const statusFilterOptions: Array<{ value: ServiceStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已移除' },
];

const emptyEditorState: ServiceEntryEditorState = {
  title: '',
  description: '',
  categoryId: 'toolbox',
  icon: 'apps',
  href: '',
  openMode: 'new_tab',
  sortOrderValue: '500',
};

export function AdminServicesPanel() {
  const [entries, setEntries] = useState<AdminServiceEntry[]>([]);
  const [statusText, setStatusText] = useState('正在读取服务入口');
  const [isBusy, setIsBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('all');
  const [query, setQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AdminServiceEntry | null>(null);
  const [editorState, setEditorState] = useState<ServiceEntryEditorState>(emptyEditorState);
  const [editorError, setEditorError] = useState('');

  const loadEntries = async () => {
    const response = await fetch(appPath('/api/admin/services/entries'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: AdminServiceEntry[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '服务入口后台暂不可用');
      return;
    }

    const items = data.items ?? [];
    setEntries(items);
    setStatusText(items.length ? `已读取 ${items.length} 个服务入口` : '暂无服务入口');
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const metrics = useMemo(
    () => [
      { label: '入口总数', value: entries.length },
      { label: '自定义入口', value: entries.filter((entry) => !isDefaultEntry(entry)).length },
      {
        label: '待审核',
        value: entries.filter((entry) => entry.status === 'pending_review').length,
        tone: entries.some((entry) => entry.status === 'pending_review')
          ? ('warning' as const)
          : undefined,
      },
      {
        label: '已发布',
        value: entries.filter((entry) => entry.status === 'published').length,
        tone: entries.some((entry) => entry.status === 'published')
          ? ('accent' as const)
          : undefined,
      },
    ],
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...entries]
      .filter((entry) => categoryFilter === 'all' || entry.categoryId === categoryFilter)
      .filter((entry) => statusFilter === 'all' || entry.status === statusFilter)
      .filter((entry) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          entry.id,
          entry.title,
          entry.description,
          entry.categoryId,
          categoryLabel(entry.categoryId),
          entry.icon,
          entry.href,
          openModeLabel(entry.openMode),
          statusLabel(entry.status),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          categorySortOrder(left.categoryId) - categorySortOrder(right.categoryId) ||
          left.sortOrder - right.sortOrder ||
          left.title.localeCompare(right.title, 'zh-CN'),
      );
  }, [categoryFilter, entries, query, statusFilter]);

  const openCreateDialog = () => {
    setIsEditorOpen(true);
    setEditingEntry(null);
    setEditorState(emptyEditorState);
    setEditorError('');
  };

  const openEditDialog = (entry: AdminServiceEntry) => {
    setIsEditorOpen(true);
    setEditingEntry(entry);
    setEditorState({
      title: entry.title,
      description: entry.description ?? '',
      categoryId: entry.categoryId,
      icon: entry.icon,
      href: entry.href,
      openMode: entry.openMode,
      sortOrderValue: String(entry.sortOrder),
    });
    setEditorError('');
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingEntry(null);
    setEditorState(emptyEditorState);
    setEditorError('');
  };

  const saveEntry = async () => {
    const title = editorState.title.trim();
    const href = editorState.href.trim();
    const icon = editorState.icon.trim();
    const sortOrder = Number(editorState.sortOrderValue.trim());

    if (!title) {
      setEditorError('请先填写入口名称。');
      return;
    }
    if (!href) {
      setEditorError('请先填写跳转链接。');
      return;
    }
    if (!icon) {
      setEditorError('请先填写 Material Symbols 图标名。');
      return;
    }
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
      setEditorError('排序必须是 0 到 10000 之间的整数。');
      return;
    }

    setIsBusy(true);
    try {
      const endpoint = editingEntry
        ? appPath(`/api/admin/services/entries/${encodeURIComponent(editingEntry.id)}`)
        : appPath('/api/admin/services/entries');
      const response = await fetch(endpoint, {
        method: editingEntry ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: editorState.description.trim() || undefined,
          categoryId: editorState.categoryId,
          icon,
          href,
          openMode: editorState.openMode,
          sortOrder,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setEditorError(data.message ?? (editingEntry ? '更新服务入口失败' : '创建服务入口失败'));
        return;
      }

      setStatusText(editingEntry ? '服务入口已更新。' : '服务入口草稿已创建。');
      closeEditor();
      await loadEntries();
    } finally {
      setIsBusy(false);
    }
  };

  const runAction = async (
    entryId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
  ) => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? appPath(`/api/admin/services/entries/${encodeURIComponent(entryId)}/submit`)
          : action === 'publish'
            ? appPath(`/api/admin/services/entries/${encodeURIComponent(entryId)}/publish`)
            : action === 'archive'
              ? appPath(`/api/admin/services/entries/${encodeURIComponent(entryId)}/archive`)
              : appPath(`/api/admin/services/entries/${encodeURIComponent(entryId)}/review`);
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

      setStatusText(action === 'archive' ? '服务入口已移除出公开列表。' : '服务入口状态已更新。');
      await loadEntries();
    } finally {
      setIsBusy(false);
    }
  };

  const deleteEntry = async (entry: AdminServiceEntry) => {
    setIsBusy(true);
    try {
      const deleteDirectly = isDefaultEntry(entry) || entry.status !== 'published';
      const response = !deleteDirectly
        ? await fetch(
            appPath(`/api/admin/services/entries/${encodeURIComponent(entry.id)}/archive`),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
          )
        : await fetch(appPath(`/api/admin/services/entries/${encodeURIComponent(entry.id)}`), {
            method: 'DELETE',
          });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '移除服务入口失败');
        return;
      }

      setStatusText(
        isDefaultEntry(entry)
          ? '系统默认入口已删除，并保留本地覆盖记录。'
          : entry.status === 'published'
            ? '服务入口已从公开列表移除。'
            : '服务入口已删除。',
      );
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

      <div className="admin-report-summary admin-poi-summary" aria-label="服务入口摘要">
        {metrics.map((metric) => (
          <div
            className={['admin-report-metric', metric.tone ? `is-${metric.tone}` : '']
              .filter(Boolean)
              .join(' ')}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="admin-services-board">
        <div
          className="admin-toolbar admin-poi-toolbar admin-services-toolbar"
          aria-label="服务入口筛选与操作"
        >
          <fieldset className="segmented-control admin-services-segment">
            <legend>入口系列</legend>
            <div>
              <button
                className={categoryFilter === 'all' ? 'is-active' : ''}
                type="button"
                aria-pressed={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
              >
                全部
              </button>
              {categoryOptions.map((category) => (
                <button
                  className={categoryFilter === category.value ? 'is-active' : ''}
                  type="button"
                  aria-pressed={categoryFilter === category.value}
                  key={category.value}
                  onClick={() => setCategoryFilter(category.value)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            <span>状态</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.currentTarget.value as ServiceStatusFilter)
              }
            >
              {statusFilterOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-poi-search">
            <span>搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="名称、图标、链接、分类"
            />
          </label>
          <button
            className="secondary-action-button is-primary"
            type="button"
            onClick={openCreateDialog}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            <span>新建入口</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setStatusFilter('all');
              setQuery('');
            }}
          >
            重置筛选
          </button>
        </div>

        <div className="admin-content-list" aria-label="服务入口记录">
          {filteredEntries.map((entry) => (
            <article className="admin-content-item admin-service-item" key={entry.id}>
              <div>
                <div className="admin-service-title-row">
                  <strong>{entry.title}</strong>
                  <span className={`admin-poi-status-chip is-${entry.status}`}>
                    {statusLabel(entry.status)}
                  </span>
                </div>
                <p className="muted">
                  {categoryLabel(entry.categoryId)} · {openModeLabel(entry.openMode)} · 图标{' '}
                  {entry.icon}
                  {entry.publishedAt ? ` · 发布于 ${entry.publishedAt.slice(0, 10)}` : ''}
                </p>
                <p className="muted">{entry.href}</p>
                {entry.description ? <p>{entry.description}</p> : null}
                {isDefaultEntry(entry) ? <span className="operation-tag">系统默认入口</span> : null}
              </div>
              <div className="admin-content-actions">
                <button
                  type="button"
                  disabled={isBusy || entry.status === 'archived'}
                  onClick={() => openEditDialog(entry)}
                >
                  编辑
                </button>
                {!isDefaultEntry(entry) ? (
                  <>
                    <button
                      type="button"
                      disabled={isBusy || entry.status !== 'draft'}
                      onClick={() => void runAction(entry.id, 'submit')}
                    >
                      提交
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || entry.status !== 'pending_review'}
                      onClick={() => void runAction(entry.id, 'approve')}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || entry.status !== 'pending_review'}
                      onClick={() => void runAction(entry.id, 'reject')}
                    >
                      驳回
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || entry.status !== 'approved'}
                      onClick={() => void runAction(entry.id, 'publish')}
                    >
                      发布
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy || entry.status === 'archived'}
                  onClick={() => {
                    if (
                      !window.confirm(
                        isDefaultEntry(entry)
                          ? `确认删除系统默认入口“${entry.title}”？删除后会立即从公开服务列表下线。`
                          : entry.status === 'published'
                            ? `确认移除已发布服务入口“${entry.title}”？移除后会立即从公开服务列表下线，并保留后台记录。`
                            : `确认删除服务入口“${entry.title}”？`,
                      )
                    ) {
                      return;
                    }

                    void deleteEntry(entry);
                  }}
                >
                  {isDefaultEntry(entry)
                    ? '删除默认入口'
                    : entry.status === 'published'
                      ? '移除'
                      : '删除'}
                </button>
              </div>
            </article>
          ))}
          {filteredEntries.length === 0 ? (
            <div className="admin-content-empty">
              <p className="muted">当前筛选条件下没有服务入口。</p>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setStatusFilter('all');
                  setQuery('');
                }}
              >
                查看全部入口
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <form
            className="modal-panel admin-service-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-service-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveEntry();
            }}
          >
            <div className="section-heading">
              <h2 id="admin-service-editor-title">
                {editingEntry ? '编辑服务入口' : '新建服务入口'}
              </h2>
              <span className="muted">
                {editingEntry
                  ? editingEntry.status === 'published'
                    ? '当前入口已发布，保存后会直接更新公开服务列表。'
                    : editingEntry.status === 'rejected'
                      ? '驳回入口保存后会回到草稿。'
                      : '保存后保留当前审核状态。'
                  : '先创建草稿，再决定是否提交审核。'}
              </span>
            </div>
            <label>
              <span>名称</span>
              <input
                value={editorState.title}
                onChange={(event) => {
                  setEditorState((current) => ({ ...current, title: event.currentTarget.value }));
                  setEditorError('');
                }}
              />
            </label>
            <label>
              <span>分类</span>
              <select
                value={editorState.categoryId}
                onChange={(event) => {
                  setEditorState((current) => ({
                    ...current,
                    categoryId: event.currentTarget.value as AdminServiceEntry['categoryId'],
                  }));
                  setEditorError('');
                }}
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
              <input
                value={editorState.icon}
                onChange={(event) => {
                  setEditorState((current) => ({ ...current, icon: event.currentTarget.value }));
                  setEditorError('');
                }}
                placeholder="apps"
              />
            </label>
            <label>
              <span>排序</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={editorState.sortOrderValue}
                onChange={(event) => {
                  setEditorState((current) => ({
                    ...current,
                    sortOrderValue: event.currentTarget.value,
                  }));
                  setEditorError('');
                }}
              />
            </label>
            <label>
              <span>打开方式</span>
              <select
                value={editorState.openMode}
                onChange={(event) => {
                  setEditorState((current) => ({
                    ...current,
                    openMode: event.currentTarget.value as AdminServiceEntry['openMode'],
                  }));
                  setEditorError('');
                }}
              >
                <option value="new_tab">新标签页</option>
                <option value="same_tab">当前页</option>
              </select>
            </label>
            <label className="admin-editor-markdown">
              <span>链接</span>
              <input
                value={editorState.href}
                onChange={(event) => {
                  setEditorState((current) => ({ ...current, href: event.currentTarget.value }));
                  setEditorError('');
                }}
                placeholder="https://..."
              />
            </label>
            <label className="admin-editor-markdown">
              <span>说明</span>
              <textarea
                value={editorState.description}
                onChange={(event) => {
                  setEditorState((current) => ({
                    ...current,
                    description: event.currentTarget.value,
                  }));
                  setEditorError('');
                }}
              />
            </label>
            {editorError ? <p className="muted admin-poi-dialog-error">{editorError}</p> : null}
            <div className="admin-content-actions">
              <button type="button" onClick={closeEditor} disabled={isBusy}>
                取消
              </button>
              <button type="submit" disabled={isBusy}>
                {editingEntry ? '保存修改' : '创建草稿'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function isDefaultEntry(entry: AdminServiceEntry): boolean {
  return entry.id.startsWith('default-');
}

function categorySortOrder(categoryId: AdminServiceEntry['categoryId']): number {
  return categoryOptions.findIndex((category) => category.value === categoryId);
}

function categoryLabel(categoryId: AdminServiceEntry['categoryId']): string {
  return categoryOptions.find((category) => category.value === categoryId)?.label ?? '其他服务';
}

function openModeLabel(openMode: AdminServiceEntry['openMode']): string {
  return openMode === 'same_tab' ? '当前页打开' : '新标签页打开';
}

function statusLabel(status: AdminServiceEntry['status']): string {
  const labels: Record<AdminServiceEntry['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '待发布',
    rejected: '已驳回',
    published: '已发布',
    archived: '已移除',
  };

  return labels[status];
}
