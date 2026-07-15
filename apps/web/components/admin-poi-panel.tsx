'use client';

import type {
  MapGeometry,
  MapMarkerSnapshot,
  PoiCategory,
  PoiFacilitySnapshot,
  PoiSubmission,
  PoiSubmissionStatus,
  RectangleBounds,
  TileProviderDescriptor,
} from '@yct/contracts';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { EmbeddedMapLocationPicker } from './embedded-map-location-picker';
import { PoiFacilityEditor } from './poi-facility-editor';

type StatusFilter = PoiSubmissionStatus | 'all' | 'todo' | 'blocked' | 'legacy';
type PoiAdminSection = 'submissions' | 'categories';
type PoiCategoryBoardFilter = 'all' | 'public_enabled' | 'public_disabled';
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

type PoiSubmissionImageReviewDecision = 'approved' | 'rejected';
type PoiSubmissionImageReviewInput = PoiSubmissionImageReviewDecision | 'unreviewed';

interface PoiSubmissionImageReview {
  id: string;
  submissionId: string;
  imageUrl: string;
  decision: PoiSubmissionImageReviewDecision;
  reason?: string;
  reviewerId: string;
  reviewedAt: string;
}

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

interface PoiHierarchyHint {
  parentLabel: string;
  childLabel: string;
  parentMarkers: MapMarker[];
}

interface PoiSubmissionEditInput {
  title: string;
  categoryId: string;
  iconFileName: string;
  description: string;
  href: string;
  imageUrl: string;
  geometry: MapGeometry;
  parentMarkerId: string;
  boundRegionMarkerIds: string[];
  openingHours: string;
  address: string;
  addressRoadMarkerId: string;
  facilities: PoiFacilitySnapshot[];
}

type PoiSubmissionFormInput = Omit<PoiSubmissionEditInput, 'geometry'>;

interface LegacyPoiMarkerEditInput {
  label: string;
  categoryId: string;
  iconFileName: string;
  description: string;
  href: string;
  imageUrl: string;
  geometry: MapGeometry;
  parentMarkerId: string;
  boundRegionMarkerIds: string[];
  openingHours: string;
  address: string;
  addressRoadMarkerId: string;
  facilities: PoiFacilitySnapshot[];
}

interface CoordinateDraft {
  x: string;
  z: string;
}

interface RectangleBoundsDraft {
  minX: string;
  minZ: string;
  maxX: string;
  maxZ: string;
}

type PoiGeometryDraft =
  | { type: 'Point'; coordinate: CoordinateDraft }
  | { type: 'MultiPoint'; coordinates: CoordinateDraft[] }
  | { type: 'LineString'; coordinates: CoordinateDraft[] }
  | { type: 'Rectangle'; bounds: RectangleBoundsDraft }
  | { type: 'MultiRectangle'; rectangles: RectangleBoundsDraft[] }
  | { type: 'Polygon'; rings: CoordinateDraft[][] }
  | { type: 'MultiPolygon'; polygons: CoordinateDraft[][][] };

interface PoiTileRegionResponse {
  properties?: {
    minRegionX: number;
    minRegionZ: number;
    maxRegionX: number;
    maxRegionZ: number;
  };
  regions: Array<{
    x: number;
    z: number;
    m: number[];
  }>;
}

interface PoiTileRegionIndex {
  properties: NonNullable<PoiTileRegionResponse['properties']>;
  groups: Map<string, PoiTileRegionResponse['regions'][number]>;
}

interface PoiTilePreviewConfig {
  tileTemplate?: string | null;
  regionIndex?: PoiTileRegionIndex;
}

