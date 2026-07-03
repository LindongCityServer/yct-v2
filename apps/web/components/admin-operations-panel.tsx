'use client';

import type {
  ApiItemResponse,
  ContentAsset,
  LegacyHtmlContentMigrationPreview,
  LegacyAssetDuplicateResource,
  LegacyAssetManifest,
  LegacyAssetManifestIssue,
  LegacyAssetManifestIssueKind,
  LegacyContentAssetInventory,
} from '@yct/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
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

interface AdminContentAssetRecord {
  asset: ContentAsset;
  sourceKind: 'legacy' | 'upload' | 'external';
  migratedPath?: string;
  sha256?: string;
  references: Array<{
    entryId: string;
    referenceKind: string;
    contentId: string;
    contentTitle: string;
    sourcePageUrl?: string;
  }>;
  duplicateGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyAssetDownloadReportForAdmin {
  generatedAt: string;
  dataSource: string;
  summary: {
    total: number;
    downloaded: number;
    updated: number;
    unchanged: number;
    failed: number;
    sizeBytes: number;
  };
  differenceReport?: {
    issueSummary?: Record<string, number>;
    failedDownloads?: Array<{
      id: string;
      sourceUrl: string;
      migratedPath: string;
      filePath: string;
      status: 'failed';
      error?: string;
    }>;
  };
}

interface LegacyAssetAdminResponse {
  manifest?: ApiItemResponse<LegacyAssetManifest>;
  contentAssets?: ApiItemResponse<LegacyContentAssetInventory>;
  downloadReport?: {
    status: 'ready' | 'not_found' | 'invalid';
    report?: LegacyAssetDownloadReportForAdmin;
    message?: string;
  };
  message?: string;
}

type LegacyHtmlPagePreviewResponse = ApiItemResponse<LegacyHtmlContentMigrationPreview>;

const categories = ['通知公告', '运营信息', '地铁运营', '公交运营', '有轨运营', '网站公告'];

export function AdminOperationsPanel() {
  const [records, setRecords] = useState<AdminContentRecord[]>([]);
  const [assetRecords, setAssetRecords] = useState<AdminContentAssetRecord[]>([]);
  const [legacyAssetManifest, setLegacyAssetManifest] = useState<LegacyAssetManifest | null>(null);
  const [legacyContentAssets, setLegacyContentAssets] =
    useState<LegacyContentAssetInventory | null>(null);
  const [legacyHtmlPreview, setLegacyHtmlPreview] =
    useState<LegacyHtmlContentMigrationPreview | null>(null);
  const [legacyDownloadReport, setLegacyDownloadReport] = useState<
    LegacyAssetAdminResponse['downloadReport'] | null
  >(null);
  const [statusText, setStatusText] = useState('正在读取内容记录');
  const [assetStatusText, setAssetStatusText] = useState('正在读取内容素材');
  const [legacyAssetStatusText, setLegacyAssetStatusText] = useState('正在读取旧资源差异报告');
  const [legacyHtmlStatusText, setLegacyHtmlStatusText] = useState('正在读取旧专题页面');
  const [isBusy, setIsBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0] ?? '运营信息');
  const [excerpt, setExcerpt] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [assetIdsText, setAssetIdsText] = useState('');
  const [showInBanner, setShowInBanner] = useState(false);
  const [selectedAssetFile, setSelectedAssetFile] = useState<File | null>(null);
  const [recentUploadedAsset, setRecentUploadedAsset] = useState<AdminContentAssetRecord | null>(
    null,
  );
  const assetFileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [records],
  );
  const sortedAssetRecords = useMemo(
    () =>
      [...assetRecords].sort((left, right) => {
        const leftPending = left.asset.status === 'pending_review' ? 0 : 1;
        const rightPending = right.asset.status === 'pending_review' ? 0 : 1;
        if (leftPending !== rightPending) {
          return leftPending - rightPending;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [assetRecords],
  );
  const pendingAssetCount = useMemo(
    () => assetRecords.filter((record) => record.asset.status === 'pending_review').length,
    [assetRecords],
  );
  const issueSummary = useMemo(
    () =>
      legacyAssetManifest?.issues.reduce<Record<string, number>>((summary, issue) => {
        summary[issue.kind] = (summary[issue.kind] ?? 0) + 1;
        return summary;
      }, {}) ?? {},
    [legacyAssetManifest],
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

  const loadContentAssets = async () => {
    const response = await fetch(appPath('/api/admin/operations/assets'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: AdminContentAssetRecord[]; message?: string };
    if (!response.ok) {
      setAssetStatusText(data.message ?? '内容素材暂不可用');
      return;
    }

    setAssetRecords(data.items ?? []);
    setAssetStatusText(
      data.items?.length ? `已读取 ${data.items.length} 条素材记录` : '暂无内容素材记录',
    );
  };

  const loadLegacyAssetReport = async () => {
    const response = await fetch(appPath('/api/admin/operations/legacy-assets'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as LegacyAssetAdminResponse;
    if (!response.ok) {
      setLegacyAssetStatusText(data.message ?? '旧资源差异报告暂不可用');
      return;
    }

    setLegacyDownloadReport(data.downloadReport ?? null);
    setLegacyContentAssets(data.contentAssets?.item ?? null);
    if (!data.manifest?.item) {
      setLegacyAssetManifest(null);
      setLegacyAssetStatusText(data.manifest?.meta.message ?? '旧资源清单暂不可用');
      return;
    }

    setLegacyAssetManifest(data.manifest.item);
    setLegacyAssetStatusText(`已读取 ${data.manifest.item.summary.referenceCount} 个旧资源引用`);
  };

  const loadLegacyHtmlPreview = async () => {
    const response = await fetch(appPath('/api/admin/operations/legacy-html-pages'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as LegacyHtmlPagePreviewResponse;
    if (!response.ok || !data.item) {
      setLegacyHtmlPreview(null);
      setLegacyHtmlStatusText(data.meta?.message ?? '旧专题页面迁移预览暂不可用');
      return;
    }

    setLegacyHtmlPreview(data.item);
    setLegacyHtmlStatusText(`已转换 ${data.item.summary.convertedCount} 个旧专题页面`);
  };

  useEffect(() => {
    void Promise.all([
      loadRecords(),
      loadContentAssets(),
      loadLegacyAssetReport(),
      loadLegacyHtmlPreview(),
    ]);
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
          assetIds: parseAssetIds(assetIdsText),
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
      setAssetIdsText('');
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

  const importLegacyAssets = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/operations/assets/import-legacy'), {
        method: 'POST',
      });
      const data = (await response.json()) as {
        message?: string;
        summary?: { total: number; created: number; refreshed: number; pendingReview: number };
      };
      if (!response.ok) {
        setAssetStatusText(data.message ?? '导入旧素材失败');
        return;
      }

      setAssetStatusText(
        `旧素材已导入：新增 ${data.summary?.created ?? 0} 条，刷新 ${
          data.summary?.refreshed ?? 0
        } 条`,
      );
      await loadContentAssets();
    } finally {
      setIsBusy(false);
    }
  };

  const uploadAsset = async () => {
    if (!selectedAssetFile) {
      setAssetStatusText('请先选择素材文件');
      return;
    }

    setIsBusy(true);
    try {
      const body = new FormData();
      body.set('asset', selectedAssetFile);
      const response = await fetch(appPath('/api/admin/operations/assets/upload'), {
        method: 'POST',
        body,
      });
      const data = (await response.json()) as {
        message?: string;
        record?: AdminContentAssetRecord;
        reused?: boolean;
      };
      if (!response.ok || !data.record) {
        setAssetStatusText(data.message ?? '上传素材失败');
        return;
      }

      setRecentUploadedAsset(data.record);
      setAssetIdsText((current) => mergeAssetIdText(current, data.record!.asset.id));
      setSelectedAssetFile(null);
      if (assetFileInputRef.current) {
        assetFileInputRef.current.value = '';
      }
      setAssetStatusText(data.reused ? '素材已存在，已复用记录' : '素材已上传，等待审核');
      await loadContentAssets();
    } finally {
      setIsBusy(false);
    }
  };

  const reviewAsset = async (
    assetId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/operations/assets/${encodeURIComponent(assetId)}/review`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reason }),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setAssetStatusText(data.message ?? '素材审核失败');
        return;
      }

      setAssetStatusText('素材审核已更新');
      await loadContentAssets();
    } finally {
      setIsBusy(false);
    }
  };

  const loadLegacyHtmlItemToEditor = (item: LegacyHtmlContentMigrationPreview['items'][number]) => {
    setTitle(item.contentTitle);
    setCategoryId(item.categoryId || categories[0] || '运营信息');
    setMarkdown(item.markdown);
    setAssetIdsText('');
    setExcerpt('');
    setShowInBanner(false);
    setStatusText('旧专题正文已载入编辑器');
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
        <label>
          <span>素材 ID</span>
          <input
            value={assetIdsText}
            onChange={(event) => setAssetIdsText(event.currentTarget.value)}
          />
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

      <section className="admin-asset-report" aria-labelledby="admin-asset-report-title">
        <div className="section-heading">
          <h2 id="admin-asset-report-title">旧资源差异报告</h2>
          <span className="muted">{legacyAssetStatusText}</span>
        </div>

        {legacyAssetManifest ? (
          <>
            <div className="admin-report-summary" aria-label="旧资源摘要">
              <ReportMetric label="内容" value={legacyAssetManifest.summary.contentCount} />
              <ReportMetric label="唯一引用" value={legacyAssetManifest.summary.referenceCount} />
              <ReportMetric
                label="下载候选"
                value={legacyAssetManifest.summary.downloadableCount}
              />
              <ReportMetric label="外链" value={legacyAssetManifest.summary.externalCount} />
              <ReportMetric
                label="本地缺失"
                value={legacyAssetManifest.summary.missingLocalFileCount}
                tone={legacyAssetManifest.summary.missingLocalFileCount > 0 ? 'warning' : 'ok'}
              />
              <ReportMetric
                label="下载失败"
                value={legacyDownloadReport?.report?.summary.failed ?? 0}
                tone={(legacyDownloadReport?.report?.summary.failed ?? 0) > 0 ? 'warning' : 'ok'}
              />
              <ReportMetric label="素材记录" value={legacyContentAssets?.summary.assetCount ?? 0} />
              <ReportMetric
                label="待审核素材"
                value={legacyContentAssets?.summary.pendingReviewCount ?? 0}
                tone={(legacyContentAssets?.summary.pendingReviewCount ?? 0) > 0 ? 'warning' : 'ok'}
              />
            </div>

            <div className="admin-report-chips" aria-label="旧资源 issue 分类">
              {Object.entries(issueSummary).map(([kind, count]) => (
                <span
                  key={kind}
                >{`${issueKindLabel(kind as LegacyAssetManifestIssueKind)} ${count}`}</span>
              ))}
              {legacyDownloadReport?.status === 'ready' ? (
                <span>{`下载报告 ${formatDate(legacyDownloadReport.report?.generatedAt)}`}</span>
              ) : (
                <span>{legacyDownloadReport?.message ?? '尚无下载报告'}</span>
              )}
            </div>

            <div className="admin-report-grid">
              <IssuePreview issues={legacyAssetManifest.issues} />
              <DuplicateResourcePreview duplicates={legacyAssetManifest.duplicateResources} />
              <ContentAssetPreview inventory={legacyContentAssets} />
              <LegacyHtmlPreviewCard
                preview={legacyHtmlPreview}
                statusText={legacyHtmlStatusText}
                onLoadItem={loadLegacyHtmlItemToEditor}
              />
              <FailedDownloadPreview
                failedDownloads={
                  legacyDownloadReport?.report?.differenceReport?.failedDownloads ?? []
                }
              />
            </div>
          </>
        ) : (
          <p className="muted">旧资源清单不可用时不会展示迁移差异，需先确认旧站数据源配置。</p>
        )}
      </section>

      <section className="admin-asset-workflow" aria-labelledby="admin-content-assets-title">
        <div className="section-heading">
          <h2 id="admin-content-assets-title">内容素材审核</h2>
          <span className="muted">{assetStatusText}</span>
        </div>

        <div className="admin-report-summary" aria-label="内容素材摘要">
          <ReportMetric label="素材" value={assetRecords.length} />
          <ReportMetric
            label="待审核"
            value={pendingAssetCount}
            tone={pendingAssetCount > 0 ? 'warning' : 'ok'}
          />
          <ReportMetric
            label="已通过"
            value={assetRecords.filter((record) => record.asset.status === 'approved').length}
            tone="ok"
          />
          <button
            className="secondary-action-button"
            type="button"
            disabled={isBusy}
            onClick={importLegacyAssets}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              inventory_2
            </span>
            <span>导入旧素材</span>
          </button>
        </div>

        <div className="admin-asset-upload-row">
          <label>
            <span>上传素材</span>
            <input
              ref={assetFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif,application/pdf,text/plain,text/markdown,.md"
              onChange={(event) => setSelectedAssetFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button
            className="secondary-action-button"
            type="button"
            disabled={isBusy || !selectedAssetFile}
            onClick={uploadAsset}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              upload
            </span>
            <span>上传</span>
          </button>
          {recentUploadedAsset ? (
            <p className="muted">
              {recentUploadedAsset.asset.id} · {markdownImageSnippet(recentUploadedAsset.asset)}
            </p>
          ) : null}
        </div>

        <div className="admin-content-list" aria-label="内容素材记录">
          {sortedAssetRecords.slice(0, 12).map((record) => (
            <article className="admin-content-item" key={record.asset.id}>
              <div>
                <strong>{record.asset.fileName}</strong>
                <p className="muted">
                  {statusLabelForAsset(record.asset.status)} · {record.references.length} 个引用
                  {record.sha256 ? ` · SHA-256 ${record.sha256.slice(0, 12)}` : ''}
                </p>
              </div>
              <div className="admin-content-actions">
                <button
                  type="button"
                  disabled={isBusy || record.asset.status !== 'pending_review'}
                  onClick={() => reviewAsset(record.asset.id, 'approved')}
                >
                  通过
                </button>
                <button
                  type="button"
                  disabled={isBusy || record.asset.status !== 'pending_review'}
                  onClick={() => reviewAsset(record.asset.id, 'rejected', '后台退回')}
                >
                  驳回
                </button>
              </div>
            </article>
          ))}
          {sortedAssetRecords.length === 0 ? (
            <p className="muted">尚未导入内容素材。旧素材导入后会先进入待审核状态。</p>
          ) : null}
        </div>
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

function ReportMetric({
  label,
  value,
  tone,
}: Readonly<{ label: string; value: number; tone?: 'ok' | 'warning' }>) {
  return (
    <div className={['admin-report-metric', tone ? `is-${tone}` : ''].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssuePreview({ issues }: Readonly<{ issues: LegacyAssetManifestIssue[] }>) {
  const visibleIssues = issues
    .filter((issue) =>
      ['missing_local_file', 'external_reference', 'duplicate_reference'].includes(issue.kind),
    )
    .slice(0, 6);

  return (
    <article className="admin-report-card">
      <h3>问题样例</h3>
      {visibleIssues.length ? (
        visibleIssues.map((issue) => (
          <p key={issue.id}>
            <strong>{issueKindLabel(issue.kind)}</strong>
            <span>{issue.contentTitle ?? issue.sourceUrl ?? issue.id}</span>
          </p>
        ))
      ) : (
        <p className="muted">没有需要优先处理的问题。</p>
      )}
    </article>
  );
}

function DuplicateResourcePreview({
  duplicates,
}: Readonly<{ duplicates: LegacyAssetDuplicateResource[] }>) {
  return (
    <article className="admin-report-card">
      <h3>重复资源</h3>
      {duplicates.length ? (
        duplicates.slice(0, 5).map((duplicate) => (
          <p key={duplicate.id}>
            <strong>{`${duplicate.occurrenceCount} 次`}</strong>
            <span>{duplicate.migratedPath}</span>
          </p>
        ))
      ) : (
        <p className="muted">没有发现重复资源。</p>
      )}
    </article>
  );
}

function ContentAssetPreview({
  inventory,
}: Readonly<{ inventory: LegacyContentAssetInventory | null }>) {
  return (
    <article className="admin-report-card">
      <h3>素材清单</h3>
      {inventory ? (
        <>
          <p>
            <strong>{`${inventory.summary.deduplicatedReferenceCount} 个重复引用已复用`}</strong>
            <span>{`${inventory.summary.referenceCount} 个内容引用，${formatBytes(
              inventory.summary.totalSizeBytes,
            )}`}</span>
          </p>
          {inventory.items.slice(0, 4).map((item) => (
            <p key={item.asset.id}>
              <strong>{item.asset.fileName}</strong>
              <span>{`${statusLabelForAsset(item.asset.status)} · ${
                item.references.length
              } 个引用`}</span>
            </p>
          ))}
        </>
      ) : (
        <p className="muted">尚未生成可映射的旧内容素材清单。</p>
      )}
    </article>
  );
}

function LegacyHtmlPreviewCard({
  preview,
  statusText,
  onLoadItem,
}: Readonly<{
  preview: LegacyHtmlContentMigrationPreview | null;
  statusText: string;
  onLoadItem: (item: LegacyHtmlContentMigrationPreview['items'][number]) => void;
}>) {
  return (
    <article className="admin-report-card">
      <h3>旧专题正文</h3>
      {preview ? (
        <>
          <p>
            <strong>{`${preview.summary.convertedCount} 个页面已转换`}</strong>
            <span>{`${preview.summary.warningCount} 条转换提示`}</span>
          </p>
          {preview.items.slice(0, 3).map((item) => (
            <div className="admin-report-card-row" key={item.sourceUrl}>
              <p>
                <strong>{item.contentTitle}</strong>
                <span>{`${item.markdownLength} 字 · ${item.imageCount} 图 · ${item.linkCount} 链接`}</span>
              </p>
              <button type="button" onClick={() => onLoadItem(item)}>
                载入
              </button>
            </div>
          ))}
        </>
      ) : (
        <p className="muted">{statusText}</p>
      )}
    </article>
  );
}

function FailedDownloadPreview({
  failedDownloads,
}: Readonly<{
  failedDownloads: NonNullable<
    LegacyAssetDownloadReportForAdmin['differenceReport']
  >['failedDownloads'];
}>) {
  return (
    <article className="admin-report-card">
      <h3>下载失败</h3>
      {failedDownloads?.length ? (
        failedDownloads.slice(0, 5).map((item) => (
          <p key={item.id}>
            <strong>{item.error ?? '失败'}</strong>
            <span>{item.sourceUrl}</span>
          </p>
        ))
      ) : (
        <p className="muted">最近一次下载没有失败项。</p>
      )}
    </article>
  );
}

function issueKindLabel(kind: LegacyAssetManifestIssueKind): string {
  const labels: Record<LegacyAssetManifestIssueKind, string> = {
    external_reference: '外链',
    not_downloadable: '非下载项',
    missing_migrated_path: '缺少目标',
    missing_local_file: '本地缺失',
    duplicate_reference: '重复引用',
    duplicate_resource: '重复资源',
  };

  return labels[kind];
}

function formatDate(value: string | undefined): string {
  return value ? value.slice(0, 10) : '未生成';
}

function statusLabelForAsset(status: ContentAsset['status']): string {
  const labels: Record<ContentAsset['status'], string> = {
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    archived: '已归档',
  };

  return labels[status];
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function parseAssetIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function mergeAssetIdText(current: string, assetId: string): string {
  return Array.from(new Set([...parseAssetIds(current), assetId])).join('\n');
}

function markdownImageSnippet(asset: ContentAsset): string {
  if (asset.kind !== 'image') {
    return asset.url;
  }

  return `![${asset.fileName}](${appPath(asset.url)})`;
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
