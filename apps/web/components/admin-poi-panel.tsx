'use client';

import type {
  MapGeometry,
  MapMarkerSnapshot,
  PoiCategory,
  PoiSubmission,
  PoiSubmissionStatus,
} from '@yct/contracts';
import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

type StatusFilter = PoiSubmissionStatus | 'all' | 'todo';
type MapMarker = MapMarkerSnapshot['markers'][number];

interface PoiSubmissionImageMetadata {
  fileName: string;
  publicPath: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
}

type AdminPoiSubmission = PoiSubmission & {
  imageMetadata?: PoiSubmissionImageMetadata;
};

interface PoiConflictHint {
  marker: MapMarker;
  reasons: string[];
  distanceBlocks: number | null;
}

type PoiConflictDecisionKind = 'ignored' | 'duplicate';
type PoiConflictDecisionInput = PoiConflictDecisionKind | 'unresolved';

interface PoiConflictDecision {
  id: string;
  submissionId: string;
  markerId: string;
  markerLabel?: string;
  submissionTitle?: string;
  decision: PoiConflictDecisionKind;
  decidedBy: string;
  decidedAt: string;
}

interface PoiAuditContextMarker {
  marker: MapMarker;
  coordinate: [number, number];
  distanceBlocks: number;
  relation: 'same-category' | 'road' | 'station' | 'nearby';
}

interface PoiSubmissionEditInput {
  title: string;
  categoryId: string;
  description: string;
  href: string;
  geometry?: Extract<MapGeometry, { type: 'Point' }>;
}

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

const poiRejectReasonPresets = [
  '坐标位置偏离实际地点，请重新选点后提交。',
  '地点分类不准确，请选择更合适的分类后提交。',
  '地点名称不符合当前地图命名规范，请调整后提交。',
  '简介或链接信息不足，无法确认地点用途或来源。',
  '投稿图片无法确认来源或与地点不匹配，请更换后提交。',
  '该地点疑似已存在，请确认后避免重复投稿。',
];

