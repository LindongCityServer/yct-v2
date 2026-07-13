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
  OperationsStrongReminderItem,
  OperationsStrongReminderRule,
  PushDelivery,
} from '@yct/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appBasePath, appPath } from '../lib/app-paths';
import { MarkdownBlocks } from './markdown-blocks';
import { TitleWithBreaks } from './title-with-breaks';

interface AdminContentMetadata {
  excerpt?: string;
  showInBanner: boolean;
  bannerSortOrder?: number;
  customTags?: string[];
  coverColor?: string;
  coverImageUrl?: string;
  expiresAt?: string;
}

interface AdminContentRecord {
  contentId: string;
  revision: {
    id: string;
    title: string;
    categoryId: string;
    markdown: string;
    assetIds: string[];
    status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';
    publishedAt?: string;
    scheduledAt?: string;
    reviewReason?: string;
  };
  metadata: AdminContentMetadata;
  publishHistory?: Array<{
    snapshotId: string;
    revisionId: string;
    title: string;
    categoryId: string;
    markdown: string;
    assetIds: string[];
    metadata: AdminContentMetadata;
    publishedAt: string;
    publishedBy: string;
  }>;
  updatedAt: string;
}

type AdminContentStatusFilter = AdminContentRecord['revision']['status'] | 'all';
type AdminContentAction = 'submit' | 'approve' | 'reject' | 'publish' | 'archive';

interface AdminContentActionOptions {
  mode?: 'immediate' | 'scheduled';
  reason?: string;
  scheduledAt?: string;
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
type AdminOperationsSection = 'contents' | 'reminders' | 'assets' | 'audit';
type AdminReminderWorkspace = 'rules' | 'preview';
type AdminReminderEnabledFilter = 'all' | 'enabled' | 'disabled';
type AdminAssetWorkspace = 'assets' | 'legacy';
type AdminAssetStatusFilter = ContentAsset['status'] | 'all';
type AdminAssetSourceFilter = AdminContentAssetRecord['sourceKind'] | 'all';
type AdminAuditStatusFilter = AdminAuditEventRecord['status'] | 'all';

interface AdminAuditEventRecord {
  eventId: string;
  type: string;
  status: 'queued' | 'dispatched' | 'failed';
  attempts: number;
  actor: {
    type: 'anonymous' | 'user' | 'admin' | 'system' | 'adapter';
    id?: string;
  };
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  failedAt?: string;
  lastErrorMessage?: string;
}

const categories = ['通知公告', '运营信息', '地铁运营', '公交运营', '有轨运营', '网站公告'];
const contentStatusFilterOptions: Array<{
  value: AdminContentStatusFilter;
  label: string;
}> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];
const auditStatusFilterOptions: Array<{ value: AdminAuditStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '待派发' },
  { value: 'dispatched', label: '已派发' },
  { value: 'failed', label: '失败' },
];
const reminderEnabledFilterOptions: Array<{
  value: AdminReminderEnabledFilter;
  label: string;
}> = [
  { value: 'all', label: '全部状态' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
];
const reminderSourceFilterOptions: Array<{
  value: OperationsStrongReminderRule['sourceKind'] | 'all';
  label: string;
}> = [
  { value: 'all', label: '全部来源' },
  { value: 'manual', label: '手动录入' },
  { value: 'content', label: '关联内容' },
];
const assetStatusFilterOptions: Array<{ value: AdminAssetStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'archived', label: '已归档' },
];
const assetSourceFilterOptions: Array<{ value: AdminAssetSourceFilter; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'legacy', label: '旧站迁移' },
  { value: 'upload', label: '后台上传' },
  { value: 'external', label: '外部引用' },
];
const reminderToneOptions: Array<{
  value: NonNullable<OperationsStrongReminderRule['tone']>;
  label: string;
}> = [
  { value: 'primary', label: '默认' },
  { value: 'metro', label: '地铁' },
  { value: 'bus', label: '公交' },
  { value: 'coach', label: '客运' },
  { value: 'tram', label: '有轨' },
  { value: 'ferry', label: '轮渡' },
  { value: 'flight', label: '航班' },
  { value: 'railway', label: '地方铁路' },
  { value: 'custom', label: '自定义' },
  { value: 'warning', label: '提示' },
  { value: 'danger', label: '警告' },
];