const defaultMarkerIconBaseUrl = 'https://map.shangxiaoguan.top/';

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'legacy', label: '旧有数据' },
  { value: 'todo', label: '待处理' },
  { value: 'blocked', label: '阻塞发布' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
  { value: 'draft', label: '草稿' },
];
const poiAdminSectionOptions: Array<{ value: PoiAdminSection; label: string }> = [
  { value: 'submissions', label: '投稿审核' },
  { value: 'categories', label: '分类 / 图标' },
];
const poiCategoryBoardFilterOptions: Array<{ value: PoiCategoryBoardFilter; label: string }> = [
  { value: 'all', label: '全部分类' },
  { value: 'public_enabled', label: '允许公开投稿' },
  { value: 'public_disabled', label: '不允许公开投稿' },
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
  const [imageReviews, setImageReviews] = useState<PoiSubmissionImageReview[]>([]);
  const [categoryIconBaseUrl, setCategoryIconBaseUrl] = useState(defaultMarkerIconBaseUrl);
  const [tilePreviewTemplate, setTilePreviewTemplate] = useState<string | null>(null);
  const [tilePreviewRegionResponse, setTilePreviewRegionResponse] =
    useState<PoiTileRegionResponse | null>(null);
  const [statusText, setStatusText] = useState('正在读取 POI 投稿');
  const [categoryStatusText, setCategoryStatusText] = useState('正在读取 POI 分类');
  const [isBusy, setIsBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<PoiAdminSection>('submissions');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [categoryBoardFilter, setCategoryBoardFilter] = useState<PoiCategoryBoardFilter>('all');
  const [categoryBoardQuery, setCategoryBoardQuery] = useState('');
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [selectedLegacyMarkerIds, setSelectedLegacyMarkerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PoiSubmission | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminPoiSubmission | null>(null);
  const [editTarget, setEditTarget] = useState<PoiSubmission | null>(null);
  const [createTarget, setCreateTarget] = useState<{ parentMarkerId?: string } | null>(null);
  const [legacyEditTarget, setLegacyEditTarget] = useState<MapMarker | null>(null);
  const [bulkRejectTargets, setBulkRejectTargets] = useState<AdminPoiSubmission[] | null>(null);
  const [bulkPublishTargets, setBulkPublishTargets] = useState<AdminPoiSubmission[] | null>(null);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [categoryEditorTargetId, setCategoryEditorTargetId] = useState<string | null>(null);

  const categoryById = useMemo(() => {
    const entries = categories.map((category) => [category.id, category] as const);
    return new Map(entries);
  }, [categories]);
  const parentMarkerOptions = useMemo(
    () =>
      mapMarkers
        .filter(
          (marker) =>
            marker.geometry.type === 'Point' &&
            marker.categoryId !== 'player' &&
            marker.categoryId !== 'road',
        )
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [mapMarkers],
  );
  const regionMarkerOptions = useMemo(
    () =>
      mapMarkers
        .filter((marker) => isRegionGeometry(marker.geometry))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [mapMarkers],
  );
  const roadMarkerOptions = useMemo(
    () =>
      mapMarkers
        .filter(
          (marker) =>
            isRoadReferenceMarker(marker) &&
            (marker.geometry.type === 'MultiPoint' || marker.geometry.type === 'LineString'),
        )
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [mapMarkers],
  );

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
      (left, right) =>
        left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'),
    );
  }, [categories, submissions]);
  const sortedCategoryProfiles = useMemo(
    () =>
      [...categories].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'),
      ),
    [categories],
  );
  const filteredCategoryProfiles = useMemo(() => {
    const normalizedQuery = normalizeSearchText(categoryBoardQuery);
    return sortedCategoryProfiles.filter((category) => {
      if (categoryBoardFilter === 'public_enabled' && !category.acceptsPublicSubmissions) {
        return false;
      }

      if (categoryBoardFilter === 'public_disabled' && category.acceptsPublicSubmissions) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = normalizeSearchText(
        [
          category.id,
          category.name,
          category.iconMapping.defaultIconFileName,
          ...category.iconMapping.iconFileNames,
        ].join(' '),
      );
      return searchableText.includes(normalizedQuery);
    });
  }, [categoryBoardFilter, categoryBoardQuery, sortedCategoryProfiles]);

  const statusCounts = useMemo(() => {
    const counts = new Map<PoiSubmissionStatus, number>();
    for (const submission of submissions) {
      counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
    }
    return counts;
  }, [submissions]);

  const imageReviewByKey = useMemo(() => {
    const entries = imageReviews.map(
      (review) => [imageReviewKey(review.submissionId, review.imageUrl), review] as const,
    );
    return new Map(entries);
  }, [imageReviews]);

  const filteredSubmissions = useMemo(
    () =>
      sortedSubmissions.filter((submission) => {
        if (
          statusFilter === 'blocked'
            ? !isPoiSubmissionPublishBlocked(submission, imageReviewByKey, conflictDecisions)
            : !matchesStatusFilter(submission.status, statusFilter)
        ) {
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
            submission.openingHours,
            submission.address,
            submission.facilities?.map((facility) => facility.description).join(' '),
            submission.href,
            submission.submittedBy,
            submission.reviewReason,
          ]
            .filter(Boolean)
            .join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [
      categoryById,
      categoryFilter,
      conflictDecisions,
      imageReviewByKey,
      query,
      sortedSubmissions,
      statusFilter,
    ],
  );
  const legacyMapMarkers = useMemo(() => {
    const groupedRoadLabels = new Set(
      mapMarkers
        .filter((marker) => marker.categoryId === 'road' && marker.geometry.type === 'MultiPoint')
        .map((marker) => normalizeSearchText(marker.label)),
    );
    return mapMarkers.filter(
      (marker) =>
        isLegacyPoiMapMarker(marker) &&
        !(
          marker.categoryId === 'road' &&
          marker.geometry.type === 'Point' &&
          groupedRoadLabels.has(normalizeSearchText(marker.label))
        ),
    );
  }, [mapMarkers]);
  const filteredLegacyMapMarkers = useMemo(() => {
    if (!shouldShowLegacyPoiMarkers(statusFilter)) {
      return [];
    }

    const normalizedQuery = normalizeSearchText(query);
    return legacyMapMarkers.filter((marker) => {
      if (categoryFilter !== 'all' && marker.categoryId !== categoryFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const category = marker.categoryId ? categoryById.get(marker.categoryId) : undefined;
      const haystack = normalizeSearchText(
        [marker.label, marker.categoryId, category?.name, marker.description, marker.href]
          .filter(Boolean)
          .join(' '),
      );
      return haystack.includes(normalizedQuery);
    });
  }, [categoryById, categoryFilter, legacyMapMarkers, query, statusFilter]);
  const filteredPoiListItems = useMemo(
    () =>
      [
        ...filteredSubmissions.map((submission) => ({
          key: `submission:${submission.id}`,
          kind: 'submission' as const,
          submission,
          sortText: submission.title,
          sortTime: submission.submittedAt ?? submission.reviewedAt ?? submission.publishedAt ?? '',
        })),
        ...filteredLegacyMapMarkers.map((marker) => ({
          key: `legacy:${marker.id}`,
          kind: 'legacy' as const,
          marker,
          sortText: marker.label,
          sortTime: '',
        })),
      ].sort(
        (left, right) =>
          right.sortTime.localeCompare(left.sortTime) ||
          left.sortText.localeCompare(right.sortText, 'zh-CN'),
      ),
    [filteredLegacyMapMarkers, filteredSubmissions],
  );

  const conflictHintsBySubmissionId = useMemo(() => {
    const entries = submissions.map(
      (submission) => [submission.id, buildPoiConflictHints(submission, mapMarkers)] as const,
    );
    return new Map(entries);
  }, [mapMarkers, submissions]);

  const conflictDecisionByKey = useMemo(() => {
    const entries = conflictDecisions.map(
      (decision) =>
        [conflictDecisionKey(decision.submissionId, decision.markerId), decision] as const,
    );
    return new Map(entries);
  }, [conflictDecisions]);

  const auditContextMarkersBySubmissionId = useMemo(() => {
    const entries = submissions.map(
      (submission) => [submission.id, buildPoiAuditContextMarkers(submission, mapMarkers)] as const,
    );
    return new Map(entries);
  }, [mapMarkers, submissions]);

  const hierarchyHintBySubmissionId = useMemo(() => {
    const entries = submissions.map(
      (submission) => [submission.id, buildPoiHierarchyHint(submission, mapMarkers)] as const,
    );
    return new Map(entries);
  }, [mapMarkers, submissions]);
  const tilePreviewConfig = useMemo<PoiTilePreviewConfig>(
    () => ({
      tileTemplate: tilePreviewTemplate,
      regionIndex: buildPoiTileRegionIndex(tilePreviewRegionResponse),
    }),
    [tilePreviewRegionResponse, tilePreviewTemplate],
  );
  const detailTarget = useMemo(
    () => submissions.find((submission) => submission.id === detailTargetId) ?? null,
    [detailTargetId, submissions],
  );

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
      setStatusText(
        data.meta?.message ?? data.message ?? '地图标记快照暂不可用，无法生成重复提示。',
      );
      return;
    }

    setMapMarkers(data.snapshot?.markers ?? []);
  };

  const loadConflictDecisions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-conflict-decisions'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as { items?: PoiConflictDecision[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 冲突提示决策暂不可用。');
      return;
    }

    setConflictDecisions(data.items ?? []);
  };

  const loadImageReviews = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-submission-image-reviews'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      items?: PoiSubmissionImageReview[];
      message?: string;
    };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 图片审核状态暂不可用。');
      return;
    }

    setImageReviews(data.items ?? []);
  };

  const loadTilePreviewConfig = async () => {
    const response = await fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: TileProviderDescriptor[] };
    if (!response.ok) {
      return;
    }

    const preferredProvider =
      data.items?.find((provider) => provider.sourceKind === 'safe-https-static') ??
      data.items?.find((provider) => provider.id === 'lindong-unmined-static') ??
      data.items?.[0];
    setTilePreviewTemplate(preferredProvider?.tileTemplate ?? null);

    if (!preferredProvider) {
      return;
    }

    if (
      preferredProvider.sourceKind !== 'safe-https-static' &&
      preferredProvider.id !== 'lindong-unmined-static'
    ) {
      setTilePreviewRegionResponse(null);
      return;
    }

    const regionResponse = await fetch(appPath('/api/map/unmined-regions'), { cache: 'no-store' });
    if (!regionResponse.ok) {
      setTilePreviewRegionResponse(null);
      return;
    }

    const regionData = (await regionResponse.json()) as PoiTileRegionResponse;
    setTilePreviewRegionResponse(regionData);
  };

  useEffect(() => {
    void loadSubmissions();
    void loadCategories();
    void loadMapMarkers();
    void loadConflictDecisions();
    void loadImageReviews();
    void loadTilePreviewConfig();
  }, []);

  useEffect(() => {
    setSelectedSubmissionIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const existingIds = new Set(submissions.map((submission) => submission.id));
      const next = new Set(Array.from(current).filter((id) => existingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [submissions]);

  useEffect(() => {
    setSelectedLegacyMarkerIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const existingIds = new Set(legacyMapMarkers.map((marker) => marker.id));
      const next = new Set(Array.from(current).filter((id) => existingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [legacyMapMarkers]);

  const toggleSubmissionSelection = (poiId: string) => {
    setSelectedSubmissionIds((current) => {
      const next = new Set(current);
      if (next.has(poiId)) {
        next.delete(poiId);
      } else {
        next.add(poiId);
      }
      return next;
    });
  };

  const toggleLegacyMarkerSelection = (markerId: string) => {
    setSelectedLegacyMarkerIds((current) => {
      const next = new Set(current);
      if (next.has(markerId)) {
        next.delete(markerId);
      } else {
        next.add(markerId);
      }
      return next;
    });
  };

  const toggleVisiblePoiSelection = () => {
    setSelectedSubmissionIds((current) => {
      const next = new Set(current);
      if (isAllVisiblePoiItemsSelected) {
        filteredSubmissions.forEach((submission) => next.delete(submission.id));
      } else {
        filteredSubmissions.forEach((submission) => next.add(submission.id));
      }
      return next;
    });
    setSelectedLegacyMarkerIds((current) => {
      const next = new Set(current);
      if (isAllVisiblePoiItemsSelected) {
        filteredLegacyMapMarkers.forEach((marker) => next.delete(marker.id));
      } else {
        filteredLegacyMapMarkers.forEach((marker) => next.add(marker.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedSubmissionIds(new Set());
    setSelectedLegacyMarkerIds(new Set());
  };

  const sendPoiAction = async (
    poiId: string,
    action: 'approve' | 'reject' | 'publish' | 'archive',
    reason?: string,
  ): Promise<{ ok: boolean; message?: string }> => {
    const endpoint =
      action === 'archive'
        ? appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}`)
        : action === 'publish'
          ? appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}/publish`)
          : appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}/review`);
    const body =
      action === 'approve'
        ? { decision: 'approved' }
        : action === 'reject'
          ? { decision: 'rejected', reason: reason?.trim() }
          : {};
    const response = await fetch(endpoint, {
      method: action === 'archive' ? 'DELETE' : 'POST',
      headers: action === 'archive' ? undefined : { 'Content-Type': 'application/json' },
      body: action === 'archive' ? undefined : JSON.stringify(body),
    });
    const data = (await response.json()) as { message?: string };
    return {
      ok: response.ok,
      message: response.ok ? undefined : (data.message ?? '操作失败'),
    };
  };

  const runAction = async (
    poiId: string,
    action: 'approve' | 'reject' | 'publish' | 'archive',
    reason?: string,
  ): Promise<boolean> => {
    setIsBusy(true);
    try {
      const result = await sendPoiAction(poiId, action, reason);
      if (!result.ok) {
        setStatusText(result.message ?? '操作失败');
        return false;
      }

      setStatusText('操作已完成');
      await loadSubmissions();
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const deleteSubmission = async (submission: AdminPoiSubmission): Promise<boolean> => {
    const confirmed = window.confirm(
      submission.status === 'published'
        ? `确认删除已发布 POI“${submission.title}”？删除后会立即从公开地图移除，后台记录会保留为已归档。`
        : `确认删除 POI 投稿“${submission.title}”？删除后记录会保留为已归档。`,
    );
    if (!confirmed) {
      return false;
    }

    const success = await runAction(submission.id, 'archive');
    if (success) {
      setStatusText(`已删除 ${submission.title}，记录已归档。`);
    }
    return success;
  };

  const runBatchAction = async (
    targets: AdminPoiSubmission[],
    action: 'approve' | 'reject' | 'publish',
    reason?: string,
  ): Promise<boolean> => {
    if (targets.length === 0) {
      setStatusText('当前没有可执行批量操作的 POI 投稿。');
      return false;
    }

    setIsBusy(true);
    try {
      const failed: Array<{ id: string; message: string }> = [];
      let successCount = 0;

      for (const submission of targets) {
        const result = await sendPoiAction(submission.id, action, reason);
        if (result.ok) {
          successCount += 1;
        } else {
          failed.push({
            id: submission.id,
            message: `${submission.title}${result.message ? `（${result.message}）` : ''}`,
          });
        }
      }

      await loadSubmissions();
      setSelectedSubmissionIds((current) => {
        const next = new Set(current);
        targets.forEach((submission) => {
          if (!failed.some((item) => item.id === submission.id)) {
            next.delete(submission.id);
          }
        });
        return next;
      });

      if (failed.length === 0) {
        setStatusText(`已批量${describePoiBatchAction(action)} ${successCount} 条 POI 投稿`);
        return true;
      }

      setStatusText(
        `批量${describePoiBatchAction(action)}完成：成功 ${successCount} 条，失败 ${failed.length} 条${
          failed.length > 0
            ? ` · ${failed
                .slice(0, 2)
                .map((item) => item.message)
                .join('；')}`
            : ''
        }`,
      );
      return false;
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
      setStatusText(
        data.status === 'published'
          ? `已修正 ${data.title} 的投稿资料，公开地图会同步读取最新版本。`
          : data.status === 'approved'
            ? `已修正 ${data.title} 的投稿资料，可继续直接发布。`
            : `已修正 ${data.title} 的投稿资料`,
      );
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const createSubmission = async (input: PoiSubmissionEditInput): Promise<string | null> => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/map/poi-submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as AdminPoiSubmission & { message?: string };
      if (!response.ok) {
        return data.message ?? '新增 POI 失败';
      }

      setSubmissions((current) => [data, ...current]);
      setStatusFilter('pending_review');
      setStatusText(`已新增 ${data.title}，当前进入待审核队列。`);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const updateLegacyMarker = async (
    markerId: string,
    input: LegacyPoiMarkerEditInput,
  ): Promise<string | null> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/legacy-markers/${encodeURIComponent(markerId)}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        return data.message ?? '旧有标记点保存失败';
      }

      await loadMapMarkers();
      setStatusText(`已保存旧有标记点：${input.label.trim()}`);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const archiveLegacyMarker = async (marker: MapMarker): Promise<boolean> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/legacy-markers/${encodeURIComponent(marker.id)}`),
        {
          method: 'DELETE',
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '旧有标记点删除失败');
        return false;
      }

      await loadMapMarkers();
      setStatusText(`已删除旧有标记点：${marker.label}`);
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const archiveSelectedPoiRecords = async (): Promise<void> => {
    const selectedLegacyMarkers = legacyMapMarkers.filter((marker) =>
      selectedLegacyMarkerIds.has(marker.id),
    );
    if (selectedSubmissions.length === 0 && selectedLegacyMarkers.length === 0) {
      setStatusText('当前没有已选择的 POI 记录。');
      return;
    }

    const confirmed = window.confirm(
      `确认归档/删除已选择的 ${selectedSubmissions.length} 条投稿和 ${selectedLegacyMarkers.length} 个旧有标记点？`,
    );
    if (!confirmed) {
      return;
    }

    let successCount = 0;
    for (const submission of selectedSubmissions) {
      const result = await sendPoiAction(submission.id, 'archive');
      if (result.ok) {
        successCount += 1;
      }
    }
    for (const marker of selectedLegacyMarkers) {
      const archived = await archiveLegacyMarker(marker);
      if (archived) {
        successCount += 1;
      }
    }

    clearSelection();
    await Promise.all([loadSubmissions(), loadMapMarkers()]);
    setStatusText(`已处理 ${successCount} 条 POI 记录。`);
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

  const updateImageReview = async (
    submission: AdminPoiSubmission,
    decision: PoiSubmissionImageReviewInput,
  ) => {
    if (!submission.imageUrl) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/map/poi-submission-image-reviews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          imageUrl: submission.imageUrl,
          decision,
        }),
      });
      const data = (await response.json()) as {
        items?: PoiSubmissionImageReview[];
        message?: string;
      };
      if (!response.ok) {
        setStatusText(data.message ?? 'POI 图片审核状态保存失败。');
        return;
      }

      setImageReviews(data.items ?? []);
      setStatusText(decision === 'unreviewed' ? '已重置图片审核状态' : '已保存图片审核状态');
    } finally {
      setIsBusy(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter('todo');
    setCategoryFilter('all');
    setQuery('');
  };

  const resetCategoryBoardFilters = () => {
    setCategoryBoardFilter('all');
    setCategoryBoardQuery('');
  };

  const pendingCount = statusCounts.get('pending_review') ?? 0;
  const approvedCount = statusCounts.get('approved') ?? 0;
  const publishedCount = statusCounts.get('published') ?? 0;
  const rejectedImageCount = submissions.filter(
    (submission) =>
      submission.imageUrl &&
      imageReviewByKey.get(imageReviewKey(submission.id, submission.imageUrl))?.decision ===
        'rejected',
  ).length;
  const duplicateConflictCount = new Set(
    conflictDecisions
      .filter((decision) => decision.decision === 'duplicate')
      .map((decision) => decision.submissionId),
  ).size;
  const selectedSubmissions = useMemo(
    () => submissions.filter((submission) => selectedSubmissionIds.has(submission.id)),
    [selectedSubmissionIds, submissions],
  );
  const selectedVisibleSubmissions = useMemo(
    () => filteredSubmissions.filter((submission) => selectedSubmissionIds.has(submission.id)),
    [filteredSubmissions, selectedSubmissionIds],
  );
  const selectedLegacyMarkers = useMemo(
    () => legacyMapMarkers.filter((marker) => selectedLegacyMarkerIds.has(marker.id)),
    [legacyMapMarkers, selectedLegacyMarkerIds],
  );
  const selectedVisibleLegacyMarkers = useMemo(
    () => filteredLegacyMapMarkers.filter((marker) => selectedLegacyMarkerIds.has(marker.id)),
    [filteredLegacyMapMarkers, selectedLegacyMarkerIds],
  );
  const selectedPendingReviewSubmissions = useMemo(
    () => selectedSubmissions.filter((submission) => submission.status === 'pending_review'),
    [selectedSubmissions],
  );
  const selectedApprovedSubmissions = useMemo(
    () => selectedSubmissions.filter((submission) => submission.status === 'approved'),
    [selectedSubmissions],
  );
  const selectedBlockedPublishSubmissions = useMemo(
    () =>
      selectedApprovedSubmissions.filter((submission) =>
        isPoiSubmissionPublishBlocked(submission, imageReviewByKey, conflictDecisions),
      ),
    [conflictDecisions, imageReviewByKey, selectedApprovedSubmissions],
  );
  const selectedPublishReadySubmissions = useMemo(
    () =>
      selectedApprovedSubmissions.filter(
        (submission) =>
          !isPoiSubmissionPublishBlocked(submission, imageReviewByKey, conflictDecisions),
      ),
    [conflictDecisions, imageReviewByKey, selectedApprovedSubmissions],
  );
  const selectedPoiRecordCount = selectedSubmissions.length + selectedLegacyMarkers.length;
  const visiblePoiRecordCount = filteredSubmissions.length + filteredLegacyMapMarkers.length;
  const isAllVisiblePoiItemsSelected =
    visiblePoiRecordCount > 0 &&
    filteredSubmissions.every((submission) => selectedSubmissionIds.has(submission.id)) &&
    filteredLegacyMapMarkers.every((marker) => selectedLegacyMarkerIds.has(marker.id));
  const currentSectionStatusText =
    activeSection === 'submissions'
      ? statusText
      : [categoryStatusText, statusText].filter(Boolean).join(' · ');
  const categoryBoardMetrics = useMemo(
    () => [
      { label: '分类总数', value: categories.length },
      {
        label: '允许投稿',
        value: categories.filter((category) => category.acceptsPublicSubmissions).length,
        tone: categories.some((category) => category.acceptsPublicSubmissions)
          ? ('accent' as const)
          : undefined,
      },
      {
        label: '禁止投稿',
        value: categories.filter((category) => !category.acceptsPublicSubmissions).length,
      },
      {
        label: '图标总数',
        value: categories.reduce(
          (total, category) => total + category.iconMapping.iconFileNames.length,
          0,
        ),
      },
      {
        label: '多图标类',
        value: categories.filter((category) => category.iconMapping.iconFileNames.length > 1)
          .length,
      },
      { label: '当前结果', value: filteredCategoryProfiles.length },
    ],
    [categories, filteredCategoryProfiles.length],
  );

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-poi-title">
      <div className="section-heading">
        <h1 id="admin-poi-title">POI 后台</h1>
        <span className="muted">{currentSectionStatusText}</span>
      </div>
      <fieldset className="segmented-control admin-page-segmented-control">
        <legend>工作区</legend>
        <div>
          {poiAdminSectionOptions.map((option) => (
            <button
              className={activeSection === option.value ? 'is-active' : ''}
              type="button"
              aria-pressed={activeSection === option.value}
              key={option.value}
              onClick={() => setActiveSection(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {activeSection === 'submissions' ? (
        <>
          <div className="admin-report-summary admin-poi-summary" aria-label="POI 投稿摘要">
            <AdminPoiMetric
              label="待审核"
              value={pendingCount}
              tone={pendingCount > 0 ? 'warning' : undefined}
            />
            <AdminPoiMetric
              label="待发布"
              value={approvedCount}
              tone={approvedCount > 0 ? 'accent' : undefined}
            />
            <AdminPoiMetric
              label="图片不合格"
              value={rejectedImageCount}
              tone={rejectedImageCount > 0 ? 'warning' : undefined}
            />
            <AdminPoiMetric
              label="待合并"
              value={duplicateConflictCount}
              tone={duplicateConflictCount > 0 ? 'warning' : undefined}
            />
            <AdminPoiMetric label="已发布" value={publishedCount} />
            <AdminPoiMetric label="旧标记点" value={legacyMapMarkers.length} />
            <AdminPoiMetric label="当前结果" value={filteredPoiListItems.length} />
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
            <button type="button" disabled={isBusy} onClick={() => setCreateTarget({})}>
              <span className="material-symbols-outlined" aria-hidden="true">
                add_location_alt
              </span>
              <span>新增 POI</span>
            </button>
          </div>

          <div className="admin-content-bulk-bar" aria-label="POI 投稿批量操作">
            <label className="checkbox-row admin-content-bulk-select">
              <input
                type="checkbox"
                checked={isAllVisiblePoiItemsSelected}
                disabled={visiblePoiRecordCount === 0}
                onChange={toggleVisiblePoiSelection}
              />
              <span>{`选择当前列表 ${
                selectedVisibleSubmissions.length + selectedVisibleLegacyMarkers.length
              }/${visiblePoiRecordCount}`}</span>
            </label>
            <span className="muted">
              {`已选 ${selectedPoiRecordCount} 条，其中投稿 ${selectedSubmissions.length} 条、旧标记点 ${selectedLegacyMarkers.length} 个；可通过 ${selectedPendingReviewSubmissions.length} 条，可发布 ${selectedPublishReadySubmissions.length} 条`}
              {selectedBlockedPublishSubmissions.length > 0
                ? `，其中 ${selectedBlockedPublishSubmissions.length} 条仍阻塞发布`
                : ''}
            </span>
            <button
              type="button"
              disabled={isBusy || selectedPendingReviewSubmissions.length === 0}
              onClick={() => void runBatchAction(selectedPendingReviewSubmissions, 'approve')}
            >
              批量通过
            </button>
            <button
              type="button"
              disabled={isBusy || selectedPendingReviewSubmissions.length === 0}
              onClick={() => setBulkRejectTargets(selectedPendingReviewSubmissions)}
            >
              批量驳回
            </button>
            <button
              type="button"
              disabled={isBusy || selectedApprovedSubmissions.length === 0}
              onClick={() => setBulkPublishTargets(selectedApprovedSubmissions)}
            >
              批量发布
            </button>
            <button
              type="button"
              disabled={isBusy || selectedPoiRecordCount === 0}
              onClick={() => void archiveSelectedPoiRecords()}
            >
              批量归档/删除
            </button>
            <button
              type="button"
              disabled={isBusy || selectedPoiRecordCount === 0}
              onClick={clearSelection}
            >
              清空选择
            </button>
          </div>

          <div className="admin-content-list" aria-label="POI 主列表">
            {filteredPoiListItems.map((item) =>
              item.kind === 'submission' ? (
                <PoiSubmissionReviewItem
                  category={categoryById.get(item.submission.categoryId)}
                  conflictHints={conflictHintsBySubmissionId.get(item.submission.id) ?? []}
                  iconBaseUrl={categoryIconBaseUrl}
                  isBusy={isBusy}
                  imageReview={
                    item.submission.imageUrl
                      ? imageReviewByKey.get(
                          imageReviewKey(item.submission.id, item.submission.imageUrl),
                        )
                      : undefined
                  }
                  isSelected={selectedSubmissionIds.has(item.submission.id)}
                  key={item.key}
                  hierarchyHint={hierarchyHintBySubmissionId.get(item.submission.id)}
                  onAddChild={() =>
                    setCreateTarget({ parentMarkerId: `poi-${item.submission.id}` })
                  }
                  onCopy={(message) => setStatusText(message)}
                  onDetail={() => setDetailTargetId(item.submission.id)}
                  onDelete={() => void deleteSubmission(item.submission)}
                  onEdit={() => setEditTarget(item.submission)}
                  onPublish={() => setPublishTarget(item.submission)}
                  onReject={() => setRejectTarget(item.submission)}
                  onRunAction={runAction}
                  onToggleSelected={() => toggleSubmissionSelection(item.submission.id)}
                  submission={item.submission}
                />
              ) : (
                <LegacyPoiMarkerItem
                  category={
                    item.marker.categoryId ? categoryById.get(item.marker.categoryId) : undefined
                  }
                  isBusy={isBusy}
                  isSelected={selectedLegacyMarkerIds.has(item.marker.id)}
                  key={item.key}
                  marker={item.marker}
                  onAddChild={() => setCreateTarget({ parentMarkerId: item.marker.id })}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `确认删除旧有标记点“${item.marker.label}”？删除后会从公开地图标记列表移除。`,
                      )
                    ) {
                      void archiveLegacyMarker(item.marker);
                    }
                  }}
                  onEdit={() => setLegacyEditTarget(item.marker)}
                  onToggleSelected={() => toggleLegacyMarkerSelection(item.marker.id)}
                />
              ),
            )}
            {filteredPoiListItems.length === 0 ? (
              <p className="muted admin-poi-empty">当前筛选条件下没有 POI 记录。</p>
            ) : null}
          </div>
        </>
      ) : (
        <PoiCategoryBoard
          categories={filteredCategoryProfiles}
          iconBaseUrl={categoryIconBaseUrl}
          isBusy={isBusy}
          metrics={categoryBoardMetrics}
          filterValue={categoryBoardFilter}
          query={categoryBoardQuery}
          totalCount={categories.length}
          onEdit={() => {
            setCategoryEditorTargetId(null);
            setIsCategoryEditorOpen(true);
          }}
          onEditCategory={(categoryId) => {
            setCategoryEditorTargetId(categoryId);
            setIsCategoryEditorOpen(true);
          }}
          onFilterChange={setCategoryBoardFilter}
          onQueryChange={setCategoryBoardQuery}
          onResetFilters={resetCategoryBoardFilters}
        />
      )}

      {detailTarget ? (
        <PoiSubmissionDetailDialog
          category={categoryById.get(detailTarget.categoryId)}
          conflictDecisionByKey={conflictDecisionByKey}
          contextMarkers={auditContextMarkersBySubmissionId.get(detailTarget.id) ?? []}
          conflictHints={conflictHintsBySubmissionId.get(detailTarget.id) ?? []}
          hierarchyHint={hierarchyHintBySubmissionId.get(detailTarget.id)}
          imageReview={
            detailTarget.imageUrl
              ? imageReviewByKey.get(imageReviewKey(detailTarget.id, detailTarget.imageUrl))
              : undefined
          }
          isBusy={isBusy}
          submission={detailTarget}
          tilePreviewConfig={tilePreviewConfig}
          onClose={() => setDetailTargetId(null)}
          onConflictDecision={(hint, decision) =>
            void updateConflictDecision(detailTarget, hint, decision)
          }
          onDelete={async () => {
            const success = await deleteSubmission(detailTarget);
            if (success) {
              setDetailTargetId(null);
            }
          }}
          onEdit={() => {
            setDetailTargetId(null);
            setEditTarget(detailTarget);
          }}
          onImageReview={(decision) => void updateImageReview(detailTarget, decision)}
          onPublish={() => {
            setDetailTargetId(null);
            setPublishTarget(detailTarget);
          }}
          onReject={() => {
            setDetailTargetId(null);
            setRejectTarget(detailTarget);
          }}
          onRunAction={runAction}
          onStatus={(message) => setStatusText(message)}
        />
      ) : null}

      {isCategoryEditorOpen ? (
        <PoiCategoryProfileDialog
          categories={categories}
          iconBaseUrl={categoryIconBaseUrl}
          isBusy={isBusy}
          selectedCategoryId={categoryEditorTargetId}
          onClose={() => {
            setIsCategoryEditorOpen(false);
            setCategoryEditorTargetId(null);
          }}
          onSaved={(message) => {
            setCategoryStatusText(message);
            void loadCategories();
          }}
        />
      ) : null}

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

      {bulkRejectTargets ? (
        <BulkRejectPoiDialog
          isBusy={isBusy}
          submissions={bulkRejectTargets}
          onClose={() => setBulkRejectTargets(null)}
          onSubmit={async (reason) => {
            await runBatchAction(bulkRejectTargets, 'reject', reason);
            setBulkRejectTargets(null);
          }}
        />
      ) : null}

      {publishTarget ? (
        <PublishPoiDialog
          category={categoryById.get(publishTarget.categoryId)}
          conflictDecisions={conflictDecisions.filter(
            (decision) => decision.submissionId === publishTarget.id,
          )}
          conflictHints={conflictHintsBySubmissionId.get(publishTarget.id) ?? []}
          imageReview={
            publishTarget.imageUrl
              ? imageReviewByKey.get(imageReviewKey(publishTarget.id, publishTarget.imageUrl))
              : undefined
          }
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

      {bulkPublishTargets ? (
        <BulkPublishPoiDialog
          conflictDecisions={conflictDecisions}
          imageReviewByKey={imageReviewByKey}
          isBusy={isBusy}
          submissions={bulkPublishTargets}
          onClose={() => setBulkPublishTargets(null)}
          onConfirm={async (targets) => {
            await runBatchAction(targets, 'publish');
            setBulkPublishTargets(null);
          }}
        />
      ) : null}

      {editTarget ? (
        <EditPoiSubmissionDialog
          categories={categories}
          contextMarkers={auditContextMarkersBySubmissionId.get(editTarget.id) ?? []}
          isBusy={isBusy}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          submission={editTarget}
          tilePreviewConfig={tilePreviewConfig}
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

      {createTarget ? (
        <EditPoiSubmissionDialog
          categories={categories}
          contextMarkers={[]}
          initialParentMarkerId={createTarget.parentMarkerId}
          isBusy={isBusy}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          tilePreviewConfig={tilePreviewConfig}
          onClose={() => setCreateTarget(null)}
          onSubmit={async (input) => {
            const error = await createSubmission(input);
            if (!error) {
              setCreateTarget(null);
            }
            return error;
          }}
        />
      ) : null}

      {legacyEditTarget ? (
        <EditLegacyPoiMarkerDialog
          categories={categories}
          isBusy={isBusy}
          marker={legacyEditTarget}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          tilePreviewConfig={tilePreviewConfig}
          onClose={() => setLegacyEditTarget(null)}
          onSubmit={async (input) => {
            const error = await updateLegacyMarker(legacyEditTarget.id, input);
            if (!error) {
              setLegacyEditTarget(null);
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

function LegacyPoiMarkerItem({
  category,
  isBusy,
  isSelected,
  marker,
  onAddChild,
  onDelete,
  onEdit,
  onToggleSelected,
}: Readonly<{
  category?: PoiCategory;
  isBusy: boolean;
  isSelected: boolean;
  marker: MapMarker;
  onAddChild: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleSelected: () => void;
}>) {
  const coordinate = getGeometryRepresentativeCoordinate(marker.geometry);
  return (
    <article className="admin-content-item admin-poi-legacy-marker-item">
      <label className="admin-content-select" aria-label={`选择旧有 POI ${marker.label}`}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelected} />
      </label>
      <div>
        <div className="admin-poi-title-row">
          <strong>{marker.label}</strong>
          <span className="admin-poi-status-chip is-legacy">旧有数据</span>
        </div>
        <p className="muted">
          {marker.categoryId ? formatCategoryName(marker.categoryId, category) : '未分类'} ·{' '}
          {geometryLabel(marker.geometry)} · {marker.id}
        </p>
        {marker.description ? <p className="muted">{marker.description}</p> : null}
        {marker.imageUrl ? <p className="muted">图片：{marker.imageUrl}</p> : null}
      </div>
      <div className="admin-content-actions">
        {coordinate ? (
          <a href={buildLegacyMarkerMapHref(marker, coordinate)} target="_blank" rel="noreferrer">
            地图查看
          </a>
        ) : null}
        <button type="button" disabled={isBusy} onClick={onEdit}>
          编辑
        </button>
        {marker.geometry.type === 'Point' ? (
          <button type="button" disabled={isBusy} onClick={onAddChild}>
            新增子地点
          </button>
        ) : null}
        <button type="button" disabled={isBusy} onClick={onDelete}>
          删除
        </button>
      </div>
    </article>
  );
}

function AdminPoiBusinessDetailsFields({
  disabled,
  form,
  onChange,
  roadMarkerOptions,
}: Readonly<{
  disabled: boolean;
  form: Pick<
    PoiSubmissionFormInput,
    'openingHours' | 'address' | 'addressRoadMarkerId' | 'facilities'
  >;
  onChange: (
    patch: Partial<
      Pick<
        PoiSubmissionFormInput,
        'openingHours' | 'address' | 'addressRoadMarkerId' | 'facilities'
      >
    >,
  ) => void;
  roadMarkerOptions: MapMarker[];
}>) {
  const matchingRoads = findAddressRoadMarkers(form.address, roadMarkerOptions);
  const matchingRoadIds = new Set(matchingRoads.map((marker) => marker.id));
  const orderedRoads = [
    ...matchingRoads,
    ...roadMarkerOptions.filter((marker) => !matchingRoadIds.has(marker.id)),
  ];

  const updateAddress = (address: string) => {
    const matches = findAddressRoadMarkers(address, roadMarkerOptions);
    const addressRoadMarkerId =
      matches.length === 1
        ? (matches[0]?.id ?? '')
        : matches.some((marker) => marker.id === form.addressRoadMarkerId)
          ? form.addressRoadMarkerId
          : '';
    onChange({ address, addressRoadMarkerId });
  };

  return (
    <div className="admin-poi-business-details">
      <label>
        <span>营业时间</span>
        <input
          disabled={disabled}
          maxLength={500}
          value={form.openingHours}
          onChange={(event) => onChange({ openingHours: event.currentTarget.value })}
          placeholder="例如：周一至周五 09:00-18:00"
        />
      </label>
      <label>
        <span>文字地址</span>
        <input
          disabled={disabled}
          maxLength={300}
          value={form.address}
          onChange={(event) => updateAddress(event.currentTarget.value)}
          placeholder="例如：青年大街 18 号"
        />
      </label>
      <label>
        <span>地址道路</span>
        <select
          disabled={disabled || !form.address.trim()}
          value={form.addressRoadMarkerId}
          onChange={(event) => onChange({ addressRoadMarkerId: event.currentTarget.value })}
        >
          <option value="">不绑定道路</option>
          {form.addressRoadMarkerId &&
          !orderedRoads.some((marker) => marker.id === form.addressRoadMarkerId) ? (
            <option value={form.addressRoadMarkerId}>{form.addressRoadMarkerId}</option>
          ) : null}
          {orderedRoads.map((marker) => (
            <option value={marker.id} key={marker.id}>
              {marker.label}
            </option>
          ))}
        </select>
      </label>
      <PoiFacilityEditor
        disabled={disabled}
        facilities={form.facilities}
        onChange={(facilities) => onChange({ facilities })}
      />
    </div>
  );
}

function EditLegacyPoiMarkerDialog({
  categories,
  isBusy,
  marker,
  onClose,
  onSubmit,
  parentMarkerOptions,
  regionMarkerOptions,
  roadMarkerOptions,
  tilePreviewConfig,
}: Readonly<{
  categories: PoiCategory[];
  isBusy: boolean;
  marker: MapMarker;
  onClose: () => void;
  onSubmit: (input: LegacyPoiMarkerEditInput) => Promise<string | null>;
  parentMarkerOptions: MapMarker[];
  regionMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const [form, setForm] = useState<LegacyPoiMarkerEditInput>(() => ({
    label: marker.label,
    categoryId: marker.categoryId ?? '',
    iconFileName: marker.iconFileName ?? '',
    description: marker.description ?? '',
    href: marker.href ?? '',
    imageUrl: marker.imageUrl ?? '',
    geometry: marker.geometry,
    parentMarkerId: marker.parentMarkerId ?? '',
    boundRegionMarkerIds: marker.boundRegionMarkerIds ?? [],
    openingHours: marker.openingHours ?? '',
    address: marker.address ?? '',
    addressRoadMarkerId: marker.addressRoadMarkerId ?? '',
    facilities: marker.facilities ?? [],
  }));
  const [geometryDraft, setGeometryDraft] = useState<PoiGeometryDraft>(() =>
    createPoiGeometryDraft(marker.geometry),
  );
  const [error, setError] = useState('');
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const iconOptions = selectedCategory?.iconMapping.iconFileNames ?? [];

  const updateForm = (patch: Partial<LegacyPoiMarkerEditInput>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.categoryId && patch.categoryId !== current.categoryId) {
        const nextCategory = categories.find((category) => category.id === patch.categoryId);
        next.iconFileName = nextCategory?.iconMapping.iconFileNames.includes(current.iconFileName)
          ? current.iconFileName
          : '';
      }
      return next;
    });
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.label.trim()) {
      setError('请填写标记点名称。');
      return;
    }
    if (form.facilities.some((facility) => !facility.description.trim())) {
      setError('请填写每条设施信息的文字描述。');
      return;
    }

    const geometryResult = buildMapGeometryFromDraft(geometryDraft);
    if (!geometryResult.geometry) {
      setError(geometryResult.error ?? '请填写有效的几何坐标。');
      return;
    }

    const submitError = await onSubmit({
      ...form,
      label: form.label.trim(),
      categoryId: form.categoryId.trim(),
      iconFileName: form.iconFileName.trim(),
      description: form.description.trim(),
      href: form.href.trim(),
      imageUrl: form.imageUrl.trim(),
      geometry: geometryResult.geometry,
      parentMarkerId: form.parentMarkerId.trim(),
      boundRegionMarkerIds: form.boundRegionMarkerIds,
      openingHours: form.openingHours.trim(),
      address: form.address.trim(),
      addressRoadMarkerId: form.addressRoadMarkerId,
      facilities: form.facilities,
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
        aria-labelledby="admin-legacy-poi-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-legacy-poi-edit-title">编辑旧有 POI</h2>
          <span className="muted">{marker.id}</span>
        </div>
        <label>
          <span>标记点名称</span>
          <input
            value={form.label}
            onChange={(event) => updateForm({ label: event.currentTarget.value })}
            maxLength={200}
          />
        </label>
        <label>
          <span>分类</span>
          <select
            value={form.categoryId}
            onChange={(event) => updateForm({ categoryId: event.currentTarget.value })}
          >
            <option value="">未分类</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {formatCategoryName(category.id, category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>展示图标</span>
          <select
            value={form.iconFileName}
            onChange={(event) => updateForm({ iconFileName: event.currentTarget.value })}
          >
            <option value="">跟随分类默认图标</option>
            {iconOptions.map((iconValue) => (
              <option value={iconValue} key={iconValue}>
                {iconValue}
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
        <AdminPoiBusinessDetailsFields
          disabled={isBusy}
          form={form}
          roadMarkerOptions={roadMarkerOptions}
          onChange={updateForm}
        />
        <label>
          <span>链接</span>
          <input
            value={form.href}
            onChange={(event) => updateForm({ href: event.currentTarget.value })}
            placeholder="https://..."
          />
        </label>
        <div className="admin-poi-image-edit-block">
          <label>
            <span>图片</span>
            <input
              value={form.imageUrl}
              onChange={(event) => updateForm({ imageUrl: event.currentTarget.value })}
              placeholder="https://... 或 /api/map/poi-submission-images/..."
            />
          </label>
          <div className="admin-content-actions">
            {form.imageUrl ? (
              <a
                href={resolvePoiSubmissionImageUrl(form.imageUrl)}
                target="_blank"
                rel="noreferrer"
              >
                预览图片
              </a>
            ) : null}
            <button
              type="button"
              disabled={!form.imageUrl}
              onClick={() => updateForm({ imageUrl: '' })}
            >
              删除图片
            </button>
          </div>
        </div>
        <label>
          <span>几何类型</span>
          <select
            value={geometryDraft.type}
            onChange={(event) =>
              setGeometryDraft(
                createEmptyPoiGeometryDraft(
                  event.currentTarget.value as PoiGeometryDraft['type'],
                  getGeometryDraftRepresentativeCoordinate(geometryDraft),
                ),
              )
            }
          >
            <option value="Point">点状 POI</option>
            <option value="MultiPoint">多点对象</option>
            <option value="LineString">道路 / 线性 POI</option>
            <option value="Rectangle">矩形区域</option>
            <option value="MultiRectangle">多矩形区域</option>
            <option value="Polygon">多边形区域</option>
            <option value="MultiPolygon">多重多边形区域</option>
          </select>
        </label>
        <LegacyPoiGeometryEditor
          draft={geometryDraft}
          originalGeometry={marker.geometry}
          tilePreviewConfig={tilePreviewConfig}
          onChange={(draft) => {
            setGeometryDraft(draft);
            setError('');
          }}
        />
        <label>
          <span>父地点</span>
          <select
            value={form.parentMarkerId}
            onChange={(event) => updateForm({ parentMarkerId: event.currentTarget.value })}
          >
            <option value="">无父地点</option>
            {parentMarkerOptions
              .filter((candidate) => candidate.id !== marker.id)
              .map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.label} · {candidate.id}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="admin-poi-region-bindings">
          <legend>绑定区域</legend>
          {regionMarkerOptions.length > 0 ? (
            regionMarkerOptions.map((region) => (
              <label className="checkbox-row" key={region.id}>
                <input
                  type="checkbox"
                  checked={form.boundRegionMarkerIds.includes(region.id)}
                  onChange={(event) =>
                    updateForm({
                      boundRegionMarkerIds: event.currentTarget.checked
                        ? [...form.boundRegionMarkerIds, region.id]
                        : form.boundRegionMarkerIds.filter((id) => id !== region.id),
                    })
                  }
                />
                <span>{region.label}</span>
              </label>
            ))
          ) : (
            <p className="muted">当前地图数据中没有可绑定的区域 POI。</p>
          )}
        </fieldset>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            保存修改
          </button>
        </div>
      </form>
    </div>
  );
}

function LegacyPoiGeometryEditor({
  draft,
  onChange,
  originalGeometry,
  tilePreviewConfig,
}: Readonly<{
  draft: PoiGeometryDraft;
  onChange: (draft: PoiGeometryDraft) => void;
  originalGeometry: MapGeometry;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  if (draft.type === 'Point') {
    const currentCoordinate = parseCoordinateDraft(draft.coordinate);
    const originalCoordinate =
      originalGeometry.type === 'Point'
        ? originalGeometry.coordinates
        : getGeometryRepresentativeCoordinate(originalGeometry);
    return (
      <div className="admin-poi-edit-coordinate">
        <div className="admin-poi-edit-coordinate-fields">
          <label>
            <span>X 坐标</span>
            <input
              inputMode="decimal"
              value={draft.coordinate.x}
              onChange={(event) =>
                onChange({
                  type: 'Point',
                  coordinate: { ...draft.coordinate, x: event.currentTarget.value },
                })
              }
            />
          </label>
          <label>
            <span>Z 坐标</span>
            <input
              inputMode="decimal"
              value={draft.coordinate.z}
              onChange={(event) =>
                onChange({
                  type: 'Point',
                  coordinate: { ...draft.coordinate, z: event.currentTarget.value },
                })
              }
            />
          </label>
        </div>
        <PoiPointCoordinatePicker
          contextMarkers={[]}
          currentCoordinate={currentCoordinate}
          originalCoordinate={originalCoordinate}
          tilePreviewConfig={tilePreviewConfig}
          onPick={(coordinate) =>
            onChange({ type: 'Point', coordinate: coordinateToDraft(coordinate) })
          }
        />
      </div>
    );
  }

  return (
    <PoiNonPointGeometryEditor
      contextMarkers={[]}
      draft={draft}
      tilePreviewConfig={tilePreviewConfig}
      onChange={onChange}
    />
  );
}

function PoiCategoryBoard({
  categories,
  filterValue,
  iconBaseUrl,
  isBusy,
  metrics,
  onEdit,
  onEditCategory,
  onFilterChange,
  onQueryChange,
  onResetFilters,
  query,
  totalCount,
}: Readonly<{
  categories: PoiCategory[];
  filterValue: PoiCategoryBoardFilter;
  iconBaseUrl: string;
  isBusy: boolean;
  metrics: Array<{ label: string; tone?: 'accent' | 'warning'; value: number }>;
  onEdit: () => void;
  onEditCategory: (categoryId: string) => void;
  onFilterChange: (value: PoiCategoryBoardFilter) => void;
  onQueryChange: (value: string) => void;
  onResetFilters: () => void;
  query: string;
  totalCount: number;
}>) {
  return (
    <section className="admin-poi-category-board" aria-labelledby="admin-poi-category-board-title">
      <div className="section-heading">
        <h2 id="admin-poi-category-board-title">分类与图标</h2>
        <span className="muted">{`${categories.length} / ${totalCount} 类`}</span>
      </div>
      <div className="admin-report-summary admin-poi-summary" aria-label="POI 分类摘要">
        {metrics.map((metric) => (
          <AdminPoiMetric
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
            key={metric.label}
          />
        ))}
      </div>
      <div className="admin-toolbar admin-poi-toolbar" aria-label="POI 分类筛选">
        <label>
          <span>公开投稿</span>
          <select
            value={filterValue}
            onChange={(event) =>
              onFilterChange(event.currentTarget.value as PoiCategoryBoardFilter)
            }
          >
            {poiCategoryBoardFilterOptions.map((option) => (
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
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="分类名称、ID、默认图标"
          />
        </label>
        <button type="button" onClick={onResetFilters}>
          重置筛选
        </button>
        <button
          className="secondary-action-button is-primary"
          type="button"
          disabled={isBusy}
          onClick={onEdit}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            tune
          </span>
          <span>编辑分类与图标</span>
        </button>
      </div>
      <div className="admin-content-list" aria-label="POI 分类记录">
        {categories.map((category) => (
          <article className="admin-content-item admin-poi-category-summary-item" key={category.id}>
            <div className="admin-poi-category-summary-main">
              <div className="admin-poi-title-row">
                <PoiCategoryIcon category={category} iconBaseUrl={iconBaseUrl} />
                <div>
                  <strong>{category.name}</strong>
                  <p className="muted">
                    {category.id} · 排序 {category.sortOrder} · 默认图标{' '}
                    {category.iconMapping.defaultIconFileName || '未设置'}
                  </p>
                </div>
                <span
                  className={`admin-poi-status-chip is-${
                    category.acceptsPublicSubmissions ? 'approved' : 'rejected'
                  }`}
                >
                  {category.acceptsPublicSubmissions ? '允许公开投稿' : '不允许公开投稿'}
                </span>
              </div>
              <div className="operation-tag-list">
                <span className="operation-tag">{`图标 ${category.iconMapping.iconFileNames.length}`}</span>
                {category.iconMapping.iconFileNames.length > 1 ? (
                  <span className="operation-tag is-accent">多图标配置</span>
                ) : null}
              </div>
              <div
                className="admin-content-publish-assets"
                aria-label={`${category.name} 图标样例`}
              >
                {category.iconMapping.iconFileNames.slice(0, 3).map((iconValue) => (
                  <span className="admin-poi-category-icon-chip" key={iconValue}>
                    <span className="admin-poi-category-icon-swatch-group" aria-hidden="true">
                      {['light', 'dark', 'map'].map((tone) => (
                        <span className={`admin-poi-category-icon-swatch is-${tone}`} key={tone}>
                          <img
                            src={toMarkerIconUrl(iconValue, iconBaseUrl)}
                            alt=""
                            draggable={false}
                          />
                        </span>
                      ))}
                    </span>
                    <code>{iconValue}</code>
                    {category.iconMapping.defaultIconFileName === iconValue ? (
                      <small>默认</small>
                    ) : null}
                  </span>
                ))}
                {category.iconMapping.iconFileNames.length > 3 ? (
                  <span className="operation-tag">{`其余 ${category.iconMapping.iconFileNames.length - 3} 个`}</span>
                ) : null}
              </div>
            </div>
            <div className="admin-content-actions">
              <button type="button" disabled={isBusy} onClick={() => onEditCategory(category.id)}>
                编辑配置
              </button>
            </div>
          </article>
        ))}
        {categories.length === 0 ? (
          <div className="admin-content-empty">
            <p className="muted">当前筛选条件下没有 POI 分类。</p>
            <button type="button" onClick={onResetFilters}>
              查看全部分类
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PoiSubmissionReviewItem({
  category,
  conflictHints,
  hierarchyHint,
  iconBaseUrl,
  isBusy,
  isSelected,
  imageReview,
  onAddChild,
  onCopy,
  onDetail,
  onDelete,
  onEdit,
  onPublish,
  onReject,
  onRunAction,
  onToggleSelected,
  submission,
}: Readonly<{
  category?: PoiCategory;
  conflictHints: PoiConflictHint[];
  hierarchyHint?: PoiHierarchyHint | null;
  iconBaseUrl: string;
  isBusy: boolean;
  isSelected: boolean;
  imageReview?: PoiSubmissionImageReview;
  onAddChild: () => void;
  onCopy: (message: string) => void;
  onDetail: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onReject: () => void;
  onRunAction: (poiId: string, action: 'approve' | 'reject', reason?: string) => Promise<boolean>;
  onToggleSelected: () => void;
  submission: PoiSubmission;
}>) {
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const mapHref = representativeCoordinate
    ? buildSubmissionMapHref(submission, representativeCoordinate)
    : appPath('/map');
  const rejectedImage = imageReview?.decision === 'rejected';
  const unreviewedImage = Boolean(submission.imageUrl) && !imageReview;
  const hasConflicts = conflictHints.length > 0;
  const conflictSummary = hasConflicts ? `${conflictHints.length} 条` : '';

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy(successMessage);
    } catch {
      onCopy('浏览器未允许写入剪贴板，可手动复制页面中的坐标或几何信息。');
    }
  };

  return (
    <article className="admin-content-item admin-poi-item">
      <label className="admin-content-select">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          aria-label={`选择 POI 投稿 ${submission.title}`}
        />
      </label>
      <div className="admin-poi-main">
        <div className="admin-poi-title-row">
          <PoiCategoryIcon
            category={category}
            iconBaseUrl={iconBaseUrl}
            iconFileName={submission.iconFileName}
          />
          <div>
            <strong>{submission.title}</strong>
            <p className="muted">
              {formatCategoryName(submission.categoryId, category)} ·{' '}
              {statusLabel(submission.status)} · {geometryLabel(submission.geometry)}
            </p>
          </div>
          <span className={`admin-poi-status-chip is-${submission.status}`}>
            {statusLabel(submission.status)}
          </span>
        </div>
        <div className="operation-tag-list">
          <span className="operation-tag">{geometryLabel(submission.geometry)}</span>
          {hasConflicts ? (
            <span className="operation-tag is-warning">{`冲突 ${conflictSummary}`}</span>
          ) : null}
          {rejectedImage ? <span className="operation-tag is-warning">图片不合格</span> : null}
          {unreviewedImage ? <span className="operation-tag">图片待审</span> : null}
          {hierarchyHint ? <span className="operation-tag">疑似父子地点</span> : null}
          {submission.parentMarkerId ? <span className="operation-tag">已绑定父地点</span> : null}
          {submission.boundRegionMarkerIds?.length ? (
            <span className="operation-tag">{`绑定区域 ${submission.boundRegionMarkerIds.length}`}</span>
          ) : null}
          {submission.description ? <span className="operation-tag">已填写简介</span> : null}
          {submission.openingHours ? <span className="operation-tag">已填写营业时间</span> : null}
          {submission.address ? <span className="operation-tag">已填写地址</span> : null}
          {submission.facilities?.length ? (
            <span className="operation-tag">{`设施 ${submission.facilities.length}`}</span>
          ) : null}
        </div>
        {representativeCoordinate ? (
          <p className="muted">代表坐标：{formatCoordinatePair(representativeCoordinate)}</p>
        ) : null}
        <p className="muted">
          投稿人：{submission.submittedBy}
          {submission.submittedAt ? ` · ${formatDate(submission.submittedAt)}` : ''}
          {submission.reviewReason ? ` · ${submission.reviewReason}` : ''}
        </p>
      </div>
      <div className="admin-content-actions">
        <button type="button" onClick={onDetail}>
          查看详情
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
          disabled={isBusy || !canEditPoiSubmission(submission.status)}
          onClick={onEdit}
        >
          修正资料
        </button>
        {submission.geometry.type === 'Point' ? (
          <button type="button" disabled={isBusy} onClick={onAddChild}>
            新增子地点
          </button>
        ) : null}
        <button
          type="button"
          disabled={isBusy || !canDeletePoiSubmission(submission.status)}
          onClick={onDelete}
        >
          删除
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
          const decision = conflictDecisionByKey.get(
            conflictDecisionKey(submission.id, hint.marker.id),
          );
          return (
            <article className="admin-poi-conflict-chip" key={hint.marker.id}>
              <a href={buildMarkerFocusHref(hint.marker)} target="_blank" rel="noreferrer">
                <span>{hint.marker.label}</span>
                <small>
                  {hint.reasons.join('、')}
                  {hint.distanceBlocks !== null
                    ? ` · 约 ${Math.round(hint.distanceBlocks)} 格`
                    : ''}
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

function PoiSubmissionDetailDialog({
  category,
  conflictDecisionByKey,
  contextMarkers,
  conflictHints,
  hierarchyHint,
  imageReview,
  isBusy,
  onClose,
  onConflictDecision,
  onDelete,
  onEdit,
  onImageReview,
  onPublish,
  onReject,
  onRunAction,
  onStatus,
  submission,
  tilePreviewConfig,
}: Readonly<{
  category?: PoiCategory;
  conflictDecisionByKey: Map<string, PoiConflictDecision>;
  contextMarkers: PoiAuditContextMarker[];
  conflictHints: PoiConflictHint[];
  hierarchyHint?: PoiHierarchyHint | null;
  imageReview?: PoiSubmissionImageReview;
  isBusy: boolean;
  onClose: () => void;
  onConflictDecision: (hint: PoiConflictHint, decision: PoiConflictDecisionInput) => void;
  onDelete: () => void;
  onEdit: () => void;
  onImageReview: (decision: PoiSubmissionImageReviewInput) => void;
  onPublish: () => void;
  onReject: () => void;
  onRunAction: (poiId: string, action: 'approve' | 'reject', reason?: string) => Promise<boolean>;
  onStatus: (message: string) => void;
  submission: AdminPoiSubmission;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const mapHref = representativeCoordinate
    ? buildSubmissionMapHref(submission, representativeCoordinate)
    : appPath('/map');

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onStatus(successMessage);
    } catch {
      onStatus('浏览器未允许写入剪贴板，可手动复制页面中的坐标或几何信息。');
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel admin-poi-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-poi-detail-title">POI 投稿详情</h2>
          <span className="muted">{submission.title}</span>
        </div>
        <div className="admin-toolbar admin-poi-toolbar">
          <button
            type="button"
            onClick={onEdit}
            disabled={isBusy || !canEditPoiSubmission(submission.status)}
          >
            修正资料
          </button>
          <button
            type="button"
            disabled={isBusy || !canDeletePoiSubmission(submission.status)}
            onClick={onDelete}
          >
            删除
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
        </div>
        {conflictHints.length > 0 ? (
          <PoiConflictHintList
            conflictDecisionByKey={conflictDecisionByKey}
            hints={conflictHints}
            isBusy={isBusy}
            onDecision={onConflictDecision}
            submission={submission}
          />
        ) : null}
        {submission.imageUrl ? (
          <PoiSubmissionImagePreview
            imageReview={imageReview}
            isBusy={isBusy}
            onReview={onImageReview}
            submission={submission}
          />
        ) : null}
        <PoiSubmissionDetail
          category={category}
          contextMarkers={contextMarkers}
          hierarchyHint={hierarchyHint}
          representativeCoordinate={representativeCoordinate}
          submission={submission}
          tilePreviewConfig={tilePreviewConfig}
        />
        <div className="admin-content-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </section>
    </div>
  );
}

function PoiSubmissionDetail({
  category,
  contextMarkers,
  hierarchyHint,
  representativeCoordinate,
  submission,
  tilePreviewConfig,
}: Readonly<{
  category?: PoiCategory;
  contextMarkers: PoiAuditContextMarker[];
  hierarchyHint?: PoiHierarchyHint | null;
  representativeCoordinate: [number, number] | null;
  submission: PoiSubmission;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  return (
    <div className="admin-poi-detail">
      <PoiAuditMapPreview
        contextMarkers={contextMarkers}
        submission={submission}
        tilePreviewConfig={tilePreviewConfig}
      />
      {hierarchyHint ? <PoiHierarchyHintPanel hint={hierarchyHint} /> : null}
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
            {category
              ? ` · ${category.acceptsPublicSubmissions ? '允许公开投稿' : '不允许公开投稿'}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>展示图标</dt>
          <dd>{submission.iconFileName || '跟随分类默认图标'}</dd>
        </div>
        <div>
          <dt>几何</dt>
          <dd>{geometryLabel(submission.geometry)}</dd>
        </div>
        <div>
          <dt>代表坐标</dt>
          <dd>
            {representativeCoordinate ? formatCoordinatePair(representativeCoordinate) : '暂无'}
          </dd>
        </div>
        <div>
          <dt>链接</dt>
          <dd>{submission.href ? <a href={submission.href}>{submission.href}</a> : '未填写'}</dd>
        </div>
        <div>
          <dt>营业时间</dt>
          <dd>{submission.openingHours || '未填写'}</dd>
        </div>
        <div>
          <dt>文字地址</dt>
          <dd>{submission.address || '未填写'}</dd>
        </div>
        <div>
          <dt>地址道路</dt>
          <dd>{submission.addressRoadMarkerId || '未绑定'}</dd>
        </div>
        <div>
          <dt>审核</dt>
          <dd>
            {submission.reviewedBy
              ? `${submission.reviewedBy} · ${submission.reviewedAt ? formatDate(submission.reviewedAt) : '已审核'}`
              : '尚未审核'}
          </dd>
        </div>
      </dl>
      {submission.facilities?.length ? (
        <div className="admin-poi-detail-facilities">
          <strong>设施信息</strong>
          {submission.facilities.map((facility, index) => (
            <div key={`${facility.symbolIcon}-${index}`}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {facility.symbolIcon}
              </span>
              <span>{facility.description}</span>
            </div>
          ))}
        </div>
      ) : null}
      <details>
        <summary>几何 JSON</summary>
        <pre>{JSON.stringify(submission.geometry, null, 2)}</pre>
      </details>
    </div>
  );
}

function PoiHierarchyHintPanel({ hint }: Readonly<{ hint: PoiHierarchyHint }>) {
  return (
    <div className="admin-poi-hierarchy-hint">
      <div>
        <strong>可能父子地点</strong>
        <span>来自旧地图命名规则</span>
      </div>
      <dl>
        <div>
          <dt>父地点</dt>
          <dd>{hint.parentLabel}</dd>
        </div>
        <div>
          <dt>子地点</dt>
          <dd>{hint.childLabel}</dd>
        </div>
        <div>
          <dt>父地点参考</dt>
          <dd>
            {hint.parentMarkers.length
              ? hint.parentMarkers
                  .slice(0, 3)
                  .map((marker) => marker.label)
                  .join('、')
              : '未找到同名公开标记'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function PoiAuditMapPreview({
  contextMarkers,
  submission,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  submission: PoiSubmission;
  tilePreviewConfig: PoiTilePreviewConfig;
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
        <span>
          {contextMarkers.length ? `附近参考 ${contextMarkers.length} 个` : '暂无附近参考标记'}
        </span>
      </div>
      <div className="admin-poi-audit-map-stage">
        <PoiAuditTileLayer bounds={preview.bounds} tilePreviewConfig={tilePreviewConfig} />
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
      </div>
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

function PoiAuditTileLayer({
  bounds,
  tilePreviewConfig,
}: Readonly<{
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const tiles = buildPoiAuditPreviewTiles(bounds, tilePreviewConfig);
  if (tiles.length === 0) {
    return null;
  }

  return (
    <div className="admin-poi-audit-map-tiles" aria-hidden="true">
      {tiles.map((tile) => (
        <img
          className="admin-poi-audit-map-tile"
          draggable={false}
          key={tile.id}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
          src={tile.url}
          style={buildPoiTileStyle(tile)}
        />
      ))}
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
  conflictDecisions,
  conflictHints,
  imageReview,
  isBusy,
  onClose,
  onConfirm,
  submission,
}: Readonly<{
  category?: PoiCategory;
  conflictDecisions: PoiConflictDecision[];
  conflictHints: PoiConflictHint[];
  imageReview?: PoiSubmissionImageReview;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submission: AdminPoiSubmission;
}>) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const hasRejectedImage = imageReview?.decision === 'rejected';
  const duplicateDecisionCount = conflictDecisions.filter(
    (decision) => decision.decision === 'duplicate',
  ).length;
  const hasDuplicateDecision = duplicateDecisionCount > 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isConfirmed || hasRejectedImage || hasDuplicateDecision) {
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
          发布后该 POI
          会对所有用户可见，并参与地图搜索、附近地点和路线规划候选。请先确认坐标、分类、图片来源和重复提示。
        </p>
        {hasRejectedImage ? (
          <p className="admin-poi-publish-blocker">
            投稿图片已被标记为不合格。请先更换图片，或重置图片审核状态后再发布。
          </p>
        ) : null}
        {hasDuplicateDecision ? (
          <p className="admin-poi-publish-blocker">
            仍有 {duplicateDecisionCount}{' '}
            条冲突提示被标记为待合并。请先完成合并、重置判断或改为忽略后再发布。
          </p>
        ) : null}
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
            <dd>
              {representativeCoordinate ? formatCoordinatePair(representativeCoordinate) : '暂无'}
            </dd>
          </div>
          <div>
            <dt>投稿图片</dt>
            <dd>
              {submission.imageUrl
                ? imageReview
                  ? imageReviewLabel(imageReview.decision)
                  : '有图片，尚未标记审核状态'
                : '未提交图片'}
            </dd>
          </div>
          <div>
            <dt>重复提示</dt>
            <dd>
              {conflictHints.length
                ? duplicateDecisionCount
                  ? `发现 ${conflictHints.length} 条可能冲突提示，其中 ${duplicateDecisionCount} 条待合并`
                  : `发现 ${conflictHints.length} 条可能冲突提示`
                : '未发现明显冲突提示'}
            </dd>
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
          <button
            type="submit"
            disabled={isBusy || !isConfirmed || hasRejectedImage || hasDuplicateDecision}
          >
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

function BulkRejectPoiDialog({
  isBusy,
  onClose,
  onSubmit,
  submissions,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  submissions: AdminPoiSubmission[];
}>) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError('请填写统一驳回理由，方便投稿者批量修正。');
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
        aria-labelledby="admin-poi-bulk-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-poi-bulk-reject-title">批量驳回 POI 投稿</h2>
          <span className="muted">{`${submissions.length} 条待审核记录`}</span>
        </div>
        <p className="muted">
          本次会对所选待审核投稿写入同一条驳回理由，适合坐标偏移、分类不准、图片问题这类统一退回场景。
        </p>
        <div className="admin-content-publish-assets" aria-label="批量驳回对象">
          {submissions.slice(0, 10).map((submission) => (
            <span className="operation-tag" key={submission.id}>
              {submission.title}
            </span>
          ))}
          {submissions.length > 10 ? (
            <span className="operation-tag">{`其余 ${submissions.length - 10} 条`}</span>
          ) : null}
        </div>
        <label>
          <span>统一驳回理由</span>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setError('');
            }}
            placeholder="例如：坐标位置普遍偏移，需要重新选点后再次提交。"
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
            确认批量驳回
          </button>
        </div>
      </form>
    </div>
  );
}

function BulkPublishPoiDialog({
  conflictDecisions,
  imageReviewByKey,
  isBusy,
  onClose,
  onConfirm,
  submissions,
}: Readonly<{
  conflictDecisions: PoiConflictDecision[];
  imageReviewByKey: Map<string, PoiSubmissionImageReview>;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: (targets: AdminPoiSubmission[]) => Promise<void>;
  submissions: AdminPoiSubmission[];
}>) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const publishReadyTargets = submissions.filter(
    (submission) => !isPoiSubmissionPublishBlocked(submission, imageReviewByKey, conflictDecisions),
  );
  const blockedTargets = submissions.filter((submission) =>
    isPoiSubmissionPublishBlocked(submission, imageReviewByKey, conflictDecisions),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isConfirmed || publishReadyTargets.length === 0 || blockedTargets.length > 0) {
      return;
    }

    await onConfirm(publishReadyTargets);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-poi-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-bulk-publish-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-poi-bulk-publish-title">批量发布到公开地图</h2>
          <span className="muted">{`${submissions.length} 条待发布记录`}</span>
        </div>
        <p className="admin-poi-publish-warning">
          批量发布会让所选 POI
          立即进入公开地图。请先确认坐标、分类、图片来源和冲突提示已经逐条核对。
        </p>
        {blockedTargets.length > 0 ? (
          <p className="admin-poi-publish-blocker">
            当前所选记录里仍有 {blockedTargets.length}{' '}
            条阻塞发布。请先处理图片不合格或待合并冲突后再执行批量发布。
          </p>
        ) : null}
        <dl className="admin-poi-publish-summary">
          <div>
            <dt>所选记录</dt>
            <dd>{submissions.length}</dd>
          </div>
          <div>
            <dt>可发布</dt>
            <dd>{publishReadyTargets.length}</dd>
          </div>
          <div>
            <dt>阻塞发布</dt>
            <dd>{blockedTargets.length}</dd>
          </div>
          <div>
            <dt>含图片</dt>
            <dd>{submissions.filter((submission) => Boolean(submission.imageUrl)).length}</dd>
          </div>
          <div>
            <dt>冲突待合并</dt>
            <dd>
              {
                submissions.filter((submission) =>
                  conflictDecisions.some(
                    (decision) =>
                      decision.submissionId === submission.id && decision.decision === 'duplicate',
                  ),
                ).length
              }
            </dd>
          </div>
        </dl>
        <div className="admin-content-publish-assets" aria-label="批量发布对象">
          {publishReadyTargets.slice(0, 10).map((submission) => (
            <span className="operation-tag" key={submission.id}>
              {submission.title}
            </span>
          ))}
          {publishReadyTargets.length > 10 ? (
            <span className="operation-tag">{`其余 ${publishReadyTargets.length - 10} 条`}</span>
          ) : null}
        </div>
        {blockedTargets.length > 0 ? (
          <div className="admin-content-publish-blockers" aria-label="批量发布阻塞对象">
            {blockedTargets.slice(0, 5).map((submission) => (
              <p key={submission.id}>
                {submission.title}
                {submission.imageUrl &&
                imageReviewByKey.get(imageReviewKey(submission.id, submission.imageUrl))
                  ?.decision === 'rejected'
                  ? '：图片不合格'
                  : '：存在待合并冲突'}
              </p>
            ))}
          </div>
        ) : null}
        <label className="admin-poi-publish-confirm">
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={(event) => setIsConfirmed(event.currentTarget.checked)}
          />
          <span>我已核对所选 POI 的公开展示信息，确认可以批量发布。</span>
        </label>
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button
            type="submit"
            disabled={
              isBusy ||
              !isConfirmed ||
              publishReadyTargets.length === 0 ||
              blockedTargets.length > 0
            }
          >
            确认批量发布
          </button>
        </div>
      </form>
    </div>
  );
}

function EditPoiSubmissionDialog({
  categories,
  contextMarkers,
  initialParentMarkerId,
  isBusy,
  onClose,
  onSubmit,
  parentMarkerOptions,
  regionMarkerOptions,
  roadMarkerOptions,
  submission,
  tilePreviewConfig,
}: Readonly<{
  categories: PoiCategory[];
  contextMarkers: PoiAuditContextMarker[];
  initialParentMarkerId?: string;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (input: PoiSubmissionEditInput) => Promise<string | null>;
  parentMarkerOptions: MapMarker[];
  regionMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  submission?: PoiSubmission;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const [form, setForm] = useState<PoiSubmissionFormInput>(() => ({
    title: submission?.title ?? '',
    categoryId: submission?.categoryId ?? categories[0]?.id ?? '',
    iconFileName: submission?.iconFileName ?? '',
    description: submission?.description ?? '',
    href: submission?.href ?? '',
    imageUrl: submission?.imageUrl ?? '',
    parentMarkerId: submission?.parentMarkerId ?? initialParentMarkerId ?? '',
    boundRegionMarkerIds: submission?.boundRegionMarkerIds ?? [],
    openingHours: submission?.openingHours ?? '',
    address: submission?.address ?? '',
    addressRoadMarkerId: submission?.addressRoadMarkerId ?? '',
    facilities: submission?.facilities ?? [],
  }));
  const [geometryDraft, setGeometryDraft] = useState<PoiGeometryDraft>(() =>
    submission ? createPoiGeometryDraft(submission.geometry) : createEmptyPoiGeometryDraft('Point'),
  );
  const [error, setError] = useState('');
  const originalPointCoordinate =
    submission?.geometry.type === 'Point' ? submission.geometry.coordinates : null;
  const currentPointCoordinate =
    geometryDraft.type === 'Point'
      ? (parseCoordinateDraft(geometryDraft.coordinate) ?? originalPointCoordinate)
      : null;
  const pointMapCoordinate = currentPointCoordinate ?? originalPointCoordinate;
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const iconOptions = selectedCategory?.iconMapping.iconFileNames ?? [];

  const updateForm = (patch: Partial<PoiSubmissionFormInput>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.categoryId && patch.categoryId !== current.categoryId) {
        const nextCategory = categories.find((category) => category.id === patch.categoryId);
        next.iconFileName = nextCategory?.iconMapping.iconFileNames.includes(current.iconFileName)
          ? current.iconFileName
          : '';
      }
      return next;
    });
    setError('');
  };

  const updateGeometryDraft = (draft: PoiGeometryDraft) => {
    setGeometryDraft(draft);
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
    if (form.facilities.some((facility) => !facility.description.trim())) {
      setError('请填写每条设施信息的文字描述。');
      return;
    }

    const geometryResult = buildMapGeometryFromDraft(geometryDraft);
    if (!geometryResult.geometry) {
      setError(geometryResult.error ?? '请填写有效的几何坐标。');
      return;
    }

    const submitError = await onSubmit({
      title: form.title.trim(),
      categoryId: form.categoryId.trim(),
      iconFileName: form.iconFileName.trim(),
      description: form.description.trim(),
      href: form.href.trim(),
      imageUrl: form.imageUrl.trim(),
      geometry: geometryResult.geometry,
      parentMarkerId: form.parentMarkerId.trim(),
      boundRegionMarkerIds: form.boundRegionMarkerIds,
      openingHours: form.openingHours.trim(),
      address: form.address.trim(),
      addressRoadMarkerId: form.addressRoadMarkerId,
      facilities: form.facilities,
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
          <h2 id="admin-poi-edit-title">{submission ? '修正 POI 投稿' : '新增 POI'}</h2>
          <span className="muted">
            {submission ? getPoiEditDialogHint(submission.status) : '保存后进入待审核队列'}
          </span>
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
          <span>展示图标</span>
          <select
            value={form.iconFileName}
            onChange={(event) => updateForm({ iconFileName: event.currentTarget.value })}
          >
            <option value="">跟随分类默认图标</option>
            {iconOptions.map((iconValue) => (
              <option value={iconValue} key={iconValue}>
                {iconValue}
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
        <AdminPoiBusinessDetailsFields
          disabled={isBusy}
          form={form}
          roadMarkerOptions={roadMarkerOptions}
          onChange={updateForm}
        />
        <label>
          <span>链接</span>
          <input
            value={form.href}
            onChange={(event) => updateForm({ href: event.currentTarget.value })}
            placeholder="https://..."
          />
        </label>
        <div className="admin-poi-image-edit-block">
          <label>
            <span>图片</span>
            <input
              value={form.imageUrl}
              onChange={(event) => updateForm({ imageUrl: event.currentTarget.value })}
              placeholder="https://... 或 /api/map/poi-submission-images/..."
            />
          </label>
          <div className="admin-content-actions">
            {form.imageUrl ? (
              <a
                href={resolvePoiSubmissionImageUrl(form.imageUrl)}
                target="_blank"
                rel="noreferrer"
              >
                预览图片
              </a>
            ) : null}
            <button
              type="button"
              disabled={!form.imageUrl}
              onClick={() => updateForm({ imageUrl: '' })}
            >
              删除图片
            </button>
          </div>
        </div>
        <label>
          <span>几何类型</span>
          <select
            value={geometryDraft.type}
            onChange={(event) =>
              updateGeometryDraft(
                createEmptyPoiGeometryDraft(
                  event.currentTarget.value as PoiGeometryDraft['type'],
                  getGeometryDraftRepresentativeCoordinate(geometryDraft),
                ),
              )
            }
          >
            <option value="Point">点状 POI</option>
            <option value="MultiPoint">多点对象</option>
            <option value="LineString">道路 / 线性 POI</option>
            <option value="Rectangle">矩形区域</option>
            <option value="MultiRectangle">多矩形区域</option>
            <option value="Polygon">多边形区域</option>
            <option value="MultiPolygon">多重多边形区域</option>
          </select>
        </label>
        <label>
          <span>父地点</span>
          <select
            value={form.parentMarkerId}
            onChange={(event) => updateForm({ parentMarkerId: event.currentTarget.value })}
          >
            <option value="">无父地点</option>
            {parentMarkerOptions
              .filter((marker) => marker.id !== (submission ? `poi-${submission.id}` : ''))
              .map((marker) => (
                <option value={marker.id} key={marker.id}>
                  {marker.label} · {marker.id}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="admin-poi-region-bindings">
          <legend>绑定区域</legend>
          {regionMarkerOptions.length > 0 ? (
            regionMarkerOptions.map((marker) => (
              <label className="checkbox-row" key={marker.id}>
                <input
                  type="checkbox"
                  checked={form.boundRegionMarkerIds.includes(marker.id)}
                  onChange={(event) =>
                    updateForm({
                      boundRegionMarkerIds: event.currentTarget.checked
                        ? [...form.boundRegionMarkerIds, marker.id]
                        : form.boundRegionMarkerIds.filter((id) => id !== marker.id),
                    })
                  }
                />
                <span>{marker.label}</span>
              </label>
            ))
          ) : (
            <p className="muted">当前地图数据中没有可绑定的区域 POI。</p>
          )}
        </fieldset>
        {geometryDraft.type === 'Point' ? (
          <div className="admin-poi-edit-coordinate">
            <div className="admin-poi-edit-coordinate-fields">
              <label>
                <span>X 坐标</span>
                <input
                  inputMode="decimal"
                  value={geometryDraft.coordinate.x}
                  onChange={(event) => {
                    updateGeometryDraft({
                      type: 'Point',
                      coordinate: {
                        ...geometryDraft.coordinate,
                        x: event.currentTarget.value,
                      },
                    });
                  }}
                />
              </label>
              <label>
                <span>Z 坐标</span>
                <input
                  inputMode="decimal"
                  value={geometryDraft.coordinate.z}
                  onChange={(event) => {
                    updateGeometryDraft({
                      type: 'Point',
                      coordinate: {
                        ...geometryDraft.coordinate,
                        z: event.currentTarget.value,
                      },
                    });
                  }}
                />
              </label>
            </div>
            <PoiPointCoordinatePicker
              contextMarkers={contextMarkers}
              currentCoordinate={currentPointCoordinate}
              originalCoordinate={originalPointCoordinate}
              tilePreviewConfig={tilePreviewConfig}
              onPick={(coordinate) => {
                updateGeometryDraft({
                  type: 'Point',
                  coordinate: coordinateToDraft(coordinate),
                });
              }}
            />
            {submission && pointMapCoordinate ? (
              <a
                className="admin-action-link"
                href={buildSubmissionMapHref(submission, pointMapCoordinate)}
                target="_blank"
                rel="noreferrer"
              >
                打开地图辅助选点
              </a>
            ) : null}
          </div>
        ) : (
          <PoiNonPointGeometryEditor
            contextMarkers={contextMarkers}
            draft={geometryDraft}
            tilePreviewConfig={tilePreviewConfig}
            onChange={updateGeometryDraft}
          />
        )}
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            {submission ? '保存修正' : '创建 POI'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PoiNonPointGeometryEditor({
  contextMarkers,
  draft,
  onChange,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  draft: PoiGeometryDraft;
  onChange: (draft: PoiGeometryDraft) => void;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  if (draft.type === 'Point') {
    return null;
  }

  let fields;
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    fields = (
      <PoiCoordinateListEditor
        coordinates={draft.coordinates}
        minPoints={2}
        title={draft.type === 'LineString' ? '道路 / 线性 POI 点序' : '点组坐标'}
        onChange={(coordinates) => onChange({ type: draft.type, coordinates })}
      />
    );
  } else if (draft.type === 'Rectangle') {
    fields = (
      <PoiRectangleBoundsEditor
        bounds={draft.bounds}
        title="矩形区域边界"
        onChange={(bounds) => onChange({ type: 'Rectangle', bounds })}
      />
    );
  } else if (draft.type === 'MultiRectangle') {
    fields = (
      <PoiMultiRectangleEditor
        rectangles={draft.rectangles}
        onChange={(rectangles) => onChange({ type: 'MultiRectangle', rectangles })}
      />
    );
  } else if (draft.type === 'Polygon') {
    fields = (
      <PoiPolygonEditor
        rings={draft.rings}
        title="多边形边界"
        onChange={(rings) => onChange({ type: 'Polygon', rings })}
      />
    );
  } else {
    fields = (
      <PoiMultiPolygonEditor
        polygons={draft.polygons}
        onChange={(polygons) => onChange({ type: 'MultiPolygon', polygons })}
      />
    );
  }

  return (
    <div className="admin-poi-nonpoint-geometry-editor">
      <PoiGeometryVisualEditor
        contextMarkers={contextMarkers}
        draft={draft}
        tilePreviewConfig={tilePreviewConfig}
        onChange={onChange}
      />
      {fields}
    </div>
  );
}

function PoiGeometryVisualEditor({
  contextMarkers,
  draft,
  onChange,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>;
  onChange: (draft: PoiGeometryDraft) => void;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const preview = buildPoiGeometryDraftMapPreview(draft, contextMarkers);
  const handlePick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const coordinate = unprojectAuditMapPreviewCoordinate(
      [
        ((event.clientX - rect.left) / rect.width) * poiAuditPreviewWidth,
        ((event.clientY - rect.top) / rect.height) * poiAuditPreviewHeight,
      ],
      preview.bounds,
    );
    onChange(appendPoiGeometryDraftCoordinate(draft, coordinate));
  };
  const removable = canRemovePoiGeometryDraftCoordinate(draft);

  return (
    <section className="admin-poi-geometry-map-editor" aria-label="POI 几何地图编辑">
      <div className="admin-poi-audit-map-header">
        <strong>地图编辑</strong>
        <span>{geometryLabelFromDraft(draft)}</span>
      </div>
      <button
        className="admin-poi-geometry-map-stage"
        type="button"
        aria-label="在地图上添加几何节点"
        onClick={handlePick}
      >
        <PoiAuditTileLayer bounds={preview.bounds} tilePreviewConfig={tilePreviewConfig} />
        <svg viewBox={`0 0 ${poiAuditPreviewWidth} ${poiAuditPreviewHeight}`} aria-hidden="true">
          <rect
            className="admin-poi-audit-map-grid"
            x="0"
            y="0"
            width={poiAuditPreviewWidth}
            height={poiAuditPreviewHeight}
          />
          {preview.polygons.map((polygon, index) => (
            <polygon
              className="admin-poi-audit-map-submission-shape"
              key={`draft-polygon-${index}`}
              points={polygon}
            />
          ))}
          {preview.lines.map((line, index) => (
            <polyline
              className="admin-poi-audit-map-submission-line"
              key={`draft-line-${index}`}
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
              <title>{marker.marker.label}</title>
            </g>
          ))}
          {preview.points.map((point, index) => (
            <g
              className="admin-poi-geometry-map-node"
              key={`draft-point-${index}`}
              transform={`translate(${roundPreviewValue(point[0])} ${roundPreviewValue(point[1])})`}
            >
              <circle r="5" />
              <text x="8" y="4">
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </button>
      <div className="admin-content-actions">
        <button
          type="button"
          disabled={!removable}
          onClick={() => onChange(removeLastPoiGeometryDraftCoordinate(draft))}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            undo
          </span>
          <span>撤销末节点</span>
        </button>
      </div>
    </section>
  );
}

function PoiCoordinateListEditor({
  coordinates,
  minPoints,
  onChange,
  title,
}: Readonly<{
  coordinates: CoordinateDraft[];
  minPoints: number;
  onChange: (coordinates: CoordinateDraft[]) => void;
  title: string;
}>) {
  const updateCoordinate = (index: number, patch: Partial<CoordinateDraft>) => {
    onChange(
      coordinates.map((coordinate, currentIndex) =>
        currentIndex === index ? { ...coordinate, ...patch } : coordinate,
      ),
    );
  };

  const moveCoordinate = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= coordinates.length) {
      return;
    }

    const next = [...coordinates];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  const insertCoordinateAfter = (index: number) => {
    const next = [...coordinates];
    next.splice(index + 1, 0, createInsertedCoordinateDraft(coordinates, index));
    onChange(next);
  };

  const removeCoordinate = (index: number) => {
    if (coordinates.length <= minPoints) {
      return;
    }

    onChange(coordinates.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="admin-poi-edit-coordinate admin-poi-coordinate-list-editor">
      <div className="admin-poi-line-order-card">
        <strong>{title}</strong>
        <dl>
          <div>
            <dt>点数</dt>
            <dd>{coordinates.length}</dd>
          </div>
          <div>
            <dt>首点</dt>
            <dd>{formatDraftCoordinatePair(coordinates[0])}</dd>
          </div>
          <div>
            <dt>末点</dt>
            <dd>{formatDraftCoordinatePair(coordinates[coordinates.length - 1])}</dd>
          </div>
        </dl>
        <div className="admin-poi-geometry-toolbar">
          <button type="button" onClick={() => onChange([...coordinates].reverse())}>
            反转点序
          </button>
          <button
            type="button"
            onClick={() => onChange([...coordinates, createInsertedCoordinateDraft(coordinates)])}
          >
            添加点
          </button>
        </div>
      </div>
      <div className="admin-poi-coordinate-table" aria-label={title}>
        {coordinates.map((coordinate, index) => (
          <div className="admin-poi-coordinate-row" key={index}>
            <span>{index + 1}</span>
            <label>
              <span>X</span>
              <input
                inputMode="decimal"
                value={coordinate.x}
                onChange={(event) => updateCoordinate(index, { x: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>Z</span>
              <input
                inputMode="decimal"
                value={coordinate.z}
                onChange={(event) => updateCoordinate(index, { z: event.currentTarget.value })}
              />
            </label>
            <div className="admin-poi-coordinate-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveCoordinate(index, -1)}
              >
                上移
              </button>
              <button
                type="button"
                disabled={index === coordinates.length - 1}
                onClick={() => moveCoordinate(index, 1)}
              >
                下移
              </button>
              <button type="button" onClick={() => insertCoordinateAfter(index)}>
                插入
              </button>
              <button
                type="button"
                disabled={coordinates.length <= minPoints}
                onClick={() => removeCoordinate(index)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="muted">
        保存前会校验坐标数量和数值；道路吸附、瓦片叠加和站点图层仍属于后续地图工作台能力。
      </p>
    </div>
  );
}

function PoiRectangleBoundsEditor({
  bounds,
  onChange,
  onRemove,
  title,
}: Readonly<{
  bounds: RectangleBoundsDraft;
  onChange: (bounds: RectangleBoundsDraft) => void;
  onRemove?: () => void;
  title: string;
}>) {
  return (
    <div className="admin-poi-rectangle-editor">
      <div className="admin-poi-rectangle-editor-heading">
        <strong>{title}</strong>
        {onRemove ? (
          <button type="button" onClick={onRemove}>
            删除
          </button>
        ) : null}
      </div>
      <div className="admin-poi-rectangle-fields">
        <label>
          <span>最小 X</span>
          <input
            inputMode="decimal"
            value={bounds.minX}
            onChange={(event) => onChange({ ...bounds, minX: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>最小 Z</span>
          <input
            inputMode="decimal"
            value={bounds.minZ}
            onChange={(event) => onChange({ ...bounds, minZ: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>最大 X</span>
          <input
            inputMode="decimal"
            value={bounds.maxX}
            onChange={(event) => onChange({ ...bounds, maxX: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>最大 Z</span>
          <input
            inputMode="decimal"
            value={bounds.maxZ}
            onChange={(event) => onChange({ ...bounds, maxZ: event.currentTarget.value })}
          />
        </label>
      </div>
    </div>
  );
}

function PoiMultiRectangleEditor({
  onChange,
  rectangles,
}: Readonly<{
  onChange: (rectangles: RectangleBoundsDraft[]) => void;
  rectangles: RectangleBoundsDraft[];
}>) {
  return (
    <div className="admin-poi-edit-coordinate">
      {rectangles.map((bounds, index) => (
        <PoiRectangleBoundsEditor
          bounds={bounds}
          key={index}
          title={`矩形 ${index + 1}`}
          onChange={(nextBounds) =>
            onChange(
              rectangles.map((item, currentIndex) => (currentIndex === index ? nextBounds : item)),
            )
          }
          onRemove={
            rectangles.length > 1
              ? () => onChange(rectangles.filter((_, currentIndex) => currentIndex !== index))
              : undefined
          }
        />
      ))}
      <div className="admin-poi-geometry-toolbar">
        <button
          type="button"
          onClick={() => onChange([...rectangles, createNextRectangleDraft(rectangles)])}
        >
          添加矩形
        </button>
      </div>
    </div>
  );
}

function PoiPolygonEditor({
  onChange,
  onRemove,
  rings,
  title,
}: Readonly<{
  onChange: (rings: CoordinateDraft[][]) => void;
  onRemove?: () => void;
  rings: CoordinateDraft[][];
  title: string;
}>) {
  return (
    <div className="admin-poi-edit-coordinate admin-poi-polygon-editor">
      <div className="admin-poi-polygon-heading">
        <strong>{title}</strong>
        {onRemove ? (
          <button type="button" onClick={onRemove}>
            删除多边形
          </button>
        ) : null}
      </div>
      {rings.map((ring, index) => (
        <div className="admin-poi-polygon-ring" key={index}>
          <div className="admin-poi-polygon-heading">
            <span>{index === 0 ? '外边界' : `内环 ${index}`}</span>
            {rings.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(rings.filter((_, currentIndex) => currentIndex !== index))}
              >
                删除环
              </button>
            ) : null}
          </div>
          <PoiCoordinateListEditor
            coordinates={ring}
            minPoints={4}
            title={`边界点序 ${index + 1}`}
            onChange={(coordinates) =>
              onChange(
                rings.map((item, currentIndex) => (currentIndex === index ? coordinates : item)),
              )
            }
          />
        </div>
      ))}
      <div className="admin-poi-geometry-toolbar">
        <button
          type="button"
          onClick={() => onChange([...rings, createDefaultPolygonRingDraft(rings.at(-1)?.[0])])}
        >
          添加内环
        </button>
      </div>
    </div>
  );
}

function PoiMultiPolygonEditor({
  onChange,
  polygons,
}: Readonly<{
  onChange: (polygons: CoordinateDraft[][][]) => void;
  polygons: CoordinateDraft[][][];
}>) {
  return (
    <div className="admin-poi-edit-coordinate admin-poi-multi-polygon-editor">
      {polygons.map((rings, index) => (
        <PoiPolygonEditor
          key={index}
          rings={rings}
          title={`多边形 ${index + 1}`}
          onChange={(nextRings) =>
            onChange(
              polygons.map((item, currentIndex) => (currentIndex === index ? nextRings : item)),
            )
          }
          onRemove={
            polygons.length > 1
              ? () => onChange(polygons.filter((_, currentIndex) => currentIndex !== index))
              : undefined
          }
        />
      ))}
      <div className="admin-poi-geometry-toolbar">
        <button
          type="button"
          onClick={() =>
            onChange([...polygons, [createDefaultPolygonRingDraft(polygons.at(-1)?.[0]?.[0])]])
          }
        >
          添加多边形
        </button>
      </div>
    </div>
  );
}

function PoiPointCoordinatePicker({
  contextMarkers,
  currentCoordinate,
  onPick,
  originalCoordinate,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  currentCoordinate: [number, number] | null;
  onPick: (coordinate: [number, number]) => void;
  originalCoordinate: [number, number] | null;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  return (
    <EmbeddedMapLocationPicker
      ariaLabel="在坐标预览中点选新的 POI 坐标"
      footer={
        currentCoordinate
          ? `点击预览区域回填坐标 · 当前 ${formatCoordinatePair(currentCoordinate)}`
          : '点击预览区域回填坐标'
      }
      markers={contextMarkers.map((marker) => ({
        coordinate: marker.coordinate,
        id: marker.marker.id,
        label: marker.marker.label,
        tone:
          marker.relation === 'same-category'
            ? 'same-category'
            : marker.relation === 'road'
              ? 'road'
              : marker.relation === 'station'
                ? 'station'
                : 'nearby',
      }))}
      onChange={onPick}
      originalValue={originalCoordinate}
      tileTemplate={tilePreviewConfig.tileTemplate}
      value={currentCoordinate}
    />
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

function PoiCategoryProfileDialog({
  categories,
  iconBaseUrl,
  isBusy,
  selectedCategoryId,
  onClose,
  onSaved,
}: Readonly<{
  categories: PoiCategory[];
  iconBaseUrl: string;
  isBusy: boolean;
  selectedCategoryId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [drafts, setDrafts] = useState<PoiCategoryDraft[]>(() => createCategoryDrafts(categories));
  const [localStatus, setLocalStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingCategoryId, setUploadingCategoryId] = useState<string | null>(null);
  const [deletingIconKey, setDeletingIconKey] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(createCategoryDrafts(categories));
  }, [categories]);

  const visibleDrafts = useMemo(
    () => (selectedCategoryId ? drafts.filter((draft) => draft.id === selectedCategoryId) : drafts),
    [drafts, selectedCategoryId],
  );
  const selectedCategoryDraft = useMemo(
    () =>
      selectedCategoryId ? (drafts.find((draft) => draft.id === selectedCategoryId) ?? null) : null,
    [drafts, selectedCategoryId],
  );

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
                ? (icons[0] ?? '')
                : draft.defaultIconFileName,
            iconFileNamesText: icons.join('\n'),
          };
        }),
      );
      onSaved(
        data.fileDeleted === false ? '图标引用已移除，文件此前已不存在' : 'POI 分类图标已删除',
      );
    } finally {
      setDeletingIconKey(null);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel admin-poi-category-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-poi-category-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-poi-category-title">
            {selectedCategoryDraft ? `${selectedCategoryDraft.name} 分类配置` : '分类与图标配置'}
          </h2>
          <span className="muted">
            {selectedCategoryDraft
              ? '当前只显示所选分类的名称、图标、排序和公开投稿配置。'
              : '管理分类名称、默认图标、图标文件列表、排序和是否开放公开投稿。'}
          </span>
        </div>
        <div className="admin-poi-category-grid">
          {visibleDrafts.map((draft) => (
            <article className="admin-poi-category-row" key={draft.id}>
              <PoiCategoryIcon category={categoryDraftToInput(draft)} iconBaseUrl={iconBaseUrl} />
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
                            <img
                              src={toMarkerIconUrl(iconValue, iconBaseUrl)}
                              alt=""
                              draggable={false}
                            />
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
          <button
            type="button"
            disabled={isSaving || isBusy}
            onClick={() => setDrafts(createCategoryDrafts(categories))}
          >
            {selectedCategoryDraft ? '重置当前分类' : '重置当前配置'}
          </button>
          <button type="button" onClick={onClose} disabled={isSaving || isBusy}>
            关闭
          </button>
          <button
            type="button"
            disabled={isSaving || visibleDrafts.length === 0 || isBusy}
            onClick={saveCategories}
          >
            保存分类配置
          </button>
        </div>
        {localStatus ? <p className="muted">{localStatus}</p> : null}
      </section>
    </div>
  );
}

function PoiCategoryIcon({
  category,
  iconBaseUrl,
  iconFileName,
}: Readonly<{ category?: PoiCategory; iconBaseUrl: string; iconFileName?: string }>) {
  const resolvedIconFileName = iconFileName || category?.iconMapping.defaultIconFileName;
  if (resolvedIconFileName) {
    return (
      <img
        className="admin-poi-category-icon"
        src={toMarkerIconUrl(resolvedIconFileName, iconBaseUrl)}
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
  imageReview,
  isBusy,
  onReview,
  submission,
}: Readonly<{
  imageReview?: PoiSubmissionImageReview;
  isBusy: boolean;
  onReview: (decision: PoiSubmissionImageReviewInput) => void;
  submission: AdminPoiSubmission;
}>) {
  if (!submission.imageUrl) {
    return null;
  }

  const imageUrl = resolvePoiSubmissionImageUrl(submission.imageUrl);
  const metadata = submission.imageMetadata;

  return (
    <article className="admin-poi-image-preview">
      <a href={imageUrl} target="_blank" rel="noreferrer">
        <img src={imageUrl} alt={`${submission.title} 投稿图片`} loading="lazy" decoding="async" />
      </a>
      <div className="admin-poi-image-preview-copy">
        <div className="admin-poi-image-preview-heading">
          <span className="admin-poi-image-preview-title">投稿图片</span>
          {imageReview ? (
            <span className={`admin-poi-image-review-chip is-${imageReview.decision}`}>
              {imageReviewLabel(imageReview.decision)}
            </span>
          ) : null}
        </div>
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
          <small>
            {submission.imageUrl.startsWith('/')
              ? '本地图片元数据暂不可用'
              : '外部图片链接，无法读取本地元数据'}
          </small>
        )}
        <div className="admin-poi-image-review-actions">
          {imageReview ? (
            <button type="button" disabled={isBusy} onClick={() => onReview('unreviewed')}>
              重置图片审核
            </button>
          ) : (
            <>
              <button type="button" disabled={isBusy} onClick={() => onReview('approved')}>
                图片可用
              </button>
              <button type="button" disabled={isBusy} onClick={() => onReview('rejected')}>
                图片不合格
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function resolvePoiSubmissionImageUrl(value: string): string {
  return value.startsWith('/') ? appPath(value) : value;
}

function buildSubmissionMapHref(submission: PoiSubmission, coordinate: [number, number]): string {
  const params = new URLSearchParams({
    label: submission.title,
    x: roundCoordinateForQuery(coordinate[0]),
    z: roundCoordinateForQuery(coordinate[1]),
  });
  return `${appPath('/map')}?${params.toString()}`;
}

function buildLegacyMarkerMapHref(marker: MapMarker, coordinate: [number, number]): string {
  const params = new URLSearchParams({
    label: marker.label,
    x: roundCoordinateForQuery(coordinate[0]),
    z: roundCoordinateForQuery(coordinate[1]),
  });
  return `${appPath('/map')}?${params.toString()}`;
}

function isLegacyPoiMapMarker(marker: MapMarker): boolean {
  const categoryId = marker.categoryId?.toLowerCase() ?? '';
  if (
    marker.id.startsWith('poi-') ||
    marker.id.startsWith('transit-line-') ||
    categoryId === 'transit-line' ||
    categoryId === 'player'
  ) {
    return false;
  }

  return Boolean(marker.label.trim());
}

interface GeometryPreviewModel {
  points: Array<[number, number]>;
  lines: string[];
  polygons: string[];
}

interface PoiAuditMapPreviewModel extends GeometryPreviewModel {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
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
  const project = (coordinate: [number, number]) =>
    projectAuditMapPreviewCoordinate(coordinate, bounds);

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
  const project = (coordinate: [number, number]) =>
    projectAuditMapPreviewCoordinate(coordinate, bounds);
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
    bounds,
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    lines,
    points,
    polygons,
  };
}

function buildPoiGeometryDraftMapPreview(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
  contextMarkers: PoiAuditContextMarker[],
): PoiAuditMapPreviewModel {
  const coordinateSets = getPoiGeometryDraftCoordinateSets(draft);
  const draftCoordinates = coordinateSets.flatMap((set) => set.coordinates);
  const contextCoordinates = contextMarkers.map((item) => item.coordinate);
  const allCoordinates = [...draftCoordinates, ...contextCoordinates];
  const bounds = expandCoordinateBounds(
    getCoordinateBounds(allCoordinates.length > 0 ? allCoordinates : [[0, 0]]),
    120,
  );
  const project = (coordinate: [number, number]) =>
    projectAuditMapPreviewCoordinate(coordinate, bounds);
  const points: Array<[number, number]> = [];
  const lines: string[] = [];
  const polygons: string[] = [];

  for (const set of coordinateSets) {
    const projected = set.coordinates.map(project);
    points.push(...projected);
    const pointsValue = projected
      .map(([x, y]) => `${roundPreviewValue(x)},${roundPreviewValue(y)}`)
      .join(' ');
    if (set.kind === 'polygon' && projected.length >= 3) {
      polygons.push(pointsValue);
    } else if (set.kind !== 'point' && projected.length >= 2) {
      lines.push(pointsValue);
    }
  }

  return {
    bounds,
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    lines,
    points,
    polygons,
  };
}

function getPoiGeometryDraftCoordinateSets(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
): Array<{ kind: 'line' | 'point' | 'polygon'; coordinates: Array<[number, number]> }> {
  if (draft.type === 'MultiPoint') {
    return [{ kind: 'point', coordinates: parseValidCoordinateDrafts(draft.coordinates) }];
  }
  if (draft.type === 'LineString') {
    return [{ kind: 'line', coordinates: parseValidCoordinateDrafts(draft.coordinates) }];
  }
  if (draft.type === 'Rectangle') {
    const bounds = parseRectangleBoundsDraft(draft.bounds);
    return bounds ? [{ kind: 'polygon', coordinates: rectangleBoundsToCoordinates(bounds) }] : [];
  }
  if (draft.type === 'MultiRectangle') {
    return draft.rectangles.flatMap((boundsDraft) => {
      const bounds = parseRectangleBoundsDraft(boundsDraft);
      return bounds
        ? [{ kind: 'polygon' as const, coordinates: rectangleBoundsToCoordinates(bounds) }]
        : [];
    });
  }
  if (draft.type === 'Polygon') {
    return draft.rings.map((ring) => ({
      kind: 'polygon' as const,
      coordinates: parseValidCoordinateDrafts(ring),
    }));
  }
  return draft.polygons.flatMap((polygon) =>
    polygon.map((ring) => ({
      kind: 'polygon' as const,
      coordinates: parseValidCoordinateDrafts(ring),
    })),
  );
}

interface PoiAuditMapView {
  centerX: number;
  centerZ: number;
  scale: number;
  zoom: number;
}

interface PoiVisibleTile {
  displaySize: number;
  id: string;
  left: number;
  top: number;
  url: string;
}

const poiAuditPreviewWidth = 220;
const poiAuditPreviewHeight = 152;
const poiAuditPreviewPadding = 16;
const poiPreviewTileSize = 256;
const poiPreviewMinZoom = -7;
const poiPreviewMaxZoom = 3;

function buildPoiTileRegionIndex(
  response: PoiTileRegionResponse | null,
): PoiTileRegionIndex | undefined {
  if (!response?.properties || response.regions.length === 0) {
    return undefined;
  }

  return {
    properties: response.properties,
    groups: new Map(
      response.regions.map((region) => [getPoiPreviewRegionKey(region.x, region.z), region]),
    ),
  };
}

function buildPoiAuditPreviewTiles(
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  config: PoiTilePreviewConfig,
): PoiVisibleTile[] {
  if (!config.tileTemplate) {
    return [];
  }

  const view = buildPoiAuditMapView(bounds);
  const tileZoom = clampPoiPreviewTileZoom(Math.round(view.zoom));
  const tileScale = getPoiPreviewScale(tileZoom);
  const tileDisplaySize = poiPreviewTileSize * (view.scale / tileScale);
  const worldMinX = view.centerX - poiAuditPreviewWidth / (2 * view.scale);
  const worldMaxX = view.centerX + poiAuditPreviewWidth / (2 * view.scale);
  const worldMinZ = view.centerZ - poiAuditPreviewHeight / (2 * view.scale);
  const worldMaxZ = view.centerZ + poiAuditPreviewHeight / (2 * view.scale);
  const minTileX = Math.floor((worldMinX * tileScale) / poiPreviewTileSize) - 1;
  const maxTileX = Math.floor((worldMaxX * tileScale) / poiPreviewTileSize) + 1;
  const minTileZ = Math.floor((worldMinZ * tileScale) / poiPreviewTileSize) - 1;
  const maxTileZ = Math.floor((worldMaxZ * tileScale) / poiPreviewTileSize) + 1;
  const tiles: PoiVisibleTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      if (config.regionIndex && !hasPoiPreviewTile(tileX, tileZ, tileZoom, config.regionIndex)) {
        continue;
      }

      tiles.push({
        displaySize: tileDisplaySize,
        id: `${tileZoom}:${tileX}:${tileZ}`,
        left:
          poiAuditPreviewWidth / 2 +
          (tileX * poiPreviewTileSize * view.scale) / tileScale -
          view.centerX * view.scale,
        top:
          poiAuditPreviewHeight / 2 +
          (tileZ * poiPreviewTileSize * view.scale) / tileScale -
          view.centerZ * view.scale,
        url: buildPoiPreviewTileUrl(config.tileTemplate, tileZoom, tileX, tileZ),
      });
    }
  }

  return tiles;
}

function buildPoiTileStyle(tile: PoiVisibleTile) {
  return {
    height: `${(tile.displaySize / poiAuditPreviewHeight) * 100}%`,
    left: `${(tile.left / poiAuditPreviewWidth) * 100}%`,
    top: `${(tile.top / poiAuditPreviewHeight) * 100}%`,
    width: `${(tile.displaySize / poiAuditPreviewWidth) * 100}%`,
  };
}

function buildPoiAuditMapView(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): PoiAuditMapView {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min(
    (poiAuditPreviewWidth - poiAuditPreviewPadding * 2) / spanX,
    (poiAuditPreviewHeight - poiAuditPreviewPadding * 2) / spanZ,
  );

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    scale,
    zoom: Math.log2(scale),
  };
}

function hasPoiPreviewTile(
  tileX: number,
  tileZ: number,
  zoomLevel: number,
  regionIndex: PoiTileRegionIndex,
): boolean {
  const { properties } = regionIndex;
  const zoomFactor = Math.pow(2, zoomLevel);
  const worldMinX = properties.minRegionX * 512;
  const worldMinZ = properties.minRegionZ * 512;
  const worldWidth = (properties.maxRegionX + 1 - properties.minRegionX) * 512;
  const worldHeight = (properties.maxRegionZ + 1 - properties.minRegionZ) * 512;
  const minTileX = Math.floor((worldMinX * zoomFactor) / poiPreviewTileSize);
  const minTileZ = Math.floor((worldMinZ * zoomFactor) / poiPreviewTileSize);
  const maxTileX = Math.ceil(((worldMinX + worldWidth) * zoomFactor) / poiPreviewTileSize) - 1;
  const maxTileZ = Math.ceil(((worldMinZ + worldHeight) * zoomFactor) / poiPreviewTileSize) - 1;

  if (tileX < minTileX || tileZ < minTileZ || tileX > maxTileX || tileZ > maxTileZ) {
    return false;
  }

  const tileBlockSize = poiPreviewTileSize / zoomFactor;
  const tileRegionPoint = {
    x: Math.floor((tileX * tileBlockSize) / 512),
    z: Math.floor((tileZ * tileBlockSize) / 512),
  };
  const tileRegionSize = Math.ceil(tileBlockSize / 512);

  for (let x = tileRegionPoint.x; x < tileRegionPoint.x + tileRegionSize; x += 1) {
    for (let z = tileRegionPoint.z; z < tileRegionPoint.z + tileRegionSize; z += 1) {
      if (hasPoiPreviewRegion(regionIndex, x, z)) {
        return true;
      }
    }
  }

  return false;
}

function hasPoiPreviewRegion(regionIndex: PoiTileRegionIndex, x: number, z: number): boolean {
  const group = {
    x: Math.floor(x / 32),
    z: Math.floor(z / 32),
  };
  const regionMap = regionIndex.groups.get(getPoiPreviewRegionKey(group.x, group.z));
  if (!regionMap) {
    return false;
  }

  const relX = x - group.x * 32;
  const relZ = z - group.z * 32;
  const index = relZ * 32 + relX;
  const value = regionMap.m[Math.floor(index / 32)] ?? 0;
  const bit = index % 32;
  return (value & (1 << bit)) !== 0;
}

function getPoiPreviewRegionKey(x: number, z: number): string {
  return `${x}:${z}`;
}

function buildPoiPreviewTileUrl(
  template: string,
  zoom: number,
  tileX: number,
  tileZ: number,
): string {
  return template
    .replaceAll('{z}', String(zoom))
    .replaceAll('{xd}', String(Math.floor(tileX / 10)))
    .replaceAll('{yd}', String(Math.floor(tileZ / 10)))
    .replaceAll('{x}', String(tileX))
    .replaceAll('{y}', String(tileZ));
}

function getPoiPreviewScale(zoom: number): number {
  return 2 ** zoom;
}

function clampPoiPreviewTileZoom(zoom: number): number {
  return clamp(zoom, poiPreviewMinZoom, poiPreviewMaxZoom);
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

function getBoundsCenter(
  bounds: Array<{
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  }>,
): [number, number] | null {
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
  return [clamp(x, bounds.minX, bounds.maxX), clamp(z, bounds.minZ, bounds.maxZ)];
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

function canEditPoiSubmission(status: PoiSubmissionStatus): boolean {
  return status === 'pending_review' || status === 'approved' || status === 'published';
}

function canDeletePoiSubmission(status: PoiSubmissionStatus): boolean {
  return status !== 'archived';
}

function getPoiEditDialogHint(status: PoiSubmissionStatus): string {
  if (status === 'approved') {
    return '当前为待发布投稿，保存后仍可直接发布，几何修正会保留原类型。';
  }

  if (status === 'published') {
    return '当前为已发布 POI，保存后会直接同步公开地图，几何修正会保留原类型。';
  }

  return '当前为待审核投稿，几何修正会保留原类型。';
}

function conflictDecisionKey(submissionId: string, markerId: string): string {
  return `${submissionId}\u0000${markerId}`;
}

function conflictDecisionLabel(decision: PoiConflictDecisionKind): string {
  return decision === 'ignored' ? '已忽略' : '待合并';
}

function imageReviewKey(submissionId: string, imageUrl: string): string {
  return `${submissionId}\u0000${imageUrl}`;
}

function imageReviewLabel(decision: PoiSubmissionImageReviewDecision): string {
  return decision === 'approved' ? '图片可用' : '图片不合格';
}

function describePoiBatchAction(action: 'approve' | 'reject' | 'publish'): string {
  if (action === 'approve') {
    return '通过';
  }

  if (action === 'reject') {
    return '驳回';
  }

  return '发布';
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
  return category?.name && category.name !== categoryId
    ? `${category.name} (${categoryId})`
    : categoryId;
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
        marker.categoryId === submission.categoryId &&
        distanceBlocks !== null &&
        distanceBlocks <= 220;
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

function buildPoiHierarchyHint(
  submission: PoiSubmission,
  markers: MapMarker[],
): PoiHierarchyHint | null {
  const parts = splitSecondaryPoiTitle(submission.title);
  if (!parts) {
    return null;
  }

  const normalizedParentLabel = normalizeSearchText(parts.parentLabel);
  const parentMarkers = markers
    .filter((marker) => normalizeSearchText(marker.label) === normalizedParentLabel)
    .slice(0, 5);

  return {
    ...parts,
    parentMarkers,
  };
}

function splitSecondaryPoiTitle(
  title: string,
): Pick<PoiHierarchyHint, 'parentLabel' | 'childLabel'> | null {
  const normalized = title.replace(/[－—–]/g, '-');
  const separatorIndex = normalized.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  const parentLabel = normalized.slice(0, separatorIndex).trim();
  const childLabel = normalized.slice(separatorIndex + 1).trim();
  return parentLabel && childLabel ? { parentLabel, childLabel } : null;
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

  return (
    left.distanceBlocks - right.distanceBlocks ||
    left.marker.label.localeCompare(right.marker.label, 'zh-CN')
  );
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

function isRoadReferenceMarker(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'symbolIcon'>,
): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(road|roadpoint|highway)\b/.test(text);
}

function findAddressRoadMarkers(address: string, markers: MapMarker[]): MapMarker[] {
  const normalizedAddress = normalizeSearchText(address);
  if (!normalizedAddress) {
    return [];
  }

  return markers
    .filter((marker) => {
      const normalizedLabel = normalizeSearchText(marker.label);
      return normalizedLabel.length >= 2 && normalizedAddress.includes(normalizedLabel);
    })
    .sort(
      (left, right) =>
        normalizeSearchText(right.label).length - normalizeSearchText(left.label).length ||
        left.label.localeCompare(right.label, 'zh-CN'),
    );
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

  return (
    (left.distanceBlocks ?? Number.POSITIVE_INFINITY) -
      (right.distanceBlocks ?? Number.POSITIVE_INFINITY) ||
    left.marker.label.localeCompare(right.marker.label, 'zh-CN')
  );
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
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'),
    )
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

function createPoiGeometryDraft(geometry: MapGeometry): PoiGeometryDraft {
  if (geometry.type === 'Point') {
    return {
      type: 'Point',
      coordinate: coordinateToDraft(geometry.coordinates),
    };
  }

  if (geometry.type === 'MultiPoint') {
    return {
      type: 'MultiPoint',
      coordinates: geometry.coordinates.map(coordinateToDraft),
    };
  }

  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map(coordinateToDraft),
    };
  }

  if (geometry.type === 'Rectangle') {
    return {
      type: 'Rectangle',
      bounds: rectangleBoundsToDraft(geometry.bounds),
    };
  }

  if (geometry.type === 'MultiRectangle') {
    return {
      type: 'MultiRectangle',
      rectangles: geometry.rectangles.map(rectangleBoundsToDraft),
    };
  }

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      rings: geometry.coordinates.map((ring) => ring.map(coordinateToDraft)),
    };
  }

  return {
    type: 'MultiPolygon',
    polygons: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(coordinateToDraft)),
    ),
  };
}

function isRegionGeometry(geometry: MapGeometry): boolean {
  return (
    geometry.type === 'Rectangle' ||
    geometry.type === 'MultiRectangle' ||
    geometry.type === 'Polygon' ||
    geometry.type === 'MultiPolygon'
  );
}

function createEmptyPoiGeometryDraft(
  type: PoiGeometryDraft['type'],
  anchor?: [number, number] | null,
): PoiGeometryDraft {
  const coordinate = anchor ? coordinateToDraft(anchor) : createEmptyCoordinateDraft();
  const nextCoordinate = anchor
    ? coordinateToDraft([anchor[0] + 1, anchor[1] + 1])
    : createEmptyCoordinateDraft();
  if (type === 'Point') {
    return { type, coordinate };
  }
  if (type === 'MultiPoint' || type === 'LineString') {
    return { type, coordinates: [coordinate, nextCoordinate] };
  }
  if (type === 'Rectangle') {
    return {
      type,
      bounds: anchor
        ? rectangleBoundsToDraft({
            minX: anchor[0] - 1,
            minZ: anchor[1] - 1,
            maxX: anchor[0] + 1,
            maxZ: anchor[1] + 1,
          })
        : createEmptyRectangleBoundsDraft(),
    };
  }
  if (type === 'MultiRectangle') {
    return {
      type,
      rectangles: [
        anchor
          ? rectangleBoundsToDraft({
              minX: anchor[0] - 1,
              minZ: anchor[1] - 1,
              maxX: anchor[0] + 1,
              maxZ: anchor[1] + 1,
            })
          : createEmptyRectangleBoundsDraft(),
      ],
    };
  }
  if (type === 'Polygon') {
    return {
      type,
      rings: [anchor ? createDefaultPolygonRingDraft(coordinate) : [coordinate, nextCoordinate]],
    };
  }
  return {
    type,
    polygons: [[anchor ? createDefaultPolygonRingDraft(coordinate) : [coordinate, nextCoordinate]]],
  };
}

function appendPoiGeometryDraftCoordinate(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
  coordinate: [number, number],
): PoiGeometryDraft {
  const coordinateDraft = coordinateToDraft(coordinate);
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    return {
      type: draft.type,
      coordinates: fillOrAppendCoordinateDraft(draft.coordinates, coordinateDraft),
    };
  }
  if (draft.type === 'Rectangle') {
    return { type: 'Rectangle', bounds: expandRectangleDraft(draft.bounds, coordinate) };
  }
  if (draft.type === 'MultiRectangle') {
    const rectangles =
      draft.rectangles.length > 0 ? [...draft.rectangles] : [createEmptyRectangleBoundsDraft()];
    rectangles[rectangles.length - 1] = expandRectangleDraft(rectangles.at(-1)!, coordinate);
    return { type: 'MultiRectangle', rectangles };
  }
  if (draft.type === 'Polygon') {
    const rings = draft.rings.length > 0 ? draft.rings.map((ring) => [...ring]) : [[]];
    rings[0] = appendPolygonRingCoordinate(rings[0] ?? [], coordinateDraft);
    return { type: 'Polygon', rings };
  }

  const polygons =
    draft.polygons.length > 0
      ? draft.polygons.map((polygon) => polygon.map((ring) => [...ring]))
      : [[[]]];
  const polygon = polygons[0] ?? [[]];
  polygon[0] = appendPolygonRingCoordinate(polygon[0] ?? [], coordinateDraft);
  polygons[0] = polygon;
  return { type: 'MultiPolygon', polygons };
}

function canRemovePoiGeometryDraftCoordinate(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
): boolean {
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    return draft.coordinates.length > 2;
  }
  if (draft.type === 'Polygon') {
    return (draft.rings[0]?.length ?? 0) > 4;
  }
  if (draft.type === 'MultiPolygon') {
    return (draft.polygons[0]?.[0]?.length ?? 0) > 4;
  }
  return false;
}

function removeLastPoiGeometryDraftCoordinate(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
): PoiGeometryDraft {
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    return { type: draft.type, coordinates: draft.coordinates.slice(0, -1) };
  }
  if (draft.type === 'Polygon') {
    return {
      type: 'Polygon',
      rings: draft.rings.map((ring, index) =>
        index === 0 ? removeLastPolygonRingCoordinate(ring) : ring,
      ),
    };
  }
  if (draft.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      polygons: draft.polygons.map((polygon, polygonIndex) =>
        polygon.map((ring, ringIndex) =>
          polygonIndex === 0 && ringIndex === 0 ? removeLastPolygonRingCoordinate(ring) : ring,
        ),
      ),
    };
  }
  return draft;
}

function fillOrAppendCoordinateDraft(
  coordinates: CoordinateDraft[],
  coordinate: CoordinateDraft,
): CoordinateDraft[] {
  const emptyIndex = coordinates.findIndex((item) => !parseCoordinateDraft(item));
  return emptyIndex >= 0
    ? coordinates.map((item, index) => (index === emptyIndex ? coordinate : item))
    : [...coordinates, coordinate];
}

function appendPolygonRingCoordinate(
  ring: CoordinateDraft[],
  coordinate: CoordinateDraft,
): CoordinateDraft[] {
  const emptyIndex = ring.findIndex((item) => !parseCoordinateDraft(item));
  if (emptyIndex >= 0) {
    return ring.map((item, index) => (index === emptyIndex ? coordinate : item));
  }
  const first = ring[0] ? parseCoordinateDraft(ring[0]) : null;
  const lastDraft = ring.at(-1);
  const last = lastDraft ? parseCoordinateDraft(lastDraft) : null;
  const closed = Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
  return closed && lastDraft
    ? [...ring.slice(0, -1), coordinate, lastDraft]
    : [...ring, coordinate];
}

function removeLastPolygonRingCoordinate(ring: CoordinateDraft[]): CoordinateDraft[] {
  const first = ring[0] ? parseCoordinateDraft(ring[0]) : null;
  const lastDraft = ring.at(-1);
  const last = lastDraft ? parseCoordinateDraft(lastDraft) : null;
  const closed = Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
  return closed && lastDraft ? [...ring.slice(0, -2), lastDraft] : ring.slice(0, -1);
}

function expandRectangleDraft(
  draft: RectangleBoundsDraft,
  coordinate: [number, number],
): RectangleBoundsDraft {
  const bounds = parseRectangleBoundsDraft(draft);
  return rectangleBoundsToDraft(
    bounds
      ? {
          minX: Math.min(bounds.minX, coordinate[0]),
          minZ: Math.min(bounds.minZ, coordinate[1]),
          maxX: Math.max(bounds.maxX, coordinate[0]),
          maxZ: Math.max(bounds.maxZ, coordinate[1]),
        }
      : {
          minX: coordinate[0] - 1,
          minZ: coordinate[1] - 1,
          maxX: coordinate[0] + 1,
          maxZ: coordinate[1] + 1,
        },
  );
}

function geometryLabelFromDraft(draft: PoiGeometryDraft): string {
  const labels: Record<PoiGeometryDraft['type'], string> = {
    Point: '点状 POI',
    MultiPoint: '多点对象',
    LineString: '线性 POI',
    Rectangle: '矩形区域',
    MultiRectangle: '多矩形区域',
    Polygon: '多边形区域',
    MultiPolygon: '多重多边形区域',
  };
  return labels[draft.type];
}

function getGeometryDraftRepresentativeCoordinate(
  draft: PoiGeometryDraft,
): [number, number] | null {
  const geometry = buildMapGeometryFromDraft(draft).geometry;
  return geometry ? getGeometryRepresentativeCoordinate(geometry) : null;
}

function createEmptyCoordinateDraft(): CoordinateDraft {
  return { x: '', z: '' };
}

function createEmptyRectangleBoundsDraft(): RectangleBoundsDraft {
  return { minX: '', minZ: '', maxX: '', maxZ: '' };
}

function buildMapGeometryFromDraft(draft: PoiGeometryDraft): {
  geometry?: MapGeometry;
  error?: string;
} {
  if (draft.type === 'Point') {
    const coordinate = parseCoordinateDraft(draft.coordinate);
    return coordinate
      ? { geometry: { type: 'Point', coordinates: coordinate } }
      : { error: '请填写有效的点状 X/Z 坐标。' };
  }

  if (draft.type === 'MultiPoint') {
    const coordinates = parseCoordinateDrafts(draft.coordinates, 2);
    return coordinates
      ? { geometry: { type: 'MultiPoint', coordinates } }
      : { error: '点组至少需要 2 个有效坐标。' };
  }

  if (draft.type === 'LineString') {
    const coordinates = parseCoordinateDrafts(draft.coordinates, 2);
    return coordinates
      ? { geometry: { type: 'LineString', coordinates } }
      : { error: '线性 POI 至少需要 2 个有效坐标。' };
  }

  if (draft.type === 'Rectangle') {
    const bounds = parseRectangleBoundsDraft(draft.bounds);
    return bounds
      ? { geometry: { type: 'Rectangle', bounds } }
      : { error: '矩形区域需要有效边界，且最小值必须小于最大值。' };
  }

  if (draft.type === 'MultiRectangle') {
    const rectangles = draft.rectangles.map(parseRectangleBoundsDraft);
    return rectangles.length > 0 && rectangles.every(Boolean)
      ? { geometry: { type: 'MultiRectangle', rectangles: rectangles as RectangleBounds[] } }
      : { error: '矩形组至少需要 1 个有效矩形边界。' };
  }

  if (draft.type === 'Polygon') {
    const rings = parsePolygonRingsDraft(draft.rings);
    return rings
      ? { geometry: { type: 'Polygon', coordinates: rings } }
      : { error: '多边形至少需要 1 个边界环，每个环至少 4 个有效坐标。' };
  }

  const polygons = draft.polygons.map(parsePolygonRingsDraft);
  return polygons.length > 0 && polygons.every(Boolean)
    ? {
        geometry: {
          type: 'MultiPolygon',
          coordinates: polygons as Array<Array<Array<[number, number]>>>,
        },
      }
    : { error: '多重多边形至少需要 1 个多边形，每个边界环至少 4 个有效坐标。' };
}

function coordinateToDraft([x, z]: [number, number]): CoordinateDraft {
  return {
    x: roundCoordinateForQuery(x),
    z: roundCoordinateForQuery(z),
  };
}

function rectangleBoundsToDraft(bounds: RectangleBounds): RectangleBoundsDraft {
  return {
    minX: roundCoordinateForQuery(bounds.minX),
    minZ: roundCoordinateForQuery(bounds.minZ),
    maxX: roundCoordinateForQuery(bounds.maxX),
    maxZ: roundCoordinateForQuery(bounds.maxZ),
  };
}

function parseCoordinateDraft(draft: CoordinateDraft): [number, number] | null {
  if (!draft.x.trim() || !draft.z.trim()) {
    return null;
  }
  const x = Number(draft.x);
  const z = Number(draft.z);
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
}

function parseCoordinateDrafts(
  drafts: CoordinateDraft[],
  minPoints: number,
): Array<[number, number]> | null {
  const coordinates = drafts.map(parseCoordinateDraft);
  return coordinates.length >= minPoints && coordinates.every(Boolean)
    ? (coordinates as Array<[number, number]>)
    : null;
}

function parseValidCoordinateDrafts(drafts: CoordinateDraft[]): Array<[number, number]> {
  return drafts.flatMap((draft) => {
    const coordinate = parseCoordinateDraft(draft);
    return coordinate ? [coordinate] : [];
  });
}

function parseRectangleBoundsDraft(draft: RectangleBoundsDraft): RectangleBounds | null {
  if (!draft.minX.trim() || !draft.minZ.trim() || !draft.maxX.trim() || !draft.maxZ.trim()) {
    return null;
  }
  const minX = Number(draft.minX);
  const minZ = Number(draft.minZ);
  const maxX = Number(draft.maxX);
  const maxZ = Number(draft.maxZ);
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxZ) ||
    minX >= maxX ||
    minZ >= maxZ
  ) {
    return null;
  }

  return { minX, minZ, maxX, maxZ };
}

function parsePolygonRingsDraft(rings: CoordinateDraft[][]): Array<Array<[number, number]>> | null {
  const parsedRings = rings.map((ring) => parseCoordinateDrafts(ring, 4));
  return parsedRings.length > 0 && parsedRings.every(Boolean)
    ? (parsedRings as Array<Array<[number, number]>>)
    : null;
}

function createInsertedCoordinateDraft(
  coordinates: CoordinateDraft[],
  afterIndex?: number,
): CoordinateDraft {
  const left = afterIndex === undefined ? coordinates.at(-1) : coordinates[afterIndex];
  const right = afterIndex === undefined ? undefined : coordinates[afterIndex + 1];
  const leftCoordinate = left ? parseCoordinateDraft(left) : null;
  const rightCoordinate = right ? parseCoordinateDraft(right) : null;

  if (leftCoordinate && rightCoordinate) {
    return coordinateToDraft([
      (leftCoordinate[0] + rightCoordinate[0]) / 2,
      (leftCoordinate[1] + rightCoordinate[1]) / 2,
    ]);
  }

  if (leftCoordinate) {
    return coordinateToDraft([leftCoordinate[0] + 1, leftCoordinate[1] + 1]);
  }

  return { x: '', z: '' };
}

function createNextRectangleDraft(rectangles: RectangleBoundsDraft[]): RectangleBoundsDraft {
  const lastBounds = rectangles.at(-1);
  const parsed = lastBounds ? parseRectangleBoundsDraft(lastBounds) : null;
  if (!parsed) {
    return { minX: '', minZ: '', maxX: '', maxZ: '' };
  }

  return rectangleBoundsToDraft({
    minX: parsed.maxX,
    minZ: parsed.minZ,
    maxX: parsed.maxX + Math.max(1, parsed.maxX - parsed.minX),
    maxZ: parsed.maxZ,
  });
}

function createDefaultPolygonRingDraft(anchor?: CoordinateDraft): CoordinateDraft[] {
  const coordinate = anchor ? parseCoordinateDraft(anchor) : null;
  const center: [number, number] = coordinate ?? [0, 0];
  const coordinates: Array<[number, number]> = [
    [center[0] - 1, center[1] - 1],
    [center[0] + 1, center[1] - 1],
    [center[0] + 1, center[1] + 1],
    [center[0] - 1, center[1] + 1],
  ];
  return coordinates.map(coordinateToDraft);
}

function formatDraftCoordinatePair(coordinate: CoordinateDraft | undefined): string {
  const parsed = coordinate ? parseCoordinateDraft(coordinate) : null;
  return parsed ? formatCoordinatePair(parsed) : '待填写';
}

function matchesStatusFilter(status: PoiSubmissionStatus, filter: StatusFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return status === 'pending_review' || status === 'approved';
  }

  if (filter === 'blocked') {
    return false;
  }

  if (filter === 'legacy') {
    return false;
  }

  return status === filter;
}

function shouldShowLegacyPoiMarkers(filter: StatusFilter): boolean {
  return filter === 'all' || filter === 'legacy';
}

function isPoiSubmissionPublishBlocked(
  submission: AdminPoiSubmission,
  imageReviewByKey: Map<string, PoiSubmissionImageReview>,
  conflictDecisions: PoiConflictDecision[],
): boolean {
  const imageReview = submission.imageUrl
    ? imageReviewByKey.get(imageReviewKey(submission.id, submission.imageUrl))
    : undefined;
  const hasRejectedImage = imageReview?.decision === 'rejected';
  const hasDuplicateConflict = conflictDecisions.some(
    (decision) => decision.submissionId === submission.id && decision.decision === 'duplicate',
  );
  return hasRejectedImage || hasDuplicateConflict;
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