export function AdminPoiPanel() {
  const [submissions, setSubmissions] = useState<AdminPoiSubmission[]>([]);
  const [categories, setCategories] = useState<PoiCategory[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [conflictDecisions, setConflictDecisions] = useState<PoiConflictDecision[]>([]);
  const [categoryIconBaseUrl, setCategoryIconBaseUrl] = useState(defaultMarkerIconBaseUrl);
  const [statusText, setStatusText] = useState('正在读取 POI 投稿');
  const [categoryStatusText, setCategoryStatusText] = useState('正在读取 POI 分类');
  const [isBusy, setIsBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [rejectTarget, setRejectTarget] = useState<PoiSubmission | null>(null);
  const [publishTarget, setPublishTarget] = useState<PoiSubmission | null>(null);
  const [editTarget, setEditTarget] = useState<PoiSubmission | null>(null);

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

  const conflictHintsBySubmissionId = useMemo(() => {
    const entries = submissions.map(
      (submission) => [submission.id, buildPoiConflictHints(submission, mapMarkers)] as const,
    );
    return new Map(entries);
  }, [mapMarkers, submissions]);

  const conflictDecisionByKey = useMemo(() => {
    const entries = conflictDecisions.map(
      (decision) => [conflictDecisionKey(decision.submissionId, decision.markerId), decision] as const,
    );
    return new Map(entries);
  }, [conflictDecisions]);

  const auditContextMarkersBySubmissionId = useMemo(() => {
    const entries = submissions.map(
      (submission) => [submission.id, buildPoiAuditContextMarkers(submission, mapMarkers)] as const,
    );
    return new Map(entries);
  }, [mapMarkers, submissions]);

  const loadSubmissions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-submissions'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: AdminPoiSubmission[]; message?: string };
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

  const loadMapMarkers = async () => {
    const response = await fetch(appPath('/api/map/markers'), { cache: 'no-store' });
    const data = (await response.json()) as {
      snapshot?: MapMarkerSnapshot;
      message?: string;
      meta?: { message?: string };
    };
    if (!response.ok) {
      setStatusText(data.meta?.message ?? data.message ?? '地图标记快照暂不可用，无法生成重复提示。');
      return;
    }

    setMapMarkers(data.snapshot?.markers ?? []);
  };

  const loadConflictDecisions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-conflict-decisions'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: PoiConflictDecision[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 冲突提示决策暂不可用。');
      return;
    }

    setConflictDecisions(data.items ?? []);
  };

  useEffect(() => {
    void loadSubmissions();
    void loadCategories();
    void loadMapMarkers();
    void loadConflictDecisions();
  }, []);

  const runAction = async (
    poiId: string,
    action: 'approve' | 'reject' | 'publish',
    reason?: string,
  ): Promise<boolean> => {
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
        return false;
      }

      setStatusText('操作已完成');
      await loadSubmissions();
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const updateSubmission = async (
    poiId: string,
    input: PoiSubmissionEditInput,
  ): Promise<string | null> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      const data = (await response.json()) as PoiSubmission & { message?: string };
      if (!response.ok) {
        return data.message ?? 'POI 投稿修正失败';
      }

      setSubmissions((current) =>
        current.map((submission) => (submission.id === poiId ? data : submission)),
      );
      setStatusText(`已修正 ${data.title} 的投稿资料`);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const updateConflictDecision = async (
    submission: PoiSubmission,
    hint: PoiConflictHint,
    decision: PoiConflictDecisionInput,
  ) => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/map/poi-conflict-decisions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          markerId: hint.marker.id,
          markerLabel: hint.marker.label,
          submissionTitle: submission.title,
          decision,
        }),
      });
      const data = (await response.json()) as { items?: PoiConflictDecision[]; message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? 'POI 冲突提示决策保存失败。');
        return;
      }

      setConflictDecisions(data.items ?? []);
      setStatusText(decision === 'unresolved' ? '已重置冲突提示判断' : '已保存冲突提示判断');
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
            conflictDecisionByKey={conflictDecisionByKey}
            contextMarkers={auditContextMarkersBySubmissionId.get(submission.id) ?? []}
            iconBaseUrl={categoryIconBaseUrl}
            conflictHints={conflictHintsBySubmissionId.get(submission.id) ?? []}
            isBusy={isBusy}
            isExpanded={expandedIds.has(submission.id)}
            key={submission.id}
            onCopy={(message) => setStatusText(message)}
            onConflictDecision={(hint, decision) => void updateConflictDecision(submission, hint, decision)}
            onEdit={() => setEditTarget(submission)}
            onPublish={() => setPublishTarget(submission)}
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
            const success = await runAction(rejectTarget.id, 'reject', reason);
            if (success) {
              setRejectTarget(null);
            }
          }}
        />
      ) : null}

      {publishTarget ? (
        <PublishPoiDialog
          category={categoryById.get(publishTarget.categoryId)}
          conflictHints={conflictHintsBySubmissionId.get(publishTarget.id) ?? []}
          isBusy={isBusy}
          submission={publishTarget}
          onClose={() => setPublishTarget(null)}
          onConfirm={async () => {
            const success = await runAction(publishTarget.id, 'publish');
            if (success) {
              setPublishTarget(null);
            }
          }}
        />
      ) : null}

      {editTarget ? (
        <EditPoiSubmissionDialog
          categories={categories}
          contextMarkers={auditContextMarkersBySubmissionId.get(editTarget.id) ?? []}
          isBusy={isBusy}
          submission={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={async (input) => {
            const error = await updateSubmission(editTarget.id, input);
            if (!error) {
              setEditTarget(null);
            }
            return error;
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
  conflictDecisionByKey,
  contextMarkers,
  conflictHints,
  iconBaseUrl,
  isBusy,
  isExpanded,
  onCopy,
  onConflictDecision,
  onEdit,
  onPublish,
  onReject,
  onRunAction,
  onToggleExpanded,
  submission,
}: Readonly<{
  category?: PoiCategory;
  conflictDecisionByKey: Map<string, PoiConflictDecision>;
  contextMarkers: PoiAuditContextMarker[];
  conflictHints: PoiConflictHint[];
  iconBaseUrl: string;
  isBusy: boolean;
  isExpanded: boolean;
  onCopy: (message: string) => void;
  onConflictDecision: (hint: PoiConflictHint, decision: PoiConflictDecisionInput) => void;
  onEdit: () => void;
  onPublish: () => void;
  onReject: () => void;
  onRunAction: (poiId: string, action: 'approve' | 'reject', reason?: string) => Promise<boolean>;
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
        {conflictHints.length > 0 ? (
          <PoiConflictHintList
            conflictDecisionByKey={conflictDecisionByKey}
            hints={conflictHints}
            isBusy={isBusy}
            onDecision={onConflictDecision}
            submission={submission}
          />
        ) : null}
        {isExpanded ? (
          <PoiSubmissionDetail
            category={category}
            contextMarkers={contextMarkers}
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
          onClick={onEdit}
        >
          修正资料
        </button>
        <button
          type="button"
          disabled={isBusy || submission.status !== 'pending_review'}
          onClick={() => void onRunAction(submission.id, 'approve')}
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
          onClick={onPublish}
        >
          发布
        </button>
      </div>
    </article>
  );
}

function PoiConflictHintList({
  conflictDecisionByKey,
  hints,
  isBusy,
  onDecision,
  submission,
}: Readonly<{
  conflictDecisionByKey: Map<string, PoiConflictDecision>;
  hints: PoiConflictHint[];
  isBusy: boolean;
  onDecision: (hint: PoiConflictHint, decision: PoiConflictDecisionInput) => void;
  submission: PoiSubmission;
}>) {
  return (
    <div className="admin-poi-conflict-list" aria-label="可能重复或冲突的地图标记">
      <strong>可能冲突</strong>
      <div>
        {hints.map((hint) => {
          const decision = conflictDecisionByKey.get(conflictDecisionKey(submission.id, hint.marker.id));
          return (
            <article className="admin-poi-conflict-chip" key={hint.marker.id}>
              <a href={buildMarkerFocusHref(hint.marker)} target="_blank" rel="noreferrer">
                <span>{hint.marker.label}</span>
                <small>
                  {hint.reasons.join('、')}
                  {hint.distanceBlocks !== null ? ` · 约 ${Math.round(hint.distanceBlocks)} 格` : ''}
                </small>
              </a>
              <div className="admin-poi-conflict-actions">
                {decision ? (
                  <>
                    <span className={`admin-poi-conflict-decision is-${decision.decision}`}>
                      {conflictDecisionLabel(decision.decision)}
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDecision(hint, 'unresolved')}
                    >
                      重置
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDecision(hint, 'ignored')}
                    >
                      忽略
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDecision(hint, 'duplicate')}
                    >
                      待合并
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PoiSubmissionDetail({
  category,
  contextMarkers,
  representativeCoordinate,
  submission,
}: Readonly<{
  category?: PoiCategory;
  contextMarkers: PoiAuditContextMarker[];
  representativeCoordinate: [number, number] | null;
  submission: PoiSubmission;
}>) {
  return (
    <div className="admin-poi-detail">
      <PoiAuditMapPreview contextMarkers={contextMarkers} submission={submission} />
      <PoiGeometryPreview geometry={submission.geometry} />
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

function PoiAuditMapPreview({
  contextMarkers,
  submission,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  submission: PoiSubmission;
}>) {
  const preview = buildPoiAuditMapPreview(submission.geometry, contextMarkers);
  if (!preview) {
    return null;
  }

  const topMarkers = contextMarkers.slice(0, 4);

  return (
    <div className="admin-poi-audit-map">
      <div className="admin-poi-audit-map-header">
        <strong>审核地图预览</strong>
        <span>{contextMarkers.length ? `附近参考 ${contextMarkers.length} 个` : '暂无附近参考标记'}</span>
      </div>
      <svg viewBox="0 0 220 152" role="img" aria-label={`${submission.title} 审核地图预览`}>
        <rect className="admin-poi-audit-map-grid" x="0" y="0" width="220" height="152" />
        {preview.polygons.map((polygon, index) => (
          <polygon
            className="admin-poi-audit-map-submission-shape"
            key={`submission-polygon-${index}`}
            points={polygon}
          />
        ))}
        {preview.lines.map((line, index) => (
          <polyline
            className="admin-poi-audit-map-submission-line"
            key={`submission-line-${index}`}
            points={line}
          />
        ))}
        {preview.contextMarkers.map((marker) => (
          <g
            className={`admin-poi-audit-map-context-marker is-${marker.relation}`}
            key={marker.marker.id}
            transform={`translate(${roundPreviewValue(marker.point[0])} ${roundPreviewValue(marker.point[1])})`}
          >
            <circle r="4.5" />
            <title>
              {marker.marker.label} · {Math.round(marker.distanceBlocks)} 格
            </title>
          </g>
        ))}
        {preview.points.map((point, index) => (
          <circle
            className="admin-poi-audit-map-submission-point"
            cx={point[0]}
            cy={point[1]}
            key={`submission-point-${index}`}
            r="5"
          />
        ))}
      </svg>
      {topMarkers.length ? (
        <div className="admin-poi-audit-map-markers" aria-label="附近参考标记">
          {topMarkers.map((item) => (
            <span className={`admin-poi-audit-map-marker is-${item.relation}`} key={item.marker.id}>
              <span>{item.marker.label}</span>
              <small>
                {auditContextRelationLabel(item.relation)} · {Math.round(item.distanceBlocks)} 格
              </small>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PoiGeometryPreview({ geometry }: Readonly<{ geometry: MapGeometry }>) {
  const preview = buildGeometryPreview(geometry);
  if (!preview) {
    return null;
  }

  return (
    <div className="admin-poi-geometry-preview">
      <svg viewBox="0 0 180 128" role="img" aria-label={`${geometryLabel(geometry)} 预览`}>
        {preview.polygons.map((polygon, index) => (
          <polygon
            className="admin-poi-geometry-preview-shape"
            key={`polygon-${index}`}
            points={polygon}
          />
        ))}
        {preview.lines.map((line, index) => (
          <polyline
            className="admin-poi-geometry-preview-line"
            key={`line-${index}`}
            points={line}
          />
        ))}
        {preview.points.map((point, index) => (
          <circle
            className="admin-poi-geometry-preview-point"
            cx={point[0]}
            cy={point[1]}
            key={`point-${index}`}
            r="4"
          />
        ))}
      </svg>
      <small>几何形状预览 · {geometryLabel(geometry)}</small>
    </div>
  );
}

function PublishPoiDialog({
  category,
  conflictHints,
  isBusy,
  onClose,
  onConfirm,
  submission,
}: Readonly<{
  category?: PoiCategory;
  conflictHints: PoiConflictHint[];
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submission: PoiSubmission;
}>) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isConfirmed) {
      return;
    }
    await onConfirm();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-poi-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-publish-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-poi-publish-title">发布到公开地图</h2>
          <span className="muted">{submission.title}</span>
        </div>
        <p className="admin-poi-publish-warning">
          发布后该 POI 会对所有用户可见，并参与地图搜索、附近地点和路线规划候选。请先确认坐标、分类、图片来源和重复提示。
        </p>
        <dl className="admin-poi-publish-summary">
          <div>
            <dt>分类</dt>
            <dd>{formatCategoryName(submission.categoryId, category)}</dd>
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
            <dt>投稿图片</dt>
            <dd>{submission.imageUrl ? '有图片，需确认来源和内容匹配' : '未提交图片'}</dd>
          </div>
          <div>
            <dt>重复提示</dt>
            <dd>{conflictHints.length ? `发现 ${conflictHints.length} 条可能冲突提示` : '未发现明显冲突提示'}</dd>
          </div>
        </dl>
        <label className="admin-poi-publish-confirm">
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={(event) => setIsConfirmed(event.currentTarget.checked)}
          />
          <span>我已核对该 POI 的公开展示信息，确认可以发布。</span>
        </label>
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy || !isConfirmed}>
            确认发布
          </button>
        </div>
      </form>
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
        <div className="admin-poi-reject-presets" aria-label="常用驳回原因">
          {poiRejectReasonPresets.map((preset) => (
            <button
              type="button"
              key={preset}
              onClick={() => {
                setReason(preset);
                setError('');
              }}
            >
              {preset}
            </button>
          ))}
        </div>
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

function EditPoiSubmissionDialog({
  categories,
  contextMarkers,
  isBusy,
  onClose,
  onSubmit,
  submission,
}: Readonly<{
  categories: PoiCategory[];
  contextMarkers: PoiAuditContextMarker[];
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (input: PoiSubmissionEditInput) => Promise<string | null>;
  submission: PoiSubmission;
}>) {
  const [form, setForm] = useState<PoiSubmissionEditInput>(() => ({
    title: submission.title,
    categoryId: submission.categoryId,
    description: submission.description ?? '',
    href: submission.href ?? '',
  }));
  const pointCoordinate = submission.geometry.type === 'Point' ? submission.geometry.coordinates : null;
  const [pointX, setPointX] = useState(pointCoordinate ? String(pointCoordinate[0]) : '');
  const [pointZ, setPointZ] = useState(pointCoordinate ? String(pointCoordinate[1]) : '');
  const [error, setError] = useState('');
  const currentPointCoordinate = pointCoordinate
    ? readPointGeometryFromForm(pointX, pointZ)?.coordinates ?? pointCoordinate
    : null;

  const updateForm = (patch: Partial<PoiSubmissionEditInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('请填写地点名称。');
      return;
    }

    if (!form.categoryId.trim()) {
      setError('请选择地点分类。');
      return;
    }

    const nextGeometry = pointCoordinate
      ? readPointGeometryFromForm(pointX, pointZ)
      : undefined;
    if (pointCoordinate && !nextGeometry) {
      setError('请填写有效的 X/Z 坐标。');
      return;
    }

    const submitError = await onSubmit({
      title: form.title.trim(),
      categoryId: form.categoryId.trim(),
      description: form.description.trim(),
      href: form.href.trim(),
      geometry: nextGeometry,
    });
    if (submitError) {
      setError(submitError);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-poi-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-poi-edit-title">修正 POI 投稿</h2>
          <span className="muted">仅限待审核投稿的基础资料</span>
        </div>
        <label>
          <span>地点名称</span>
          <input
            value={form.title}
            onChange={(event) => updateForm({ title: event.currentTarget.value })}
            maxLength={200}
          />
        </label>
        <label>
          <span>分类</span>
          <select
            value={form.categoryId}
            onChange={(event) => updateForm({ categoryId: event.currentTarget.value })}
          >
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {formatCategoryName(category.id, category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>简介</span>
          <textarea
            value={form.description}
            onChange={(event) => updateForm({ description: event.currentTarget.value })}
            maxLength={1000}
          />
        </label>
        <label>
          <span>链接</span>
          <input
            value={form.href}
            onChange={(event) => updateForm({ href: event.currentTarget.value })}
            placeholder="https://..."
          />
        </label>
        {pointCoordinate ? (
          <div className="admin-poi-edit-coordinate">
            <div className="admin-poi-edit-coordinate-fields">
              <label>
                <span>X 坐标</span>
                <input
                  inputMode="decimal"
                  value={pointX}
                  onChange={(event) => {
                    setPointX(event.currentTarget.value);
                    setError('');
                  }}
                />
              </label>
              <label>
                <span>Z 坐标</span>
                <input
                  inputMode="decimal"
                  value={pointZ}
                  onChange={(event) => {
                    setPointZ(event.currentTarget.value);
                    setError('');
                  }}
                />
              </label>
            </div>
            <PoiPointCoordinatePicker
              contextMarkers={contextMarkers}
              currentCoordinate={currentPointCoordinate ?? pointCoordinate}
              originalCoordinate={pointCoordinate}
              onPick={(coordinate) => {
                setPointX(roundCoordinateForQuery(coordinate[0]));
                setPointZ(roundCoordinateForQuery(coordinate[1]));
                setError('');
              }}
            />
            <a
              className="admin-action-link"
              href={buildSubmissionMapHref(submission, currentPointCoordinate ?? pointCoordinate)}
              target="_blank"
              rel="noreferrer"
            >
              打开地图辅助选点
            </a>
          </div>
        ) : (
          <p className="muted">当前仅支持点状 POI 在此处修正坐标；线和面需要后续地图编辑器。</p>
        )}
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            保存修正
          </button>
        </div>
      </form>
    </div>
  );
}

function PoiPointCoordinatePicker({
  contextMarkers,
  currentCoordinate,
  onPick,
  originalCoordinate,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  currentCoordinate: [number, number];
  onPick: (coordinate: [number, number]) => void;
  originalCoordinate: [number, number];
}>) {
  const model = buildPoiPointCoordinatePickerModel(currentCoordinate, originalCoordinate, contextMarkers);

  const pickCoordinate = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewPoint: [number, number] = [
      ((event.clientX - rect.left) / rect.width) * 220,
      ((event.clientY - rect.top) / rect.height) * 152,
    ];
    onPick(unprojectAuditMapPreviewCoordinate(viewPoint, model.bounds));
  };

  return (
    <button
      className="admin-poi-coordinate-picker"
      type="button"
      onClick={pickCoordinate}
      aria-label="在坐标预览中点选新的 POI 坐标"
    >
      <svg viewBox="0 0 220 152" aria-hidden="true">
        <rect className="admin-poi-coordinate-picker-grid" x="0" y="0" width="220" height="152" />
        {model.contextMarkers.map((marker) => (
          <circle
            className={`admin-poi-coordinate-picker-context is-${marker.relation}`}
            cx={marker.point[0]}
            cy={marker.point[1]}
            key={marker.marker.id}
            r="4"
          />
        ))}
        <circle
          className="admin-poi-coordinate-picker-original"
          cx={model.originalPoint[0]}
          cy={model.originalPoint[1]}
          r="6"
        />
        <circle
          className="admin-poi-coordinate-picker-current"
          cx={model.currentPoint[0]}
          cy={model.currentPoint[1]}
          r="5"
        />
      </svg>
      <span>
        点击预览区域回填坐标 · 当前 {formatCoordinatePair(currentCoordinate)}
      </span>
    </button>
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
  const [deletingIconKey, setDeletingIconKey] = useState<string | null>(null);

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

  const deleteCategoryIcon = async (categoryId: string, iconValue: string) => {
    const uploadedFileName = extractUploadedPoiIconFileName(iconValue);
    if (!uploadedFileName) {
      setLocalStatus('只能删除通过后台上传的运行时图标。');
      return;
    }

    if (!window.confirm(`确认删除图标 ${uploadedFileName}？这会同步移除分类配置中的引用。`)) {
      return;
    }

    const deleteKey = `${categoryId}:${iconValue}`;
    setDeletingIconKey(deleteKey);
    setLocalStatus('');
    try {
      const response = await fetch(appPath('/api/admin/map/poi-category-icons'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iconFileName: iconValue }),
      });
      const data = (await response.json()) as {
        fileName?: string;
        fileDeleted?: boolean;
        message?: string;
        removedCategoryIds?: string[];
      };
      if (!response.ok) {
        setLocalStatus(data.message ?? '图标删除失败');
        return;
      }

      const deletedFileName = data.fileName ?? uploadedFileName;
      setDrafts((current) =>
        current.map((draft) => {
          const icons = splitIconFileNames(draft.iconFileNamesText).filter(
            (icon) => extractUploadedPoiIconFileName(icon) !== deletedFileName,
          );
          return {
            ...draft,
            defaultIconFileName:
              extractUploadedPoiIconFileName(draft.defaultIconFileName) === deletedFileName
                ? icons[0] ?? ''
                : draft.defaultIconFileName,
            iconFileNamesText: icons.join('\n'),
          };
        }),
      );
      onSaved(data.fileDeleted === false ? '图标引用已移除，文件此前已不存在' : 'POI 分类图标已删除');
    } finally {
      setDeletingIconKey(null);
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
                <div className="admin-poi-category-icon-list" aria-label={`${draft.name} 图标预览`}>
                  {splitIconFileNames(draft.iconFileNamesText).map((iconValue) => {
                    const uploadedFileName = extractUploadedPoiIconFileName(iconValue);
                    const isDefault = draft.defaultIconFileName.trim() === iconValue;
                    const deleteKey = `${draft.id}:${iconValue}`;
                    return (
                      <span
                        className={`admin-poi-category-icon-chip${isDefault ? ' is-default' : ''}`}
                        key={iconValue}
                      >
                        <span className="admin-poi-category-icon-swatch-group" aria-hidden="true">
                          {['light', 'dark', 'map'].map((tone) => (
                            <span
                              className={`admin-poi-category-icon-swatch is-${tone}`}
                              key={tone}
                              title={iconPreviewToneLabel(tone)}
                            >
                              <img src={toMarkerIconUrl(iconValue, iconBaseUrl)} alt="" draggable={false} />
                            </span>
                          ))}
                        </span>
                        <code>{iconValue}</code>
                        {isDefault ? <small>默认</small> : null}
                        {uploadedFileName ? (
                          <button
                            type="button"
                            disabled={deletingIconKey === deleteKey}
                            onClick={() => void deleteCategoryIcon(draft.id, iconValue)}
                          >
                            删除
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
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
}: Readonly<{ submission: AdminPoiSubmission }>) {
  if (!submission.imageUrl) {
    return null;
  }

  const imageUrl = resolvePoiSubmissionImageUrl(submission.imageUrl);
  const metadata = submission.imageMetadata;

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
        {metadata ? (
          <dl className="admin-poi-image-metadata">
            <div>
              <dt>文件</dt>
              <dd>{metadata.fileName}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{metadata.mimeType}</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>{formatFileSize(metadata.sizeBytes)}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{formatDate(metadata.updatedAt)}</dd>
            </div>
          </dl>
        ) : (
          <small>{submission.imageUrl.startsWith('/') ? '本地图片元数据暂不可用' : '外部图片链接，无法读取本地元数据'}</small>
        )}
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

interface GeometryPreviewModel {
  points: Array<[number, number]>;
  lines: string[];
  polygons: string[];
}

interface PoiAuditMapPreviewModel extends GeometryPreviewModel {
  contextMarkers: Array<PoiAuditContextMarker & { point: [number, number] }>;
}

interface PoiPointCoordinatePickerModel {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  contextMarkers: Array<PoiAuditContextMarker & { point: [number, number] }>;
  currentPoint: [number, number];
  originalPoint: [number, number];
}

function buildPoiPointCoordinatePickerModel(
  currentCoordinate: [number, number],
  originalCoordinate: [number, number],
  contextMarkers: PoiAuditContextMarker[],
): PoiPointCoordinatePickerModel {
  const contextCoordinates = contextMarkers.map((item) => item.coordinate);
  const bounds = expandCoordinateBounds(
    getCoordinateBounds([currentCoordinate, originalCoordinate, ...contextCoordinates]),
    120,
  );
  const project = (coordinate: [number, number]) => projectAuditMapPreviewCoordinate(coordinate, bounds);

  return {
    bounds,
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    currentPoint: project(currentCoordinate),
    originalPoint: project(originalCoordinate),
  };
}

function buildPoiAuditMapPreview(
  geometry: MapGeometry,
  contextMarkers: PoiAuditContextMarker[],
): PoiAuditMapPreviewModel | null {
  const coordinateSets = getGeometryPreviewCoordinateSets(geometry);
  const submissionCoordinates = coordinateSets.flatMap((set) => set.coordinates);
  const contextCoordinates = contextMarkers.map((item) => item.coordinate);
  const allCoordinates = [...submissionCoordinates, ...contextCoordinates];
  if (allCoordinates.length === 0) {
    return null;
  }

  const bounds = expandCoordinateBounds(getCoordinateBounds(allCoordinates), 80);
  const project = (coordinate: [number, number]) => projectAuditMapPreviewCoordinate(coordinate, bounds);
  const points: Array<[number, number]> = [];
  const lines: string[] = [];
  const polygons: string[] = [];

  for (const set of coordinateSets) {
    const projected = set.coordinates.map(project);
    const pointsValue = projected
      .map(([x, y]) => `${roundPreviewValue(x)},${roundPreviewValue(y)}`)
      .join(' ');
    if (set.kind === 'point') {
      points.push(...projected);
    } else if (set.kind === 'line') {
      lines.push(pointsValue);
      points.push(...projected);
    } else {
      polygons.push(pointsValue);
    }
  }

  return {
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    lines,
    points,
    polygons,
  };
}

function buildGeometryPreview(geometry: MapGeometry): GeometryPreviewModel | null {
  const coordinateSets = getGeometryPreviewCoordinateSets(geometry);
  const allCoordinates = coordinateSets.flatMap((set) => set.coordinates);
  if (allCoordinates.length === 0) {
    return null;
  }

  const bounds = getCoordinateBounds(allCoordinates);
  const project = (coordinate: [number, number]) =>
    projectGeometryPreviewCoordinate(coordinate, bounds);
  const points: Array<[number, number]> = [];
  const lines: string[] = [];
  const polygons: string[] = [];

  for (const set of coordinateSets) {
    const projected = set.coordinates.map(project);
    const pointsValue = projected
      .map(([x, y]) => `${roundPreviewValue(x)},${roundPreviewValue(y)}`)
      .join(' ');
    if (set.kind === 'point') {
      points.push(...projected);
    } else if (set.kind === 'line') {
      lines.push(pointsValue);
      points.push(...projected);
    } else {
      polygons.push(pointsValue);
    }
  }

  return { points, lines, polygons };
}

function getGeometryPreviewCoordinateSets(
  geometry: MapGeometry,
): Array<{ kind: 'point' | 'line' | 'polygon'; coordinates: Array<[number, number]> }> {
  if (geometry.type === 'Point') {
    return [{ kind: 'point', coordinates: [geometry.coordinates] }];
  }

  if (geometry.type === 'MultiPoint') {
    return [{ kind: 'point', coordinates: geometry.coordinates }];
  }

  if (geometry.type === 'LineString') {
    return [{ kind: 'line', coordinates: geometry.coordinates }];
  }

  if (geometry.type === 'Rectangle') {
    return [{ kind: 'polygon', coordinates: rectangleBoundsToCoordinates(geometry.bounds) }];
  }

  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.map((bounds) => ({
      kind: 'polygon',
      coordinates: rectangleBoundsToCoordinates(bounds),
    }));
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((coordinates) => ({ kind: 'polygon', coordinates }));
  }

  return geometry.coordinates.flatMap((polygon) =>
    polygon.map((coordinates) => ({ kind: 'polygon' as const, coordinates })),
  );
}

function rectangleBoundsToCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): Array<[number, number]> {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ];
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

function getCoordinateBounds(coordinates: Array<[number, number]>): {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
} {
  return coordinates.reduce(
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
}

function expandCoordinateBounds(
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  minSpan: number,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const spanX = Math.max(minSpan, bounds.maxX - bounds.minX);
  const spanZ = Math.max(minSpan, bounds.maxZ - bounds.minZ);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return {
    maxX: centerX + spanX / 2,
    maxZ: centerZ + spanZ / 2,
    minX: centerX - spanX / 2,
    minZ: centerZ - spanZ / 2,
  };
}

function projectAuditMapPreviewCoordinate(
  coordinate: [number, number],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): [number, number] {
  const width = 220;
  const height = 152;
  const padding = 16;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const contentWidth = spanX * scale;
  const contentHeight = spanZ * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  return [
    offsetX + (coordinate[0] - bounds.minX) * scale,
    offsetY + (coordinate[1] - bounds.minZ) * scale,
  ];
}

function unprojectAuditMapPreviewCoordinate(
  point: [number, number],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): [number, number] {
  const width = 220;
  const height = 152;
  const padding = 16;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const contentWidth = spanX * scale;
  const contentHeight = spanZ * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  const x = bounds.minX + (point[0] - offsetX) / scale;
  const z = bounds.minZ + (point[1] - offsetY) / scale;
  return [
    clamp(x, bounds.minX, bounds.maxX),
    clamp(z, bounds.minZ, bounds.maxZ),
  ];
}

function projectGeometryPreviewCoordinate(
  coordinate: [number, number],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): [number, number] {
  const width = 180;
  const height = 128;
  const padding = 14;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const contentWidth = spanX * scale;
  const contentHeight = spanZ * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  return [
    offsetX + (coordinate[0] - bounds.minX) * scale,
    offsetY + (coordinate[1] - bounds.minZ) * scale,
  ];
}

function roundPreviewValue(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatCoordinatePair([x, z]: [number, number]): string {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
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

function conflictDecisionKey(submissionId: string, markerId: string): string {
  return `${submissionId}\u0000${markerId}`;
}

function conflictDecisionLabel(decision: PoiConflictDecisionKind): string {
  return decision === 'ignored' ? '已忽略' : '待合并';
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

function buildPoiConflictHints(submission: PoiSubmission, markers: MapMarker[]): PoiConflictHint[] {
  const submissionCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const normalizedSubmissionTitle = normalizeSearchText(submission.title);
  const ownPublishedMarkerId = `poi-${submission.id}`;

  return markers
    .filter((marker) => marker.id !== ownPublishedMarkerId)
    .map((marker) => {
      const markerCoordinate = getGeometryRepresentativeCoordinate(marker.geometry);
      const distanceBlocks =
        submissionCoordinate && markerCoordinate
          ? distanceBetweenCoordinates(submissionCoordinate, markerCoordinate)
          : null;
      const normalizedMarkerTitle = normalizeSearchText(marker.label);
      const isSameName =
        normalizedMarkerTitle.length > 0 && normalizedMarkerTitle === normalizedSubmissionTitle;
      const isNearby = distanceBlocks !== null && distanceBlocks <= 120;
      const isSameCategoryNearby =
        marker.categoryId === submission.categoryId && distanceBlocks !== null && distanceBlocks <= 220;
      const reasons = [
        isSameName ? '同名' : '',
        isNearby ? '近距离' : '',
        isSameCategoryNearby ? '同分类附近' : '',
      ].filter(Boolean);

      return reasons.length > 0
        ? ({
            marker,
            reasons,
            distanceBlocks,
          } satisfies PoiConflictHint)
        : null;
    })
    .filter((hint): hint is PoiConflictHint => Boolean(hint))
    .sort(comparePoiConflictHints)
    .slice(0, 5);
}

function buildPoiAuditContextMarkers(
  submission: PoiSubmission,
  markers: MapMarker[],
): PoiAuditContextMarker[] {
  const submissionCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  if (!submissionCoordinate) {
    return [];
  }

  const ownPublishedMarkerId = `poi-${submission.id}`;
  return markers
    .filter((marker) => marker.id !== ownPublishedMarkerId)
    .map((marker) => {
      const coordinate = getGeometryRepresentativeCoordinate(marker.geometry);
      if (!coordinate) {
        return null;
      }

      const distanceBlocks = distanceBetweenCoordinates(submissionCoordinate, coordinate);
      if (distanceBlocks > 640) {
        return null;
      }

      return {
        coordinate,
        distanceBlocks,
        marker,
        relation: getPoiAuditContextRelation(submission, marker),
      } satisfies PoiAuditContextMarker;
    })
    .filter((item): item is PoiAuditContextMarker => Boolean(item))
    .sort(comparePoiAuditContextMarkers)
    .slice(0, 10);
}

function getPoiAuditContextRelation(
  submission: PoiSubmission,
  marker: MapMarker,
): PoiAuditContextMarker['relation'] {
  if (marker.categoryId && marker.categoryId === submission.categoryId) {
    return 'same-category';
  }

  if (isRoadReferenceMarker(marker)) {
    return 'road';
  }

  if (isTransitStationReferenceMarker(marker)) {
    return 'station';
  }

  return 'nearby';
}

function comparePoiAuditContextMarkers(
  left: PoiAuditContextMarker,
  right: PoiAuditContextMarker,
): number {
  const leftPriority = auditContextRelationPriority(left.relation);
  const rightPriority = auditContextRelationPriority(right.relation);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.distanceBlocks - right.distanceBlocks
    || left.marker.label.localeCompare(right.marker.label, 'zh-CN');
}

function auditContextRelationPriority(relation: PoiAuditContextMarker['relation']): number {
  if (relation === 'same-category') {
    return 0;
  }

  if (relation === 'road') {
    return 1;
  }

  if (relation === 'station') {
    return 2;
  }

  return 3;
}

function auditContextRelationLabel(relation: PoiAuditContextMarker['relation']): string {
  if (relation === 'same-category') {
    return '同分类';
  }

  if (relation === 'road') {
    return '道路参考';
  }

  if (relation === 'station') {
    return '站点参考';
  }

  return '附近地点';
}

function isRoadReferenceMarker(marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'symbolIcon'>): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(road|roadpoint|highway)\b/.test(text);
}

function isTransitStationReferenceMarker(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'symbolIcon'>,
): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(station|metro|subway|bus|tram|rail|ferry)/.test(text);
}

function comparePoiConflictHints(left: PoiConflictHint, right: PoiConflictHint): number {
  const leftSameName = left.reasons.includes('同名') ? 0 : 1;
  const rightSameName = right.reasons.includes('同名') ? 0 : 1;
  if (leftSameName !== rightSameName) {
    return leftSameName - rightSameName;
  }

  return (left.distanceBlocks ?? Number.POSITIVE_INFINITY)
    - (right.distanceBlocks ?? Number.POSITIVE_INFINITY)
    || left.marker.label.localeCompare(right.marker.label, 'zh-CN');
}

function distanceBetweenCoordinates(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function readPointGeometryFromForm(
  xValue: string,
  zValue: string,
): Extract<MapGeometry, { type: 'Point' }> | undefined {
  const x = Number(xValue);
  const z = Number(zValue);
  return Number.isFinite(x) && Number.isFinite(z)
    ? {
        type: 'Point',
        coordinates: [x, z],
      }
    : undefined;
}

function buildMarkerFocusHref(marker: MapMarker): string {
  const params = new URLSearchParams({ marker: marker.id });
  return `${appPath('/map')}?${params.toString()}`;
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

function extractUploadedPoiIconFileName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const pathMatch = /\/api\/map\/poi-icons\/([^/?#]+)/.exec(trimmed);
  const candidate = pathMatch?.[1] ?? trimmed.split(/[?#]/, 1)[0] ?? '';
  try {
    const fileName = decodeURIComponent(candidate);
    return /^[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/.test(fileName) ? fileName : null;
  } catch {
    return null;
  }
}

function iconPreviewToneLabel(tone: string): string {
  if (tone === 'dark') {
    return '深色背景预览';
  }

  if (tone === 'map') {
    return '地图底色预览';
  }

  return '浅色背景预览';
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