export function AdminOperationsPanel() {
  const [records, setRecords] = useState<AdminContentRecord[]>([]);
  const [reminderRules, setReminderRules] = useState<OperationsStrongReminderRule[]>([]);
  const [reminderPreview, setReminderPreview] = useState<ReminderPreviewResponse | null>(null);
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
  const [contentStatusFilter, setContentStatusFilter] = useState<AdminContentStatusFilter>('all');
  const [contentCategoryFilter, setContentCategoryFilter] = useState('all');
  const [contentSearchText, setContentSearchText] = useState('');
  const [reminderStatusText, setReminderStatusText] = useState('正在读取首页强提醒规则');
  const [reminderPreviewStatusText, setReminderPreviewStatusText] =
    useState('正在读取运营提醒投递预览');
  const [reminderWorkspace, setReminderWorkspace] = useState<AdminReminderWorkspace>('rules');
  const [reminderEnabledFilter, setReminderEnabledFilter] =
    useState<AdminReminderEnabledFilter>('all');
  const [reminderSourceFilter, setReminderSourceFilter] = useState<
    OperationsStrongReminderRule['sourceKind'] | 'all'
  >('all');
  const [reminderSearchText, setReminderSearchText] = useState('');
  const [assetStatusText, setAssetStatusText] = useState('正在读取内容素材');
  const [legacyAssetStatusText, setLegacyAssetStatusText] = useState('正在读取旧资源差异报告');
  const [legacyHtmlStatusText, setLegacyHtmlStatusText] = useState('正在读取旧专题页面');
  const [assetWorkspace, setAssetWorkspace] = useState<AdminAssetWorkspace>('assets');
  const [assetStatusFilter, setAssetStatusFilter] = useState<AdminAssetStatusFilter>('all');
  const [assetSourceFilter, setAssetSourceFilter] = useState<AdminAssetSourceFilter>('all');
  const [assetSearchText, setAssetSearchText] = useState('');
  const [visibleAssetCount, setVisibleAssetCount] = useState(12);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEventRecord[]>([]);
  const [auditStatusText, setAuditStatusText] = useState('正在读取后台审计事件');
  const [auditStatusFilter, setAuditStatusFilter] = useState<AdminAuditStatusFilter>('all');
  const [auditTypeFilter, setAuditTypeFilter] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditSearchText, setAuditSearchText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminOperationsSection>('contents');
  const [isContentEditorOpen, setIsContentEditorOpen] = useState(false);
  const [isReminderEditorOpen, setIsReminderEditorOpen] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminContentRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminContentRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminContentRecord | null>(null);
  const [bulkArchiveTargets, setBulkArchiveTargets] = useState<AdminContentRecord[] | null>(null);
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(() => new Set());
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0] ?? '运营信息');
  const [excerpt, setExcerpt] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [bannerSortOrderValue, setBannerSortOrderValue] = useState('');
  const [customTagsText, setCustomTagsText] = useState('');
  const [coverColor, setCoverColor] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [expiresAtValue, setExpiresAtValue] = useState('');
  const [assetIdsText, setAssetIdsText] = useState('');
  const [showInBanner, setShowInBanner] = useState(false);
  const [selectedAssetFile, setSelectedAssetFile] = useState<File | null>(null);
  const [recentUploadedAsset, setRecentUploadedAsset] = useState<AdminContentAssetRecord | null>(
    null,
  );
  const [reminderSourceKind, setReminderSourceKind] =
    useState<OperationsStrongReminderRule['sourceKind']>('manual');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTone, setReminderTone] =
    useState<NonNullable<OperationsStrongReminderRule['tone']>>('primary');
  const [reminderLabel, setReminderLabel] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderSummary, setReminderSummary] = useState('');
  const [reminderHref, setReminderHref] = useState('');
  const [reminderContentId, setReminderContentId] = useState('');
  const [reminderStartsAtValue, setReminderStartsAtValue] = useState('');
  const [reminderEndsAtValue, setReminderEndsAtValue] = useState('');
  const [reminderSortOrderValue, setReminderSortOrderValue] = useState('0');
  const assetFileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [records],
  );
  const contentCategoryOptions = useMemo(
    () =>
      Array.from(new Set([...categories, ...records.map((record) => record.revision.categoryId)])),
    [records],
  );
  const assetRecordById = useMemo(
    () => new Map(assetRecords.map((record) => [record.asset.id, record] as const)),
    [assetRecords],
  );
  const assetRecordByUrl = useMemo(
    () =>
      new Map(
        assetRecords.flatMap((record) =>
          buildContentAssetReferenceKeys(record.asset.url).map((key) => [key, record] as const),
        ),
      ),
    [assetRecords],
  );
  const contentTitleById = useMemo(
    () => new Map(records.map((record) => [record.contentId, record.revision.title] as const)),
    [records],
  );
  const currentEditingContentRecord = useMemo(
    () => records.find((record) => record.contentId === editingContentId) ?? null,
    [editingContentId, records],
  );
  const draftAssetIds = useMemo(
    () =>
      mergeUniqueStringValues([
        ...parseAssetIds(assetIdsText),
        ...extractContentAssetReferencePaths(markdown).flatMap((path) => {
          const assetRecord = assetRecordByUrl.get(normalizeContentAssetReferencePath(path));
          return assetRecord ? [assetRecord.asset.id] : [];
        }),
      ]),
    [assetIdsText, assetRecordByUrl, markdown],
  );
  const contentReviewPreviewById = useMemo(
    () =>
      new Map(
        records.map((record) => [
          record.contentId,
          buildContentPublishPreview(record, assetRecordById, {
            includeStatusBlocker: false,
          }),
        ]),
      ),
    [assetRecordById, records],
  );
  const draftContentReviewPreview = useMemo(
    () =>
      buildContentPublishPreview(
        {
          contentId: editingContentId ?? 'draft_preview',
          revision: {
            id: currentEditingContentRecord?.revision.id ?? 'draft_preview',
            title: title.trim() || '未填写标题',
            categoryId,
            markdown,
            assetIds: draftAssetIds,
            status: currentEditingContentRecord?.revision.status ?? 'draft',
            publishedAt: currentEditingContentRecord?.revision.publishedAt,
            scheduledAt: currentEditingContentRecord?.revision.scheduledAt,
            reviewReason: currentEditingContentRecord?.revision.reviewReason,
          },
          metadata: {
            excerpt: excerpt.trim() || undefined,
            showInBanner,
            bannerSortOrder: parseBannerSortOrderInput(bannerSortOrderValue),
            customTags: parseCustomTagsInput(customTagsText),
            coverColor: coverColor.trim() || undefined,
            coverImageUrl: coverImageUrl.trim() || undefined,
            expiresAt: parseDateTimeLocalInput(expiresAtValue) ?? undefined,
          },
          publishHistory: currentEditingContentRecord?.publishHistory,
          updatedAt: currentEditingContentRecord?.updatedAt ?? new Date().toISOString(),
        },
        assetRecordById,
        { includeStatusBlocker: false },
      ),
    [
      assetIdsText,
      assetRecordById,
      assetRecordByUrl,
      bannerSortOrderValue,
      categoryId,
      coverColor,
      coverImageUrl,
      currentEditingContentRecord,
      draftAssetIds,
      editingContentId,
      excerpt,
      expiresAtValue,
      markdown,
      showInBanner,
      title,
      customTagsText,
    ],
  );
  const contentStatusCounts = useMemo(
    () =>
      records.reduce<Record<AdminContentRecord['revision']['status'], number>>(
        (summary, record) => {
          summary[record.revision.status] += 1;
          return summary;
        },
        {
          draft: 0,
          pending_review: 0,
          approved: 0,
          rejected: 0,
          published: 0,
          archived: 0,
        },
      ),
    [records],
  );
  const contentDashboardMetrics = useMemo(() => {
    const publishReadyCount = records.filter((record) => {
      const preview = contentReviewPreviewById.get(record.contentId);
      return record.revision.status === 'approved' && (preview?.blockers.length ?? 0) === 0;
    }).length;
    const blockedPublishCount = records.filter((record) => {
      const preview = contentReviewPreviewById.get(record.contentId);
      return record.revision.status === 'approved' && (preview?.blockers.length ?? 0) > 0;
    }).length;
    const attentionCount = records.filter((record) => {
      const preview = contentReviewPreviewById.get(record.contentId);
      return record.revision.status !== 'archived' && (preview?.warnings.length ?? 0) > 0;
    }).length;

    return [
      { label: '内容总数', value: records.length },
      {
        label: '待审核',
        value: contentStatusCounts.pending_review,
        tone: contentStatusCounts.pending_review > 0 ? ('warning' as const) : undefined,
      },
      {
        label: '待发布',
        value: contentStatusCounts.approved,
        tone: contentStatusCounts.approved > 0 ? ('ok' as const) : undefined,
      },
      {
        label: '可直接发布',
        value: publishReadyCount,
        tone: publishReadyCount > 0 ? ('ok' as const) : undefined,
      },
      {
        label: '阻塞发布',
        value: blockedPublishCount,
        tone: blockedPublishCount > 0 ? ('warning' as const) : undefined,
      },
      {
        label: '待补资料',
        value: attentionCount,
        tone: attentionCount > 0 ? ('warning' as const) : undefined,
      },
      {
        label: '已过期',
        value: records.filter(isExpiredContentRecord).length,
        tone: records.some(isExpiredContentRecord) ? ('warning' as const) : undefined,
      },
    ];
  }, [contentReviewPreviewById, contentStatusCounts, records]);
  const filteredContentRecords = useMemo(() => {
    const normalizedSearchText = contentSearchText.trim().toLowerCase();

    return sortedRecords.filter((record) => {
      if (contentStatusFilter !== 'all' && record.revision.status !== contentStatusFilter) {
        return false;
      }

      if (contentCategoryFilter !== 'all' && record.revision.categoryId !== contentCategoryFilter) {
        return false;
      }

      return recordMatchesContentSearch(record, normalizedSearchText);
    });
  }, [contentCategoryFilter, contentSearchText, contentStatusFilter, sortedRecords]);
  const selectedContentRecords = useMemo(
    () => records.filter((record) => selectedContentIds.has(record.contentId)),
    [records, selectedContentIds],
  );
  const selectedVisibleContentRecords = useMemo(
    () => filteredContentRecords.filter((record) => selectedContentIds.has(record.contentId)),
    [filteredContentRecords, selectedContentIds],
  );
  const batchSubmitContentRecords = useMemo(
    () => selectedContentRecords.filter((record) => record.revision.status === 'draft'),
    [selectedContentRecords],
  );
  const batchArchiveContentRecords = useMemo(
    () => selectedContentRecords.filter((record) => record.revision.status !== 'archived'),
    [selectedContentRecords],
  );
  const isAllVisibleContentSelected =
    filteredContentRecords.length > 0 &&
    filteredContentRecords.every((record) => selectedContentIds.has(record.contentId));
  const sortedReminderRules = useMemo(
    () =>
      [...reminderRules].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
      }),
    [reminderRules],
  );
  const reminderDashboardMetrics = useMemo(() => {
    const now = new Date().toISOString();
    const enabledCount = reminderRules.filter((rule) => rule.enabled !== false).length;
    const contentLinkedCount = reminderRules.filter((rule) => rule.sourceKind === 'content').length;
    const activeCount = reminderRules.filter((rule) => {
      if (rule.enabled === false) {
        return false;
      }

      if (rule.startsAt && rule.startsAt > now) {
        return false;
      }

      if (rule.endsAt && rule.endsAt < now) {
        return false;
      }

      return true;
    }).length;

    return [
      { label: '规则总数', value: reminderRules.length },
      {
        label: '已启用',
        value: enabledCount,
        tone: enabledCount > 0 ? ('ok' as const) : undefined,
      },
      { label: '关联内容', value: contentLinkedCount },
      { label: '当前生效', value: activeCount },
    ];
  }, [reminderRules]);
  const filteredReminderRules = useMemo(() => {
    const normalizedSearchText = reminderSearchText.trim().toLowerCase();

    return sortedReminderRules.filter((rule) => {
      if (reminderEnabledFilter === 'enabled' && rule.enabled === false) {
        return false;
      }

      if (reminderEnabledFilter === 'disabled' && rule.enabled !== false) {
        return false;
      }

      if (reminderSourceFilter !== 'all' && rule.sourceKind !== reminderSourceFilter) {
        return false;
      }

      if (!normalizedSearchText) {
        return true;
      }

      const searchHaystacks = [
        rule.id,
        rule.label,
        rule.title,
        rule.summary,
        rule.href,
        rule.contentId,
        rule.contentId ? contentTitleById.get(rule.contentId) : '',
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return searchHaystacks.some((value) => value.includes(normalizedSearchText));
    });
  }, [
    contentTitleById,
    reminderEnabledFilter,
    reminderSearchText,
    reminderSourceFilter,
    sortedReminderRules,
  ]);
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
  const approvedAssetCount = useMemo(
    () => assetRecords.filter((record) => record.asset.status === 'approved').length,
    [assetRecords],
  );
  const rejectedAssetCount = useMemo(
    () => assetRecords.filter((record) => record.asset.status === 'rejected').length,
    [assetRecords],
  );
  const filteredAssetRecords = useMemo(() => {
    const normalizedSearchText = assetSearchText.trim().toLowerCase();

    return sortedAssetRecords.filter((record) => {
      if (assetStatusFilter !== 'all' && record.asset.status !== assetStatusFilter) {
        return false;
      }

      if (assetSourceFilter !== 'all' && record.sourceKind !== assetSourceFilter) {
        return false;
      }

      if (!normalizedSearchText) {
        return true;
      }

      const searchHaystacks = [
        record.asset.id,
        record.asset.fileName,
        record.asset.url,
        record.asset.sourceUrl,
        record.sha256,
        record.sourceKind,
        ...record.references.flatMap((reference) => [
          reference.contentId,
          reference.contentTitle,
          reference.entryId,
          reference.sourcePageUrl,
        ]),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return searchHaystacks.some((value) => value.includes(normalizedSearchText));
    });
  }, [assetSearchText, assetSourceFilter, assetStatusFilter, sortedAssetRecords]);
  const visibleAssetRecords = useMemo(
    () => filteredAssetRecords.slice(0, visibleAssetCount),
    [filteredAssetRecords, visibleAssetCount],
  );
  const issueSummary = useMemo(
    () =>
      legacyAssetManifest?.issues.reduce<Record<string, number>>((summary, issue) => {
        summary[issue.kind] = (summary[issue.kind] ?? 0) + 1;
        return summary;
      }, {}) ?? {},
    [legacyAssetManifest],
  );
  const auditEventStatusCounts = useMemo(
    () =>
      auditEvents.reduce<Record<AdminAuditEventRecord['status'], number>>(
        (summary, event) => {
          summary[event.status] += 1;
          return summary;
        },
        { queued: 0, dispatched: 0, failed: 0 },
      ),
    [auditEvents],
  );
  const auditEventTypeOptions = useMemo(
    () =>
      Array.from(new Set(auditEvents.map((event) => event.type))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [auditEvents],
  );
  const hasActiveAuditFilters =
    auditStatusFilter !== 'all' ||
    auditTypeFilter.trim().length > 0 ||
    auditEntityFilter.trim().length > 0 ||
    auditActorFilter.trim().length > 0 ||
    auditSearchText.trim().length > 0;
  const hasActiveReminderFilters =
    reminderEnabledFilter !== 'all' ||
    reminderSourceFilter !== 'all' ||
    reminderSearchText.trim().length > 0;
  const hasActiveAssetFilters =
    assetStatusFilter !== 'all' || assetSourceFilter !== 'all' || assetSearchText.trim().length > 0;
  const currentSectionStatusText = useMemo(() => {
    if (activeSection === 'contents') {
      return statusText;
    }

    if (activeSection === 'reminders') {
      return reminderWorkspace === 'preview' ? reminderPreviewStatusText : reminderStatusText;
    }

    if (activeSection === 'audit') {
      return auditStatusText;
    }

    if (assetWorkspace === 'legacy') {
      return [legacyAssetStatusText, legacyHtmlStatusText].filter(Boolean).join(' · ');
    }

    return assetStatusText;
  }, [
    activeSection,
    assetStatusText,
    assetWorkspace,
    auditStatusText,
    legacyAssetStatusText,
    legacyHtmlStatusText,
    reminderPreviewStatusText,
    reminderStatusText,
    reminderWorkspace,
    statusText,
  ]);

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

  const loadAuditEvents = async () => {
    const params = new URLSearchParams({
      limit: '100',
    });
    if (auditStatusFilter !== 'all') {
      params.set('status', auditStatusFilter);
    }
    if (auditTypeFilter.trim()) {
      params.set('type', auditTypeFilter.trim());
    }
    if (auditEntityFilter.trim()) {
      params.set('entityId', auditEntityFilter.trim());
    }
    if (auditActorFilter.trim()) {
      params.set('actorId', auditActorFilter.trim());
    }
    if (auditSearchText.trim()) {
      params.set('search', auditSearchText.trim());
    }

    setAuditStatusText('正在读取后台审计事件');
    const response = await fetch(
      appPath(`/api/admin/operations/audit-events?${params.toString()}`),
      {
        cache: 'no-store',
      },
    );
    const data = (await response.json()) as {
      items?: AdminAuditEventRecord[];
      message?: string;
    };
    if (!response.ok) {
      setAuditStatusText(data.message ?? '后台审计事件暂不可用');
      return;
    }

    setAuditEvents(data.items ?? []);
    const filterSummary = describeAuditFilterSummary({
      status: auditStatusFilter,
      type: auditTypeFilter,
      entityId: auditEntityFilter,
      actorId: auditActorFilter,
      search: auditSearchText,
    });
    setAuditStatusText(
      data.items?.length
        ? `已读取 ${data.items.length} 条审计事件${filterSummary ? ` · ${filterSummary}` : ''}`
        : filterSummary
          ? `当前筛选下暂无审计事件 · ${filterSummary}`
          : '暂无后台审计事件',
    );
  };

  const loadReminderRules = async () => {
    const response = await fetch(appPath('/api/admin/operations/reminder-rules'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      items?: OperationsStrongReminderRule[];
      message?: string;
    };
    if (!response.ok) {
      setReminderStatusText(data.message ?? '首页强提醒规则暂不可用');
      return;
    }

    setReminderRules(data.items ?? []);
    setReminderStatusText(
      data.items?.length ? `已读取 ${data.items.length} 条首页强提醒规则` : '暂无首页强提醒规则',
    );
  };

  const loadReminderPreview = async () => {
    const response = await fetch(appPath('/api/admin/operations/reminder-preview'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as ReminderPreviewResponse & { message?: string };
    if (!response.ok) {
      setReminderPreviewStatusText(data.message ?? '运营提醒投递预览暂不可用');
      return;
    }

    setReminderPreview(data);
    setReminderPreviewStatusText(
      data.candidates.length > 0
        ? `已读取 ${data.candidates.length} 条提醒候选与 ${data.deliveries.length} 条投递记录`
        : '暂无运营提醒候选或投递记录',
    );
  };

  const syncReminderSources = async (forceRefresh = false) => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/operations/reminder-preview/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh }),
      });
      const data = (await response.json()) as ReminderPreviewResponse & { message?: string };
      if (!response.ok) {
        setReminderPreviewStatusText(data.message ?? '公告源同步失败');
        return;
      }

      setReminderPreview(data);
      setReminderPreviewStatusText(
        data.syncResult?.message ??
          (forceRefresh ? '已强制同步公告源并尝试重算运营提醒。' : '已同步公告源。'),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const runReminderTasks = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/operations/reminder-preview/run-tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as ReminderPreviewResponse & { message?: string };
      if (!response.ok) {
        setReminderPreviewStatusText(data.message ?? '运行统一内部任务失败');
        return;
      }

      setReminderPreview(data);
      setReminderPreviewStatusText(
        data.taskRun
          ? `统一任务已运行：事件 ${data.taskRun.events.dispatched} 条，通知处理 ${data.taskRun.notifications.processed} 条`
          : '统一任务已运行。',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const refreshReminderDeliveries = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/operations/reminder-preview/refresh'), {
        method: 'POST',
      });
      const data = (await response.json()) as ReminderPreviewResponse & { message?: string };
      if (!response.ok) {
        setReminderPreviewStatusText(data.message ?? '手动重算运营提醒投递失败');
        return;
      }

      setReminderPreview(data);
      setReminderPreviewStatusText(
        data.candidates.length > 0
          ? `已手动重算 ${data.candidates.length} 条提醒候选与 ${data.deliveries.length} 条投递记录`
          : '已手动重算，但当前没有运营提醒候选或投递记录',
      );
    } finally {
      setIsBusy(false);
    }
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
      loadReminderRules(),
      loadReminderPreview(),
      loadContentAssets(),
      loadLegacyAssetReport(),
      loadLegacyHtmlPreview(),
    ]);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAuditEvents();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [auditActorFilter, auditEntityFilter, auditSearchText, auditStatusFilter, auditTypeFilter]);

  useEffect(() => {
    setVisibleAssetCount(12);
  }, [assetSearchText, assetSourceFilter, assetStatusFilter, assetWorkspace]);

  const resetEditor = () => {
    setEditingContentId(null);
    setTitle('');
    setCategoryId(categories[0] ?? '运营信息');
    setExcerpt('');
    setMarkdown('');
    setBannerSortOrderValue('');
    setCustomTagsText('');
    setCoverColor('');
    setCoverImageUrl('');
    setExpiresAtValue('');
    setAssetIdsText('');
    setShowInBanner(false);
    setIsContentEditorOpen(false);
  };

  const resetReminderEditor = () => {
    setEditingReminderId(null);
    setReminderSourceKind('manual');
    setReminderEnabled(true);
    setReminderTone('primary');
    setReminderLabel('');
    setReminderTitle('');
    setReminderSummary('');
    setReminderHref('');
    setReminderContentId('');
    setReminderStartsAtValue('');
    setReminderEndsAtValue('');
    setReminderSortOrderValue('0');
    setIsReminderEditorOpen(false);
  };

  const loadRecordToEditor = (record: AdminContentRecord) => {
    setIsContentEditorOpen(true);
    setEditingContentId(record.contentId);
    setTitle(record.revision.title);
    setCategoryId(record.revision.categoryId);
    setExcerpt(record.metadata.excerpt ?? '');
    setMarkdown(record.revision.markdown);
    setBannerSortOrderValue(
      record.metadata.bannerSortOrder !== undefined ? String(record.metadata.bannerSortOrder) : '',
    );
    setCustomTagsText((record.metadata.customTags ?? []).join('\n'));
    setCoverColor(record.metadata.coverColor ?? '');
    setCoverImageUrl(record.metadata.coverImageUrl ?? '');
    setExpiresAtValue(toDateTimeLocalInput(record.metadata.expiresAt));
    setAssetIdsText(record.revision.assetIds.join('\n'));
    setShowInBanner(record.metadata.showInBanner);
    setStatusText(
      record.revision.status === 'rejected'
        ? '已载入已驳回内容，修改后保存会回到草稿状态。'
        : record.revision.status === 'pending_review'
          ? '已载入待审核内容，修改后保存会撤回到草稿。'
          : record.revision.status === 'approved'
            ? '已载入待发布内容，修改后保存会撤回到草稿。'
            : record.revision.status === 'published'
              ? '已载入已发布内容，保存后会直接覆盖当前公开内容。'
              : '已载入草稿，可继续编辑。',
    );
  };

  const loadReminderToEditor = (rule: OperationsStrongReminderRule) => {
    setActiveSection('reminders');
    setReminderWorkspace('rules');
    setIsReminderEditorOpen(true);
    setEditingReminderId(rule.id);
    setReminderSourceKind(rule.sourceKind);
    setReminderEnabled(rule.enabled !== false);
    setReminderTone(rule.tone ?? 'primary');
    setReminderLabel(rule.label ?? '');
    setReminderTitle(rule.title ?? '');
    setReminderSummary(rule.summary ?? '');
    setReminderHref(rule.href ?? '');
    setReminderContentId(rule.contentId ?? '');
    setReminderStartsAtValue(toDateTimeLocalInput(rule.startsAt));
    setReminderEndsAtValue(toDateTimeLocalInput(rule.endsAt));
    setReminderSortOrderValue(String(rule.sortOrder ?? 0));
    setReminderStatusText('已载入首页强提醒规则，可继续修改。');
  };

  const saveDraft = async () => {
    const previousEditingStatus = currentEditingContentRecord?.revision.status ?? null;
    setIsBusy(true);
    try {
      const endpoint = editingContentId
        ? appPath(`/api/admin/operations/contents/${encodeURIComponent(editingContentId)}`)
        : appPath('/api/admin/operations/contents');
      const expiresAt = expiresAtValue.trim() ? parseDateTimeLocalInput(expiresAtValue) : undefined;
      if (expiresAtValue.trim() && !expiresAt) {
        setStatusText('有效期格式无效。');
        return;
      }
      const bannerSortOrder = parseBannerSortOrderInput(bannerSortOrderValue);
      if (bannerSortOrderValue.trim() && bannerSortOrder === undefined) {
        setStatusText('重点排序必须是整数。');
        return;
      }
      const customTags = parseCustomTagsInput(customTagsText);
      const response = await fetch(endpoint, {
        method: editingContentId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          categoryId,
          excerpt: excerpt.trim() || undefined,
          markdown,
          showInBanner,
          bannerSortOrder,
          customTags,
          coverColor: coverColor.trim() || undefined,
          coverImageUrl: coverImageUrl.trim() || undefined,
          expiresAt,
          assetIds: parseAssetIds(assetIdsText),
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? (editingContentId ? '更新草稿失败' : '创建草稿失败'));
        return;
      }

      resetEditor();
      setStatusText(
        editingContentId
          ? previousEditingStatus === 'published'
            ? '内容已更新，当前公开内容已同步刷新。'
            : previousEditingStatus === 'pending_review' || previousEditingStatus === 'approved'
              ? '内容已保存，并已回到草稿状态，可再次提交审核。'
              : '草稿已更新，可在下方提交审核。'
          : '草稿已创建',
      );
      await loadRecords();
    } finally {
      setIsBusy(false);
    }
  };

  const sendContentAction = async (
    contentId: string,
    action: AdminContentAction,
    options: AdminContentActionOptions = {},
  ) => {
    const endpoint =
      action === 'submit'
        ? appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/submit`)
        : action === 'publish'
          ? appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/publish`)
          : action === 'archive'
            ? appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/archive`)
            : appPath(`/api/admin/operations/contents/${encodeURIComponent(contentId)}/review`);
    const body =
      action === 'approve'
        ? { decision: 'approved' }
        : action === 'reject'
          ? { decision: 'rejected', reason: options.reason ?? '后台退回' }
          : action === 'publish'
            ? {
                mode: options.mode ?? 'immediate',
                scheduledAt: options.mode === 'scheduled' ? options.scheduledAt : undefined,
              }
            : action === 'archive'
              ? {}
              : {};
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { message?: string };

    return {
      ok: response.ok,
      message: response.ok ? undefined : (data.message ?? '操作失败'),
    };
  };

  const runAction = async (
    contentId: string,
    action: AdminContentAction,
    options: AdminContentActionOptions = {},
  ) => {
    setIsBusy(true);
    try {
      const result = await sendContentAction(contentId, action, options);
      if (!result.ok) {
        setStatusText(result.message ?? '操作失败');
        return false;
      }

      if (action === 'publish') {
        setPublishTarget(null);
      }
      setStatusText('操作已完成');
      await loadRecords();
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const runBatchContentAction = async (
    targetRecords: AdminContentRecord[],
    action: Extract<AdminContentAction, 'submit' | 'archive'>,
  ) => {
    if (targetRecords.length === 0) {
      setStatusText(action === 'submit' ? '没有可提交审核的草稿。' : '没有可归档的内容。');
      return false;
    }

    setIsBusy(true);
    try {
      const failedTitles: string[] = [];
      for (const record of targetRecords) {
        const result = await sendContentAction(record.contentId, action);
        if (!result.ok) {
          failedTitles.push(`${record.revision.title}：${result.message ?? '操作失败'}`);
        }
      }

      await loadRecords();

      if (failedTitles.length > 0) {
        setStatusText(`批量操作部分失败：${failedTitles.slice(0, 2).join('；')}`);
        return false;
      }

      setSelectedContentIds((current) => {
        const next = new Set(current);
        targetRecords.forEach((record) => next.delete(record.contentId));
        return next;
      });
      setStatusText(
        action === 'submit'
          ? `已提交 ${targetRecords.length} 条内容进入审核。`
          : `已归档 ${targetRecords.length} 条内容。`,
      );
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const openPublishDialog = (record: AdminContentRecord) => {
    setPublishTarget(record);
  };

  const openRejectDialog = (record: AdminContentRecord) => {
    setRejectTarget(record);
  };

  const openArchiveDialog = (record: AdminContentRecord) => {
    setArchiveTarget(record);
  };

  const toggleContentRecordSelection = (contentId: string) => {
    setSelectedContentIds((current) => {
      const next = new Set(current);
      if (next.has(contentId)) {
        next.delete(contentId);
      } else {
        next.add(contentId);
      }
      return next;
    });
  };

  const toggleVisibleContentSelection = () => {
    setSelectedContentIds((current) => {
      const next = new Set(current);
      if (isAllVisibleContentSelected) {
        filteredContentRecords.forEach((record) => next.delete(record.contentId));
      } else {
        filteredContentRecords.forEach((record) => next.add(record.contentId));
      }
      return next;
    });
  };

  const clearContentSelection = () => {
    setSelectedContentIds(new Set());
  };

  const openCreateContentEditor = () => {
    setEditingContentId(null);
    setTitle('');
    setCategoryId(categories[0] ?? '运营信息');
    setExcerpt('');
    setMarkdown('');
    setBannerSortOrderValue('');
    setCustomTagsText('');
    setCoverColor('');
    setCoverImageUrl('');
    setExpiresAtValue('');
    setAssetIdsText('');
    setShowInBanner(false);
    setIsContentEditorOpen(true);
  };

  const openCreateReminderEditor = () => {
    setActiveSection('reminders');
    setReminderWorkspace('rules');
    setEditingReminderId(null);
    setReminderSourceKind('manual');
    setReminderEnabled(true);
    setReminderTone('primary');
    setReminderLabel('');
    setReminderTitle('');
    setReminderSummary('');
    setReminderHref('');
    setReminderContentId('');
    setReminderStartsAtValue('');
    setReminderEndsAtValue('');
    setReminderSortOrderValue('0');
    setIsReminderEditorOpen(true);
  };

  const resetReminderFilters = () => {
    setReminderEnabledFilter('all');
    setReminderSourceFilter('all');
    setReminderSearchText('');
  };

  const resetAssetFilters = () => {
    setAssetStatusFilter('all');
    setAssetSourceFilter('all');
    setAssetSearchText('');
  };

  const reloadLegacyAssetWorkspace = async () => {
    setIsBusy(true);
    try {
      await Promise.all([loadLegacyAssetReport(), loadLegacyHtmlPreview()]);
    } finally {
      setIsBusy(false);
    }
  };

  const persistReminderRules = async (
    nextRules: OperationsStrongReminderRule[],
    successMessage: string,
  ) => {
    const response = await fetch(appPath('/api/admin/operations/reminder-rules'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: nextRules.map((rule) => ({
          ...rule,
          id: rule.id || undefined,
        })),
      }),
    });
    const data = (await response.json()) as {
      items?: OperationsStrongReminderRule[];
      message?: string;
    };
    if (!response.ok) {
      setReminderStatusText(data.message ?? '保存首页强提醒规则失败');
      return false;
    }

    setReminderRules(data.items ?? []);
    setReminderStatusText(successMessage);
    resetReminderEditor();
    await loadReminderPreview();
    return true;
  };

  const saveReminderRule = async () => {
    const startsAt = reminderStartsAtValue.trim()
      ? parseDateTimeLocalInput(reminderStartsAtValue)
      : undefined;
    const endsAt = reminderEndsAtValue.trim()
      ? parseDateTimeLocalInput(reminderEndsAtValue)
      : undefined;
    if (reminderStartsAtValue.trim() && !startsAt) {
      setReminderStatusText('首页强提醒开始时间格式无效。');
      return;
    }
    if (reminderEndsAtValue.trim() && !endsAt) {
      setReminderStatusText('首页强提醒结束时间格式无效。');
      return;
    }
    if (startsAt && endsAt && startsAt >= endsAt) {
      setReminderStatusText('首页强提醒结束时间必须晚于开始时间。');
      return;
    }

    const sortOrder = parseBannerSortOrderInput(reminderSortOrderValue);
    if (reminderSortOrderValue.trim() && sortOrder === undefined) {
      setReminderStatusText('首页强提醒排序必须是整数。');
      return;
    }

    if (reminderSourceKind === 'manual' && !reminderTitle.trim()) {
      setReminderStatusText('手动强提醒至少需要标题。');
      return;
    }
    if (reminderSourceKind === 'content' && !reminderContentId.trim()) {
      setReminderStatusText('内容型强提醒需要关联一个内容。');
      return;
    }
    if (reminderHref.trim() && !/^(?:https?:\/\/|\/)/i.test(reminderHref.trim())) {
      setReminderStatusText('强提醒跳转链接必须是站内路径或 http(s) 链接。');
      return;
    }

    setIsBusy(true);
    try {
      const nextRule: OperationsStrongReminderRule = {
        id: editingReminderId ?? '',
        sourceKind: reminderSourceKind,
        enabled: reminderEnabled,
        sortOrder: sortOrder ?? 0,
        tone: reminderTone,
        label: reminderLabel.trim() || undefined,
        title: reminderTitle.trim() || undefined,
        summary: reminderSummary.trim() || undefined,
        href: reminderHref.trim() || undefined,
        contentId: reminderContentId.trim() || undefined,
        startsAt,
        endsAt,
      };

      const nextRules = editingReminderId
        ? reminderRules.map((rule) => (rule.id === editingReminderId ? nextRule : rule))
        : [nextRule, ...reminderRules];
      await persistReminderRules(
        nextRules,
        editingReminderId ? '首页强提醒规则已更新。' : '首页强提醒规则已创建。',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const deleteReminderRule = async (ruleId: string) => {
    setIsBusy(true);
    try {
      await persistReminderRules(
        reminderRules.filter((rule) => rule.id !== ruleId),
        '首页强提醒规则已删除。',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const toggleReminderRuleEnabled = async (ruleId: string) => {
    setIsBusy(true);
    try {
      await persistReminderRules(
        reminderRules.map((rule) =>
          rule.id === ruleId ? { ...rule, enabled: rule.enabled === false } : rule,
        ),
        '首页强提醒启用状态已更新。',
      );
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
    setIsContentEditorOpen(true);
    setEditingContentId(null);
    setTitle(item.contentTitle);
    setCategoryId(item.categoryId || categories[0] || '运营信息');
    setExcerpt('');
    setMarkdown(item.markdown);
    setBannerSortOrderValue('');
    setCustomTagsText('');
    setCoverColor('');
    setCoverImageUrl('');
    setExpiresAtValue('');
    setAssetIdsText('');
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
        <span className="muted">{currentSectionStatusText}</span>
      </div>
      <fieldset className="segmented-control admin-page-segmented-control">
        <legend>内容后台系列</legend>
        <div>
          <button
            className={activeSection === 'contents' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'contents'}
            onClick={() => setActiveSection('contents')}
          >
            内容记录
          </button>
          <button
            className={activeSection === 'reminders' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'reminders'}
            onClick={() => setActiveSection('reminders')}
          >
            首页强提醒
          </button>
          <button
            className={activeSection === 'assets' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'assets'}
            onClick={() => setActiveSection('assets')}
          >
            素材与迁移
          </button>
          <button
            className={activeSection === 'audit' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'audit'}
            onClick={() => setActiveSection('audit')}
          >
            审计事件
          </button>
        </div>
      </fieldset>

      {isContentEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={resetEditor}>
          <section
            className="modal-panel admin-content-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="创建内容草稿"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {editingContentId ? (
              <p className="muted">{`当前正在编辑 ${editingContentId.slice(-8).toUpperCase()} 内容`}</p>
            ) : null}
            <label>
              <span>标题</span>
              <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </label>
            <label>
              <span>分类</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.currentTarget.value)}
              >
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
            <label>
              <span>封面色</span>
              <input
                value={coverColor}
                onChange={(event) => setCoverColor(event.currentTarget.value)}
                placeholder="#168f78 或 var(--token)"
              />
            </label>
            <label>
              <span>封面图链接</span>
              <input
                value={coverImageUrl}
                onChange={(event) => setCoverImageUrl(event.currentTarget.value)}
                placeholder="/content-assets/cover.png 或 https://..."
              />
            </label>
            <label>
              <span>有效期</span>
              <input
                type="datetime-local"
                value={expiresAtValue}
                onChange={(event) => setExpiresAtValue(event.currentTarget.value)}
              />
            </label>
            <div className="admin-editor-markdown-grid">
              <label className="admin-editor-markdown">
                <span>Markdown 正文</span>
                <textarea
                  value={markdown}
                  onChange={(event) => setMarkdown(event.currentTarget.value)}
                />
              </label>
              <article className="admin-editor-preview" aria-label="内容预览">
                {coverImageUrl.trim() || coverColor.trim() ? (
                  <div
                    className="admin-editor-preview-cover"
                    style={
                      coverImageUrl.trim()
                        ? { backgroundImage: `url("${appPath(coverImageUrl.trim())}")` }
                        : { backgroundColor: coverColor.trim() }
                    }
                  />
                ) : null}
                <div className="admin-editor-preview-header">
                  <span className="muted">{categoryId}</span>
                  <strong>
                    <TitleWithBreaks
                      title={title.trim() || '未填写标题'}
                      segments={getPreviewTitleSegments(title)}
                    />
                  </strong>
                  {excerpt.trim() ? <p>{excerpt.trim()}</p> : null}
                  {expiresAtValue ? (
                    <small className="muted">{`有效期至 ${formatDateTimeLocalPreview(
                      expiresAtValue,
                    )}`}</small>
                  ) : null}
                </div>
                {parseCustomTagsInput(customTagsText).length > 0 ? (
                  <div className="operation-tag-list" aria-label="内容标签预览">
                    {parseCustomTagsInput(customTagsText).map((tag) => (
                      <span className="operation-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <ContentReviewSnapshot preview={draftContentReviewPreview} title="编辑提示" />
                {markdown.trim() ? (
                  <MarkdownBlocks markdown={markdown} />
                ) : (
                  <p className="muted">正文为空时，这里会显示 Markdown 预览。</p>
                )}
              </article>
            </div>
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
            <label>
              <span>重点排序</span>
              <input
                type="number"
                step="1"
                value={bannerSortOrderValue}
                onChange={(event) => setBannerSortOrderValue(event.currentTarget.value)}
                placeholder="数值越小越靠前"
              />
            </label>
            <label className="admin-editor-markdown">
              <span>标签</span>
              <textarea
                value={customTagsText}
                onChange={(event) => setCustomTagsText(event.currentTarget.value)}
                placeholder="每行一个标签，或用逗号分隔"
              />
            </label>
            <div className="admin-content-actions">
              <button
                className="secondary-action-button is-primary"
                type="button"
                disabled={isBusy}
                onClick={saveDraft}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {editingContentId ? 'save' : 'add'}
                </span>
                <span>{editingContentId ? '保存草稿' : '创建草稿'}</span>
              </button>
              <button type="button" disabled={isBusy} onClick={resetEditor}>
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'reminders' ? (
        <section className="admin-reminder-workflow" aria-labelledby="admin-reminders-title">
          <div className="section-heading">
            <h2 id="admin-reminders-title">首页强提醒</h2>
            <span className="muted">{reminderStatusText}</span>
          </div>
          <p className="muted admin-reminder-note">
            第一版用于管理首页“强提醒”卡片，可手动录入，也可关联已公开的运营内容。旧 `ltcx/stop.txt`
            解析出的客运公告也会自动并入候选与投递预览；如果只是旧公告源
            更新、没有改动规则正文，可直接用下方“重算投递”同步当前队列。
          </p>
          <fieldset className="segmented-control admin-subsection-segmented-control">
            <legend>首页强提醒工作区</legend>
            <div>
              <button
                className={reminderWorkspace === 'rules' ? 'is-active' : ''}
                type="button"
                aria-pressed={reminderWorkspace === 'rules'}
                onClick={() => setReminderWorkspace('rules')}
              >
                规则列表
              </button>
              <button
                className={reminderWorkspace === 'preview' ? 'is-active' : ''}
                type="button"
                aria-pressed={reminderWorkspace === 'preview'}
                onClick={() => setReminderWorkspace('preview')}
              >
                投递预览
              </button>
            </div>
          </fieldset>

          {reminderWorkspace === 'rules' ? (
            <>
              <div className="admin-report-summary" aria-label="首页强提醒规则摘要">
                {reminderDashboardMetrics.map((metric) => (
                  <ReportMetric
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                    key={metric.label}
                  />
                ))}
                <ReportMetric label="当前结果" value={filteredReminderRules.length} />
              </div>
              <div
                className="admin-poi-toolbar admin-content-toolbar"
                aria-label="首页强提醒规则筛选"
              >
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  onClick={openCreateReminderEditor}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_alert
                  </span>
                  <span>{editingReminderId ? '继续编辑规则' : '新增规则'}</span>
                </button>
                <label>
                  <span>状态</span>
                  <select
                    value={reminderEnabledFilter}
                    onChange={(event) =>
                      setReminderEnabledFilter(
                        event.currentTarget.value as AdminReminderEnabledFilter,
                      )
                    }
                  >
                    {reminderEnabledFilterOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>来源</span>
                  <select
                    value={reminderSourceFilter}
                    onChange={(event) =>
                      setReminderSourceFilter(
                        event.currentTarget.value as
                          OperationsStrongReminderRule['sourceKind'] | 'all',
                      )
                    }
                  >
                    {reminderSourceFilterOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-poi-search">
                  <span>搜索</span>
                  <input
                    value={reminderSearchText}
                    onChange={(event) => setReminderSearchText(event.currentTarget.value)}
                    placeholder="标题、标签、内容 ID、链接"
                  />
                </label>
                <button
                  type="button"
                  disabled={!hasActiveReminderFilters}
                  onClick={resetReminderFilters}
                >
                  清空筛选
                </button>
              </div>

              <div className="admin-content-list" aria-label="首页强提醒规则列表">
                {filteredReminderRules.map((rule) => (
                  <article className="admin-content-item" key={rule.id}>
                    <div>
                      <strong>{describeReminderRuleTitle(rule)}</strong>
                      <p className="muted">{describeReminderRuleMeta(rule)}</p>
                      <div className="operation-tag-list" aria-label={`${rule.id} 规则标签`}>
                        <span className="operation-tag">
                          {describeReminderRuleSourceKind(rule.sourceKind)}
                        </span>
                        <span
                          className={`operation-tag ${rule.enabled === false ? 'is-warning' : 'is-ok'}`}
                        >
                          {rule.enabled === false ? '已停用' : '已启用'}
                        </span>
                        {rule.label ? <span className="operation-tag">{rule.label}</span> : null}
                        {rule.contentId ? (
                          <span className="operation-tag">{`内容 ${rule.contentId}`}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="admin-content-actions">
                      <button
                        type="button"
                        disabled={isBusy || editingReminderId === rule.id}
                        onClick={() => loadReminderToEditor(rule)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void toggleReminderRuleEnabled(rule.id)}
                      >
                        {rule.enabled === false ? '启用' : '停用'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void deleteReminderRule(rule.id)}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
                {filteredReminderRules.length === 0 ? (
                  <div className="admin-content-empty">
                    <p className="muted">
                      {hasActiveReminderFilters
                        ? '当前筛选条件下没有首页强提醒规则。'
                        : '尚未配置首页强提醒规则。'}
                    </p>
                    {hasActiveReminderFilters ? (
                      <button type="button" onClick={resetReminderFilters}>
                        查看全部规则
                      </button>
                    ) : (
                      <button type="button" onClick={openCreateReminderEditor}>
                        新增第一条规则
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <section
              className="admin-reminder-preview"
              aria-labelledby="admin-reminder-preview-title"
            >
              <div className="section-heading">
                <h3 id="admin-reminder-preview-title">运营提醒投递预览</h3>
                <span className="muted">{reminderPreviewStatusText}</span>
              </div>
              <div className="admin-toolbar">
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => setReminderWorkspace('rules')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    list_alt
                  </span>
                  <span>查看规则列表</span>
                </button>
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  onClick={openCreateReminderEditor}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_alert
                  </span>
                  <span>新增规则</span>
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void syncReminderSources(false)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    sync
                  </span>
                  <span>同步公告源</span>
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void syncReminderSources(true)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    published_with_changes
                  </span>
                  <span>强制同步并重算</span>
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void loadReminderPreview()}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    refresh
                  </span>
                  <span>刷新预览</span>
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={isBusy}
                  onClick={runReminderTasks}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    play_circle
                  </span>
                  <span>运行统一任务</span>
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={isBusy}
                  onClick={refreshReminderDeliveries}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    notifications_active
                  </span>
                  <span>重算投递</span>
                </button>
              </div>

              {reminderPreview ? (
                <>
                  <div className="admin-report-summary" aria-label="运营提醒投递摘要">
                    <ReportMetric label="提醒候选" value={reminderPreview.summary.candidateCount} />
                    <ReportMetric
                      label="当前生效"
                      value={reminderPreview.summary.activeCandidateCount}
                    />
                    <ReportMetric
                      label="未来生效"
                      value={reminderPreview.summary.scheduledCandidateCount}
                    />
                    <ReportMetric
                      label="目标用户"
                      value={reminderPreview.summary.targetUserCount}
                    />
                    <ReportMetric
                      label="有订阅用户"
                      value={reminderPreview.summary.subscribedTargetUserCount}
                      tone={
                        reminderPreview.summary.targetUserCount > 0 &&
                        reminderPreview.summary.subscribedTargetUserCount === 0
                          ? 'warning'
                          : 'ok'
                      }
                    />
                    <ReportMetric label="待投递" value={reminderPreview.summary.queuedCount} />
                    <ReportMetric label="跳过" value={reminderPreview.summary.skippedCount} />
                    <ReportMetric label="已取消" value={reminderPreview.summary.cancelledCount} />
                  </div>

                  {reminderPreview.taskRun ? (
                    <div className="admin-report-summary" aria-label="最近统一任务结果">
                      <ReportMetric
                        label="事件重放"
                        value={reminderPreview.taskRun.events.dispatched}
                        tone={reminderPreview.taskRun.events.failed > 0 ? 'warning' : 'ok'}
                      />
                      <ReportMetric
                        label="通知处理"
                        value={reminderPreview.taskRun.notifications.processed}
                      />
                      <ReportMetric
                        label="通知失败"
                        value={reminderPreview.taskRun.notifications.failed}
                        tone={reminderPreview.taskRun.notifications.failed > 0 ? 'warning' : 'ok'}
                      />
                      <ReportMetric
                        label="过期订单"
                        value={reminderPreview.taskRun.ticketing.expiredOrderCount}
                      />
                      <ReportMetric
                        label="过期占座"
                        value={reminderPreview.taskRun.ticketing.expiredHoldCount}
                      />
                    </div>
                  ) : null}

                  <div className="admin-report-grid">
                    {reminderPreview.taskRun ? (
                      <PreviewListCard
                        title="最近统一任务"
                        emptyText="尚未运行统一内部任务。"
                        items={reminderPreview.taskRunHistory.map((taskRun) => ({
                          id: taskRun.processedAt,
                          title: `${describeReminderTaskRunStatus(taskRun.status)} · ${formatDateTime(
                            taskRun.processedAt,
                          )}`,
                          meta: [
                            taskRun.actorId
                              ? `${taskRun.actorType === 'admin' ? '管理员' : '系统'} ${taskRun.actorId}`
                              : taskRun.actorType === 'admin'
                                ? '管理员触发'
                                : '系统触发',
                            `公告 ${describeReminderTaskSourceStatus(taskRun.operationsReminders.status)}`,
                            `内容 ${describeContentReminderTaskSourceStatus(
                              taskRun.contentOperationsReminders.status,
                            )}`,
                            `事件处理 ${taskRun.events.processed}`,
                            `通知 ${taskRun.notifications.processed}`,
                          ].join(' · '),
                          body: describeReminderTaskRunBody(taskRun),
                        }))}
                      />
                    ) : null}
                    <PreviewListCard
                      title="提醒源状态"
                      emptyText="当前没有提醒源状态。"
                      items={reminderPreview.sourceStates.map((sourceState) => ({
                        id: sourceState.sourceKey,
                        title: describeReminderSourceStateTitle(sourceState),
                        meta: describeReminderSourceStateMeta(sourceState),
                        body: describeReminderSourceStateBody(sourceState),
                      }))}
                    />
                    <PreviewListCard
                      title="提醒候选"
                      emptyText="当前没有可用于投递的运营提醒候选。"
                      items={reminderPreview.candidates.map((candidate) => ({
                        id: candidate.id,
                        title: candidate.title,
                        meta: describeReminderCandidateMeta(candidate),
                        body: describeReminderCandidateCounts(candidate.deliveryCounts),
                      }))}
                    />
                    <PreviewListCard
                      title="用户预览"
                      emptyText="当前没有可用于运营提醒的账号偏好记录。"
                      items={reminderPreview.users.map((user) => ({
                        id: user.userId,
                        title: user.userId,
                        meta: describeReminderPreviewUser(user),
                        body: user.lastDeliveryAt
                          ? `最近写入 ${formatDateTime(user.lastDeliveryAt)}`
                          : undefined,
                      }))}
                    />
                    <PreviewListCard
                      title="最近投递"
                      emptyText="当前没有运营提醒投递记录。"
                      items={reminderPreview.deliveries.slice(0, 12).map((delivery) => ({
                        id: delivery.deliveryId,
                        title: `${delivery.payload.title} -> ${delivery.userId}`,
                        meta: `${describePushDeliveryStatus(delivery.status)} · ${formatDateTime(
                          delivery.createdAt,
                        )}`,
                        body: delivery.lastErrorMessage ?? delivery.payload.url,
                      }))}
                    />
                  </div>
                </>
              ) : (
                <p className="muted">尚未加载运营提醒投递预览。</p>
              )}
            </section>
          )}
        </section>
      ) : null}

      {isReminderEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={resetReminderEditor}>
          <section
            className="modal-panel admin-reminder-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="编辑首页强提醒规则"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {editingReminderId ? (
              <p className="muted">{`当前正在编辑 ${editingReminderId.slice(-8).toUpperCase()} 规则`}</p>
            ) : null}
            <label>
              <span>来源</span>
              <select
                value={reminderSourceKind}
                onChange={(event) =>
                  setReminderSourceKind(
                    event.currentTarget.value as OperationsStrongReminderRule['sourceKind'],
                  )
                }
              >
                <option value="manual">手动录入</option>
                <option value="content">关联内容</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(event) => setReminderEnabled(event.currentTarget.checked)}
              />
              <span>启用这条强提醒</span>
            </label>
            <label>
              <span>语义色</span>
              <select
                value={reminderTone}
                onChange={(event) =>
                  setReminderTone(
                    event.currentTarget.value as NonNullable<OperationsStrongReminderRule['tone']>,
                  )
                }
              >
                {reminderToneOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>排序</span>
              <input
                type="number"
                step="1"
                value={reminderSortOrderValue}
                onChange={(event) => setReminderSortOrderValue(event.currentTarget.value)}
                placeholder="数值越小越靠前"
              />
            </label>
            <label>
              <span>标签</span>
              <input
                value={reminderLabel}
                onChange={(event) => setReminderLabel(event.currentTarget.value)}
                placeholder="如 地铁运营 / 客运调整"
              />
            </label>
            <label>
              <span>关联内容</span>
              <input
                list="admin-operations-reminder-content-options"
                value={reminderContentId}
                disabled={reminderSourceKind !== 'content'}
                onChange={(event) => setReminderContentId(event.currentTarget.value)}
                placeholder="可输入本地内容 ID，也可从下方建议中选择"
              />
              <datalist id="admin-operations-reminder-content-options">
                {sortedRecords.map((record) => (
                  <option
                    value={record.contentId}
                    label={`${record.revision.title}（${statusLabel(record)}）`}
                    key={record.contentId}
                  />
                ))}
              </datalist>
            </label>
            <label>
              <span>{reminderSourceKind === 'content' ? '标题覆盖' : '标题'}</span>
              <input
                value={reminderTitle}
                onChange={(event) => setReminderTitle(event.currentTarget.value)}
                placeholder={
                  reminderSourceKind === 'content'
                    ? '留空则使用关联内容标题'
                    : '如 今晚地铁加开列车'
                }
              />
            </label>
            <label className="admin-editor-markdown">
              <span>{reminderSourceKind === 'content' ? '摘要覆盖' : '摘要'}</span>
              <textarea
                value={reminderSummary}
                onChange={(event) => setReminderSummary(event.currentTarget.value)}
                placeholder={
                  reminderSourceKind === 'content'
                    ? '留空则使用关联内容摘要'
                    : '适合放 1 到 2 句，说明这条提醒为什么重要'
                }
              />
            </label>
            <label>
              <span>跳转链接</span>
              <input
                value={reminderHref}
                onChange={(event) => setReminderHref(event.currentTarget.value)}
                placeholder="/operations/xxx 或 https://..."
              />
            </label>
            <label>
              <span>开始时间</span>
              <input
                type="datetime-local"
                value={reminderStartsAtValue}
                onChange={(event) => setReminderStartsAtValue(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>结束时间</span>
              <input
                type="datetime-local"
                value={reminderEndsAtValue}
                onChange={(event) => setReminderEndsAtValue(event.currentTarget.value)}
              />
            </label>
            <div className="admin-content-actions">
              <button
                className="secondary-action-button is-primary"
                type="button"
                disabled={isBusy}
                onClick={saveReminderRule}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {editingReminderId ? 'save' : 'add_alert'}
                </span>
                <span>{editingReminderId ? '保存规则' : '新增规则'}</span>
              </button>
              <button type="button" disabled={isBusy} onClick={resetReminderEditor}>
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'assets' ? (
        <>
          <section className="admin-asset-report" aria-labelledby="admin-asset-report-title">
            <div className="section-heading">
              <h2 id="admin-asset-report-title">旧资源差异报告</h2>
              <span className="muted">{legacyAssetStatusText}</span>
            </div>

            {legacyAssetManifest ? (
              <>
                <div className="admin-report-summary" aria-label="旧资源摘要">
                  <ReportMetric label="内容" value={legacyAssetManifest.summary.contentCount} />
                  <ReportMetric
                    label="唯一引用"
                    value={legacyAssetManifest.summary.referenceCount}
                  />
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
                    tone={
                      (legacyDownloadReport?.report?.summary.failed ?? 0) > 0 ? 'warning' : 'ok'
                    }
                  />
                  <ReportMetric
                    label="素材记录"
                    value={legacyContentAssets?.summary.assetCount ?? 0}
                  />
                  <ReportMetric
                    label="待审核素材"
                    value={legacyContentAssets?.summary.pendingReviewCount ?? 0}
                    tone={
                      (legacyContentAssets?.summary.pendingReviewCount ?? 0) > 0 ? 'warning' : 'ok'
                    }
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
        </>
      ) : null}

      {activeSection === 'audit' ? (
        <section className="admin-content-board" aria-labelledby="admin-audit-title">
          <div className="section-heading">
            <h2 id="admin-audit-title">审计事件</h2>
            <span className="muted">{auditStatusText}</span>
          </div>
          <div className="admin-report-summary" aria-label="后台事件摘要">
            <ReportMetric label="最近事件" value={auditEvents.length} />
            <ReportMetric label="待派发" value={auditEventStatusCounts.queued} />
            <ReportMetric
              label="已派发"
              value={auditEventStatusCounts.dispatched}
              tone={auditEventStatusCounts.dispatched > 0 ? 'ok' : undefined}
            />
            <ReportMetric
              label="失败"
              value={auditEventStatusCounts.failed}
              tone={auditEventStatusCounts.failed > 0 ? 'warning' : undefined}
            />
          </div>
          <div className="admin-poi-toolbar admin-content-toolbar" aria-label="后台审计筛选">
            <label>
              <span>状态</span>
              <select
                value={auditStatusFilter}
                onChange={(event) =>
                  setAuditStatusFilter(event.currentTarget.value as AdminAuditStatusFilter)
                }
              >
                {auditStatusFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-poi-search">
              <span>事件类型</span>
              <input
                list="admin-audit-event-types"
                value={auditTypeFilter}
                onChange={(event) => setAuditTypeFilter(event.currentTarget.value)}
                placeholder="Published / Reviewed / Updated"
              />
            </label>
            <label className="admin-poi-search">
              <span>实体</span>
              <input
                value={auditEntityFilter}
                onChange={(event) => setAuditEntityFilter(event.currentTarget.value)}
                placeholder="contentId / poiId / revisionId"
              />
            </label>
            <label className="admin-poi-search">
              <span>操作者</span>
              <input
                value={auditActorFilter}
                onChange={(event) => setAuditActorFilter(event.currentTarget.value)}
                placeholder="admin 或用户 ID"
              />
            </label>
            <label className="admin-poi-search">
              <span>关键词</span>
              <input
                value={auditSearchText}
                onChange={(event) => setAuditSearchText(event.currentTarget.value)}
                placeholder="事件名、载荷字段、状态"
              />
            </label>
            <button
              type="button"
              disabled={!hasActiveAuditFilters}
              onClick={() => {
                setAuditStatusFilter('all');
                setAuditTypeFilter('');
                setAuditEntityFilter('');
                setAuditActorFilter('');
                setAuditSearchText('');
              }}
            >
              清空筛选
            </button>
            <datalist id="admin-audit-event-types">
              {auditEventTypeOptions.map((eventType) => (
                <option value={eventType} key={eventType} />
              ))}
            </datalist>
          </div>
          <div className="admin-toolbar">
            <button
              className="secondary-action-button"
              type="button"
              disabled={isBusy}
              onClick={() => void loadAuditEvents()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
              </span>
              <span>刷新审计</span>
            </button>
          </div>
          <div className="admin-content-list" aria-label="后台审计事件列表">
            {auditEvents.map((event) => (
              <article className="admin-content-item admin-audit-event-item" key={event.eventId}>
                <div>
                  <strong>{event.type}</strong>
                  <p className="muted">
                    {describeAuditEventStatus(event.status)} · {describeAuditActor(event.actor)} ·
                    发生 {formatDateTime(event.occurredAt)} · 尝试 {event.attempts}
                  </p>
                  <p className="muted">{describeAuditPayload(event.payload)}</p>
                  {event.lastErrorMessage ? (
                    <p className="muted">{`错误：${event.lastErrorMessage}`}</p>
                  ) : null}
                </div>
                <span className={`admin-audit-status is-${event.status}`}>
                  {describeAuditEventStatus(event.status)}
                </span>
              </article>
            ))}
            {auditEvents.length === 0 ? (
              <div className="admin-content-empty">
                <p className="muted">
                  {hasActiveAuditFilters ? '当前筛选下暂无后台审计事件。' : '暂无后台审计事件。'}
                </p>
                <button type="button" onClick={() => void loadAuditEvents()}>
                  重新读取
                </button>
                {hasActiveAuditFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditStatusFilter('all');
                      setAuditTypeFilter('');
                      setAuditEntityFilter('');
                      setAuditActorFilter('');
                      setAuditSearchText('');
                    }}
                  >
                    清空筛选
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeSection === 'contents' ? (
        <section className="admin-content-board" aria-labelledby="admin-content-records-title">
          <div className="section-heading">
            <h2 id="admin-content-records-title">内容记录</h2>
            <span className="muted">{`${filteredContentRecords.length} / ${records.length} 条`}</span>
          </div>
          <div className="admin-report-summary" aria-label="内容后台待办总览">
            {contentDashboardMetrics.map((metric) => (
              <ReportMetric
                label={metric.label}
                value={metric.value}
                tone={metric.tone}
                key={metric.label}
              />
            ))}
          </div>
          <div className="admin-toolbar">
            <button
              className="secondary-action-button is-primary"
              type="button"
              disabled={isBusy}
              onClick={openCreateContentEditor}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add
              </span>
              <span>{editingContentId ? '继续编辑内容' : '新建内容'}</span>
            </button>
          </div>
          <div className="admin-content-bulk-bar" aria-label="内容批量操作">
            <label className="checkbox-row admin-content-bulk-select">
              <input
                type="checkbox"
                checked={isAllVisibleContentSelected}
                disabled={filteredContentRecords.length === 0}
                onChange={toggleVisibleContentSelection}
              />
              <span>{`选择当前列表 ${selectedVisibleContentRecords.length}/${filteredContentRecords.length}`}</span>
            </label>
            <span className="muted">{`已选 ${selectedContentRecords.length} 条，可提交 ${batchSubmitContentRecords.length} 条，可归档 ${batchArchiveContentRecords.length} 条`}</span>
            <button
              type="button"
              disabled={isBusy || batchSubmitContentRecords.length === 0}
              onClick={() => void runBatchContentAction(batchSubmitContentRecords, 'submit')}
            >
              批量提交审核
            </button>
            <button
              type="button"
              disabled={isBusy || batchArchiveContentRecords.length === 0}
              onClick={() => setBulkArchiveTargets(batchArchiveContentRecords)}
            >
              批量归档
            </button>
            <button
              type="button"
              disabled={isBusy || selectedContentRecords.length === 0}
              onClick={clearContentSelection}
            >
              清空选择
            </button>
          </div>
          <div className="admin-poi-toolbar admin-content-toolbar" aria-label="内容记录筛选">
            <label>
              <span>状态</span>
              <select
                value={contentStatusFilter}
                onChange={(event) =>
                  setContentStatusFilter(event.currentTarget.value as AdminContentStatusFilter)
                }
              >
                {contentStatusFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>分类</span>
              <select
                value={contentCategoryFilter}
                onChange={(event) => setContentCategoryFilter(event.currentTarget.value)}
              >
                <option value="all">全部分类</option>
                {contentCategoryOptions.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-poi-search">
              <span>关键词</span>
              <input
                value={contentSearchText}
                onChange={(event) => setContentSearchText(event.currentTarget.value)}
                placeholder="标题、摘要、标签、内容 ID"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setContentStatusFilter('all');
                setContentCategoryFilter('all');
                setContentSearchText('');
              }}
            >
              清空筛选
            </button>
          </div>
          <div className="admin-content-list" aria-label="内容记录">
            {filteredContentRecords.map((record) => {
              const reviewPreview =
                contentReviewPreviewById.get(record.contentId) ??
                buildContentPublishPreview(record, assetRecordById, {
                  includeStatusBlocker: false,
                });

              return (
                <article
                  className="admin-content-item admin-content-record-item"
                  key={record.contentId}
                >
                  <label className="admin-content-select">
                    <input
                      type="checkbox"
                      checked={selectedContentIds.has(record.contentId)}
                      onChange={() => toggleContentRecordSelection(record.contentId)}
                      aria-label={`选择内容 ${record.revision.title}`}
                    />
                  </label>
                  <div>
                    <strong>{record.revision.title}</strong>
                    <p className="muted">
                      {record.revision.categoryId} · {statusLabel(record)}
                      {record.revision.publishedAt
                        ? ` · ${record.revision.publishedAt.slice(0, 10)}`
                        : ''}
                      {record.metadata.expiresAt
                        ? ` · 有效至 ${record.metadata.expiresAt.slice(0, 10)}`
                        : ''}
                      {record.metadata.showInBanner
                        ? ` · 重点${
                            record.metadata.bannerSortOrder !== undefined
                              ? `#${record.metadata.bannerSortOrder}`
                              : ''
                          }`
                        : ''}
                      {record.metadata.customTags?.length
                        ? ` · 标签 ${record.metadata.customTags.join(' / ')}`
                        : ''}
                    </p>
                    {record.revision.reviewReason ? (
                      <p className="muted">{`驳回原因：${record.revision.reviewReason}`}</p>
                    ) : null}
                    <ContentReviewSnapshot preview={reviewPreview} />
                  </div>
                  <div className="admin-content-actions">
                    <button
                      type="button"
                      disabled={
                        isBusy ||
                        record.revision.status === 'archived' ||
                        editingContentId === record.contentId
                      }
                      onClick={() => loadRecordToEditor(record)}
                    >
                      编辑
                    </button>
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
                      onClick={() => openRejectDialog(record)}
                    >
                      驳回
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || record.revision.status !== 'approved'}
                      onClick={() => openPublishDialog(record)}
                    >
                      发布
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || record.revision.status === 'archived'}
                      onClick={() => openArchiveDialog(record)}
                    >
                      归档
                    </button>
                  </div>
                </article>
              );
            })}
            {filteredContentRecords.length === 0 ? (
              <div className="admin-content-empty">
                <p className="muted">没有符合当前筛选条件的内容记录。</p>
                <button
                  type="button"
                  onClick={() => {
                    setContentStatusFilter('all');
                    setContentCategoryFilter('all');
                    setContentSearchText('');
                  }}
                >
                  查看全部内容
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {publishTarget ? (
        <ContentPublishDialog
          assetRecordById={assetRecordById}
          isBusy={isBusy}
          record={publishTarget}
          onClose={() => setPublishTarget(null)}
          onSubmit={async (input) => {
            await runAction(publishTarget.contentId, 'publish', input);
          }}
        />
      ) : null}
      {rejectTarget ? (
        <ContentRejectDialog
          isBusy={isBusy}
          record={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (reason) => {
            const success = await runAction(rejectTarget.contentId, 'reject', { reason });
            if (success) {
              setRejectTarget(null);
            }
          }}
        />
      ) : null}
      {archiveTarget ? (
        <ContentArchiveDialog
          isBusy={isBusy}
          record={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onSubmit={async () => {
            const success = await runAction(archiveTarget.contentId, 'archive');
            if (success) {
              setArchiveTarget(null);
            }
          }}
        />
      ) : null}
      {bulkArchiveTargets ? (
        <ContentBulkArchiveDialog
          isBusy={isBusy}
          records={bulkArchiveTargets}
          onClose={() => setBulkArchiveTargets(null)}
          onSubmit={async () => {
            const success = await runBatchContentAction(bulkArchiveTargets, 'archive');
            if (success) {
              setBulkArchiveTargets(null);
            }
          }}
        />
      ) : null}
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

function PreviewListCard({
  title,
  items,
  emptyText,
}: Readonly<{
  title: string;
  items: Array<{ id: string; title: string; meta: string; body?: string }>;
  emptyText: string;
}>) {
  return (
    <section className="admin-preview-card" aria-label={title}>
      <h4>{title}</h4>
      <div className="admin-preview-list">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="admin-preview-item" key={item.id}>
              <strong>{item.title}</strong>
              <p className="muted">{item.meta}</p>
              {item.body ? <p>{item.body}</p> : null}
            </article>
          ))
        ) : (
          <p className="muted">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

const contentRejectReasonPresets = [
  '标题或正文信息不足',
  '分类不准确',
  '素材未审核通过',
  '发布时间或有效期需要调整',
  '不适合进入首页重点位',
];

function ContentRejectDialog({
  isBusy,
  record,
  onClose,
  onSubmit,
}: Readonly<{
  isBusy: boolean;
  record: AdminContentRecord;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}>) {
  const [reason, setReason] = useState(record.revision.reviewReason ?? '');
  const [error, setError] = useState('');

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('请填写驳回原因，方便编辑人员回到草稿后修正。');
      return;
    }

    await onSubmit(trimmedReason);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-poi-reject-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-content-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-content-reject-title">驳回内容</h2>
          <span className="muted">{record.revision.title}</span>
        </div>
        <div className="admin-poi-reject-presets" aria-label="常用驳回原因">
          {contentRejectReasonPresets.map((preset) => (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setReason(preset);
                setError('');
              }}
              key={preset}
            >
              {preset}
            </button>
          ))}
        </div>
        <label>
          <span>驳回原因</span>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setError('');
            }}
          />
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" disabled={isBusy} onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={isBusy} onClick={() => void submit()}>
            确认驳回
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentArchiveDialog({
  isBusy,
  record,
  onClose,
  onSubmit,
}: Readonly<{
  isBusy: boolean;
  record: AdminContentRecord;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}>) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!confirmed) {
      setError('请先确认归档影响。');
      return;
    }

    await onSubmit();
  };

  const isPublished = record.revision.status === 'published';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-content-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-content-archive-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-content-archive-title">归档内容</h2>
          <span className="muted">{record.revision.title}</span>
        </div>
        <p className="muted">归档后内容会离开当前工作流；已发布内容归档后不再作为公开内容返回。</p>
        <dl className="admin-content-publish-summary">
          <div>
            <dt>当前状态</dt>
            <dd>{statusLabel(record)}</dd>
          </div>
          <div>
            <dt>分类</dt>
            <dd>{record.revision.categoryId}</dd>
          </div>
          <div>
            <dt>发布时间</dt>
            <dd>
              {record.revision.publishedAt ? formatDateTime(record.revision.publishedAt) : '未发布'}
            </dd>
          </div>
          <div>
            <dt>有效期</dt>
            <dd>
              {record.metadata.expiresAt ? formatDateTime(record.metadata.expiresAt) : '未设置'}
            </dd>
          </div>
        </dl>
        {isPublished ? (
          <div className="admin-content-publish-warnings" aria-label="归档提醒">
            <p>
              {isScheduledPublishedContentRecord(record)
                ? '这是一条未来定时发布内容，归档后定时上线计划会失效。'
                : '这是一条已公开内容，归档后前台将不再展示。'}
            </p>
          </div>
        ) : null}
        <label className="checkbox-row admin-content-publish-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.currentTarget.checked);
              setError('');
            }}
          />
          <span>我已确认归档影响，继续归档这条内容。</span>
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" disabled={isBusy} onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={isBusy} onClick={() => void submit()}>
            确认归档
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentBulkArchiveDialog({
  isBusy,
  records,
  onClose,
  onSubmit,
}: Readonly<{
  isBusy: boolean;
  records: AdminContentRecord[];
  onClose: () => void;
  onSubmit: () => Promise<void>;
}>) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const publishedCount = records.filter((record) => record.revision.status === 'published').length;
  const scheduledCount = records.filter(isScheduledPublishedContentRecord).length;

  const submit = async () => {
    if (!confirmed) {
      setError('请先确认批量归档影响。');
      return;
    }

    await onSubmit();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-content-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-content-bulk-archive-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-content-bulk-archive-title">批量归档内容</h2>
          <span className="muted">{`${records.length} 条内容`}</span>
        </div>
        <dl className="admin-content-publish-summary">
          <div>
            <dt>归档数量</dt>
            <dd>{records.length}</dd>
          </div>
          <div>
            <dt>已发布</dt>
            <dd>{publishedCount}</dd>
          </div>
          <div>
            <dt>定时发布</dt>
            <dd>{scheduledCount}</dd>
          </div>
          <div>
            <dt>待审核</dt>
            <dd>
              {records.filter((record) => record.revision.status === 'pending_review').length}
            </dd>
          </div>
        </dl>
        {publishedCount > 0 ? (
          <div className="admin-content-publish-warnings" aria-label="批量归档提醒">
            <p>所选内容中包含已发布或定时发布内容，归档后会影响前台公开展示。</p>
          </div>
        ) : null}
        <div className="admin-content-publish-assets" aria-label="批量归档内容样例">
          {records.slice(0, 8).map((record) => (
            <span className="operation-tag" key={record.contentId}>
              {`${record.revision.title} · ${statusLabel(record)}`}
            </span>
          ))}
          {records.length > 8 ? (
            <span className="operation-tag">{`另有 ${records.length - 8} 条`}</span>
          ) : null}
        </div>
        <label className="checkbox-row admin-content-publish-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.currentTarget.checked);
              setError('');
            }}
          />
          <span>我已确认批量归档影响，继续归档这些内容。</span>
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" disabled={isBusy} onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={isBusy} onClick={() => void submit()}>
            确认批量归档
          </button>
        </div>
      </div>
    </div>
  );
}

interface ContentPublishPreview {
  attentionItems: ContentAuditItem[];
  auditTags: ContentAuditTag[];
  approvedAssetCount: number;
  baselinePublishedAt?: string;
  editorialStats: ContentEditorialStats;
  missingAssetIds: string[];
  blockers: string[];
  diffItems: string[];
  diffSummaryText: string;
  reviewPendingAssetIds: string[];
  rejectedAssetIds: string[];
  summaryText: string;
  totalAssetCount: number;
  warnings: string[];
}

type ContentAuditTone = 'default' | 'ok' | 'warning' | 'danger';

interface ContentAuditTag {
  label: string;
  tone?: ContentAuditTone;
}

interface ContentAuditItem {
  message: string;
  tone: Exclude<ContentAuditTone, 'default'>;
}

interface ContentEditorialStats {
  bodyTextLength: number;
  headingCount: number;
  imageCount: number;
  linkCount: number;
}

function ContentReviewSnapshot({
  preview,
  title,
}: Readonly<{ preview: ContentPublishPreview; title?: string }>) {
  return (
    <section className="admin-content-review-snapshot" aria-label={title ?? '内容审核提示'}>
      {title ? <h3>{title}</h3> : null}
      <div className="operation-tag-list admin-content-review-tags">
        {preview.auditTags.map((tag) => (
          <span
            className={['operation-tag', tag.tone && tag.tone !== 'default' ? `is-${tag.tone}` : '']
              .filter(Boolean)
              .join(' ')}
            key={`${tag.label}-${tag.tone ?? 'default'}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
      {preview.attentionItems.length > 0 ? (
        <div className="admin-content-review-items" aria-label="内容审核提示项">
          {preview.attentionItems.map((item) => (
            <p
              className={`admin-content-review-item is-${item.tone}`}
              key={`${item.tone}-${item.message}`}
            >
              {item.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ContentPublishDialog({
  assetRecordById,
  isBusy,
  record,
  onClose,
  onSubmit,
}: Readonly<{
  assetRecordById: ReadonlyMap<string, AdminContentAssetRecord>;
  isBusy: boolean;
  record: AdminContentRecord;
  onClose: () => void;
  onSubmit: (input: { mode?: 'immediate' | 'scheduled'; scheduledAt?: string }) => Promise<void>;
}>) {
  const preview = useMemo(
    () => buildContentPublishPreview(record, assetRecordById),
    [assetRecordById, record],
  );
  const [mode, setMode] = useState<'immediate' | 'scheduled'>(
    record.revision.scheduledAt ? 'scheduled' : 'immediate',
  );
  const [scheduledAtValue, setScheduledAtValue] = useState(() =>
    toDateTimeLocalInput(record.revision.scheduledAt),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (preview.blockers.length > 0) {
      setError(preview.blockers[0] ?? '当前内容仍存在发布阻塞项。');
      return;
    }

    if (!confirmed) {
      setError('请先确认已核对发布摘要。');
      return;
    }

    if (mode === 'scheduled') {
      const scheduledAt = parseDateTimeLocalInput(scheduledAtValue);
      if (!scheduledAt) {
        setError('请填写有效的定时发布时间。');
        return;
      }

      await onSubmit({ mode, scheduledAt });
      return;
    }

    await onSubmit({ mode });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-content-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-content-publish-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-content-publish-title">发布内容</h2>
          <span className="muted">{record.revision.title}</span>
        </div>
        <p className="muted">
          发布前先核对素材审核、首页重点位、有效期和发布时间，避免管理员点按钮后直接收到 `409`。
        </p>
        <fieldset className="segmented-control admin-content-publish-toggle">
          <legend>上线方式</legend>
          <div>
            <button
              className={mode === 'immediate' ? 'is-active' : ''}
              type="button"
              aria-pressed={mode === 'immediate'}
              onClick={() => {
                setMode('immediate');
                setError('');
              }}
            >
              立即发布
            </button>
            <button
              className={mode === 'scheduled' ? 'is-active' : ''}
              type="button"
              aria-pressed={mode === 'scheduled'}
              onClick={() => {
                setMode('scheduled');
                setError('');
              }}
            >
              定时发布
            </button>
          </div>
        </fieldset>
        {mode === 'scheduled' ? (
          <label>
            <span>定时发布时间</span>
            <input
              type="datetime-local"
              value={scheduledAtValue}
              onChange={(event) => {
                setScheduledAtValue(event.currentTarget.value);
                setError('');
              }}
            />
          </label>
        ) : null}
        <dl className="admin-content-publish-summary">
          <div>
            <dt>素材</dt>
            <dd>{preview.summaryText}</dd>
          </div>
          <div>
            <dt>分类</dt>
            <dd>{record.revision.categoryId}</dd>
          </div>
          <div>
            <dt>首页重点位</dt>
            <dd>
              {record.metadata.showInBanner
                ? `是${record.metadata.bannerSortOrder !== undefined ? ` · 排序 #${record.metadata.bannerSortOrder}` : ''}`
                : '否'}
            </dd>
          </div>
          <div>
            <dt>有效期</dt>
            <dd>
              {record.metadata.expiresAt ? formatDateTime(record.metadata.expiresAt) : '未设置'}
            </dd>
          </div>
          <div>
            <dt>发布时间</dt>
            <dd>
              {mode === 'scheduled' && scheduledAtValue
                ? formatDateTimeLocalPreview(scheduledAtValue)
                : '立即生效'}
            </dd>
          </div>
          <div>
            <dt>上次发布</dt>
            <dd>
              {preview.baselinePublishedAt
                ? formatDateTime(preview.baselinePublishedAt)
                : '无历史快照'}
            </dd>
          </div>
          <div>
            <dt>发布差异</dt>
            <dd>{preview.diffSummaryText}</dd>
          </div>
        </dl>
        <div className="admin-content-publish-diff" aria-label="发布差异摘要">
          {preview.diffItems.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
        {preview.blockers.length > 0 ? (
          <div className="admin-content-publish-blockers" aria-label="发布阻塞项">
            {preview.blockers.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}
        {preview.warnings.length > 0 ? (
          <div className="admin-content-publish-warnings" aria-label="发布提醒">
            {preview.warnings.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}
        {preview.totalAssetCount > 0 ? (
          <div className="admin-content-publish-assets" aria-label="素材审核状态">
            {record.revision.assetIds.map((assetId) => {
              const assetRecord = assetRecordById.get(assetId);
              return (
                <span className="operation-tag" key={assetId}>
                  {assetRecord
                    ? `${assetRecord.asset.fileName} · ${statusLabelForAsset(assetRecord.asset.status)}`
                    : `${assetId} · 未找到`}
                </span>
              );
            })}
          </div>
        ) : null}
        <label className="checkbox-row admin-content-publish-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.currentTarget.checked);
              setError('');
            }}
          />
          <span>我已核对内容、素材和发布时间，确认可以进入公开首页。</span>
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="button" onClick={() => void submit()} disabled={isBusy}>
            确认发布
          </button>
        </div>
      </div>
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

function formatDateTime(value: string | undefined): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '未生成';
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

function describeAuditEventStatus(status: AdminAuditEventRecord['status']): string {
  const labels: Record<AdminAuditEventRecord['status'], string> = {
    queued: '待派发',
    dispatched: '已派发',
    failed: '失败',
  };

  return labels[status];
}

function describeAuditActor(actor: AdminAuditEventRecord['actor']): string {
  return actor.id ? `${actor.type} ${actor.id}` : actor.type;
}

function describeAuditPayload(payload: Record<string, unknown>): string {
  const preferredKeys = [
    'contentId',
    'poiId',
    'revisionId',
    'datasetId',
    'scheduleServiceId',
    'serviceEntryId',
    'title',
    'categoryId',
    'decision',
    'publishedAt',
    'archivedAt',
  ];
  const parts = preferredKeys
    .flatMap((key) => {
      const value = payload[key];
      if (value === undefined || value === null || typeof value === 'object') {
        return [];
      }

      return `${key}: ${String(value)}`;
    })
    .slice(0, 5);

  if (parts.length > 0) {
    return parts.join(' · ');
  }

  const source = JSON.stringify(payload);
  return source.length > 160 ? `${source.slice(0, 160)}...` : source;
}

function describeAuditFilterSummary(input: {
  status: AdminAuditStatusFilter;
  type: string;
  entityId: string;
  actorId: string;
  search: string;
}): string {
  const parts = [
    input.status !== 'all' ? `状态 ${describeAuditStatusFilterLabel(input.status)}` : '',
    input.type.trim() ? `类型 ${input.type.trim()}` : '',
    input.entityId.trim() ? `实体 ${input.entityId.trim()}` : '',
    input.actorId.trim() ? `操作者 ${input.actorId.trim()}` : '',
    input.search.trim() ? `关键词 ${input.search.trim()}` : '',
  ].filter(Boolean);

  return parts.join(' · ');
}

function describeAuditStatusFilterLabel(status: AdminAuditStatusFilter): string {
  if (status === 'all') {
    return '全部状态';
  }

  return describeAuditEventStatus(status);
}

function recordMatchesContentSearch(
  record: AdminContentRecord,
  normalizedSearchText: string,
): boolean {
  if (!normalizedSearchText) {
    return true;
  }

  const searchableText = [
    record.contentId,
    record.revision.id,
    record.revision.title,
    record.revision.categoryId,
    record.metadata.excerpt,
    record.revision.markdown,
    record.revision.reviewReason,
    ...(record.metadata.customTags ?? []),
    ...(record.revision.assetIds ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  return searchableText.includes(normalizedSearchText);
}

function isScheduledPublishedContentRecord(record: AdminContentRecord): boolean {
  if (record.revision.status !== 'published' || !record.revision.publishedAt) {
    return false;
  }

  const publishedAt = new Date(record.revision.publishedAt).getTime();
  return Number.isFinite(publishedAt) && publishedAt > Date.now();
}

function isExpiredContentRecord(record: AdminContentRecord): boolean {
  if (!record.metadata.expiresAt || record.revision.status === 'archived') {
    return false;
  }

  const expiresAt = new Date(record.metadata.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
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

function extractContentAssetReferencePaths(markdown: string): string[] {
  const matches = markdown.match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g) ?? [];
  return matches
    .map((entry) => /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(entry)?.[1]?.trim() ?? '')
    .filter(Boolean);
}

function mergeUniqueStringValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildContentAssetReferenceKeys(value: string): string[] {
  const normalized = normalizeContentAssetReferencePath(value);
  const original = value.trim();
  return mergeUniqueStringValues([original, normalized]);
}

function normalizeContentAssetReferencePath(value: string): string {
  try {
    const pathname = new URL(value, 'https://yct.local').pathname;
    for (const prefix of ['/content-assets/', '/legacy-assets/']) {
      const basePrefix = appBasePath ? `${appBasePath}${prefix}` : '';
      if (basePrefix && pathname.startsWith(basePrefix)) {
        return pathname.slice(appBasePath.length);
      }

      if (pathname.startsWith(prefix)) {
        return pathname;
      }
    }

    return pathname;
  } catch {
    return value.trim();
  }
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

function statusLabel(record: AdminContentRecord): string {
  if (
    record.revision.status === 'published' &&
    record.revision.publishedAt &&
    new Date(record.revision.publishedAt).getTime() > Date.now()
  ) {
    return '定时发布';
  }

  const labels: Record<AdminContentRecord['revision']['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };

  return labels[record.revision.status];
}

function buildContentPublishPreview(
  record: AdminContentRecord,
  assetRecordById: ReadonlyMap<string, AdminContentAssetRecord>,
  options: {
    includeStatusBlocker?: boolean;
  } = {},
): ContentPublishPreview {
  const assetRecords = record.revision.assetIds
    .map((assetId) => assetRecordById.get(assetId))
    .filter(Boolean) as AdminContentAssetRecord[];
  const editorialStats = inspectContentMarkdown(record.revision.markdown);
  const hasMeaningfulBody = record.revision.markdown.trim().length > 0;
  const approvedAssetCount = assetRecords.filter(
    (assetRecord) => assetRecord.asset.status === 'approved',
  ).length;
  const reviewPendingAssetIds = assetRecords
    .filter((assetRecord) => assetRecord.asset.status === 'pending_review')
    .map((assetRecord) => assetRecord.asset.fileName || assetRecord.asset.id);
  const rejectedAssetIds = assetRecords
    .filter((assetRecord) => assetRecord.asset.status === 'rejected')
    .map((assetRecord) => assetRecord.asset.fileName || assetRecord.asset.id);
  const missingAssetIds = record.revision.assetIds.filter(
    (assetId) => !assetRecordById.has(assetId),
  );
  const blockers: string[] = [];
  const warnings: string[] = [];

  if ((options.includeStatusBlocker ?? true) && record.revision.status !== 'approved') {
    blockers.push('只有审核通过的内容才允许发布。');
  }
  if (!hasMeaningfulBody) {
    blockers.push('正文为空白内容，请先补充可见正文。');
  }
  if (reviewPendingAssetIds.length > 0) {
    blockers.push(`仍有 ${reviewPendingAssetIds.length} 个素材待审核。`);
  }
  if (rejectedAssetIds.length > 0) {
    blockers.push(`仍有 ${rejectedAssetIds.length} 个素材已驳回。`);
  }
  if (missingAssetIds.length > 0) {
    blockers.push(`引用了 ${missingAssetIds.length} 个不存在的素材记录。`);
  }
  if (record.metadata.expiresAt && new Date(record.metadata.expiresAt).getTime() <= Date.now()) {
    warnings.push('当前内容有效期已过，发布后首页可能立刻视为过期。');
  }
  if (!record.metadata.excerpt?.trim()) {
    warnings.push('未填写摘要，首页卡片信息会偏弱。');
  }
  if (
    record.metadata.showInBanner &&
    !record.metadata.coverImageUrl?.trim() &&
    !record.metadata.coverColor?.trim()
  ) {
    warnings.push('已设为首页重点候选，但未配置封面图或封面色。');
  }
  if (
    editorialStats.bodyTextLength > 0 &&
    editorialStats.bodyTextLength < 80 &&
    editorialStats.imageCount === 0
  ) {
    warnings.push(`正文仅 ${editorialStats.bodyTextLength} 字，公开页信息可能偏少。`);
  }
  const diff = buildContentPublishDiff(record);
  const attentionItems = [
    ...blockers.map((message) => ({ message, tone: 'danger' as const })),
    ...warnings.map((message) => ({ message, tone: 'warning' as const })),
  ];
  const auditTags = buildContentAuditTags({
    approvedAssetCount,
    editorialStats,
    record,
    reviewPendingAssetCount: reviewPendingAssetIds.length,
    rejectedAssetCount: rejectedAssetIds.length,
    missingAssetCount: missingAssetIds.length,
    warningCount: warnings.length,
    blockerCount: blockers.length,
  });

  return {
    attentionItems,
    auditTags,
    approvedAssetCount,
    baselinePublishedAt: diff.baselinePublishedAt,
    editorialStats,
    blockers,
    diffItems: diff.items,
    diffSummaryText: diff.summaryText,
    missingAssetIds,
    rejectedAssetIds,
    reviewPendingAssetIds,
    summaryText:
      record.revision.assetIds.length > 0
        ? `${approvedAssetCount}/${record.revision.assetIds.length} 个素材已通过`
        : editorialStats.imageCount > 0
          ? `正文含 ${editorialStats.imageCount} 张图片，尚未挂素材记录`
          : '正文未引用素材',
    totalAssetCount: record.revision.assetIds.length,
    warnings,
  };
}

function buildContentAuditTags(input: {
  record: AdminContentRecord;
  editorialStats: ContentEditorialStats;
  approvedAssetCount: number;
  reviewPendingAssetCount: number;
  rejectedAssetCount: number;
  missingAssetCount: number;
  warningCount: number;
  blockerCount: number;
}): ContentAuditTag[] {
  const tags: ContentAuditTag[] = [];
  if (input.blockerCount > 0) {
    tags.push({ label: `局部阻塞 ${input.blockerCount}`, tone: 'danger' });
  } else if (input.warningCount > 0) {
    tags.push({ label: `建议补资料 ${input.warningCount}`, tone: 'warning' });
  } else {
    tags.push({ label: '局部检查通过', tone: 'ok' });
  }

  tags.push({
    label:
      input.editorialStats.bodyTextLength > 0
        ? `正文 ${input.editorialStats.bodyTextLength} 字`
        : '正文无可见文字',
    tone: input.editorialStats.bodyTextLength > 0 ? 'default' : 'warning',
  });

  if (input.editorialStats.headingCount > 0) {
    tags.push({ label: `小标题 ${input.editorialStats.headingCount}` });
  }

  if (input.editorialStats.linkCount > 0) {
    tags.push({ label: `链接 ${input.editorialStats.linkCount}` });
  }

  if (input.editorialStats.imageCount > 0) {
    tags.push({ label: `正文图片 ${input.editorialStats.imageCount}` });
  }

  if (input.record.revision.assetIds.length > 0) {
    tags.push({
      label: `素材 ${input.approvedAssetCount}/${input.record.revision.assetIds.length} 已通过`,
      tone:
        input.rejectedAssetCount > 0 || input.missingAssetCount > 0
          ? 'danger'
          : input.reviewPendingAssetCount > 0
            ? 'warning'
            : 'ok',
    });
  } else if (input.editorialStats.imageCount > 0) {
    tags.push({ label: '正文图片未挂素材', tone: 'warning' });
  } else {
    tags.push({ label: '未挂素材' });
  }

  if (input.record.metadata.showInBanner) {
    tags.push({
      label:
        input.record.metadata.bannerSortOrder !== undefined
          ? `首页重点 #${input.record.metadata.bannerSortOrder}`
          : '首页重点候选',
      tone:
        input.record.metadata.coverImageUrl?.trim() || input.record.metadata.coverColor?.trim()
          ? 'default'
          : 'warning',
    });
  }

  if (isExpiredContentRecord(input.record)) {
    tags.push({ label: '已过期', tone: 'warning' });
  }

  return tags;
}

function inspectContentMarkdown(markdown: string): ContentEditorialStats {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
  const headingCount = normalizedMarkdown.match(/^#{1,6}\s+/gm)?.length ?? 0;
  const imageCount =
    normalizedMarkdown.match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)?.length ?? 0;
  const linkCount =
    normalizedMarkdown.match(/(?<!!)\[[^\]]+]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)?.length ?? 0;
  const bodyTextLength = stripMarkdownForAudit(normalizedMarkdown).length;

  return {
    bodyTextLength,
    headingCount,
    imageCount,
    linkCount,
  };
}

function stripMarkdownForAudit(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContentPublishDiff(record: AdminContentRecord): {
  baselinePublishedAt?: string;
  items: string[];
  summaryText: string;
} {
  const baseline = record.publishHistory?.at(-1);
  if (!baseline) {
    return {
      items: ['首次发布，没有可对比的历史发布快照。'],
      summaryText: '首次发布',
    };
  }

  const items: string[] = [];
  if (baseline.title !== record.revision.title) {
    items.push(`标题：${baseline.title} -> ${record.revision.title}`);
  }
  if (baseline.categoryId !== record.revision.categoryId) {
    items.push(`分类：${baseline.categoryId} -> ${record.revision.categoryId}`);
  }
  if (baseline.markdown !== record.revision.markdown) {
    items.push(`正文长度：${baseline.markdown.length} -> ${record.revision.markdown.length} 字符`);
  }

  const assetDiff = describeStringListDiff(baseline.assetIds, record.revision.assetIds, '素材');
  if (assetDiff) {
    items.push(assetDiff);
  }

  const metadataDiffs = buildContentMetadataDiffs(baseline.metadata, record.metadata);
  items.push(...metadataDiffs);

  return {
    baselinePublishedAt: baseline.publishedAt,
    items: items.length > 0 ? items : ['与上次发布快照一致。'],
    summaryText: items.length > 0 ? `${items.length} 项变化` : '无变化',
  };
}

function buildContentMetadataDiffs(
  baseline: AdminContentMetadata,
  current: AdminContentMetadata,
): string[] {
  const diffs: string[] = [];
  if ((baseline.excerpt ?? '') !== (current.excerpt ?? '')) {
    diffs.push('摘要已变化');
  }
  if (baseline.showInBanner !== current.showInBanner) {
    diffs.push(
      `首页重点位：${baseline.showInBanner ? '是' : '否'} -> ${current.showInBanner ? '是' : '否'}`,
    );
  }
  if ((baseline.bannerSortOrder ?? '') !== (current.bannerSortOrder ?? '')) {
    diffs.push(
      `重点排序：${baseline.bannerSortOrder ?? '未设置'} -> ${current.bannerSortOrder ?? '未设置'}`,
    );
  }
  if ((baseline.coverColor ?? '') !== (current.coverColor ?? '')) {
    diffs.push('封面色已变化');
  }
  if ((baseline.coverImageUrl ?? '') !== (current.coverImageUrl ?? '')) {
    diffs.push('封面图已变化');
  }
  if ((baseline.expiresAt ?? '') !== (current.expiresAt ?? '')) {
    diffs.push(`有效期：${baseline.expiresAt ?? '未设置'} -> ${current.expiresAt ?? '未设置'}`);
  }

  const tagDiff = describeStringListDiff(
    baseline.customTags ?? [],
    current.customTags ?? [],
    '标签',
  );
  if (tagDiff) {
    diffs.push(tagDiff);
  }

  return diffs;
}

function describeStringListDiff(
  baseline: string[],
  current: string[],
  label: string,
): string | null {
  const baselineSet = new Set(baseline);
  const currentSet = new Set(current);
  const added = current.filter((item) => !baselineSet.has(item));
  const removed = baseline.filter((item) => !currentSet.has(item));
  if (added.length === 0 && removed.length === 0) {
    return null;
  }

  return `${label}：新增 ${added.length}，移除 ${removed.length}`;
}

interface ReminderPreviewResponse {
  generatedAt: string;
  sourceStates: Array<{
    sourceKey: string;
    sourceStatus: 'ready' | 'not_configured' | 'unavailable' | 'not_checked';
    candidateCount: number;
    message?: string;
    lastCheckedAt?: string;
    lastChangedAt?: string;
    lastRefreshRequestedAt?: string;
  }>;
  syncResult?: {
    sourceKey: string;
    status: 'changed' | 'unchanged' | 'not_configured' | 'unavailable';
    candidateCount: number;
    currentSignature?: string;
    previousSignature?: string;
    checkedAt: string;
    changedAt?: string;
    refreshRequestedAt?: string;
    refreshTriggered: boolean;
    message?: string;
  };
  taskRun?: {
    processedAt: string;
    status: 'ok' | 'warning';
    statusSummary: string;
    actorType: 'admin' | 'system';
    actorId?: string;
    operationsReminders: {
      sourceKey: string;
      status: 'changed' | 'unchanged' | 'not_configured' | 'unavailable';
      candidateCount: number;
      currentSignature?: string;
      previousSignature?: string;
      checkedAt: string;
      changedAt?: string;
      refreshRequestedAt?: string;
      refreshTriggered: boolean;
      message?: string;
    };
    contentOperationsReminders: {
      sourceKey: string;
      status: 'changed' | 'unchanged';
      candidateCount: number;
      checkedAt: string;
      changedAt?: string;
      refreshRequestedAt?: string;
      refreshTriggered: boolean;
      message?: string;
    };
    events: {
      processed: number;
      dispatched: number;
      failed: number;
    };
    notifications: {
      processed: number;
      sent: number;
      failed: number;
      skipped: number;
      deferred: number;
    };
    ticketing: {
      processedAt: string;
      expiredOrderCount: number;
      expiredHoldCount: number;
    };
  };
  taskRunHistory: Array<{
    processedAt: string;
    status: 'ok' | 'warning';
    statusSummary: string;
    actorType: 'admin' | 'system';
    actorId?: string;
    operationsReminders: {
      sourceKey: string;
      status: 'changed' | 'unchanged' | 'not_configured' | 'unavailable';
      candidateCount: number;
      checkedAt: string;
      changedAt?: string;
      refreshRequestedAt?: string;
      refreshTriggered: boolean;
      message?: string;
    };
    contentOperationsReminders: {
      sourceKey: string;
      status: 'changed' | 'unchanged';
      candidateCount: number;
      checkedAt: string;
      changedAt?: string;
      refreshRequestedAt?: string;
      refreshTriggered: boolean;
      message?: string;
    };
    events: {
      processed: number;
      dispatched: number;
      failed: number;
    };
    notifications: {
      processed: number;
      sent: number;
      failed: number;
      skipped: number;
      deferred: number;
    };
    ticketing: {
      processedAt: string;
      expiredOrderCount: number;
      expiredHoldCount: number;
    };
  }>;
  summary: {
    candidateCount: number;
    activeCandidateCount: number;
    scheduledCandidateCount: number;
    targetUserCount: number;
    subscribedTargetUserCount: number;
    queuedCount: number;
    skippedCount: number;
    sentCount: number;
    failedCount: number;
    deferredCount: number;
    cancelledCount: number;
  };
  candidates: Array<
    OperationsStrongReminderItem & {
      phase: 'active' | 'scheduled';
      deliveryCounts: Record<PushDelivery['status'], number>;
    }
  >;
  users: Array<{
    userId: string;
    ldpassUserId: string;
    operationsEnabled: boolean;
    subscriptionCount: number;
    expectedAction: 'queued' | 'skipped_no_subscription' | 'ignored_disabled';
    candidateCount: number;
    queuedCount: number;
    skippedCount: number;
    cancelledCount: number;
    lastDeliveryAt?: string;
  }>;
  deliveries: PushDelivery[];
}

function describeReminderRuleTitle(rule: OperationsStrongReminderRule): string {
  if (rule.title?.trim()) {
    return rule.title.trim();
  }

  if (rule.sourceKind === 'content' && rule.contentId) {
    return `关联内容 ${rule.contentId}`;
  }

  return '未命名强提醒';
}

function describeReminderRuleMeta(rule: OperationsStrongReminderRule): string {
  const parts = [
    rule.sourceKind === 'content' ? '关联内容' : '手动录入',
    rule.enabled === false ? '已停用' : '已启用',
    `排序 ${rule.sortOrder}`,
  ];

  if (rule.label) {
    parts.push(`标签 ${rule.label}`);
  }

  if (rule.contentId) {
    parts.push(`内容 ${rule.contentId}`);
  }

  if (rule.startsAt) {
    parts.push(`开始 ${rule.startsAt.slice(0, 10)}`);
  }

  if (rule.endsAt) {
    parts.push(`结束 ${rule.endsAt.slice(0, 10)}`);
  }

  return parts.join(' · ');
}

function describeReminderRuleSourceKind(
  sourceKind: OperationsStrongReminderRule['sourceKind'],
): string {
  return sourceKind === 'content' ? '关联内容' : '手动录入';
}

function describeReminderCandidateMeta(
  candidate: ReminderPreviewResponse['candidates'][number],
): string {
  const parts = [
    describeReminderCandidateSource(candidate.sourceKind),
    candidate.phase === 'scheduled' ? '未来生效' : '当前生效',
    candidate.label ?? '未设置标签',
  ];

  if (candidate.displayStartDate) {
    parts.push(`开始 ${candidate.displayStartDate}`);
  }
  if (candidate.displayEndDate) {
    parts.push(`结束 ${candidate.displayEndDate}`);
  }

  return parts.join(' · ');
}

function describeReminderSourceStateTitle(
  state: ReminderPreviewResponse['sourceStates'][number],
): string {
  switch (state.sourceKey) {
    case 'operations_content_rule_visibility':
      return '内容型提醒可见性';
    case 'transit_service_notice':
      return '旧客运公告源';
    default:
      return state.sourceKey;
  }
}

function describeReminderSourceStateMeta(
  state: ReminderPreviewResponse['sourceStates'][number],
): string {
  const parts = [describeReminderSourceStatus(state.sourceStatus), `候选 ${state.candidateCount}`];

  if (state.lastCheckedAt) {
    parts.push(`检查 ${formatDateTime(state.lastCheckedAt)}`);
  }
  if (state.lastChangedAt) {
    parts.push(`变化 ${formatDateTime(state.lastChangedAt)}`);
  }

  return parts.join(' · ');
}

function describeReminderSourceStateBody(
  state: ReminderPreviewResponse['sourceStates'][number],
): string | undefined {
  const parts = [];
  if (state.lastRefreshRequestedAt) {
    parts.push(`最近请求重算 ${formatDateTime(state.lastRefreshRequestedAt)}`);
  }
  if (state.message) {
    parts.push(state.message);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function describeReminderTaskSourceStatus(
  status: NonNullable<ReminderPreviewResponse['taskRun']>['operationsReminders']['status'],
): string {
  switch (status) {
    case 'changed':
      return '源已变化';
    case 'unchanged':
      return '源无变化';
    case 'not_configured':
      return '源未配置';
    case 'unavailable':
      return '源不可用';
    default:
      return '未知状态';
  }
}

function describeReminderTaskRunStatus(
  status: NonNullable<ReminderPreviewResponse['taskRun']>['status'],
): string {
  return status === 'warning' ? '有告警' : '正常';
}

function describeReminderTaskRunBody(
  taskRun: NonNullable<ReminderPreviewResponse['taskRun']>,
): string {
  return [
    taskRun.statusSummary,
    `内容可见性 ${describeContentReminderTaskSourceStatus(taskRun.contentOperationsReminders.status)}`,
    `事件失败 ${taskRun.events.failed}`,
    `通知已发送 ${taskRun.notifications.sent}`,
    `通知失败 ${taskRun.notifications.failed}`,
    `通知延后 ${taskRun.notifications.deferred}`,
    `通知跳过 ${taskRun.notifications.skipped}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function describeContentReminderTaskSourceStatus(
  status: NonNullable<ReminderPreviewResponse['taskRun']>['contentOperationsReminders']['status'],
): string {
  return status === 'changed' ? '已变化' : '无变化';
}

function describeReminderSourceStatus(
  status: ReminderPreviewResponse['sourceStates'][number]['sourceStatus'],
): string {
  switch (status) {
    case 'ready':
      return '可用';
    case 'not_configured':
      return '未配置';
    case 'unavailable':
      return '暂不可用';
    case 'not_checked':
      return '尚未检查';
    default:
      return '未知状态';
  }
}

function describeReminderCandidateSource(
  sourceKind: ReminderPreviewResponse['candidates'][number]['sourceKind'],
): string {
  switch (sourceKind) {
    case 'manual':
      return '手动录入';
    case 'content':
      return '关联内容';
    case 'service_notice':
      return '自动客运公告';
    default:
      return '未知来源';
  }
}

function describeReminderCandidateCounts(
  counts: ReminderPreviewResponse['candidates'][number]['deliveryCounts'],
): string {
  return [
    `待投递 ${counts.queued}`,
    `跳过 ${counts.skipped}`,
    `已发送 ${counts.sent}`,
    `延后 ${counts.deferred}`,
    `失败 ${counts.failed}`,
    `已取消 ${counts.cancelled}`,
  ].join(' · ');
}

function describeReminderPreviewUser(user: ReminderPreviewResponse['users'][number]): string {
  const actionText =
    user.expectedAction === 'queued'
      ? '将写入待投递队列'
      : user.expectedAction === 'skipped_no_subscription'
        ? '会被标记为无订阅跳过'
        : '已关闭运营提醒';
  return [
    `ldpass ${user.ldpassUserId}`,
    user.operationsEnabled ? '已启用运营提醒' : '未启用运营提醒',
    `订阅 ${user.subscriptionCount}`,
    `候选 ${user.candidateCount}`,
    actionText,
  ].join(' · ');
}

function describePushDeliveryStatus(status: PushDelivery['status']): string {
  const labels: Record<PushDelivery['status'], string> = {
    queued: '待投递',
    deferred: '已延后',
    sent: '已发送',
    failed: '已失败',
    skipped: '已跳过',
    cancelled: '已取消',
  };
  return labels[status];
}

function parseDateTimeLocalInput(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function parseBannerSortOrderInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseCustomTagsInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);
}

function getPreviewTitleSegments(title: string): string[] | undefined {
  const segments = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 1 ? segments : undefined;
}

function toDateTimeLocalInput(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  const hours = `${parsed.getHours()}`.padStart(2, '0');
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeLocalPreview(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-${`${parsed.getDate()}`.padStart(2, '0')} ${`${parsed.getHours()}`.padStart(2, '0')}:${`${parsed.getMinutes()}`.padStart(2, '0')}`;
}
