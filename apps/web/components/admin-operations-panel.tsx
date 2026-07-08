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
import { appPath } from '../lib/app-paths';
import { MarkdownBlocks } from './markdown-blocks';
import { TitleWithBreaks } from './title-with-breaks';

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
  metadata: {
    excerpt?: string;
    showInBanner: boolean;
    bannerSortOrder?: number;
    customTags?: string[];
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
  const [reminderStatusText, setReminderStatusText] = useState('正在读取首页强提醒规则');
  const [reminderPreviewStatusText, setReminderPreviewStatusText] =
    useState('正在读取运营提醒投递预览');
  const [assetStatusText, setAssetStatusText] = useState('正在读取内容素材');
  const [legacyAssetStatusText, setLegacyAssetStatusText] = useState('正在读取旧资源差异报告');
  const [legacyHtmlStatusText, setLegacyHtmlStatusText] = useState('正在读取旧专题页面');
  const [isBusy, setIsBusy] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [scheduledPublishValues, setScheduledPublishValues] = useState<Record<string, string>>({});
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
  };

  const loadRecordToEditor = (record: AdminContentRecord) => {
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
        : '已载入草稿，可继续编辑。',
    );
  };

  const loadReminderToEditor = (rule: OperationsStrongReminderRule) => {
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
    setIsBusy(true);
    try {
      const endpoint = editingContentId
      ? appPath(`/api/admin/operations/contents/${encodeURIComponent(editingContentId)}`)
      : appPath('/api/admin/operations/contents');
      const expiresAt = expiresAtValue.trim()
        ? parseDateTimeLocalInput(expiresAtValue)
        : undefined;
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
      setStatusText(editingContentId ? '草稿已更新，可在下方提交审核。' : '草稿已创建');
      await loadRecords();
    } finally {
      setIsBusy(false);
    }
  };

  const runAction = async (
    contentId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
    options: { mode?: 'immediate' | 'scheduled'; scheduledAt?: string } = {},
  ) => {
    setIsBusy(true);
    try {
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
            ? { decision: 'rejected', reason: '后台退回' }
            : action === 'publish'
              ? {
                  mode: options.mode ?? 'immediate',
                  scheduledAt:
                    options.mode === 'scheduled' ? options.scheduledAt : undefined,
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

  const publishScheduled = async (contentId: string) => {
    const value = scheduledPublishValues[contentId]?.trim();
    if (!value) {
      setStatusText('请先选择定时发布时间。');
      return;
    }

    const scheduledAt = parseDateTimeLocalInput(value);
    if (!scheduledAt) {
      setStatusText('定时发布时间格式无效。');
      return;
    }

    await runAction(contentId, 'publish', {
      mode: 'scheduled',
      scheduledAt,
    });
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
        <span className="muted">{statusText}</span>
      </div>

      <section className="admin-editor" aria-label="创建内容草稿">
        {editingContentId ? (
          <p className="muted">{`当前正在编辑 ${editingContentId.slice(-8).toUpperCase()} 草稿`}</p>
        ) : null}
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
        {editingContentId ? (
          <button className="secondary-action-button" type="button" disabled={isBusy} onClick={resetEditor}>
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
            <span>取消编辑</span>
          </button>
        ) : null}
      </section>

      <section className="admin-reminder-workflow" aria-labelledby="admin-reminders-title">
        <div className="section-heading">
          <h2 id="admin-reminders-title">首页强提醒</h2>
          <span className="muted">{reminderStatusText}</span>
        </div>
        <p className="muted admin-reminder-note">
          第一版用于管理首页“强提醒”卡片，可手动录入，也可关联已公开的运营内容。旧
          `ltcx/stop.txt` 解析出的客运公告也会自动并入候选与投递预览；如果只是旧公告源
          更新、没有改动规则正文，可直接用下方“重算投递”同步当前队列。
        </p>

        <section className="admin-editor" aria-label="编辑首页强提醒规则">
          {editingReminderId ? (
            <p className="muted">{`当前正在编辑 ${editingReminderId.slice(-8).toUpperCase()} 规则`}</p>
          ) : null}
          <label>
            <span>来源</span>
            <select
              value={reminderSourceKind}
              onChange={(event) =>
                setReminderSourceKind(event.currentTarget.value as OperationsStrongReminderRule['sourceKind'])
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
                reminderSourceKind === 'content' ? '留空则使用关联内容标题' : '如 今晚地铁加开列车'
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
          {editingReminderId ? (
            <button
              className="secondary-action-button"
              type="button"
              disabled={isBusy}
              onClick={resetReminderEditor}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
              <span>取消编辑</span>
            </button>
          ) : null}
        </section>

        <div className="admin-content-list" aria-label="首页强提醒规则列表">
          {sortedReminderRules.map((rule) => (
            <article className="admin-content-item" key={rule.id}>
              <div>
                <strong>{describeReminderRuleTitle(rule)}</strong>
                <p className="muted">{describeReminderRuleMeta(rule)}</p>
              </div>
              <div className="admin-content-actions">
                <button
                  type="button"
                  disabled={isBusy || editingReminderId === rule.id}
                  onClick={() => loadReminderToEditor(rule)}
                >
                  编辑
                </button>
                <button type="button" disabled={isBusy} onClick={() => void toggleReminderRuleEnabled(rule.id)}>
                  {rule.enabled === false ? '启用' : '停用'}
                </button>
                <button type="button" disabled={isBusy} onClick={() => void deleteReminderRule(rule.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
          {sortedReminderRules.length === 0 ? (
            <p className="muted">尚未配置首页强提醒规则。</p>
          ) : null}
        </div>

        <section className="admin-reminder-preview" aria-labelledby="admin-reminder-preview-title">
          <div className="section-heading">
            <h3 id="admin-reminder-preview-title">运营提醒投递预览</h3>
            <span className="muted">{reminderPreviewStatusText}</span>
          </div>
          <div className="admin-toolbar">
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
            <button className="secondary-action-button" type="button" disabled={isBusy} onClick={() => void loadReminderPreview()}>
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
                <ReportMetric label="当前生效" value={reminderPreview.summary.activeCandidateCount} />
                <ReportMetric label="未来生效" value={reminderPreview.summary.scheduledCandidateCount} />
                <ReportMetric label="目标用户" value={reminderPreview.summary.targetUserCount} />
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
                    tone={
                      reminderPreview.taskRun.events.failed > 0
                        ? 'warning'
                        : 'ok'
                    }
                  />
                  <ReportMetric
                    label="通知处理"
                    value={reminderPreview.taskRun.notifications.processed}
                  />
                  <ReportMetric
                    label="通知失败"
                    value={reminderPreview.taskRun.notifications.failed}
                    tone={
                      reminderPreview.taskRun.notifications.failed > 0
                        ? 'warning'
                        : 'ok'
                    }
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
                    body: user.lastDeliveryAt ? `最近写入 ${formatDateTime(user.lastDeliveryAt)}` : undefined,
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
                {record.revision.categoryId} · {statusLabel(record)}
                {record.revision.publishedAt
                  ? ` · ${record.revision.publishedAt.slice(0, 10)}`
                  : ''}
                {record.metadata.expiresAt ? ` · 有效至 ${record.metadata.expiresAt.slice(0, 10)}` : ''}
                {record.metadata.showInBanner
                  ? ` · 重点${record.metadata.bannerSortOrder !== undefined ? `#${record.metadata.bannerSortOrder}` : ''}`
                  : ''}
                {record.metadata.customTags?.length
                  ? ` · 标签 ${record.metadata.customTags.join(' / ')}`
                  : ''}
              </p>
              {record.revision.reviewReason ? (
                <p className="muted">{`驳回原因：${record.revision.reviewReason}`}</p>
              ) : null}
            </div>
            <div className="admin-content-actions">
              <button
                type="button"
                disabled={
                  isBusy ||
                  !['draft', 'rejected'].includes(record.revision.status) ||
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
              {record.revision.status === 'approved' ? (
                <>
                  <input
                    type="datetime-local"
                    aria-label="定时发布时间"
                    value={scheduledPublishValues[record.contentId] ?? ''}
                    onChange={(event) =>
                      setScheduledPublishValues((current) => ({
                        ...current,
                        [record.contentId]: event.currentTarget.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={isBusy || !(scheduledPublishValues[record.contentId] ?? '').trim()}
                    onClick={() => void publishScheduled(record.contentId)}
                  >
                    定时
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={isBusy || record.revision.status === 'archived'}
                onClick={() => runAction(record.contentId, 'archive')}
              >
                归档
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

function describeReminderTaskRunBody(taskRun: NonNullable<ReminderPreviewResponse['taskRun']>): string {
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
