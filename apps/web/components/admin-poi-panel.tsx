'use client';

import type {
  MapGeometry,
  PoiCategory,
  PoiSubmission,
  PoiSubmissionStatus,
} from '@yct/contracts';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

type StatusFilter = PoiSubmissionStatus | 'all' | 'todo';

const defaultMarkerIconBaseUrl = 'https://map.shangxiaoguan.top/';

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'todo', label: '待处理' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
  { value: 'draft', label: '草稿' },
];

export function AdminPoiPanel() {
  const [submissions, setSubmissions] = useState<PoiSubmission[]>([]);
  const [categories, setCategories] = useState<PoiCategory[]>([]);
  const [categoryIconBaseUrl, setCategoryIconBaseUrl] = useState(defaultMarkerIconBaseUrl);
  const [statusText, setStatusText] = useState('正在读取 POI 投稿');
  const [categoryStatusText, setCategoryStatusText] = useState('正在读取 POI 分类');
  const [isBusy, setIsBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [rejectTarget, setRejectTarget] = useState<PoiSubmission | null>(null);

  const categoryById = useMemo(() => {
    const entries = categories.map((category) => [category.id, category] as const);
    return new Map(entries);
  }, [categories]);

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

  const categoryOptions = useMemo(() => {
    const usedCategoryIds = new Set(submissions.map((submission) => submission.categoryId));
    const knownOptions = categories
      .filter((category) => usedCategoryIds.has(category.id))
      .map((category) => ({
        id: category.id,
        label: category.name || category.id,
        sortOrder: category.sortOrder,
      }));
    const knownIds = new Set(knownOptions.map((option) => option.id));
    const unknownOptions = Array.from(usedCategoryIds)
      .filter((categoryId) => !knownIds.has(categoryId))
      .map((categoryId) => ({ id: categoryId, label: categoryId, sortOrder: 100_000 }));

    return [...knownOptions, ...unknownOptions].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'),
    );
  }, [categories, submissions]);

  const statusCounts = useMemo(() => {
    const counts = new Map<PoiSubmissionStatus, number>();
    for (const submission of submissions) {
      counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
    }
    return counts;
  }, [submissions]);

  const filteredSubmissions = useMemo(
    () =>
      sortedSubmissions.filter((submission) => {
        if (!matchesStatusFilter(submission.status, statusFilter)) {
          return false;
        }

        if (categoryFilter !== 'all' && submission.categoryId !== categoryFilter) {
          return false;
        }

        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery) {
          return true;
        }

        const category = categoryById.get(submission.categoryId);
        const haystack = normalizeSearchText(
          [
            submission.title,
            submission.categoryId,
            category?.name,
            statusLabel(submission.status),
            geometryLabel(submission.geometry),
            submission.description,
            submission.href,
            submission.submittedBy,
            submission.reviewReason,
          ]
            .filter(Boolean)
            .join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [categoryById, categoryFilter, query, sortedSubmissions, statusFilter],
  );

  const loadSubmissions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-submissions'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: PoiSubmission[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 后台暂不可用');
      return;
    }

    const items = data.items ?? [];
    setSubmissions(items);
    setStatusText(items.length ? `已读取 ${items.length} 条 POI 投稿` : '暂无 POI 投稿');
  };

  const loadCategories = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-categories'), { cache: 'no-store' });
    const data = (await response.json()) as {
      items?: PoiCategory[];
      iconBaseUrl?: string;
      meta?: { message?: string };
      message?: string;
    };

    if (!response.ok) {
      setCategoryStatusText(data.meta?.message ?? data.message ?? 'POI 分类暂不可用');
      return;
    }

    const items = data.items ?? [];
    setCategories(items);
    setCategoryIconBaseUrl(data.iconBaseUrl ?? defaultMarkerIconBaseUrl);
    setCategoryStatusText(items.length ? `已读取 ${items.length} 个分类` : '暂无可用 POI 分类');
  };

  useEffect(() => {
    void loadSubmissions();
    void loadCategories();
  }, []);

  const runAction = async (
    poiId: string,
    action: 'approve' | 'reject' | 'publish',
    reason?: string,
  ) => {
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
            ? { decision: 'rejected', reason: reason?.trim() }
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

  const resetFilters = () => {
    setStatusFilter('todo');
    setCategoryFilter('all');
    setQuery('');
  };

  const toggleExpanded = (poiId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(poiId)) {
        next.delete(poiId);
      } else {
        next.add(poiId);
      }
      return next;
    });
  };

  const pendingCount = statusCounts.get('pending_review') ?? 0;
  const approvedCount = statusCounts.get('approved') ?? 0;
  const publishedCount = statusCounts.get('published') ?? 0;

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-poi-title">
      <div className="section-heading">
        <h1 id="admin-poi-title">POI 投稿审核</h1>
        <span className="muted">
          {statusText}
          {categoryStatusText ? ` · ${categoryStatusText}` : ''}
        </span>
      </div>

      <div className="admin-report-summary admin-poi-summary" aria-label="POI 投稿摘要">
        <AdminPoiMetric label="待审核" value={pendingCount} tone={pendingCount > 0 ? 'warning' : undefined} />
        <AdminPoiMetric label="待发布" value={approvedCount} tone={approvedCount > 0 ? 'accent' : undefined} />
        <AdminPoiMetric label="已发布" value={publishedCount} />
        <AdminPoiMetric label="当前结果" value={filteredSubmissions.length} />
      </div>

      <div className="admin-toolbar admin-poi-toolbar" aria-label="POI 投稿筛选">
        <label>
          <span>状态</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
          >
            {statusFilterOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>分类</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.currentTarget.value)}
          >
            <option value="all">全部分类</option>
            {categoryOptions.map((option) => (
              <option value={option.id} key={option.id}>
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
            placeholder="标题、分类、投稿人、链接"
          />
        </label>
        <button type="button" onClick={resetFilters}>
          重置筛选
        </button>
      </div>

      <PoiCategoryProfileEditor
        categories={categories}
        iconBaseUrl={categoryIconBaseUrl}
        onSaved={(message) => {
          setStatusText(message);
          void loadCategories();
        }}
      />

      <div className="admin-content-list" aria-label="POI 投稿记录">
        {filteredSubmissions.map((submission) => (
          <PoiSubmissionReviewItem
            category={categoryById.get(submission.categoryId)}
            iconBaseUrl={categoryIconBaseUrl}
            isBusy={isBusy}
            isExpanded={expandedIds.has(submission.id)}
            key={submission.id}
            onCopy={(message) => setStatusText(message)}
            onReject={() => setRejectTarget(submission)}
            onRunAction={runAction}
            onToggleExpanded={() => toggleExpanded(submission.id)}
            submission={submission}
          />
        ))}
        {filteredSubmissions.length === 0 ? (
          <p className="muted admin-poi-empty">当前筛选条件下没有 POI 投稿。</p>
        ) : null}
      </div>

      {rejectTarget ? (
        <RejectPoiDialog
          isBusy={isBusy}
          submission={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (reason) => {
            await runAction(rejectTarget.id, 'reject', reason);
            setRejectTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

function AdminPoiMetric({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone?: 'accent' | 'warning'; value: number }>) {
  return (
    <div className={['admin-report-metric', tone ? `is-${tone}` : ''].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PoiSubmissionReviewItem({
  category,
  iconBaseUrl,
  isBusy,
  isExpanded,
  onCopy,
  onReject,
  onRunAction,
  onToggleExpanded,
  submission,
}: Readonly<{
  category?: PoiCategory;
  iconBaseUrl: string;
  isBusy: boolean;
  isExpanded: boolean;
  onCopy: (message: string) => void;
  onReject: () => void;
  onRunAction: (poiId: string, action: 'approve' | 'reject' | 'publish', reason?: string) => void;
  onToggleExpanded: () => void;
  submission: PoiSubmission;
}>) {
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const mapHref = representativeCoordinate
    ? buildSubmissionMapHref(submission, representativeCoordinate)
    : appPath('/map');

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy(successMessage);
    } catch {
      onCopy('浏览器未允许写入剪贴板，可手动复制页面中的坐标或几何信息。');
    }
  };

  return (
    <article className={['admin-content-item', 'admin-poi-item', isExpanded ? 'is-expanded' : ''].join(' ')}>
      <div className="admin-poi-main">
        <div className="admin-poi-title-row">
          <PoiCategoryIcon category={category} iconBaseUrl={iconBaseUrl} />
          <div>
            <strong>{submission.title}</strong>
            <p className="muted">
              {formatCategoryName(submission.categoryId, category)} · {statusLabel(submission.status)} ·{' '}
              {geometryLabel(submission.geometry)}
            </p>
          </div>
          <span className={`admin-poi-status-chip is-${submission.status}`}>
            {statusLabel(submission.status)}
          </span>
        </div>
        {representativeCoordinate ? (
          <p className="muted">代表坐标：{formatCoordinatePair(representativeCoordinate)}</p>
        ) : null}
        <p className="muted">
          投稿人：{submission.submittedBy}
          {submission.submittedAt ? ` · ${formatDate(submission.submittedAt)}` : ''}
          {submission.reviewReason ? ` · ${submission.reviewReason}` : ''}
        </p>
        {submission.description ? <p>{submission.description}</p> : null}
        {isExpanded ? (
          <PoiSubmissionDetail
            category={category}
            representativeCoordinate={representativeCoordinate}
            submission={submission}
          />
        ) : null}
        {submission.imageUrl ? <PoiSubmissionImagePreview submission={submission} /> : null}
      </div>
      <div className="admin-content-actions">
        <button type="button" onClick={onToggleExpanded}>
          {isExpanded ? '收起详情' : '展开详情'}
        </button>
        <a className="admin-action-link" href={mapHref} target="_blank" rel="noreferrer">
          地图查看
        </a>
        <button
          type="button"
          disabled={!representativeCoordinate}
          onClick={() =>
            representativeCoordinate
              ? void copyText(
                  formatCoordinatePair(representativeCoordinate),
                  `已复制 ${submission.title} 的代表坐标。`,
                )
              : undefined
          }
        >
          复制坐标
        </button>
        <button
          type="button"
          onClick={() =>
            void copyText(
              JSON.stringify(submission.geometry, null, 2),
              `已复制 ${submission.title} 的几何 JSON。`,
            )
          }
        >
          复制几何
        </button>
        <button
          type="button"
          disabled={isBusy || submission.status !== 'pending_review'}
          onClick={() => onRunAction(submission.id, 'approve')}
        >
          通过
        </button>
        <button
          type="button"
          disabled={isBusy || submission.status !== 'pending_review'}
          onClick={onReject}
        >
          驳回
        </button>
        <button
          type="button"
          disabled={isBusy || submission.status !== 'approved'}
          onClick={() => onRunAction(submission.id, 'publish')}
        >
          发布
        </button>
      </div>
    </article>
  );
}

function PoiSubmissionDetail({
  category,
  representativeCoordinate,
  submission,
}: Readonly<{
  category?: PoiCategory;
  representativeCoordinate: [number, number] | null;
  submission: PoiSubmission;
}>) {
  return (
    <div className="admin-poi-detail">
      <dl>
        <div>
          <dt>投稿 ID</dt>
          <dd>{submission.id}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>
            {formatCategoryName(submission.categoryId, category)}
            {category ? ` · ${category.acceptsPublicSubmissions ? '允许公开投稿' : '不允许公开投稿'}` : ''}
          </dd>
        </div>
        <div>
          <dt>几何</dt>
          <dd>{geometryLabel(submission.geometry)}</dd>
        </div>
        <div>
          <dt>代表坐标</dt>
          <dd>{representativeCoordinate ? formatCoordinatePair(representativeCoordinate) : '暂无'}</dd>
        </div>
        <div>
          <dt>链接</dt>
          <dd>{submission.href ? <a href={submission.href}>{submission.href}</a> : '未填写'}</dd>
        </div>
        <div>
          <dt>审核</dt>
          <dd>
            {submission.reviewedBy ? `${submission.reviewedBy} · ${submission.reviewedAt ? formatDate(submission.reviewedAt) : '已审核'}` : '尚未审核'}
          </dd>
        </div>
      </dl>
      <details>
        <summary>几何 JSON</summary>
        <pre>{JSON.stringify(submission.geometry, null, 2)}</pre>
      </details>
    </div>
  );
}

function RejectPoiDialog({
  isBusy,
  onClose,
  onSubmit,
  submission,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  submission: PoiSubmission;
}>) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError('请填写驳回理由，方便投稿者修正。');
      return;
    }
    await onSubmit(normalizedReason);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-poi-reject-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-poi-reject-title">驳回 POI 投稿</h2>
          <span className="muted">{submission.title}</span>
        </div>
        <label>
          <span>驳回理由</span>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setError('');
            }}
            placeholder="例如：坐标偏离实际地点、分类不正确、图片无法确认来源……"
            maxLength={500}
          />
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            确认驳回
          </button>
        </div>
      </form>
    </div>
  );
}

interface PoiCategoryDraft {
  id: string;
  name: string;
  acceptsPublicSubmissions: boolean;
  sortOrder: number;
  defaultIconFileName: string;
  iconFileNamesText: string;
}

function PoiCategoryProfileEditor({
  categories,
  iconBaseUrl,
  onSaved,
}: Readonly<{
  categories: PoiCategory[];
  iconBaseUrl: string;
  onSaved: (message: string) => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<PoiCategoryDraft[]>(() => createCategoryDrafts(categories));
  const [localStatus, setLocalStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingCategoryId, setUploadingCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(createCategoryDrafts(categories));
  }, [categories]);

  const updateDraft = (categoryId: string, patch: Partial<PoiCategoryDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === categoryId ? { ...draft, ...patch } : draft)),
    );
  };

  const saveCategories = async () => {
    setIsSaving(true);
    setLocalStatus('');
    try {
      const payload = {
        categories: drafts.map(categoryDraftToInput),
      };
      const response = await fetch(appPath('/api/admin/map/poi-categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string; issues?: unknown[] };
      if (!response.ok) {
        setLocalStatus(data.message ?? '分类配置保存失败');
        return;
      }

      onSaved('POI 分类配置已保存');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadCategoryIcon = async (categoryId: string, file: File | undefined) => {
    if (!file) {
      return;
    }

    setUploadingCategoryId(categoryId);
    setLocalStatus('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(appPath('/api/admin/map/poi-category-icons/upload'), {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as { iconUrl?: string; message?: string };
      if (!response.ok || !data.iconUrl) {
        setLocalStatus(data.message ?? '图标上传失败');
        return;
      }

      const iconUrl = data.iconUrl;
      setDrafts((current) =>
        current.map((draft) => {
          if (draft.id !== categoryId) {
            return draft;
          }

          const icons = splitIconFileNames(draft.iconFileNamesText);
          const nextIcons = Array.from(new Set([...icons, iconUrl]));
          return {
            ...draft,
            defaultIconFileName: draft.defaultIconFileName.trim() || iconUrl,
            iconFileNamesText: nextIcons.join('\n'),
          };
        }),
      );
      setLocalStatus(`已上传图标：${iconUrl}`);
    } finally {
      setUploadingCategoryId(null);
    }
  };

  return (
    <section className="admin-poi-category-config" aria-labelledby="admin-poi-category-title">
      <div className="admin-poi-category-config-header">
        <div>
          <h2 id="admin-poi-category-title">分类与图标配置</h2>
          <p className="muted">
            管理分类名称、默认图标、图标文件列表、排序和是否开放公开投稿。
          </p>
        </div>
        <button type="button" onClick={() => setIsOpen((value) => !value)}>
          {isOpen ? '收起配置' : '展开配置'}
        </button>
      </div>
      {isOpen ? (
        <>
          <div className="admin-poi-category-grid">
            {drafts.map((draft) => (
              <article className="admin-poi-category-row" key={draft.id}>
                <PoiCategoryIcon
                  category={categoryDraftToInput(draft)}
                  iconBaseUrl={iconBaseUrl}
                />
                <label>
                  <span>分类 ID</span>
                  <input value={draft.id} disabled />
                </label>
                <label>
                  <span>名称</span>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft(draft.id, { name: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>排序</span>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    value={draft.sortOrder}
                    onChange={(event) =>
                      updateDraft(draft.id, { sortOrder: Number(event.currentTarget.value) })
                    }
                  />
                </label>
                <label>
                  <span>默认图标</span>
                  <input
                    value={draft.defaultIconFileName}
                    onChange={(event) =>
                      updateDraft(draft.id, { defaultIconFileName: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="admin-poi-category-icons">
                  <span>图标文件列表</span>
                  <textarea
                    value={draft.iconFileNamesText}
                    onChange={(event) =>
                      updateDraft(draft.id, { iconFileNamesText: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="admin-poi-category-upload">
                  <span>上传图标</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                    disabled={uploadingCategoryId === draft.id}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      void uploadCategoryIcon(draft.id, file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="checkbox-row admin-poi-category-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.acceptsPublicSubmissions}
                    onChange={(event) =>
                      updateDraft(draft.id, {
                        acceptsPublicSubmissions: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>允许公开投稿</span>
                </label>
              </article>
            ))}
          </div>
          <div className="admin-content-actions">
            <button type="button" onClick={() => setDrafts(createCategoryDrafts(categories))}>
              重置当前配置
            </button>
            <button type="button" disabled={isSaving || drafts.length === 0} onClick={saveCategories}>
              保存分类配置
            </button>
          </div>
          {localStatus ? <p className="muted">{localStatus}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function PoiCategoryIcon({
  category,
  iconBaseUrl,
}: Readonly<{ category?: PoiCategory; iconBaseUrl: string }>) {
  const iconFileName = category?.iconMapping.defaultIconFileName;
  if (iconFileName) {
    return (
      <img
        className="admin-poi-category-icon"
        src={toMarkerIconUrl(iconFileName, iconBaseUrl)}
        alt=""
        draggable={false}
      />
    );
  }

  return (
    <span className="material-symbols-outlined admin-poi-category-symbol" aria-hidden="true">
      location_on
    </span>
  );
}

function PoiSubmissionImagePreview({
  submission,
}: Readonly<{ submission: PoiSubmission }>) {
  if (!submission.imageUrl) {
    return null;
  }

  const imageUrl = resolvePoiSubmissionImageUrl(submission.imageUrl);

  return (
    <a
      className="admin-poi-image-preview"
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
    >
      <img
        src={imageUrl}
        alt={`${submission.title} 投稿图片`}
        loading="lazy"
        decoding="async"
      />
      <span className="admin-poi-image-preview-copy">
        <span className="admin-poi-image-preview-title">投稿图片</span>
        <small>{submission.imageUrl}</small>
      </span>
    </a>
  );
}

function resolvePoiSubmissionImageUrl(value: string): string {
  return value.startsWith('/') ? appPath(value) : value;
}

function buildSubmissionMapHref(
  submission: PoiSubmission,
  coordinate: [number, number],
): string {
  const params = new URLSearchParams({
    label: submission.title,
    x: roundCoordinateForQuery(coordinate[0]),
    z: roundCoordinateForQuery(coordinate[1]),
  });
  return `${appPath('/map')}?${params.toString()}`;
}

function getGeometryRepresentativeCoordinate(geometry: MapGeometry): [number, number] | null {
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }

  if (geometry.type === 'Rectangle') {
    return getBoundsCenter([geometry.bounds]);
  }

  if (geometry.type === 'MultiRectangle') {
    return getBoundsCenter(geometry.rectangles);
  }

  const coordinates = flattenGeometryCoordinates(geometry);
  if (coordinates.length === 0) {
    return null;
  }

  return getCoordinateBoundsCenter(coordinates);
}

function flattenGeometryCoordinates(geometry: MapGeometry): Array<[number, number]> {
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    return geometry.coordinates;
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2);
  }

  return [];
}

function getBoundsCenter(bounds: Array<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>): [number, number] | null {
  if (bounds.length === 0) {
    return null;
  }

  const points = bounds.flatMap((item) => [
    [item.minX, item.minZ] as [number, number],
    [item.maxX, item.maxZ] as [number, number],
  ]);
  return getCoordinateBoundsCenter(points);
}

function getCoordinateBoundsCenter(coordinates: Array<[number, number]>): [number, number] {
  const bounds = coordinates.reduce(
    (current, [x, z]) => ({
      maxX: Math.max(current.maxX, x),
      maxZ: Math.max(current.maxZ, z),
      minX: Math.min(current.minX, x),
      minZ: Math.min(current.minZ, z),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
    },
  );

  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

function formatCoordinatePair([x, z]: [number, number]): string {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

function roundCoordinateForQuery(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function statusLabel(status: PoiSubmissionStatus): string {
  const labels: Record<PoiSubmissionStatus, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '待发布',
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

  if (geometry.type === 'Rectangle') {
    return '矩形区域';
  }

  if (geometry.type === 'MultiRectangle') {
    return `矩形组 ${geometry.rectangles.length} 个`;
  }

  if (geometry.type === 'Polygon') {
    return `多边形 ${geometry.coordinates[0]?.length ?? 0} 点`;
  }

  if (geometry.type === 'MultiPolygon') {
    return `多重多边形 ${geometry.coordinates.length} 个`;
  }

  return '未知几何';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCategoryName(categoryId: string, category?: PoiCategory): string {
  return category?.name && category.name !== categoryId ? `${category.name} (${categoryId})` : categoryId;
}

function createCategoryDrafts(categories: PoiCategory[]): PoiCategoryDraft[] {
  return [...categories]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'))
    .map((category) => ({
      id: category.id,
      name: category.name,
      acceptsPublicSubmissions: category.acceptsPublicSubmissions,
      sortOrder: category.sortOrder,
      defaultIconFileName: category.iconMapping.defaultIconFileName,
      iconFileNamesText: category.iconMapping.iconFileNames.join('\n'),
    }));
}

function categoryDraftToInput(draft: PoiCategoryDraft): PoiCategory {
  const iconFileNames = splitIconFileNames(draft.iconFileNamesText);
  const defaultIconFileName =
    draft.defaultIconFileName.trim() || iconFileNames[0] || `${draft.id}.png`;
  const normalizedIconFileNames = Array.from(new Set([defaultIconFileName, ...iconFileNames]));

  return {
    id: draft.id,
    name: draft.name.trim() || draft.id,
    acceptsPublicSubmissions: draft.acceptsPublicSubmissions,
    sortOrder: Number.isFinite(draft.sortOrder) ? Math.max(0, Math.floor(draft.sortOrder)) : 0,
    iconMapping: {
      categoryId: draft.id,
      defaultIconFileName,
      iconFileNames: normalizedIconFileNames,
    },
  };
}

function splitIconFileNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function matchesStatusFilter(status: PoiSubmissionStatus, filter: StatusFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return status === 'pending_review' || status === 'approved';
  }

  return status === filter;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s　|]+/g, '');
}

function toMarkerIconUrl(fileName: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(fileName)) {
    return fileName;
  }

  if (fileName.startsWith('/')) {
    return appPath(fileName);
  }

  if (!baseUrl) {
    return fileName;
  }

  return new URL(fileName.replace(/^\/+/, ''), baseUrl).toString();
}
