'use client';

import { requestConfirmation, requestPageWindow } from '../lib/client-dialog-events';

import type {
  EntityTranslationRecord,
  MapGeometry,
  MapMarkerSpatialMetadata,
  MapMarkerSnapshot,
  PoiCategory,
  PoiFacilitySnapshot,
  PoiSubmission,
  PoiSubmissionStatus,
  RectangleBounds,
  TileProviderDescriptor,
  TileZoomRange,
} from '@yct/contracts';
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { AdminPoiDescription } from './admin-poi-description';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishEditorDraftChanged } from '../lib/client-editor-events';
import { roadNameTranslationEntityId } from '../lib/entity-translation-keys';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import {
  findPoiAddressMarkerMatches,
  inferPoiFloorLabel,
  selectUnambiguousAddressMarker,
} from '../lib/poi-address-inference';
import { CurrentPlayerLocationButton } from './current-player-location-button';
import { AdminRefreshButton } from './admin-refresh-button';
import { LayeredMapTile } from './layered-map-tile';
import { MaterialSymbol } from './material-symbol';
import { PoiFacilityEditor, PoiFacilityRow } from './poi-facility-editor';
import { ProgressiveImage } from './progressive-image';
import { SegmentedControl } from './segmented-control';
import { SegmentedTabs } from './ui/segmented-control';
import type { SegmentedControlOption } from './segmented-control';
import { VisualEditorShell } from './visual-editor-shell';
import { EditorToolbar } from './editor/editor-toolbar';
import { EditorToolbarActionButton } from './editor/editor-toolbar-actions';
import { buildEditorToolbarSections } from './editor/editor-toolbar-sections';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import { EditorHeaderToolsPortal } from './editor/editor-header-tools-portal';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import {
  EditorLayerRowActions,
  type EditorLayerRowAction,
} from './editor/editor-layer-row-actions';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorZoomControls } from './editor/editor-zoom-controls';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import { EDITOR_SHORTCUT_CATALOG, isEditableTarget } from '../lib/editor/shortcuts';
import { useEditorInspectorFocus } from '../lib/editor/use-editor-inspector-focus';
import { useEditorLayerScroll } from '../lib/editor/use-editor-layer-scroll';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import type { EditorTool } from '../lib/editor/types';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { useListKeyboardNavigation } from './use-list-keyboard-navigation';
import { StatusChip } from './ui/chip';
import { CheckboxRow } from './ui/checkbox-row';
import { Field, Input, Select, Textarea } from './ui/field';
import { Button, ButtonLink, IconButton } from './ui/button';
import { Modal } from './ui/modal';

type StatusFilter = PoiSubmissionStatus | 'all' | 'todo' | 'blocked' | 'legacy';
type PoiAdminSection = 'submissions' | 'categories';
type PoiCategoryBoardFilter = 'all' | 'public_enabled' | 'public_disabled';
type PoiEditTab = 'basic' | 'facility' | 'advanced';

const poiEditTabOptions: ReadonlyArray<SegmentedControlOption<PoiEditTab>> = [
  { value: 'basic', label: '基本信息', panelId: 'poi-edit-panel-basic' },
  { value: 'facility', label: '设施 / 出入口', panelId: 'poi-edit-panel-facility' },
  { value: 'advanced', label: '高级', panelId: 'poi-edit-panel-advanced' },
];

export type AdminMapMarker = MapMarkerSnapshot['markers'][number];
type MapMarker = AdminMapMarker;

interface PoiSubmissionImageMetadata {
  fileName: string;
  publicPath: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
}

type AdminPoiSubmission = PoiSubmission & {
  imageMetadataByUrl?: Record<string, PoiSubmissionImageMetadata>;
};

interface PoiStationBindingSummary {
  details: Array<{
    detailSourceId: string;
    exitCount: number;
    facilityCount: number;
    layerCount: number;
    lineName: string;
    stationName: string;
    transferCount: number;
  }>;
  lines: Array<{
    color?: string;
    id: string;
    mode: string;
    name: string;
    operationStatus: string;
  }>;
  stationName: string;
  stationSourceId: string;
}

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
  imageUrls: string[];
  geometry: MapGeometry;
  spatial?: MapMarkerSpatialMetadata;
  parentMarkerId: string;
  floorLabel: string;
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
  imageUrls: string[];
  geometry: MapGeometry;
  spatial?: MapMarkerSpatialMetadata;
  parentMarkerId: string;
  floorLabel: string;
  boundRegionMarkerIds: string[];
  openingHours: string;
  address: string;
  addressRoadMarkerId: string;
  facilities: PoiFacilitySnapshot[];
}

export interface CoordinateDraft {
  x: string;
  y?: string;
  z: string;
}

export interface RectangleBoundsDraft {
  minX: string;
  minZ: string;
  maxX: string;
  maxZ: string;
}

export type PoiGeometryDraft =
  | { type: 'Point'; coordinate: CoordinateDraft }
  | { type: 'MultiPoint'; coordinates: CoordinateDraft[] }
  | { type: 'LineString'; coordinates: CoordinateDraft[] }
  | { type: 'Rectangle'; bounds: RectangleBoundsDraft }
  | { type: 'MultiRectangle'; rectangles: RectangleBoundsDraft[] }
  | { type: 'Polygon'; rings: CoordinateDraft[][] }
  | { type: 'MultiPolygon'; polygons: CoordinateDraft[][][] };

interface PoiTileRegionResponse {
  properties?: {
    centerX?: number;
    centerZ?: number;
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

export interface PoiTilePreviewConfig {
  freshTileTemplate?: string | null;
  tileTemplate?: string | null;
  tileZoomRange?: TileZoomRange | null;
  regionIndex?: PoiTileRegionIndex;
}

export type RegionMapGeometry = Extract<
  MapGeometry,
  { type: 'Rectangle' | 'MultiRectangle' | 'Polygon' | 'MultiPolygon' }
>;

const defaultMarkerIconBaseUrl = 'https://map.shangxiaoguan.top/';
const defaultRoadTravelModes = ['walk', 'taxi', 'bus', 'coach'] as const;
const defaultTraversalBarrierModes = ['walk', 'taxi', 'bus', 'coach'] as const;

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
// 字段标签已写明「公开投稿」，分段控件用短文案，避免在工具条里折行。
const poiCategoryBoardFilterOptions: Array<{ value: PoiCategoryBoardFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'public_enabled', label: '允许' },
  { value: 'public_disabled', label: '不允许' },
];

const poiRejectReasonPresets = [
  '坐标位置偏离实际地点，请重新选点后提交。',
  '地点分类不准确，请选择更合适的分类后提交。',
  '地点名称不符合当前地图命名规范，请调整后提交。',
  '简介或链接信息不足，无法确认地点用途或来源。',
  '投稿图片无法确认来源或与地点不匹配，请更换后提交。',
  '该地点疑似已存在，请确认后避免重复投稿。',
];

/** 进入工作台前确认未保存修改，避免源表单内容被静默丢弃。 */
async function confirmLeavePoiDialogForWorkspace(isDirty: boolean): Promise<boolean> {
  if (!isDirty) {
    return true;
  }

  return (
    (await requestConfirmation(
      '当前弹窗有未保存的修改，进入工作台会丢弃这些修改，确定继续吗？',
    )) === true
  );
}

/** 工作台链接的点击处理：先取地址再等待确认，避免 React 事件对象在 await 后被回收。 */
async function openPoiWorkspaceWithConfirm(
  event: MouseEvent<HTMLAnchorElement>,
  isDirty: boolean,
): Promise<void> {
  event.preventDefault();
  const href = event.currentTarget.href;
  if (!(await confirmLeavePoiDialogForWorkspace(isDirty))) {
    return;
  }
  window.location.assign(href);
}

export function AdminPoiPanel({
  editorMode = 'panel',
  initialMarkerId,
  onEditorClose,
  pageWorkspace = 'geometry',
}: Readonly<{
  editorMode?: 'page' | 'panel';
  initialMarkerId?: string;
  onEditorClose?: () => void;
  pageWorkspace?: 'geometry' | 'intro';
}>) {
  const [submissions, setSubmissions] = useState<AdminPoiSubmission[]>([]);
  const [actorNameById, setActorNameById] = useState<Map<string, string>>(() => new Map());
  const [categories, setCategories] = useState<PoiCategory[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [conflictDecisions, setConflictDecisions] = useState<PoiConflictDecision[]>([]);
  const [imageReviews, setImageReviews] = useState<PoiSubmissionImageReview[]>([]);
  const [entityTranslations, setEntityTranslations] = useState<EntityTranslationRecord[]>([]);
  const [categoryIconBaseUrl, setCategoryIconBaseUrl] = useState(defaultMarkerIconBaseUrl);
  const [tilePreviewFreshTemplate, setTilePreviewFreshTemplate] = useState<string | null>(null);
  const [tilePreviewTemplate, setTilePreviewTemplate] = useState<string | null>(null);
  const [tilePreviewZoomRange, setTilePreviewZoomRange] = useState<TileZoomRange | null>(null);
  const [tilePreviewRegionResponse, setTilePreviewRegionResponse] =
    useState<PoiTileRegionResponse | null>(null);
  const [statusText, setStatusText] = useState('正在读取 POI 投稿');
  const [categoryStatusText, setCategoryStatusText] = useState('正在读取 POI 分类');
  const [isBusy, setIsBusy] = useState(false);
  const [poiDataLoaded, setPoiDataLoaded] = useState(false);
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
  const initialMarkerHandledRef = useRef(false);
  const editorSessionId = `poi:${initialMarkerId ?? 'panel'}`;

  const categoryById = useMemo(() => {
    const entries = categories.map((category) => [category.id, category] as const);
    return new Map(entries);
  }, [categories]);
  const parentMarkerOptions = useMemo(
    () =>
      mapMarkers
        .filter(
          (marker) =>
            (marker.geometry.type === 'Point' || isRegionGeometry(marker.geometry)) &&
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
            submission.floorLabel,
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
        .filter((marker) => isRoadReferenceMarker(marker) && marker.geometry.type === 'MultiPoint')
        .map((marker) => normalizeSearchText(marker.label)),
    );
    return mapMarkers.filter(
      (marker) =>
        isLegacyPoiMapMarker(marker) &&
        !(
          isRoadReferenceMarker(marker) &&
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
  const translationBySubmissionId = useMemo(() => {
    const entries = new Map<string, EntityTranslationRecord>();
    for (const submission of submissions) {
      const record =
        entityTranslations.find(
          (item) => item.entityKind === 'map_marker' && item.entityId === `poi-${submission.id}`,
        ) ??
        entityTranslations.find(
          (item) =>
            item.entityKind === 'map_marker' &&
            item.entityId === roadNameTranslationEntityId(submission.title),
        );
      if (record) {
        entries.set(submission.id, record);
      }
    }
    return entries;
  }, [entityTranslations, submissions]);
  const translationByLegacyMarkerId = useMemo(() => {
    const byEntityId = new Map<string, EntityTranslationRecord>();
    for (const item of entityTranslations) {
      if (item.entityKind === 'map_marker') {
        byEntityId.set(item.entityId, item);
      }
    }

    const entries = new Map<string, EntityTranslationRecord>();
    for (const marker of mapMarkers) {
      const record =
        byEntityId.get(marker.id) ?? byEntityId.get(roadNameTranslationEntityId(marker.label));
      if (record) {
        entries.set(marker.id, record);
      }
    }
    return entries;
  }, [entityTranslations, mapMarkers]);
  const defaultDraftCoordinate = useMemo<[number, number]>(() => {
    const properties = tilePreviewRegionResponse?.properties;
    return properties?.centerX !== undefined && properties.centerZ !== undefined
      ? [properties.centerX, properties.centerZ]
      : [-1079, -1009];
  }, [tilePreviewRegionResponse]);
  const tilePreviewConfig = useMemo<PoiTilePreviewConfig>(
    () => ({
      freshTileTemplate: tilePreviewFreshTemplate,
      tileTemplate: tilePreviewTemplate,
      tileZoomRange: tilePreviewZoomRange,
      regionIndex: buildPoiTileRegionIndex(tilePreviewRegionResponse),
    }),
    [
      tilePreviewFreshTemplate,
      tilePreviewRegionResponse,
      tilePreviewTemplate,
      tilePreviewZoomRange,
    ],
  );
  const detailTarget = useMemo(
    () => submissions.find((submission) => submission.id === detailTargetId) ?? null,
    [detailTargetId, submissions],
  );
  const formatActor = (actorId?: string) => formatPoiActorName(actorId, actorNameById);
  const markerLabelById = useMemo(
    () => new Map(mapMarkers.map((marker) => [marker.id, marker.label] as const)),
    [mapMarkers],
  );
  const formatRoadMarker = (markerId?: string) =>
    markerId ? (markerLabelById.get(markerId) ?? markerId) : '未绑定';

  const loadSubmissions = async () => {
    const response = await fetch(appPath('/api/admin/map/poi-submissions'), { cache: 'no-store' });
    const data = (await response.json()) as {
      items?: AdminPoiSubmission[];
      actors?: Array<{ ldpassUserId: string; displayName: string }>;
      message?: string;
    };
    if (!response.ok) {
      setStatusText(data.message ?? 'POI 后台暂不可用');
      return;
    }

    const items = data.items ?? [];
    setSubmissions(items);
    setActorNameById(
      new Map((data.actors ?? []).map((actor) => [actor.ldpassUserId, actor.displayName])),
    );
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

  // 区域索引只用于瓦片预览遮罩，单独异步加载：
  // 源站较慢时不能让整个工作台首屏一直等它。
  const loadTilePreviewRegionIndex = async () => {
    try {
      const regionResponse = await fetch(appPath('/api/map/unmined-regions'), {
        cache: 'no-store',
      });
      if (!regionResponse.ok) {
        setTilePreviewRegionResponse(null);
        return;
      }

      const regionData = (await regionResponse.json()) as PoiTileRegionResponse;
      setTilePreviewRegionResponse(regionData);
    } catch {
      setTilePreviewRegionResponse(null);
    }
  };

  const loadTilePreviewConfig = async () => {
    const response = await fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: TileProviderDescriptor[] };
    if (!response.ok) {
      return;
    }

    const tileTemplates = selectMapTileTemplates(data.items ?? []);
    setTilePreviewTemplate(tileTemplates.tileTemplate);
    setTilePreviewFreshTemplate(tileTemplates.freshTileTemplate);
    setTilePreviewZoomRange(tileTemplates.tileZoomRange ?? null);

    const fallbackProvider =
      data.items?.find((provider) => provider.sourceKind === 'safe-https-static') ??
      data.items?.find((provider) => provider.id === 'lindong-unmined-static');
    if (!tileTemplates.tileTemplate || !fallbackProvider) {
      setTilePreviewRegionResponse(null);
      return;
    }
    if (
      fallbackProvider.sourceKind !== 'safe-https-static' &&
      fallbackProvider.id !== 'lindong-unmined-static'
    ) {
      setTilePreviewRegionResponse(null);
      return;
    }

    void loadTilePreviewRegionIndex();
  };

  const loadEntityTranslations = async () => {
    const response = await fetch(appPath('/api/admin/entity-translations'), { cache: 'no-store' });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { items?: EntityTranslationRecord[] };
    setEntityTranslations(data.items ?? []);
  };

  const reloadPoiData = () =>
    Promise.all([
      loadSubmissions(),
      loadCategories(),
      loadMapMarkers(),
      loadConflictDecisions(),
      loadImageReviews(),
      loadTilePreviewConfig(),
      loadEntityTranslations(),
    ]).then((result) => {
      setPoiDataLoaded(true);
      return result;
    });

  const notifyPoiDataChanged = (
    reason: 'submission_created' | 'status_changed' | 'record_updated' | 'record_archived',
  ) => {
    publishAdminDataChanged({
      resource: 'poi',
      reason,
      occurredAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    void reloadPoiData();
  }, []);

  useEffect(() => {
    if (!initialMarkerId || initialMarkerHandledRef.current || !poiDataLoaded) {
      return;
    }

    initialMarkerHandledRef.current = true;
    setActiveSection('submissions');
    setStatusFilter('all');
    setCategoryFilter('all');
    const submission = submissions.find(
      (item) => item.id === initialMarkerId || `poi-${item.id}` === initialMarkerId,
    );
    if (submission) {
      // 深链 / 从工作台返回：直接打开该 POI 的编辑弹窗。
      setEditTarget(submission);
      setQuery(submission.title);
      setSelectedSubmissionIds(new Set([submission.id]));
      setSelectedLegacyMarkerIds(new Set());
      setStatusText(`已定位 POI：${submission.title}`);
    } else {
      const legacyMarker = mapMarkers.find((marker) => marker.id === initialMarkerId);
      if (legacyMarker) {
        setLegacyEditTarget(legacyMarker);
        setQuery(legacyMarker.label);
        setSelectedSubmissionIds(new Set());
        setSelectedLegacyMarkerIds(new Set([legacyMarker.id]));
        setStatusText(`已定位旧 POI：${legacyMarker.label}`);
      } else {
        setQuery(initialMarkerId);
        setStatusText('未找到要编辑的 POI。');
      }
    }

    window.requestAnimationFrame(() => {
      document
        .querySelector(
          '.admin-poi-item.is-deep-linked, .admin-poi-legacy-marker-item.is-deep-linked',
        )
        ?.scrollIntoView({
          block: 'center',
        });
    });
  }, [initialMarkerId, mapMarkers, poiDataLoaded, submissions]);

  const closeEditor = () => {
    setEditTarget(null);
    setCreateTarget(null);
    setLegacyEditTarget(null);
    if (editorMode === 'page') {
      onEditorClose?.();
    }
  };

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

      notifyPoiDataChanged(action === 'archive' ? 'record_archived' : 'status_changed');
      await reloadPoiData();
      setStatusText('操作已完成，列表与地图资料已刷新。');
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const deleteSubmission = async (submission: AdminPoiSubmission): Promise<boolean> => {
    const confirmed = await requestConfirmation(
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

      await reloadPoiData();
      if (successCount > 0) {
        notifyPoiDataChanged('status_changed');
      }
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

      notifyPoiDataChanged('record_updated');
      await reloadPoiData();
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

  const createSubmission = async (
    input: PoiSubmissionEditInput,
    options?: { asDraft?: boolean },
  ): Promise<{ error: string | null; submission: AdminPoiSubmission | null }> => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/map/poi-submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, asDraft: options?.asDraft === true }),
      });
      const data = (await response.json()) as AdminPoiSubmission & { message?: string };
      if (!response.ok) {
        return { error: data.message ?? '新增 POI 失败', submission: null };
      }

      notifyPoiDataChanged('submission_created');
      await reloadPoiData();
      if (options?.asDraft) {
        setStatusFilter('draft');
        setStatusText(`已保存 ${data.title} 草稿，可继续完善几何与简介后再提交审核。`);
      } else {
        setStatusFilter('pending_review');
        setStatusText(`已新增 ${data.title}，当前进入待审核队列。`);
      }
      return { error: null, submission: data };
    } finally {
      setIsBusy(false);
    }
  };

  /** 保存草稿：自动保存时用 silent 模式，避免切换全局忙碌态打断输入。 */
  const savePoiDraft = async (
    input: PoiSubmissionEditInput,
    options?: { poiId?: string; silent?: boolean },
  ): Promise<{ error: string | null; submission: AdminPoiSubmission | null }> => {
    if (!options?.silent) {
      setIsBusy(true);
    }
    try {
      const poiId = options?.poiId;
      const response = await fetch(
        poiId
          ? appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}`)
          : appPath('/api/admin/map/poi-submissions'),
        {
          method: poiId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(poiId ? input : { ...input, asDraft: true }),
        },
      );
      const data = (await response.json()) as AdminPoiSubmission & { message?: string };
      if (!response.ok) {
        return { error: data.message ?? '保存草稿失败', submission: null };
      }

      notifyPoiDataChanged(poiId ? 'record_updated' : 'submission_created');
      if (options?.silent) {
        void reloadPoiData();
      } else {
        await reloadPoiData();
        setStatusFilter('draft');
        setStatusText(`已保存 ${data.title} 草稿，可继续完善几何与简介后再提交审核。`);
      }
      return { error: null, submission: data };
    } catch {
      return { error: '保存草稿失败', submission: null };
    } finally {
      if (!options?.silent) {
        setIsBusy(false);
      }
    }
  };

  const submitDraftForReview = async (poiId: string): Promise<string | null> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/poi-submissions/${encodeURIComponent(poiId)}/submit`),
        { method: 'POST' },
      );
      const data = (await response.json()) as {
        message?: string;
        status?: PoiSubmissionStatus;
        title?: string;
      };
      if (!response.ok) {
        return data.message ?? '提交审核失败';
      }

      notifyPoiDataChanged('status_changed');
      await reloadPoiData();
      setStatusFilter('pending_review');
      setStatusText(`已将 ${data.title ?? '该 POI'} 提交审核。`);
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

      notifyPoiDataChanged('record_updated');
      await reloadPoiData();
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

      notifyPoiDataChanged('record_archived');
      await reloadPoiData();
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

    const confirmed = await requestConfirmation(
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
      notifyPoiDataChanged('record_updated');
      setStatusText(decision === 'unresolved' ? '已重置冲突提示判断' : '已保存冲突提示判断');
    } finally {
      setIsBusy(false);
    }
  };

  const updateImageReview = async (
    submission: AdminPoiSubmission,
    imageUrl: string,
    decision: PoiSubmissionImageReviewInput,
  ) => {
    if (!imageUrl) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/map/poi-submission-image-reviews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          imageUrl,
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
      notifyPoiDataChanged('record_updated');
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
  const rejectedImageCount = submissions.filter((submission) =>
    getPoiImageUrls(submission).some(
      (imageUrl) =>
        imageReviewByKey.get(imageReviewKey(submission.id, imageUrl))?.decision === 'rejected',
    ),
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

  const poiListRef = useRef<HTMLDivElement | null>(null);
  const runBulkApproveShortcut = () => {
    if (selectedPendingReviewSubmissions.length === 0) {
      return;
    }
    void (async () => {
      const confirmed = await requestConfirmation(
        `确认批量通过 ${selectedPendingReviewSubmissions.length} 条 POI 投稿吗？`,
      );
      if (!confirmed) {
        return;
      }
      await runBatchAction(selectedPendingReviewSubmissions, 'approve');
    })();
  };
  useListKeyboardNavigation({
    containerRef: poiListRef,
    enabled: editorMode === 'page' && activeSection === 'submissions',
    onBulkAction: runBulkApproveShortcut,
  });

  if (editorMode === 'page') {
    if (editTarget) {
      return (
        <EditPoiSubmissionDialog
          categories={categories}
          contextMarkers={auditContextMarkersBySubmissionId.get(editTarget.id) ?? []}
          defaultCoordinate={defaultDraftCoordinate}
          editorMode="page"
          editorSessionId={editorSessionId}
          iconBaseUrl={categoryIconBaseUrl}
          isBusy={isBusy}
          pageWorkspace={pageWorkspace}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          submission={editTarget}
          tilePreviewConfig={tilePreviewConfig}
          translation={translationBySubmissionId.get(editTarget.id)}
          onClose={closeEditor}
          onSubmit={async (input) => {
            const error = await updateSubmission(editTarget.id, input);
            if (!error) closeEditor();
            return error;
          }}
        />
      );
    }
    if (legacyEditTarget) {
      return (
        <EditLegacyPoiMarkerDialog
          categories={categories}
          editorMode="page"
          editorSessionId={editorSessionId}
          iconBaseUrl={categoryIconBaseUrl}
          isBusy={isBusy}
          marker={legacyEditTarget}
          pageWorkspace={pageWorkspace}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          tilePreviewConfig={tilePreviewConfig}
          translation={translationByLegacyMarkerId.get(legacyEditTarget.id)}
          onClose={closeEditor}
          onSubmit={async (input) => {
            const error = await updateLegacyMarker(legacyEditTarget.id, input);
            if (!error) closeEditor();
            return error;
          }}
        />
      );
    }
    return (
      <VisualEditorShell
        backHref={
          initialMarkerId
            ? `/admin/map-poi?markerId=${encodeURIComponent(initialMarkerId)}`
            : '/admin/map-poi'
        }
        editorKind="poi"
        sessionId={editorSessionId}
        title="POI 几何工作台"
      >
        <div className="visual-editor-empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            progress_activity
          </span>
          <p>{poiDataLoaded ? '请返回 POI 后台重新选择记录。' : '正在读取编辑数据。'}</p>
        </div>
      </VisualEditorShell>
    );
  }

  return (
    <section
      className={`module-panel admin-operations-panel${isBusy ? ' is-busy' : ''}`}
      aria-busy={isBusy}
      aria-labelledby="admin-poi-title"
    >
      <div className="section-heading">
        <h1 id="admin-poi-title">POI 后台</h1>
        <div className="admin-content-actions">
          <span className="muted">{currentSectionStatusText}</span>
          <AdminRefreshButton
            disabled={isBusy}
            label="刷新 POI"
            onRefresh={reloadPoiData}
            resource="poi"
          />
        </div>
      </div>
      <SegmentedTabs
        label="工作区"
        className="admin-page-segmented-control"
        options={poiAdminSectionOptions}
        value={activeSection}
        onChange={setActiveSection}
      />

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
            <CheckboxRow
              className="admin-content-bulk-select"
              checked={isAllVisiblePoiItemsSelected}
              disabled={visiblePoiRecordCount === 0}
              onChange={toggleVisiblePoiSelection}
              label={`选择当前列表 ${
                selectedVisibleSubmissions.length + selectedVisibleLegacyMarkers.length
              }/${visiblePoiRecordCount}`}
            />
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

          <div className="admin-content-list" aria-label="POI 主列表" ref={poiListRef}>
            {filteredPoiListItems.map((item) =>
              item.kind === 'submission' ? (
                <PoiSubmissionReviewItem
                  category={categoryById.get(item.submission.categoryId)}
                  conflictHints={conflictHintsBySubmissionId.get(item.submission.id) ?? []}
                  formatActor={formatActor}
                  iconBaseUrl={categoryIconBaseUrl}
                  isBusy={isBusy}
                  imageReviews={getPoiImageReviews(item.submission, imageReviewByKey)}
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
                  onDelete={async () => {
                    if (
                      await requestConfirmation(
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
          formatActor={formatActor}
          formatRoadMarker={formatRoadMarker}
          hierarchyHint={hierarchyHintBySubmissionId.get(detailTarget.id)}
          imageReviews={getPoiImageReviews(detailTarget, imageReviewByKey)}
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
          onImageReview={(imageUrl, decision) =>
            void updateImageReview(detailTarget, imageUrl, decision)
          }
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
            notifyPoiDataChanged('record_updated');
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
          imageReviews={getPoiImageReviews(publishTarget, imageReviewByKey)}
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
          iconBaseUrl={categoryIconBaseUrl}
          contextMarkers={auditContextMarkersBySubmissionId.get(editTarget.id) ?? []}
          defaultCoordinate={defaultDraftCoordinate}
          isBusy={isBusy}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          submission={editTarget}
          tilePreviewConfig={tilePreviewConfig}
          translation={translationBySubmissionId.get(editTarget.id)}
          onClose={() => setEditTarget(null)}
          onSaveDraft={(input, options) =>
            savePoiDraft(input, { ...options, poiId: options?.poiId ?? editTarget.id })
          }
          onSubmit={async (input) => {
            const error = await updateSubmission(editTarget.id, input);
            if (!error) {
              setEditTarget(null);
            }
            return error;
          }}
          onSubmitForReview={async (poiId) => submitDraftForReview(poiId ?? editTarget.id)}
        />
      ) : null}

      {createTarget ? (
        <EditPoiSubmissionDialog
          categories={categories}
          iconBaseUrl={categoryIconBaseUrl}
          contextMarkers={[]}
          defaultCoordinate={defaultDraftCoordinate}
          initialParentMarkerId={createTarget.parentMarkerId}
          isBusy={isBusy}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          tilePreviewConfig={tilePreviewConfig}
          onClose={() => setCreateTarget(null)}
          onSubmit={async (input) => {
            const result = await createSubmission(input);
            if (!result.error) {
              setCreateTarget(null);
            }
            return result.error;
          }}
          onSaveDraft={(input, options) => savePoiDraft(input, options)}
          onSubmitForReview={async (poiId) => (poiId ? submitDraftForReview(poiId) : null)}
        />
      ) : null}

      {legacyEditTarget ? (
        <EditLegacyPoiMarkerDialog
          categories={categories}
          iconBaseUrl={categoryIconBaseUrl}
          isBusy={isBusy}
          marker={legacyEditTarget}
          parentMarkerOptions={parentMarkerOptions}
          regionMarkerOptions={regionMarkerOptions}
          roadMarkerOptions={roadMarkerOptions}
          tilePreviewConfig={tilePreviewConfig}
          translation={translationByLegacyMarkerId.get(legacyEditTarget.id)}
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
    <article
      className={
        isSelected
          ? 'admin-content-item admin-poi-legacy-marker-item is-deep-linked'
          : 'admin-content-item admin-poi-legacy-marker-item'
      }
    >
      <label className="admin-content-select" aria-label={`选择旧有 POI ${marker.label}`}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelected} />
      </label>
      <div>
        <div className="admin-poi-title-row">
          <strong>{marker.label}</strong>
          <StatusChip variant="poi" tone="legacy">
            旧有数据
          </StatusChip>
        </div>
        <p className="muted">
          {marker.categoryId ? formatCategoryName(marker.categoryId, category) : '未分类'} ·{' '}
          {geometryLabel(marker.geometry)} · {marker.id}
        </p>
        {marker.description ? (
          <AdminPoiDescription key={marker.id} description={marker.description} />
        ) : null}
        {getPoiImageUrls(marker).length > 0 ? (
          <p className="muted">图片：{getPoiImageUrls(marker).length} 张</p>
        ) : null}
      </div>
      <div className="admin-content-actions">
        {coordinate ? (
          <a href={buildLegacyMarkerMapHref(marker, coordinate)} target="_blank" rel="noreferrer">
            地图查看
          </a>
        ) : null}
        <a
          className="admin-action-link"
          href={appPath(`/admin/map-poi/editor?markerId=${encodeURIComponent(marker.id)}`)}
        >
          几何工作台
        </a>
        <a
          className="admin-action-link"
          href={appPath(`/admin/map-poi/intro-editor?markerId=${encodeURIComponent(marker.id)}`)}
        >
          简介工作台
        </a>
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

/** POI 编辑弹窗统一分区外壳：标题 + 摘要 + 可选操作，正文由调用方决定。 */
function PoiEditorSection({
  actions,
  children,
  summary,
  title,
}: Readonly<{
  actions?: ReactNode;
  children: ReactNode;
  summary?: string;
  title: string;
}>) {
  return (
    <section className="poi-editor-section">
      <div className="poi-editor-section-heading">
        <div>
          <strong>{title}</strong>
          {summary ? <span>{summary}</span> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function PoiTranslationSection({
  translation,
}: Readonly<{ translation?: EntityTranslationRecord }>) {
  return (
    <PoiEditorSection summary={translation ? '来自名称翻译后台' : '尚未维护'} title="外语名称">
      <p className="muted">
        {translation
          ? `繁體：${translation.localizedLabels['zh-Hant'] || '未填写'} · English：${translation.localizedLabels.en || '未填写'}`
          : '译名在名称翻译后台维护，未填写的语种会自动回退到中文名称。'}
      </p>
      {translation?.roadSignPinyin ? (
        <p className="muted">{`路牌拼音：${translation.roadSignPinyin}`}</p>
      ) : null}
      <ButtonLink variant="secondary" href={appPath('/admin/translations')} icon="translate">
        打开名称翻译后台
      </ButtonLink>
    </PoiEditorSection>
  );
}

function PoiStationBindingsSection({
  emptySummary,
  markerId,
}: Readonly<{
  /** 未绑定车站时展示的摘要与说明。 */
  emptySummary: string;
  markerId: string | null;
}>) {
  const [bindings, setBindings] = useState<PoiStationBindingSummary[] | null>(null);

  useEffect(() => {
    if (!markerId) {
      setBindings(null);
      return undefined;
    }

    let cancelled = false;
    void fetch(
      appPath(`/api/admin/map/poi-station-bindings?markerId=${encodeURIComponent(markerId)}`),
      { cache: 'no-store' },
    )
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: PoiStationBindingSummary[] }) => {
        if (!cancelled) {
          setBindings(Array.isArray(data.items) ? data.items : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBindings([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [markerId]);

  const summary = !markerId
    ? emptySummary
    : bindings === null
      ? '正在读取站内信息…'
      : bindings.length > 0
        ? `已绑定 ${bindings.length} 个车站`
        : emptySummary;

  return (
    <PoiEditorSection summary={summary} title="站内信息">
      {!markerId || bindings === null ? (
        <p className="muted">{markerId ? '正在读取站内信息…' : emptySummary}</p>
      ) : bindings.length === 0 ? (
        <p className="muted">
          楼层、站内设施、换乘与出口属于「线路与班次」后台的车站数据。在车站详情里把该地点绑定为车站后，站内信息会显示在这里。
        </p>
      ) : (
        <div className="poi-station-bindings">
          {bindings.map((binding) => (
            <div className="poi-station-binding" key={binding.stationSourceId}>
              <div className="poi-station-binding-heading">
                <strong>{binding.stationName}</strong>
                <span className="muted">
                  {binding.lines.map((line) => line.name).join(' / ') || '未关联线路'}
                </span>
              </div>
              {binding.details.length > 0 ? (
                <ul className="poi-station-binding-details">
                  {binding.details.map((detail) => (
                    <li key={detail.detailSourceId}>
                      <span>{`${detail.lineName} · ${detail.stationName}`}</span>
                      <small className="muted">
                        {`${detail.layerCount} 层 · ${detail.facilityCount} 项设施 · ${detail.transferCount} 处换乘 · ${detail.exitCount} 个出口`}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">该车站尚未维护站内信息。</p>
              )}
              {binding.lines[0] ? (
                <ButtonLink
                  variant="secondary"
                  href={appPath(
                    `/admin/transit?section=lines&lineId=${encodeURIComponent(binding.lines[0].id)}`,
                  )}
                  icon="directions_transit"
                >
                  打开线路与班次后台
                </ButtonLink>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {!bindings?.length ? (
        <ButtonLink variant="secondary" href={appPath('/admin/transit')} icon="directions_transit">
          打开线路与班次后台
        </ButtonLink>
      ) : null}
    </PoiEditorSection>
  );
}

function AdminPoiBusinessDetailsFields({
  disabled,
  excludedParentMarkerId,
  form,
  onChange,
  parentMarkerOptions,
  roadMarkerOptions,
  showFacilities = true,
}: Readonly<{
  disabled: boolean;
  excludedParentMarkerId?: string;
  form: Pick<
    PoiSubmissionFormInput,
    | 'openingHours'
    | 'address'
    | 'addressRoadMarkerId'
    | 'parentMarkerId'
    | 'floorLabel'
    | 'facilities'
  >;
  onChange: (
    patch: Partial<
      Pick<
        PoiSubmissionFormInput,
        | 'openingHours'
        | 'address'
        | 'addressRoadMarkerId'
        | 'parentMarkerId'
        | 'floorLabel'
        | 'facilities'
      >
    >,
  ) => void;
  parentMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  showFacilities?: boolean;
}>) {
  const matchingRoads = findAddressRoadMarkers(form.address, roadMarkerOptions);
  const matchingRoadIds = new Set(matchingRoads.map((marker) => marker.id));
  const orderedRoads = [
    ...matchingRoads,
    ...roadMarkerOptions.filter((marker) => !matchingRoadIds.has(marker.id)),
  ];
  const roadMarkerIds = new Set(roadMarkerOptions.map((marker) => marker.id));
  const matchingParents = findPoiAddressMarkerMatches(
    form.address,
    parentMarkerOptions.filter(
      (marker) => marker.id !== excludedParentMarkerId && !roadMarkerIds.has(marker.id),
    ),
  );
  const suggestedRoad = selectUnambiguousAddressMarker(matchingRoads);
  const suggestedParent = selectUnambiguousAddressMarker(matchingParents);
  const suggestedFloorLabel = inferPoiFloorLabel(form.address);

  const updateAddress = (address: string) => {
    onChange({ address });
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
        <span>楼层</span>
        <input
          disabled={disabled}
          maxLength={40}
          value={form.floorLabel}
          onChange={(event) => onChange({ floorLabel: event.currentTarget.value })}
          placeholder="例如：B1、3F、站厅层"
        />
      </label>
      {suggestedRoad?.id !== form.addressRoadMarkerId ||
      suggestedParent?.id !== form.parentMarkerId ||
      (suggestedFloorLabel && suggestedFloorLabel !== form.floorLabel) ? (
        <div className="admin-poi-address-suggestions" aria-label="地址识别建议">
          <span>从地址识别</span>
          {suggestedRoad && suggestedRoad.id !== form.addressRoadMarkerId ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ addressRoadMarkerId: suggestedRoad.id })}
            >
              道路：{suggestedRoad.label}
            </button>
          ) : null}
          {suggestedParent && suggestedParent.id !== form.parentMarkerId ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ parentMarkerId: suggestedParent.id })}
            >
              父地点：{suggestedParent.label}
            </button>
          ) : null}
          {suggestedFloorLabel && suggestedFloorLabel !== form.floorLabel ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ floorLabel: suggestedFloorLabel })}
            >
              楼层：{suggestedFloorLabel}
            </button>
          ) : null}
        </div>
      ) : null}
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
      {showFacilities ? (
        <PoiFacilityEditor
          disabled={disabled}
          facilities={form.facilities}
          onChange={(facilities) => onChange({ facilities })}
        />
      ) : null}
    </div>
  );
}

function normalizePoiSpatialInput(
  spatial: MapMarkerSpatialMetadata | undefined,
  categoryId: string,
  geometryType?: MapGeometry['type'],
): MapMarkerSpatialMetadata | undefined {
  const isRoadGeometry = geometryType === 'LineString';
  const isRoadCategory = isRoadPoiCategory(categoryId);
  const networkKind =
    spatial?.networkKind ??
    (isRoadCategory || isRoadGeometry
      ? 'road'
      : categoryId === 'pedestrian-path'
        ? 'pedestrian'
        : undefined);
  const allowedModes = spatial?.allowedModes?.length
    ? spatial.allowedModes
    : networkKind === 'road'
      ? defaultRoadTravelModes
      : networkKind === 'pedestrian'
        ? (['walk'] as const)
        : undefined;
  const traversalBarrierSupported = Boolean(
    geometryType &&
    ['Rectangle', 'MultiRectangle', 'Polygon', 'MultiPolygon'].includes(geometryType),
  );
  const waterCategory = categoryId.trim().toLowerCase() === 'water';
  return compactPoiSpatialMetadata({
    ...spatial,
    networkKind,
    direction: networkKind ? (spatial?.direction ?? 'both') : spatial?.direction,
    allowedModes: allowedModes ? [...allowedModes] : undefined,
    traversalBarrier: traversalBarrierSupported
      ? (spatial?.traversalBarrier ??
        (waterCategory
          ? { kind: 'blocked_area', blockedModes: [...defaultTraversalBarrierModes] }
          : undefined))
      : undefined,
  });
}

function compactPoiSpatialMetadata(
  spatial: MapMarkerSpatialMetadata,
): MapMarkerSpatialMetadata | undefined {
  const style = spatial.style
    ? Object.fromEntries(
        Object.entries(spatial.style).filter(([, item]) => item !== undefined && item !== ''),
      )
    : undefined;
  const compacted: MapMarkerSpatialMetadata = {
    ...spatial,
    worldId: spatial.worldId?.trim() || undefined,
    coordinateY: spatial.coordinateY?.length ? spatial.coordinateY : undefined,
    allowedModes: spatial.allowedModes?.length
      ? Array.from(new Set(spatial.allowedModes))
      : undefined,
    style: style && Object.keys(style).length > 0 ? style : undefined,
    hideMarkerIcon: spatial.hideMarkerIcon || undefined,
    dynamicSymbol: spatial.dynamicSymbol?.ref.trim()
      ? { ...spatial.dynamicSymbol, ref: spatial.dynamicSymbol.ref.trim() }
      : undefined,
  };
  return Object.values(compacted).some((item) => item !== undefined) ? compacted : undefined;
}

function updatePoiSpatialStyle(
  value: MapMarkerSpatialMetadata | undefined,
  update: (patch: Partial<MapMarkerSpatialMetadata>) => void,
  patch: Partial<NonNullable<MapMarkerSpatialMetadata['style']>>,
) {
  update({ style: { ...value?.style, ...patch } });
}

function parseOptionalFiniteNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRoadPoiCategory(categoryId: string): boolean {
  return ['road', 'roadpoint', 'highway-s1', 'toll-gate'].includes(categoryId.trim().toLowerCase());
}

function formatPointCoordinateY(value: MapMarkerSpatialMetadata | undefined): string {
  const y = value?.coordinateY?.[0] ?? value?.defaultY;
  return y === undefined || y === null ? '' : String(y);
}

function updatePoiPointCoordinateY(
  value: MapMarkerSpatialMetadata | undefined,
  yText: string,
): MapMarkerSpatialMetadata | undefined | null {
  const y = yText.trim() ? Number(yText) : undefined;
  if (y !== undefined && !Number.isFinite(y)) {
    return null;
  }
  return compactPoiSpatialMetadata({
    ...value,
    defaultY: undefined,
    coordinateY: y === undefined ? undefined : [y],
  });
}

function parseCommaSeparatedValues(value: string): string[] | undefined {
  const values = Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
  return values.length > 0 ? values : undefined;
}

function buildMapVolumeFromGeometry(
  geometry: MapGeometry,
  firstY: number,
  secondY: number,
): MapMarkerSpatialMetadata['volume'] {
  const minY = Math.min(firstY, secondY);
  const maxY = Math.max(firstY, secondY);
  if (geometry.type === 'Rectangle') {
    return { type: 'ExtrudedRectangle', bounds: geometry.bounds, minY, maxY };
  }
  if (geometry.type === 'MultiRectangle') {
    return {
      type: 'MultiExtrudedRectangle',
      volumes: geometry.rectangles.map((bounds) => ({ bounds, minY, maxY })),
    };
  }
  if (geometry.type === 'Polygon') {
    return { type: 'ExtrudedPolygon', coordinates: geometry.coordinates, minY, maxY };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiExtrudedPolygon',
      volumes: geometry.coordinates.map((coordinates) => ({ coordinates, minY, maxY })),
    };
  }
  return undefined;
}

function getVolumeHeightBounds(
  volume: MapMarkerSpatialMetadata['volume'],
): { minY: number; maxY: number } | undefined {
  if (!volume) {
    return undefined;
  }
  if (volume.type === 'ExtrudedRectangle' || volume.type === 'ExtrudedPolygon') {
    return { minY: volume.minY, maxY: volume.maxY };
  }
  const minY = Math.min(...volume.volumes.map((item) => item.minY));
  const maxY = Math.max(...volume.volumes.map((item) => item.maxY));
  return Number.isFinite(minY) && Number.isFinite(maxY) ? { minY, maxY } : undefined;
}

function PoiSpatialMetadataEditor({
  categoryId,
  geometry,
  onChange,
  value,
}: Readonly<{
  categoryId: string;
  geometry?: MapGeometry;
  onChange: (value: MapMarkerSpatialMetadata | undefined) => void;
  value?: MapMarkerSpatialMetadata;
}>) {
  const normalizedValue = normalizePoiSpatialInput(value, categoryId, geometry?.type);
  const update = (patch: Partial<MapMarkerSpatialMetadata>) => {
    onChange(compactPoiSpatialMetadata({ ...normalizedValue, ...patch }));
  };
  const toggleMode = (mode: NonNullable<MapMarkerSpatialMetadata['allowedModes']>[number]) => {
    const modes = new Set(normalizedValue?.allowedModes ?? []);
    if (modes.has(mode)) {
      modes.delete(mode);
    } else {
      modes.add(mode);
    }
    update({ allowedModes: Array.from(modes) });
  };
  const barrierModes = normalizedValue?.traversalBarrier?.blockedModes?.length
    ? normalizedValue.traversalBarrier.blockedModes
    : [...defaultTraversalBarrierModes];
  const toggleBarrierMode = (mode: (typeof defaultTraversalBarrierModes)[number]) => {
    if (!normalizedValue?.traversalBarrier) {
      return;
    }
    const modes = new Set(barrierModes);
    if (modes.has(mode)) {
      if (modes.size === 1) {
        return;
      }
      modes.delete(mode);
    } else {
      modes.add(mode);
    }
    update({
      traversalBarrier: {
        ...normalizedValue.traversalBarrier,
        blockedModes: Array.from(modes),
      },
    });
  };
  const volumeBounds = getVolumeHeightBounds(normalizedValue?.volume);
  const regionGeometrySupported = Boolean(
    geometry && ['Rectangle', 'MultiRectangle', 'Polygon', 'MultiPolygon'].includes(geometry.type),
  );
  const waterCategory = categoryId.trim().toLowerCase() === 'water';
  const volumeSupported = regionGeometrySupported;

  return (
    <>
      <PoiEditorSection summary="道路/通道网络与可达性" title="路网与通行">
        <div className="admin-poi-edit-coordinate-fields">
          <div className="admin-segmented-field">
            <span>网络类型</span>
            <SegmentedControl
              ariaLabel="路网类型"
              className="material-mode-switch material-variant-switch"
              value={normalizedValue?.networkKind ?? ''}
              onChange={(next) => {
                const networkKind = (next as MapMarkerSpatialMetadata['networkKind']) || undefined;
                update({
                  networkKind,
                  allowedModes:
                    networkKind !== value?.networkKind
                      ? networkKind === 'road'
                        ? [...defaultRoadTravelModes]
                        : networkKind === 'pedestrian'
                          ? ['walk']
                          : undefined
                      : normalizedValue?.allowedModes,
                });
              }}
              options={[
                { value: '', label: '非路网 POI' },
                { value: 'road', label: '道路' },
                { value: 'pedestrian', label: '通道 / 步行路' },
              ]}
            />
          </div>
          <div className="admin-segmented-field">
            <span>方向</span>
            <SegmentedControl
              ariaLabel="路网方向"
              className="material-mode-switch material-variant-switch"
              value={normalizedValue?.direction ?? 'both'}
              onChange={(next) =>
                update({
                  direction: next as NonNullable<MapMarkerSpatialMetadata['direction']>,
                })
              }
              options={[
                { value: 'both', label: '双向' },
                { value: 'forward', label: '沿点序单向' },
                { value: 'reverse', label: '逆点序单向' },
              ]}
            />
          </div>
        </div>
        <fieldset className="poi-editor-subsection">
          <legend>允许通行方式</legend>
          <div className="admin-inline-checkboxes">
            {(
              [
                ['walk', '步行'],
                ['taxi', '出租车'],
                ['bus', '公交'],
                ['coach', '客运'],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={normalizedValue?.allowedModes?.includes(mode) ?? false}
                  onChange={() => toggleMode(mode)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="admin-poi-edit-coordinate-fields">
          <label>
            <span>跨层连接器</span>
            <select
              value={normalizedValue?.verticalConnectorKind ?? ''}
              onChange={(event) =>
                update({
                  verticalConnectorKind:
                    (event.currentTarget
                      .value as MapMarkerSpatialMetadata['verticalConnectorKind']) || undefined,
                })
              }
            >
              <option value="">不是跨层连接器</option>
              <option value="ramp">匝道 / 坡道</option>
              <option value="stairs">楼梯</option>
              <option value="escalator">扶梯</option>
              <option value="elevator">电梯</option>
            </select>
          </label>
          <label className="admin-inline-checkbox">
            <input
              type="checkbox"
              checked={normalizedValue?.accessible ?? false}
              onChange={(event) => update({ accessible: event.currentTarget.checked || undefined })}
            />
            <span>无障碍可通行</span>
          </label>
        </div>
      </PoiEditorSection>
      <PoiEditorSection summary="阻断区域与禁止穿越方式" title="通行限制">
        <label className="admin-inline-checkbox">
          <input
            type="checkbox"
            disabled={!regionGeometrySupported || waterCategory}
            checked={Boolean(normalizedValue?.traversalBarrier)}
            onChange={(event) =>
              update({
                traversalBarrier: event.currentTarget.checked
                  ? {
                      kind: 'blocked_area',
                      blockedModes: [...defaultTraversalBarrierModes],
                    }
                  : undefined,
              })
            }
          />
          <span>{waterCategory ? '水域分类默认阻断直接穿越' : '作为通行阻断区域'}</span>
        </label>
        {normalizedValue?.traversalBarrier?.kind === 'blocked_area' ? (
          <fieldset className="poi-editor-subsection">
            <legend>阻断直接穿越的方式</legend>
            <div className="admin-inline-checkboxes">
              {(
                [
                  ['walk', '步行'],
                  ['taxi', '出租车'],
                  ['bus', '公交'],
                  ['coach', '客运'],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode}>
                  <input
                    type="checkbox"
                    checked={barrierModes.includes(mode)}
                    disabled={barrierModes.length === 1 && barrierModes.includes(mode)}
                    onChange={() => toggleBarrierMode(mode)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </PoiEditorSection>
      <PoiEditorSection summary="区域填充、线路色与 2.5D 体块" title="地图展示与立体样式">
        <div className="admin-poi-edit-coordinate-fields">
          <label>
            <span>填充颜色</span>
            <input
              type="color"
              value={normalizedValue?.style?.fillColor ?? '#3b82f6'}
              onChange={(event) =>
                updatePoiSpatialStyle(normalizedValue, update, {
                  fillColor: event.currentTarget.value,
                })
              }
            />
          </label>
          <label>
            <span>填充透明度</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={normalizedValue?.style?.fillOpacity ?? ''}
              onChange={(event) =>
                updatePoiSpatialStyle(normalizedValue, update, {
                  fillOpacity: parseOptionalFiniteNumber(event.currentTarget.value),
                })
              }
            />
          </label>
          <label>
            <span>描边颜色</span>
            <input
              type="color"
              value={normalizedValue?.style?.strokeColor ?? '#2563eb'}
              onChange={(event) =>
                updatePoiSpatialStyle(normalizedValue, update, {
                  strokeColor: event.currentTarget.value,
                })
              }
            />
          </label>
          <label>
            <span>描边透明度</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={normalizedValue?.style?.strokeOpacity ?? ''}
              onChange={(event) =>
                updatePoiSpatialStyle(normalizedValue, update, {
                  strokeOpacity: parseOptionalFiniteNumber(event.currentTarget.value),
                })
              }
            />
          </label>
        </div>
        <label>
          <span>绑定线路色（线路 ID，逗号分隔，首个有效值优先）</span>
          <input
            value={normalizedValue?.style?.lineColorTransitLineIds?.join(', ') ?? ''}
            onChange={(event) =>
              updatePoiSpatialStyle(normalizedValue, update, {
                lineColorTransitLineIds: parseCommaSeparatedValues(event.currentTarget.value),
              })
            }
          />
        </label>
        <label className="admin-inline-checkbox">
          <input
            type="checkbox"
            disabled={!volumeSupported}
            checked={Boolean(normalizedValue?.volume)}
            onChange={(event) => {
              const minY = normalizedValue?.defaultY ?? 64;
              update({
                volume:
                  event.currentTarget.checked && geometry
                    ? buildMapVolumeFromGeometry(geometry, minY, minY + 4)
                    : undefined,
              });
            }}
          />
          <span>按当前区域生成 2.5D 体块</span>
        </label>
        {normalizedValue?.volume && geometry ? (
          <div className="admin-poi-edit-coordinate-fields">
            <label>
              <span>体块底部 Y</span>
              <input
                type="number"
                value={volumeBounds?.minY ?? ''}
                onChange={(event) => {
                  const minY = parseOptionalFiniteNumber(event.currentTarget.value);
                  if (minY !== undefined) {
                    update({
                      volume: buildMapVolumeFromGeometry(
                        geometry,
                        minY,
                        volumeBounds?.maxY ?? minY + 4,
                      ),
                    });
                  }
                }}
              />
            </label>
            <label>
              <span>体块顶部 Y</span>
              <input
                type="number"
                value={volumeBounds?.maxY ?? ''}
                onChange={(event) => {
                  const maxY = parseOptionalFiniteNumber(event.currentTarget.value);
                  if (maxY !== undefined) {
                    update({
                      volume: buildMapVolumeFromGeometry(
                        geometry,
                        volumeBounds?.minY ?? maxY - 4,
                        maxY,
                      ),
                    });
                  }
                }}
              />
            </label>
          </div>
        ) : null}
      </PoiEditorSection>
      <PoiEditorSection summary="地铁出入口、道路与高速编号" title="标记符号">
        <div className="admin-poi-edit-coordinate-fields">
          <label>
            <span>动态编号图标</span>
            <select
              value={value?.dynamicSymbol?.kind ?? ''}
              onChange={(event) => {
                const kind = event.currentTarget.value as NonNullable<
                  MapMarkerSpatialMetadata['dynamicSymbol']
                >['kind'];
                update({
                  dynamicSymbol: kind ? { kind, ref: value?.dynamicSymbol?.ref ?? '1' } : undefined,
                });
              }}
            >
              <option value="">使用静态图标</option>
              <option value="metro_exit">地铁出入口编号</option>
              <option value="road_ref">道路编号</option>
              <option value="highway_ref">高速公路编号</option>
            </select>
          </label>
          <label>
            <span>编号</span>
            <input
              value={value?.dynamicSymbol?.ref ?? ''}
              disabled={!value?.dynamicSymbol}
              onChange={(event) =>
                value?.dynamicSymbol &&
                update({
                  dynamicSymbol: { ...value.dynamicSymbol, ref: event.currentTarget.value },
                })
              }
              maxLength={12}
            />
          </label>
        </div>
      </PoiEditorSection>
    </>
  );
}

function PoiWorldMetadataEditor({
  isPoint,
  onChange,
  value,
}: Readonly<{
  isPoint: boolean;
  onChange: (value: MapMarkerSpatialMetadata | undefined) => void;
  value?: MapMarkerSpatialMetadata;
}>) {
  const update = (patch: Partial<MapMarkerSpatialMetadata>) =>
    onChange(compactPoiSpatialMetadata({ ...value, ...patch }));

  return (
    <PoiEditorSection summary="世界 ID 与默认高度" title="世界与高度">
      <div className="admin-poi-edit-coordinate-fields">
        <label>
          <span>世界 ID</span>
          <input
            value={value?.worldId ?? ''}
            onChange={(event) => update({ worldId: event.currentTarget.value || undefined })}
            placeholder="留空继承地图主世界"
          />
        </label>
        {!isPoint ? (
          <label>
            <span>默认 Y</span>
            <input
              type="number"
              value={value?.defaultY ?? ''}
              onChange={(event) =>
                update({ defaultY: parseOptionalFiniteNumber(event.currentTarget.value) })
              }
              placeholder="64"
            />
          </label>
        ) : null}
      </div>
    </PoiEditorSection>
  );
}

function EditLegacyPoiMarkerDialog({
  categories,
  editorMode = 'dialog',
  editorSessionId = 'legacy-poi-dialog',
  iconBaseUrl,
  isBusy,
  marker,
  onClose,
  onSubmit,
  pageWorkspace = 'geometry',
  parentMarkerOptions,
  regionMarkerOptions,
  roadMarkerOptions,
  tilePreviewConfig,
  translation,
}: Readonly<{
  categories: PoiCategory[];
  editorMode?: 'dialog' | 'page';
  editorSessionId?: string;
  iconBaseUrl: string;
  isBusy: boolean;
  marker: MapMarker;
  onClose: () => void;
  onSubmit: (input: LegacyPoiMarkerEditInput) => Promise<string | null>;
  /** page 模式下要渲染的工作台；dialog 模式忽略。 */
  pageWorkspace?: 'geometry' | 'intro';
  parentMarkerOptions: MapMarker[];
  regionMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  tilePreviewConfig: PoiTilePreviewConfig;
  translation?: EntityTranslationRecord;
}>) {
  const [form, setForm] = useState<LegacyPoiMarkerEditInput>(() => ({
    label: marker.label,
    categoryId: marker.categoryId ?? '',
    iconFileName: marker.iconFileName ?? '',
    description: marker.description ?? '',
    href: marker.href ?? '',
    imageUrls: getPoiImageUrls(marker),
    geometry: marker.geometry,
    spatial: normalizePoiSpatialInput(
      marker.spatial,
      marker.categoryId ?? '',
      marker.geometry.type,
    ),
    parentMarkerId: marker.parentMarkerId ?? '',
    floorLabel: marker.floorLabel ?? '',
    boundRegionMarkerIds: marker.boundRegionMarkerIds ?? [],
    openingHours: marker.openingHours ?? '',
    address: marker.address ?? '',
    addressRoadMarkerId: marker.addressRoadMarkerId ?? '',
    facilities: marker.facilities ?? [],
  }));
  const [geometryDraft, setGeometryDraft] = useState<PoiGeometryDraft>(() =>
    createPoiGeometryDraft(marker.geometry, marker.spatial?.coordinateY),
  );
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [pointYText, setPointYText] = useState(() => formatPointCoordinateY(marker.spatial));
  const [activeTab, setActiveTab] = useState<PoiEditTab>('basic');
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const iconOptions = selectedCategory?.iconMapping.iconFileNames ?? [];
  /** 简介工作台复用投稿表单结构，仅主标题字段名不同。 */
  const introForm: PoiSubmissionFormInput = { ...form, title: form.label };
  // 返回后台时带上 POI 标识，后台会自动重新打开该 POI 的编辑弹窗。
  const pageBackHref = `/admin/map-poi?markerId=${encodeURIComponent(marker.id)}`;

  const updateForm = (patch: Partial<LegacyPoiMarkerEditInput>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.categoryId && patch.categoryId !== current.categoryId) {
        const nextCategory = categories.find((category) => category.id === patch.categoryId);
        next.iconFileName = nextCategory?.iconMapping.iconFileNames.includes(current.iconFileName)
          ? current.iconFileName
          : '';
        next.spatial = normalizePoiSpatialInput(
          current.spatial,
          patch.categoryId,
          geometryDraft.type,
        );
      }
      return next;
    });
    setError('');
    setIsDirty(true);
    publishEditorDraftChanged({
      dirty: true,
      editorKind: 'poi',
      sessionId: editorSessionId,
    });
  };

  const updateGeometryDraft = (draft: PoiGeometryDraft) => {
    setGeometryDraft(draft);
    setForm((current) => ({
      ...current,
      spatial: normalizePoiSpatialInput(current.spatial, current.categoryId, draft.type),
    }));
    setError('');
    setIsDirty(true);
    publishEditorDraftChanged({
      dirty: true,
      editorKind: 'poi',
      sessionId: editorSessionId,
    });
  };

  const updateIntroForm = (patch: Partial<PoiSubmissionFormInput>) => {
    const { title, ...rest } = patch;
    updateForm(title === undefined ? rest : { ...rest, label: title });
  };

  const save = async (): Promise<boolean> => {
    if (!form.label.trim()) {
      setError('请填写标记点名称。');
      return false;
    }
    if (form.facilities.some((facility) => !facility.description.trim())) {
      setError('请填写每条设施信息的文字描述。');
      return false;
    }

    const geometryResult = buildMapGeometryFromDraft(geometryDraft);
    if (!geometryResult.geometry) {
      setError(geometryResult.error ?? '请填写有效的几何坐标。');
      return false;
    }

    const submitError = await onSubmit({
      ...form,
      label: form.label.trim(),
      categoryId: form.categoryId.trim(),
      iconFileName: form.iconFileName.trim(),
      description: form.description.trim(),
      href: form.href.trim(),
      imageUrls: normalizePoiImageUrlList(form.imageUrls),
      geometry: geometryResult.geometry,
      spatial: normalizePoiSpatialInput(
        {
          ...form.spatial,
          coordinateY:
            geometryDraft.type === 'Point'
              ? form.spatial?.coordinateY
              : extractCoordinateYDraftValues(geometryDraft),
        },
        form.categoryId,
        geometryResult.geometry.type,
      ),
      parentMarkerId: form.parentMarkerId.trim(),
      floorLabel: form.floorLabel.trim(),
      boundRegionMarkerIds: form.boundRegionMarkerIds,
      openingHours: form.openingHours.trim(),
      address: form.address.trim(),
      addressRoadMarkerId: form.addressRoadMarkerId,
      facilities: form.facilities,
    });
    if (submitError) {
      setError(submitError);
      return false;
    }
    setIsDirty(false);
    publishEditorDraftChanged({
      dirty: false,
      editorKind: 'poi',
      sessionId: editorSessionId,
    });
    return true;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  if (editorMode === 'page') {
    if (pageWorkspace === 'intro') {
      return (
        <VisualEditorShell
          actions={
            <Button
              variant="primary"
              icon="save"
              loading={isBusy}
              disabled={isBusy}
              onClick={() => void save()}
            >
              {isBusy ? '保存中' : '保存简介'}
            </Button>
          }
          backHref={pageBackHref}
          editorKind="poi"
          isBusy={isBusy}
          isDirty={isDirty}
          onSave={() => save()}
          sessionId={editorSessionId}
          title={`编辑 ${marker.label} 简介`}
          workspace
        >
          <PoiIntroWorkspace
            categories={categories}
            disabled={isBusy}
            excludedParentMarkerId={marker.id}
            form={introForm}
            iconBaseUrl={iconBaseUrl}
            parentMarkerOptions={parentMarkerOptions}
            roadMarkerOptions={roadMarkerOptions}
            selectedCategory={selectedCategory}
            onChange={updateIntroForm}
          />
        </VisualEditorShell>
      );
    }

    return (
      <VisualEditorShell
        actions={
          <Button
            variant="primary"
            icon="save"
            loading={isBusy}
            disabled={isBusy}
            onClick={() => void save()}
          >
            {isBusy ? '保存中' : '保存几何'}
          </Button>
        }
        backHref={pageBackHref}
        editorKind="poi"
        isBusy={isBusy}
        isDirty={isDirty}
        onSave={() => save()}
        sessionId={editorSessionId}
        title={`调整 ${marker.label} 几何`}
        workspace
      >
        <PoiStandaloneGeometryWorkspace
          contextMarkers={[]}
          draft={geometryDraft}
          entityLabel={marker.label}
          pointYText={pointYText}
          tilePreviewConfig={tilePreviewConfig}
          onChange={updateGeometryDraft}
          onPointYChange={(value) => {
            setPointYText(value);
            const nextSpatial = updatePoiPointCoordinateY(form.spatial, value);
            if (nextSpatial !== null) updateForm({ spatial: nextSpatial });
          }}
        />
      </VisualEditorShell>
    );
  }

  const geometryMetrics = describePoiGeometry(
    buildMapGeometryFromDraft(geometryDraft).geometry ?? null,
  );

  const geometryEditorElement = (
    <PoiEditorSection summary={geometryLabelFromDraft(geometryDraft)} title="几何">
      <p className="muted">{`中点 ${geometryMetrics.center} · ${geometryMetrics.detail}`}</p>
      <ButtonLink
        variant="secondary"
        href={appPath(`/admin/map-poi/editor?markerId=${encodeURIComponent(marker.id)}`)}
        onClick={(event) => void openPoiWorkspaceWithConfirm(event, isDirty)}
        icon="edit_location_alt"
      >
        打开几何工作台
      </ButtonLink>
    </PoiEditorSection>
  );

  const introEditorElement = (
    <PoiEditorSection summary={describePoiIntroSummary(introForm)} title="简介与图片">
      <p className="muted">
        {[
          form.openingHours.trim() || '未填写营业时间',
          form.address.trim() || '未填写文字地址',
          form.floorLabel.trim(),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <ButtonLink
        variant="secondary"
        href={appPath(`/admin/map-poi/intro-editor?markerId=${encodeURIComponent(marker.id)}`)}
        onClick={(event) => void openPoiWorkspaceWithConfirm(event, isDirty)}
        icon="article"
      >
        打开简介工作台
      </ButtonLink>
    </PoiEditorSection>
  );

  const formElement = (
    <Modal
      as="form"
      className="admin-poi-edit-dialog"
      labelledBy="admin-legacy-poi-edit-title"
      onSubmit={submit}
      onBackdropClick={onClose}
    >
      <div className="section-heading">
        <h2 id="admin-legacy-poi-edit-title">编辑旧有 POI</h2>
        <span className="muted">{marker.id}</span>
      </div>
      <SegmentedControl
        ariaLabel="旧有 POI 编辑分区"
        className="material-mode-switch material-variant-switch admin-poi-edit-tabs"
        disabled={isBusy}
        options={poiEditTabOptions}
        role="tablist"
        value={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'basic' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-basic"
          role="tabpanel"
          aria-label="基本信息"
        >
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
          <AdminPoiIconPicker
            defaultIconFileName={selectedCategory?.iconMapping.defaultIconFileName}
            disabled={isBusy}
            hidden={Boolean(form.spatial?.hideMarkerIcon)}
            iconBaseUrl={iconBaseUrl}
            options={iconOptions}
            value={form.iconFileName}
            onChange={(iconFileName) => updateForm({ iconFileName })}
            onHiddenChange={(hidden) =>
              updateForm({
                spatial: compactPoiSpatialMetadata({
                  ...form.spatial,
                  hideMarkerIcon: hidden || undefined,
                }),
              })
            }
          />
          <PoiTranslationSection translation={translation} />
          {geometryEditorElement}
          {introEditorElement}
        </div>
      ) : null}
      {activeTab === 'facility' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-facility"
          role="tabpanel"
          aria-label="设施与出入口"
        >
          <ParentMarkerSelect
            categories={categories}
            excludedMarkerId={marker.id}
            iconBaseUrl={iconBaseUrl}
            markerOptions={parentMarkerOptions}
            selectedId={form.parentMarkerId}
            onChange={(parentMarkerId) => updateForm({ parentMarkerId })}
          />
          <PoiRegionBindingsFieldset
            markerOptions={regionMarkerOptions}
            selectedIds={form.boundRegionMarkerIds}
            onChange={(boundRegionMarkerIds) => updateForm({ boundRegionMarkerIds })}
          />
          <PoiFacilityEditor
            disabled={isBusy}
            facilities={form.facilities}
            onChange={(facilities) => updateForm({ facilities })}
          />
          <PoiStationBindingsSection emptySummary="未绑定车站" markerId={marker.id} />
        </div>
      ) : null}
      {activeTab === 'advanced' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-advanced"
          role="tabpanel"
          aria-label="高级设置"
        >
          <PoiWorldMetadataEditor
            isPoint={geometryDraft.type === 'Point'}
            value={form.spatial}
            onChange={(spatial) => updateForm({ spatial })}
          />
          <PoiSpatialMetadataEditor
            categoryId={form.categoryId}
            geometry={buildMapGeometryFromDraft(geometryDraft).geometry}
            value={form.spatial}
            onChange={(spatial) => updateForm({ spatial })}
          />
        </div>
      ) : null}
      {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
      <div className="admin-content-actions">
        <button type="button" onClick={onClose} disabled={isBusy}>
          取消
        </button>
        <button type="submit" disabled={isBusy}>
          保存修改
        </button>
      </div>
    </Modal>
  );

  return formElement;
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
        <div className="admin-segmented-field">
          <span>公开投稿</span>
          <SegmentedControl
            ariaLabel="公开投稿筛选"
            className="material-mode-switch material-variant-switch"
            value={filterValue}
            onChange={(next) => onFilterChange(next as PoiCategoryBoardFilter)}
            options={poiCategoryBoardFilterOptions}
          />
        </div>
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
        <Button variant="primary" icon="tune" disabled={isBusy} onClick={onEdit}>
          编辑分类与图标
        </Button>
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
                <StatusChip
                  variant="poi"
                  tone={category.acceptsPublicSubmissions ? 'approved' : 'rejected'}
                >
                  {category.acceptsPublicSubmissions ? '允许公开投稿' : '不允许公开投稿'}
                </StatusChip>
              </div>
              <div className="operation-tag-list">
                <StatusChip>{`图标 ${category.iconMapping.iconFileNames.length}`}</StatusChip>
                {category.iconMapping.iconFileNames.length > 1 ? (
                  <StatusChip tone="accent">多图标配置</StatusChip>
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
                  <StatusChip>{`其余 ${category.iconMapping.iconFileNames.length - 3} 个`}</StatusChip>
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

/** 将 LDPass 用户 ID 显示为“用户名（ID 末段）”，缺少快照时回退为原始 ID。 */
function formatPoiActorName(
  actorId: string | undefined,
  actorNameById: Map<string, string>,
): string {
  if (!actorId) {
    return '未知';
  }

  const name = actorNameById.get(actorId);
  if (!name || name === actorId) {
    return actorId;
  }

  const suffix = actorId.length > 8 ? actorId.slice(-6) : actorId;
  return `${name}（${suffix}）`;
}

function PoiSubmissionReviewItem({
  category,
  conflictHints,
  formatActor,
  hierarchyHint,
  iconBaseUrl,
  isBusy,
  isSelected,
  imageReviews,
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
  formatActor: (actorId?: string) => string;
  hierarchyHint?: PoiHierarchyHint | null;
  iconBaseUrl: string;
  isBusy: boolean;
  isSelected: boolean;
  imageReviews: PoiSubmissionImageReview[];
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
  const imageUrls = getPoiImageUrls(submission);
  const rejectedImage = imageReviews.some((review) => review.decision === 'rejected');
  const unreviewedImage = imageUrls.length > imageReviews.length;
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
    <article
      className={
        isSelected
          ? 'admin-content-item admin-poi-item is-deep-linked'
          : 'admin-content-item admin-poi-item'
      }
      data-keyboard-list-item
      tabIndex={-1}
    >
      <label className="admin-content-select">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          aria-label={`选择 POI 投稿 ${submission.title}`}
          data-keyboard-select
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
          <StatusChip variant="poi" tone={submission.status}>
            {statusLabel(submission.status)}
          </StatusChip>
        </div>
        <div className="operation-tag-list">
          <StatusChip>{geometryLabel(submission.geometry)}</StatusChip>
          {hasConflicts ? (
            <StatusChip tone="warning">{`冲突 ${conflictSummary}`}</StatusChip>
          ) : null}
          {rejectedImage ? <StatusChip tone="warning">图片不合格</StatusChip> : null}
          {unreviewedImage ? <StatusChip>图片待审</StatusChip> : null}
          {hierarchyHint ? <StatusChip>疑似父子地点</StatusChip> : null}
          {submission.parentMarkerId ? <StatusChip>已绑定父地点</StatusChip> : null}
          {submission.boundRegionMarkerIds?.length ? (
            <StatusChip>{`绑定区域 ${submission.boundRegionMarkerIds.length}`}</StatusChip>
          ) : null}
          {submission.description ? <StatusChip>已填写简介</StatusChip> : null}
          {submission.openingHours ? <StatusChip>已填写营业时间</StatusChip> : null}
          {submission.address ? <StatusChip>已填写地址</StatusChip> : null}
          {submission.floorLabel ? (
            <StatusChip>{`楼层 ${submission.floorLabel}`}</StatusChip>
          ) : null}
          {submission.facilities?.length ? (
            <StatusChip>{`设施 ${submission.facilities.length}`}</StatusChip>
          ) : null}
        </div>
        {representativeCoordinate ? (
          <p className="muted">代表坐标：{formatCoordinatePair(representativeCoordinate)}</p>
        ) : null}
        <p className="muted">
          投稿人：{formatActor(submission.submittedBy)}
          {submission.submittedAt ? ` · ${formatDate(submission.submittedAt)}` : ''}
          {submission.reviewReason ? ` · ${submission.reviewReason}` : ''}
        </p>
      </div>
      <div className="admin-content-actions">
        <button type="button" onClick={onDetail} data-keyboard-open>
          查看详情
        </button>
        <a className="admin-action-link" href={mapHref} target="_blank" rel="noreferrer">
          地图查看
        </a>
        <a
          className="admin-action-link"
          href={appPath(`/admin/map-poi/editor?markerId=${encodeURIComponent(submission.id)}`)}
        >
          几何工作台
        </a>
        <a
          className="admin-action-link"
          href={appPath(
            `/admin/map-poi/intro-editor?markerId=${encodeURIComponent(submission.id)}`,
          )}
        >
          简介工作台
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
  formatActor,
  formatRoadMarker,
  hierarchyHint,
  imageReviews,
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
  formatActor: (actorId?: string) => string;
  formatRoadMarker: (markerId?: string) => string;
  hierarchyHint?: PoiHierarchyHint | null;
  imageReviews: PoiSubmissionImageReview[];
  isBusy: boolean;
  onClose: () => void;
  onConflictDecision: (hint: PoiConflictHint, decision: PoiConflictDecisionInput) => void;
  onDelete: () => void;
  onEdit: () => void;
  onImageReview: (imageUrl: string, decision: PoiSubmissionImageReviewInput) => void;
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
    <Modal
      labelledBy="admin-poi-detail-title"
      className="admin-poi-detail-dialog"
      onBackdropClick={onClose}
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
        <button
          type="button"
          disabled={isBusy || submission.status !== 'approved'}
          onClick={() => requestPageWindow(mapHref, '地图查看')}
        >
          地图查看
        </button>
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
      {getPoiImageUrls(submission).length > 0 ? (
        <PoiSubmissionImagePreview
          imageReviews={imageReviews}
          isBusy={isBusy}
          onReview={onImageReview}
          submission={submission}
        />
      ) : null}
      <PoiSubmissionDetail
        category={category}
        contextMarkers={contextMarkers}
        formatActor={formatActor}
        formatRoadMarker={formatRoadMarker}
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
    </Modal>
  );
}

function PoiSubmissionDetail({
  category,
  contextMarkers,
  formatActor,
  formatRoadMarker,
  hierarchyHint,
  representativeCoordinate,
  submission,
  tilePreviewConfig,
}: Readonly<{
  category?: PoiCategory;
  contextMarkers: PoiAuditContextMarker[];
  formatActor: (actorId?: string) => string;
  formatRoadMarker: (markerId?: string) => string;
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
          <dd>
            {submission.spatial?.hideMarkerIcon
              ? '不使用图标（仅显示名称标签）'
              : submission.iconFileName || '跟随分类默认图标'}
          </dd>
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
          <dt>楼层</dt>
          <dd>{submission.floorLabel || '未填写'}</dd>
        </div>
        <div>
          <dt>地址道路</dt>
          <dd>
            {submission.addressRoadMarkerId
              ? formatRoadMarker(submission.addressRoadMarkerId)
              : '未绑定'}
          </dd>
        </div>
        <div>
          <dt>审核</dt>
          <dd>
            {submission.reviewedBy
              ? `${formatActor(submission.reviewedBy)} · ${submission.reviewedAt ? formatDate(submission.reviewedAt) : '已审核'}`
              : '尚未审核'}
          </dd>
        </div>
      </dl>
      {submission.facilities?.length ? (
        <div className="admin-poi-detail-facilities">
          <strong>设施信息</strong>
          {submission.facilities.map((facility, index) => (
            <div key={`${facility.symbolIcon}-${index}`}>
              <MaterialSymbol name={facility.symbolIcon} preview aria-hidden="true" />
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
          <PoiShapeLayer
            className="admin-poi-audit-map-submission-shape"
            height={152}
            preview={preview}
            width={220}
          />
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
  viewport,
}: Readonly<{
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  tilePreviewConfig: PoiTilePreviewConfig;
  viewport?: PoiMapViewport;
}>) {
  const tiles = buildPoiAuditPreviewTiles(bounds, tilePreviewConfig, viewport);
  if (tiles.length === 0) {
    return null;
  }

  return (
    <div className="admin-poi-audit-map-tiles" aria-hidden="true">
      {tiles.map((tile) => (
        <LayeredMapTile
          className="admin-poi-audit-map-tile"
          fallbackUrl={tile.fallbackUrl}
          freshUrl={tile.freshUrl}
          key={tile.id}
          tileKey={tile.id}
          style={buildPoiTileStyle(tile, viewport)}
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
        <PoiShapeLayer
          className="admin-poi-geometry-preview-shape"
          height={128}
          preview={preview}
          width={180}
        />
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
  imageReviews,
  isBusy,
  onClose,
  onConfirm,
  submission,
}: Readonly<{
  category?: PoiCategory;
  conflictDecisions: PoiConflictDecision[];
  conflictHints: PoiConflictHint[];
  imageReviews: PoiSubmissionImageReview[];
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submission: AdminPoiSubmission;
}>) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const representativeCoordinate = getGeometryRepresentativeCoordinate(submission.geometry);
  const imageUrls = getPoiImageUrls(submission);
  const hasRejectedImage = imageReviews.some((review) => review.decision === 'rejected');
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
    <Modal
      labelledBy="admin-poi-publish-title"
      className="admin-poi-publish-dialog"
      as="form"
      onSubmit={submit}
      onBackdropClick={() => onClose}
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
            {imageUrls.length > 0
              ? `${imageUrls.length} 张 · ${imageReviews.length} 张已审核`
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
    </Modal>
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
    <Modal
      labelledBy="admin-poi-reject-title"
      className="admin-poi-reject-dialog"
      as="form"
      onSubmit={submit}
      onBackdropClick={() => onClose}
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
    </Modal>
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
    <Modal
      labelledBy="admin-poi-bulk-reject-title"
      className="admin-poi-reject-dialog"
      as="form"
      onSubmit={submit}
      onBackdropClick={() => onClose}
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
          <StatusChip key={submission.id}>{submission.title}</StatusChip>
        ))}
        {submissions.length > 10 ? (
          <StatusChip>{`其余 ${submissions.length - 10} 条`}</StatusChip>
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
    </Modal>
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
    <Modal
      labelledBy="admin-poi-bulk-publish-title"
      className="admin-poi-publish-dialog"
      as="form"
      onSubmit={submit}
      onBackdropClick={() => onClose}
    >
      <div className="section-heading">
        <h2 id="admin-poi-bulk-publish-title">批量发布到公开地图</h2>
        <span className="muted">{`${submissions.length} 条待发布记录`}</span>
      </div>
      <p className="admin-poi-publish-warning">
        批量发布会让所选 POI 立即进入公开地图。请先确认坐标、分类、图片来源和冲突提示已经逐条核对。
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
          <dd>
            {submissions.filter((submission) => getPoiImageUrls(submission).length > 0).length}
          </dd>
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
          <StatusChip key={submission.id}>{submission.title}</StatusChip>
        ))}
        {publishReadyTargets.length > 10 ? (
          <StatusChip>{`其余 ${publishReadyTargets.length - 10} 条`}</StatusChip>
        ) : null}
      </div>
      {blockedTargets.length > 0 ? (
        <div className="admin-content-publish-blockers" aria-label="批量发布阻塞对象">
          {blockedTargets.slice(0, 5).map((submission) => (
            <p key={submission.id}>
              {submission.title}
              {hasRejectedPoiImage(submission, imageReviewByKey)
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
            isBusy || !isConfirmed || publishReadyTargets.length === 0 || blockedTargets.length > 0
          }
        >
          确认批量发布
        </button>
      </div>
    </Modal>
  );
}

function EditPoiSubmissionDialog({
  categories,
  contextMarkers,
  defaultCoordinate = [0, 0],
  editorMode = 'dialog',
  editorSessionId = 'poi-dialog',
  initialParentMarkerId,
  iconBaseUrl,
  isBusy,
  onClose,
  onSaveDraft,
  onSubmit,
  onSubmitForReview,
  pageWorkspace = 'geometry',
  parentMarkerOptions,
  regionMarkerOptions,
  roadMarkerOptions,
  submission,
  tilePreviewConfig,
  translation,
}: Readonly<{
  categories: PoiCategory[];
  contextMarkers: PoiAuditContextMarker[];
  defaultCoordinate?: [number, number];
  editorMode?: 'dialog' | 'page';
  editorSessionId?: string;
  initialParentMarkerId?: string;
  iconBaseUrl: string;
  isBusy: boolean;
  onClose: () => void;
  onSaveDraft?: (
    input: PoiSubmissionEditInput,
    options?: { poiId?: string; silent?: boolean },
  ) => Promise<{ error: string | null; submission: { id: string } | null }>;
  onSubmit: (input: PoiSubmissionEditInput) => Promise<string | null>;
  onSubmitForReview?: (poiId?: string) => Promise<string | null>;
  pageWorkspace?: 'geometry' | 'intro';
  parentMarkerOptions: MapMarker[];
  regionMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  submission?: PoiSubmission;
  tilePreviewConfig: PoiTilePreviewConfig;
  translation?: EntityTranslationRecord;
}>) {
  const [form, setForm] = useState<PoiSubmissionFormInput>(() => ({
    title: submission?.title ?? '',
    categoryId: submission?.categoryId ?? categories[0]?.id ?? '',
    iconFileName: submission?.iconFileName ?? '',
    description: submission?.description ?? '',
    href: submission?.href ?? '',
    imageUrls: submission ? getPoiImageUrls(submission) : [],
    parentMarkerId: submission?.parentMarkerId ?? initialParentMarkerId ?? '',
    floorLabel: submission?.floorLabel ?? '',
    boundRegionMarkerIds: submission?.boundRegionMarkerIds ?? [],
    openingHours: submission?.openingHours ?? '',
    address: submission?.address ?? '',
    addressRoadMarkerId: submission?.addressRoadMarkerId ?? '',
    facilities: submission?.facilities ?? [],
    spatial: normalizePoiSpatialInput(
      submission?.spatial,
      submission?.categoryId ?? categories[0]?.id ?? '',
      submission?.geometry.type,
    ),
  }));
  const [geometryDraft, setGeometryDraft] = useState<PoiGeometryDraft>(() =>
    submission
      ? createPoiGeometryDraft(submission.geometry, submission.spatial?.coordinateY)
      : createEmptyPoiGeometryDraft('Point'),
  );
  const [pointYText, setPointYText] = useState(() => formatPointCoordinateY(submission?.spatial));
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (geometryDraft.type === 'Point') {
      setPointYText(formatPointCoordinateY(form.spatial));
    }
  }, [form.spatial?.coordinateY, form.spatial?.defaultY, geometryDraft.type]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<PoiEditTab>('basic');
  /** 自动保存后拿到的草稿 id：新建弹窗用它继续做 PATCH，避免重复创建。 */
  const [draftId, setDraftId] = useState<string | null>(
    submission?.status === 'draft' ? submission.id : null,
  );
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle',
  );
  const autoSaveSnapshotRef = useRef('');
  const autoSavePendingRef = useRef(false);
  /** 记录表单修改版本，避免自动保存返回时把期间的新的修改误标为已保存。 */
  const formVersionRef = useRef(0);
  const [autoSaveTick, setAutoSaveTick] = useState(0);
  const submissionMarkerId = submission ? `poi-${submission.id}` : null;
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const iconOptions = selectedCategory?.iconMapping.iconFileNames ?? [];
  /** 已保存的草稿 id：新建弹窗自动保存后即可进入几何/简介工作台。 */
  const effectivePoiId = submission?.id ?? draftId;
  // 返回后台时带上 POI 标识，后台会自动重新打开该 POI 的编辑弹窗。
  const pageBackHref = effectivePoiId
    ? `/admin/map-poi?markerId=${encodeURIComponent(effectivePoiId)}`
    : '/admin/map-poi';

  const updateForm = (patch: Partial<PoiSubmissionFormInput>) => {
    formVersionRef.current += 1;
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.categoryId && patch.categoryId !== current.categoryId) {
        const nextCategory = categories.find((category) => category.id === patch.categoryId);
        next.iconFileName = nextCategory?.iconMapping.iconFileNames.includes(current.iconFileName)
          ? current.iconFileName
          : '';
        next.spatial = normalizePoiSpatialInput(
          current.spatial,
          patch.categoryId,
          geometryDraft.type,
        );
      }
      return next;
    });
    setError('');
    setIsDirty(true);
    publishEditorDraftChanged({ dirty: true, editorKind: 'poi', sessionId: editorSessionId });
  };

  const updateGeometryDraft = (draft: PoiGeometryDraft) => {
    formVersionRef.current += 1;
    setGeometryDraft(draft);
    setForm((current) => ({
      ...current,
      spatial: normalizePoiSpatialInput(current.spatial, current.categoryId, draft.type),
    }));
    setError('');
    setIsDirty(true);
    publishEditorDraftChanged({ dirty: true, editorKind: 'poi', sessionId: editorSessionId });
  };

  const buildInput = (options?: {
    allowMissingGeometry?: boolean;
    silent?: boolean;
  }): PoiSubmissionEditInput | null => {
    const fail = (tab: PoiEditTab, message: string) => {
      if (!options?.silent) {
        setActiveTab(tab);
        setError(message);
      }
      return null;
    };

    if (!form.title.trim()) {
      return fail('basic', '请填写地点名称。');
    }

    if (!form.categoryId.trim()) {
      return fail('basic', '请选择地点分类。');
    }
    if (form.facilities.some((facility) => !facility.description.trim())) {
      return fail('facility', '请填写每条设施信息的文字描述。');
    }

    const geometryResult = buildMapGeometryFromDraft(geometryDraft);
    let geometry = geometryResult.geometry;
    if (!geometry) {
      if (!options?.allowMissingGeometry) {
        return fail('basic', geometryResult.error ?? '请填写有效的几何坐标。');
      }
      geometry = { coordinates: defaultCoordinate, type: 'Point' };
    }

    return {
      title: form.title.trim(),
      categoryId: form.categoryId.trim(),
      iconFileName: form.iconFileName.trim(),
      description: form.description.trim(),
      href: form.href.trim(),
      imageUrls: normalizePoiImageUrlList(form.imageUrls),
      geometry,
      spatial: normalizePoiSpatialInput(
        {
          ...form.spatial,
          coordinateY:
            geometryDraft.type === 'Point'
              ? form.spatial?.coordinateY
              : extractCoordinateYDraftValues(geometryDraft),
        },
        form.categoryId,
        geometry.type,
      ),
      parentMarkerId: form.parentMarkerId.trim(),
      floorLabel: form.floorLabel.trim(),
      boundRegionMarkerIds: form.boundRegionMarkerIds,
      openingHours: form.openingHours.trim(),
      address: form.address.trim(),
      addressRoadMarkerId: form.addressRoadMarkerId,
      facilities: form.facilities,
    };
  };

  const persist = async (
    handler: (input: PoiSubmissionEditInput) => Promise<string | null>,
    options?: { allowMissingGeometry?: boolean },
  ): Promise<boolean> => {
    const input = buildInput(options);
    if (!input) {
      return false;
    }

    const submitError = await handler(input);
    if (submitError) {
      setError(submitError);
      return false;
    }

    setError('');
    setIsDirty(false);
    publishEditorDraftChanged({ dirty: false, editorKind: 'poi', sessionId: editorSessionId });
    return true;
  };

  const saveDraft = async () => {
    if (!onSaveDraft) {
      return;
    }
    const input = buildInput({ allowMissingGeometry: true });
    if (!input) {
      return;
    }

    const result = await onSaveDraft(input, { poiId: draftId ?? undefined });
    if (result.error) {
      setError(result.error);
      return;
    }

    setError('');
    setIsDirty(false);
    setAutoSaveState('saved');
    publishEditorDraftChanged({ dirty: false, editorKind: 'poi', sessionId: editorSessionId });
    if (result.submission) {
      setDraftId(result.submission.id);
    }
    onClose();
  };
  const save = () => {
    const shouldSaveDraft =
      Boolean(onSaveDraft) && (draftId !== null || submission?.status === 'draft');
    return shouldSaveDraft ? saveDraft() : persist(onSubmit);
  };
  const saveAndSubmitForReview = async () => {
    if (!onSubmitForReview) {
      return;
    }

    let saveError: string | null = null;
    if (draftId) {
      if (onSaveDraft) {
        const input = buildInput({ allowMissingGeometry: true });
        if (!input) {
          return;
        }
        const result = await onSaveDraft(input, { poiId: draftId });
        saveError = result.error;
        if (!saveError) {
          setIsDirty(false);
          publishEditorDraftChanged({
            dirty: false,
            editorKind: 'poi',
            sessionId: editorSessionId,
          });
        }
      } else {
        saveError = '当前草稿无法保存。';
      }
    } else {
      const saved = await persist(onSubmit);
      if (!saved) {
        return;
      }
    }

    if (saveError) {
      setError(saveError);
      return;
    }

    const reviewError = await onSubmitForReview(draftId ?? undefined);
    if (reviewError) {
      setError(reviewError);
      return;
    }
    onClose();
  };

  /** 自动保存草稿：仅新建或草稿态生效，避免改动已发布/待审核内容。 */
  const autoSaveEnabled = Boolean(onSaveDraft) && (!submission || submission.status === 'draft');
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || isBusy) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (autoSavePendingRef.current) {
        return;
      }
      const input = buildInput({ allowMissingGeometry: true, silent: true });
      if (!input) {
        return;
      }
      const snapshot = JSON.stringify(input);
      if (snapshot === autoSaveSnapshotRef.current) {
        return;
      }

      const version = formVersionRef.current;
      autoSavePendingRef.current = true;
      setAutoSaveState('saving');
      void onSaveDraft?.(input, { poiId: draftId ?? undefined, silent: true })
        .then((result) => {
          autoSavePendingRef.current = false;
          if (result.error || !result.submission) {
            setAutoSaveState('failed');
            return;
          }
          autoSaveSnapshotRef.current = snapshot;
          setDraftId(result.submission.id);
          setAutoSaveState('saved');
          const unchanged = formVersionRef.current === version;
          if (unchanged) {
            setIsDirty(false);
          } else {
            // 保存期间又改过内容：触发一次补存，避免最后一次修改丢失。
            setAutoSaveTick((current) => current + 1);
          }
          publishEditorDraftChanged({
            dirty: !unchanged,
            editorKind: 'poi',
            sessionId: editorSessionId,
          });
        })
        .catch(() => {
          autoSavePendingRef.current = false;
          setAutoSaveState('failed');
        });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [
    autoSaveEnabled,
    autoSaveTick,
    draftId,
    editorSessionId,
    form,
    geometryDraft,
    isBusy,
    isDirty,
    onSaveDraft,
  ]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  if (editorMode === 'page') {
    if (pageWorkspace === 'intro') {
      return (
        <VisualEditorShell
          actions={
            <Button
              variant="primary"
              icon="save"
              loading={isBusy}
              disabled={isBusy}
              onClick={() => void save()}
            >
              {isBusy ? '保存中' : '保存简介'}
            </Button>
          }
          backHref={pageBackHref}
          editorKind="poi"
          isBusy={isBusy}
          isDirty={isDirty}
          onSave={() => save()}
          sessionId={editorSessionId}
          title={`编辑 ${submission?.title ?? 'POI'} 简介`}
          workspace
        >
          <PoiIntroWorkspace
            categories={categories}
            disabled={isBusy}
            excludedParentMarkerId={submission ? `poi-${submission.id}` : undefined}
            form={form}
            iconBaseUrl={iconBaseUrl}
            parentMarkerOptions={parentMarkerOptions}
            roadMarkerOptions={roadMarkerOptions}
            selectedCategory={selectedCategory}
            onChange={updateForm}
          />
        </VisualEditorShell>
      );
    }

    return (
      <VisualEditorShell
        actions={
          <Button
            variant="primary"
            icon="save"
            loading={isBusy}
            disabled={isBusy}
            onClick={() => void save()}
          >
            {isBusy ? '保存中' : '保存几何'}
          </Button>
        }
        backHref={pageBackHref}
        editorKind="poi"
        isBusy={isBusy}
        isDirty={isDirty}
        onSave={() => save()}
        sessionId={editorSessionId}
        title={`调整 ${submission?.title ?? 'POI'} 几何`}
        workspace
      >
        <PoiStandaloneGeometryWorkspace
          contextMarkers={contextMarkers}
          draft={geometryDraft}
          entityLabel={submission?.title ?? 'POI'}
          pointYText={pointYText}
          tilePreviewConfig={tilePreviewConfig}
          onChange={updateGeometryDraft}
          onPointYChange={(value) => {
            setPointYText(value);
            const nextSpatial = updatePoiPointCoordinateY(form.spatial, value);
            if (nextSpatial !== null) updateForm({ spatial: nextSpatial });
          }}
        />
      </VisualEditorShell>
    );
  }

  const geometryMetrics = describePoiGeometry(
    buildMapGeometryFromDraft(geometryDraft).geometry ?? null,
  );

  const geometryEditorElement = (
    <>
      <PoiEditorSection summary={geometryLabelFromDraft(geometryDraft)} title="几何">
        <p className="muted">{`中点 ${geometryMetrics.center} · ${geometryMetrics.detail}`}</p>
        {effectivePoiId ? (
          <ButtonLink
            variant="secondary"
            href={appPath(`/admin/map-poi/editor?markerId=${encodeURIComponent(effectivePoiId)}`)}
            onClick={(event) => void openPoiWorkspaceWithConfirm(event, isDirty)}
            icon="edit_location_alt"
          >
            打开几何工作台
          </ButtonLink>
        ) : (
          <p className="muted">
            填写名称后会自动保存草稿，随后即可进入几何工作台选择类型并增删坐标。
          </p>
        )}
      </PoiEditorSection>
      {!submission ? (
        <PoiEditorSection summary="未设置坐标时可先保存草稿" title="坐标">
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
          {geometryDraft.type === 'Point' ? (
            <div className="admin-poi-edit-coordinate">
              <div className="poi-visual-point-fields">
                <label>
                  <span>X</span>
                  <input
                    inputMode="decimal"
                    value={geometryDraft.coordinate.x}
                    onChange={(event) =>
                      updateGeometryDraft({
                        type: 'Point',
                        coordinate: { ...geometryDraft.coordinate, x: event.currentTarget.value },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    inputMode="decimal"
                    value={pointYText}
                    placeholder="继承默认"
                    onChange={(event) => {
                      setPointYText(event.currentTarget.value);
                      const nextSpatial = updatePoiPointCoordinateY(
                        form.spatial,
                        event.currentTarget.value,
                      );
                      if (nextSpatial !== null) updateForm({ spatial: nextSpatial });
                    }}
                  />
                </label>
                <label>
                  <span>Z</span>
                  <input
                    inputMode="decimal"
                    value={geometryDraft.coordinate.z}
                    onChange={(event) =>
                      updateGeometryDraft({
                        type: 'Point',
                        coordinate: { ...geometryDraft.coordinate, z: event.currentTarget.value },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ) : (
            <PoiNonPointGeometryEditor
              contextMarkers={contextMarkers}
              draft={geometryDraft}
              showMap={false}
              tilePreviewConfig={tilePreviewConfig}
              onChange={updateGeometryDraft}
            />
          )}
        </PoiEditorSection>
      ) : null}
    </>
  );

  const introEditorElement = (
    <PoiEditorSection summary={describePoiIntroSummary(form)} title="简介与图片">
      <p className="muted">
        {[
          form.openingHours.trim() || '未填写营业时间',
          form.address.trim() || '未填写文字地址',
          form.floorLabel.trim(),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {effectivePoiId ? (
        <ButtonLink
          variant="secondary"
          href={appPath(
            `/admin/map-poi/intro-editor?markerId=${encodeURIComponent(effectivePoiId)}`,
          )}
          onClick={(event) => void openPoiWorkspaceWithConfirm(event, isDirty)}
          icon="article"
        >
          打开简介工作台
        </ButtonLink>
      ) : (
        <p className="muted">
          填写名称后会自动保存草稿，随后即可进入简介工作台编辑图片与营业信息。
        </p>
      )}
    </PoiEditorSection>
  );

  const formElement = (
    <Modal
      as="form"
      className="admin-poi-edit-dialog"
      labelledBy="admin-poi-edit-title"
      onSubmit={submit}
      onBackdropClick={onClose}
    >
      <div className="section-heading">
        <h2 id="admin-poi-edit-title">{submission ? '修正 POI 投稿' : '新增 POI'}</h2>
        <span className="muted">
          {submission
            ? getPoiEditDialogHint(submission.status)
            : '建议先保存草稿，再进入几何/简介工作台完善内容'}
        </span>
      </div>
      <SegmentedControl
        ariaLabel="POI 编辑分区"
        className="material-mode-switch material-variant-switch admin-poi-edit-tabs"
        disabled={isBusy}
        options={poiEditTabOptions}
        role="tablist"
        value={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'basic' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-basic"
          role="tabpanel"
          aria-label="基本信息"
        >
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
          <AdminPoiIconPicker
            defaultIconFileName={selectedCategory?.iconMapping.defaultIconFileName}
            disabled={isBusy}
            hidden={Boolean(form.spatial?.hideMarkerIcon)}
            iconBaseUrl={iconBaseUrl}
            options={iconOptions}
            value={form.iconFileName}
            onChange={(iconFileName) => updateForm({ iconFileName })}
            onHiddenChange={(hidden) =>
              updateForm({
                spatial: compactPoiSpatialMetadata({
                  ...form.spatial,
                  hideMarkerIcon: hidden || undefined,
                }),
              })
            }
          />
          {submission ? <PoiTranslationSection translation={translation} /> : null}
          {geometryEditorElement}
          {introEditorElement}
        </div>
      ) : null}
      {activeTab === 'facility' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-facility"
          role="tabpanel"
          aria-label="设施与出入口"
        >
          <ParentMarkerSelect
            categories={categories}
            excludedMarkerId={submission ? `poi-${submission.id}` : undefined}
            iconBaseUrl={iconBaseUrl}
            markerOptions={parentMarkerOptions}
            selectedId={form.parentMarkerId}
            onChange={(parentMarkerId) => updateForm({ parentMarkerId })}
          />
          <PoiRegionBindingsFieldset
            markerOptions={regionMarkerOptions}
            selectedIds={form.boundRegionMarkerIds}
            onChange={(boundRegionMarkerIds) => updateForm({ boundRegionMarkerIds })}
          />
          <PoiFacilityEditor
            disabled={isBusy}
            facilities={form.facilities}
            onChange={(facilities) => updateForm({ facilities })}
          />
          <PoiStationBindingsSection
            emptySummary={submission ? '未绑定车站' : '发布并绑定车站后可查看'}
            markerId={submissionMarkerId}
          />
        </div>
      ) : null}
      {activeTab === 'advanced' ? (
        <div
          className="admin-poi-edit-tabpanel"
          id="poi-edit-panel-advanced"
          role="tabpanel"
          aria-label="高级设置"
        >
          <PoiWorldMetadataEditor
            isPoint={geometryDraft.type === 'Point'}
            value={form.spatial}
            onChange={(spatial) => updateForm({ spatial })}
          />
          <PoiSpatialMetadataEditor
            categoryId={form.categoryId}
            geometry={buildMapGeometryFromDraft(geometryDraft).geometry}
            value={form.spatial}
            onChange={(spatial) => updateForm({ spatial })}
          />
        </div>
      ) : null}
      {autoSaveEnabled ? (
        <p className="muted" aria-live="polite">
          {autoSaveState === 'saving'
            ? '正在自动保存草稿…'
            : autoSaveState === 'saved'
              ? '草稿已自动保存'
              : autoSaveState === 'failed'
                ? '自动保存草稿失败，请手动保存'
                : '填写名称后会自动保存为草稿'}
        </p>
      ) : null}
      {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
      <div className="admin-content-actions">
        <button type="button" onClick={onClose} disabled={isBusy}>
          取消
        </button>
        {!submission && !draftId && onSaveDraft ? (
          <button type="button" disabled={isBusy} onClick={() => void saveDraft()}>
            保存草稿
          </button>
        ) : null}
        {onSubmitForReview && (submission?.status === 'draft' || draftId) ? (
          <button type="button" disabled={isBusy} onClick={() => void saveAndSubmitForReview()}>
            保存并提交审核
          </button>
        ) : null}
        <button type="submit" disabled={isBusy}>
          {draftId || submission?.status === 'draft'
            ? '保存草稿'
            : submission
              ? '保存修正'
              : '创建并提交审核'}
        </button>
      </div>
    </Modal>
  );

  return formElement;
}

type PoiIntroChapterId =
  'header' | 'images' | 'description' | 'details' | 'facilities' | 'relation' | 'link';

type PoiIntroSelection = { chapter: PoiIntroChapterId; field?: string } | null;

type PoiIntroPreviewWidth = 'narrow' | 'medium' | 'wide';

/** 简介工作台的章节顺序：标题栏 / 图片 / 简介 / 更多信息 / 设施 / 地点关系 / 链接。 */
const poiIntroChapters: ReadonlyArray<{
  id: PoiIntroChapterId;
  label: string;
  icon: string;
}> = [
  { id: 'header', label: '标题栏', icon: 'title' },
  { id: 'images', label: '图片', icon: 'image' },
  { id: 'description', label: '简介', icon: 'article' },
  { id: 'details', label: '更多信息', icon: 'info' },
  { id: 'facilities', label: '设施', icon: 'accessible' },
  { id: 'relation', label: '地点关系', icon: 'account_tree' },
  { id: 'link', label: '链接', icon: 'link' },
];

const poiIntroHeaderFields = [
  { id: 'title', label: '名称' },
  { id: 'category', label: '分类' },
  { id: 'icon', label: '图标' },
] as const;

const poiIntroDetailFields = [
  { id: 'openingHours', label: '营业时间' },
  { id: 'address', label: '地址' },
  { id: 'floorLabel', label: '楼层' },
  { id: 'addressRoadMarkerId', label: '地址道路' },
] as const;

const poiIntroRelationFields = [
  { id: 'parent', label: '父地点' },
  { id: 'children', label: '子地点' },
] as const;

const poiIntroPreviewWidthOptions: ReadonlyArray<{
  value: PoiIntroPreviewWidth;
  label: string;
  icon: string;
}> = [
  { value: 'narrow', label: '窄屏预览（240px）', icon: 'smartphone' },
  { value: 'medium', label: '桌面预览（340px）', icon: 'desktop_windows' },
  { value: 'wide', label: '宽屏预览（760px）', icon: 'tablet_mac' },
];

function describePoiIntroField(chapter: PoiIntroChapterId, field: string): string {
  if (chapter === 'images') {
    return `图片 ${Number(field.replace('image:', '')) + 1}`;
  }
  if (chapter === 'header') {
    return field === 'title' ? '名称' : field === 'category' ? '分类' : '图标';
  }
  if (chapter === 'details') {
    return poiIntroDetailFields.find((item) => item.id === field)?.label ?? '属性';
  }
  if (chapter === 'facilities') {
    return `设施 ${Number(field.replace('facility:', '')) + 1}`;
  }
  if (chapter === 'relation') {
    return field === 'parent' ? '父地点' : '子地点';
  }
  return chapter === 'description' ? '简介' : '链接';
}

/** 预览卡里的可点选区域：单击选中字段，具体编辑仍在右侧检查器完成。 */
function PoiIntroPreviewTarget({
  children,
  className,
  label,
  onSelect,
}: Readonly<{
  children: ReactNode;
  className?: string;
  label: string;
  onSelect: () => void;
}>) {
  return (
    <div
      className={`poi-intro-preview-target${className ? ` ${className}` : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * POI 简介工作台：中间是公开端详情卡预览，左侧是章节 / 字段树，右侧是属性检查器。
 * 预览保持只读，单击卡片上的区域即可选中对应字段并进入右侧检查器编辑。
 */
function PoiIntroWorkspace({
  categories,
  disabled,
  excludedParentMarkerId,
  form,
  iconBaseUrl,
  onChange,
  parentMarkerOptions,
  roadMarkerOptions,
  selectedCategory,
}: Readonly<{
  categories: PoiCategory[];
  disabled: boolean;
  excludedParentMarkerId?: string;
  form: PoiSubmissionFormInput;
  iconBaseUrl: string;
  onChange: (patch: Partial<PoiSubmissionFormInput>) => void;
  parentMarkerOptions: MapMarker[];
  roadMarkerOptions: MapMarker[];
  selectedCategory?: PoiCategory;
}>) {
  const [selection, setSelection] = useState<PoiIntroSelection>(null);
  const [previewWidth, setPreviewWidth] = useState<PoiIntroPreviewWidth>('medium');
  const [previewTab, setPreviewTab] = useState<'summary' | 'facilities'>('summary');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { panelsVisible, panelStateClass, togglePanels, openInspector, closeInspector } =
    useEditorPanels();
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layerBodyRef = useRef<HTMLDivElement | null>(null);
  const focusInspector = useEditorInspectorFocus(inspectorRef);
  useEditorLayerScroll(
    layerBodyRef,
    selection ? `${selection.chapter}:${selection.field ?? ''}` : null,
  );

  const imageUrls = form.imageUrls.map((url) => url.trim()).filter(Boolean);
  const imageCount = imageUrls.length;
  const filledImageIndexes = form.imageUrls
    .map((url, index) => (url.trim() ? index : -1))
    .filter((index) => index >= 0);
  const safeImageIndex =
    imageUrls.length > 0 ? Math.min(activeImageIndex, imageUrls.length - 1) : 0;
  const activeImageRawIndex = filledImageIndexes[safeImageIndex] ?? filledImageIndexes[0] ?? 0;
  const descriptionLength = form.description.trim().length;
  const detailCompletedCount = [
    form.openingHours.trim(),
    form.address.trim(),
    form.floorLabel.trim(),
    form.addressRoadMarkerId,
  ].filter(Boolean).length;
  const categoryName = selectedCategory
    ? formatCategoryName(selectedCategory.id, selectedCategory)
    : form.categoryId
      ? formatCategoryName(form.categoryId)
      : '未选择分类';
  const previewCategoryName = selectedCategory?.name || form.categoryId || '未选择分类';
  const roadName =
    roadMarkerOptions.find((marker) => marker.id === form.addressRoadMarkerId)?.label ??
    form.addressRoadMarkerId ??
    '未绑定';
  const parentMarker = parentMarkerOptions.find((marker) => marker.id === form.parentMarkerId);
  const childMarkers = excludedParentMarkerId
    ? parentMarkerOptions.filter((marker) => marker.parentMarkerId === excludedParentMarkerId)
    : [];
  const childGroups = childMarkers.reduce<Array<{ categoryId: string; markers: MapMarker[] }>>(
    (groups, marker) => {
      const categoryId = marker.categoryId ?? '';
      const group = groups.find((item) => item.categoryId === categoryId);
      if (group) {
        group.markers.push(marker);
      } else {
        groups.push({ categoryId, markers: [marker] });
      }
      return groups;
    },
    [],
  );
  const categoryLabelFor = (categoryId: string): string => {
    if (!categoryId) {
      return '未分类';
    }
    return categories.find((category) => category.id === categoryId)?.name || categoryId;
  };
  const iconHidden = Boolean(form.spatial?.hideMarkerIcon);
  const iconUrl =
    !iconHidden && form.iconFileName
      ? toMarkerIconUrl(form.iconFileName, iconBaseUrl)
      : !iconHidden && selectedCategory?.iconMapping.defaultIconFileName
        ? toMarkerIconUrl(selectedCategory.iconMapping.defaultIconFileName, iconBaseUrl)
        : null;
  const iconLabel = iconHidden ? '不使用图标' : form.iconFileName ? '自定义图标' : '跟随分类默认';

  const handleTreeDoubleClick = (chapter: PoiIntroChapterId, field?: string) => {
    setSelection({ chapter, field });
    focusInspector();
  };

  const updateImageAt = (index: number, value: string) => {
    onChange({
      imageUrls: form.imageUrls.map((item, itemIndex) => (itemIndex === index ? value : item)),
    });
  };
  const moveImage = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    onChange({ imageUrls: moveListItem(form.imageUrls, index, nextIndex) });
    setSelection({ chapter: 'images', field: `image:${nextIndex}` });
  };
  const removeImage = (index: number) => {
    onChange({ imageUrls: form.imageUrls.filter((_, itemIndex) => itemIndex !== index) });
    setSelection({ chapter: 'images' });
  };
  const addImage = () => {
    const nextIndex = form.imageUrls.length;
    onChange({ imageUrls: [...form.imageUrls, ''] });
    setSelection({ chapter: 'images', field: `image:${nextIndex}` });
  };

  const updateFacility = (index: number, facility: PoiFacilitySnapshot) => {
    onChange({
      facilities: form.facilities.map((item, itemIndex) => (itemIndex === index ? facility : item)),
    });
  };
  const removeFacility = (index: number) => {
    onChange({ facilities: form.facilities.filter((_, itemIndex) => itemIndex !== index) });
    setSelection({ chapter: 'facilities' });
  };
  const addFacility = () => {
    const nextIndex = form.facilities.length;
    onChange({ facilities: [...form.facilities, { symbolIcon: 'info', description: '' }] });
    setSelection({ chapter: 'facilities', field: `facility:${nextIndex}` });
  };

  const chapterMeta = (chapter: PoiIntroChapterId): string => {
    if (chapter === 'header') {
      return form.title.trim() ? '已填写' : '未填写';
    }
    if (chapter === 'images') {
      return `${form.imageUrls.length} 项`;
    }
    if (chapter === 'description') {
      return `${descriptionLength} 字`;
    }
    if (chapter === 'details') {
      return `${detailCompletedCount}/${poiIntroDetailFields.length}`;
    }
    if (chapter === 'facilities') {
      return `${form.facilities.length} 项`;
    }
    if (chapter === 'relation') {
      return `${childMarkers.length} 个子地点`;
    }
    return form.href.trim() ? '已填写' : '未填写';
  };

  const renderFieldRow = (
    chapter: PoiIntroChapterId,
    field: string,
    label: string,
    meta: string,
    actions?: EditorLayerRowAction[],
  ) => {
    const selected = selection?.chapter === chapter && selection.field === field;
    return (
      <li key={field}>
        <div className={`poi-visual-layer-row${selected ? ' is-active' : ''}`}>
          <button
            aria-pressed={selected}
            className="poi-visual-layer-point"
            type="button"
            onClick={() => setSelection({ chapter, field })}
            onDoubleClick={() => handleTreeDoubleClick(chapter, field)}
          >
            <span className="poi-visual-layer-coordinate">{label}</span>
            <span className="poi-visual-layer-count">{meta}</span>
          </button>
          {actions ? <EditorLayerRowActions actions={actions} /> : null}
        </div>
      </li>
    );
  };

  const renderChapterFields = (chapter: PoiIntroChapterId) => {
    if (chapter === 'header') {
      return (
        <ul className="poi-visual-layer-points">
          {poiIntroHeaderFields.map((field) =>
            renderFieldRow(
              chapter,
              field.id,
              field.label,
              field.id === 'title'
                ? form.title.trim()
                  ? '已填写'
                  : '未填写'
                : field.id === 'category'
                  ? categoryName
                  : iconLabel,
            ),
          )}
        </ul>
      );
    }
    if (chapter === 'images') {
      if (form.imageUrls.length === 0) {
        return <p className="poi-visual-panel-empty">还没有图片，使用面板底部的「添加图片」。</p>;
      }
      return (
        <ul className="poi-visual-layer-points">
          {form.imageUrls.map((url, index) =>
            renderFieldRow(
              chapter,
              `image:${index}`,
              `图片 ${index + 1}`,
              url.trim() ? '已填写' : '空链接',
              [
                {
                  id: 'move-up',
                  icon: 'arrow_upward',
                  label: '上移图片',
                  disabled: index === 0,
                  onClick: () => moveImage(index, -1),
                },
                {
                  id: 'move-down',
                  icon: 'arrow_downward',
                  label: '下移图片',
                  disabled: index === form.imageUrls.length - 1,
                  onClick: () => moveImage(index, 1),
                },
                {
                  id: 'remove',
                  icon: 'delete',
                  label: '移除图片',
                  danger: true,
                  onClick: () => removeImage(index),
                },
              ],
            ),
          )}
        </ul>
      );
    }
    if (chapter === 'description') {
      return (
        <ul className="poi-visual-layer-points">
          {renderFieldRow('description', 'description', '简介', `${descriptionLength} 字`)}
        </ul>
      );
    }
    if (chapter === 'details') {
      return (
        <ul className="poi-visual-layer-points">
          {poiIntroDetailFields.map((field) =>
            renderFieldRow(
              chapter,
              field.id,
              field.label,
              field.id === 'openingHours'
                ? form.openingHours.trim() || '未填写'
                : field.id === 'address'
                  ? form.address.trim() || '未填写'
                  : field.id === 'floorLabel'
                    ? form.floorLabel.trim() || '未填写'
                    : roadName,
            ),
          )}
          <li>
            <div className="poi-visual-layer-row">
              <button
                className="poi-visual-layer-point is-disabled"
                disabled
                title="等待后续建造者信息 PR 接入"
                type="button"
              >
                <span className="poi-visual-layer-coordinate">建造者信息</span>
                <span className="poi-visual-layer-count">待接入</span>
              </button>
            </div>
          </li>
        </ul>
      );
    }
    if (chapter === 'facilities') {
      if (form.facilities.length === 0) {
        return <p className="poi-visual-panel-empty">还没有设施，使用面板底部的「添加设施」。</p>;
      }
      return (
        <ul className="poi-visual-layer-points">
          {form.facilities.map((facility, index) =>
            renderFieldRow(
              chapter,
              `facility:${index}`,
              `设施 ${index + 1}`,
              facility.description.trim() || '未填写描述',
            ),
          )}
        </ul>
      );
    }
    if (chapter === 'relation') {
      return (
        <ul className="poi-visual-layer-points">
          {poiIntroRelationFields.map((field) =>
            renderFieldRow(
              'relation',
              field.id,
              field.label,
              field.id === 'parent'
                ? (parentMarker?.label ?? '未绑定')
                : `${childMarkers.length} 个`,
            ),
          )}
        </ul>
      );
    }
    return (
      <ul className="poi-visual-layer-points">
        {renderFieldRow('link', 'href', '链接', form.href.trim() ? '已填写' : '未填写')}
      </ul>
    );
  };

  const selectedChapter = selection
    ? poiIntroChapters.find((chapter) => chapter.id === selection.chapter)
    : null;
  const selectedFieldLabel =
    selection && selection.field !== undefined
      ? describePoiIntroField(selection.chapter, selection.field)
      : null;

  const nameField = (
    <Field label={<>POI 名称</>}>
      <Input
        disabled={disabled}
        maxLength={200}
        value={form.title}
        onChange={(event) => onChange({ title: event.currentTarget.value })}
      />
    </Field>
  );

  const categoryField = (
    <Field label={<>分类</>}>
      <Select
        disabled={disabled}
        value={form.categoryId}
        onChange={(event) => onChange({ categoryId: event.currentTarget.value })}
      >
        <option value="">未选择分类</option>
        {form.categoryId && !categories.some((category) => category.id === form.categoryId) ? (
          <option value={form.categoryId}>{form.categoryId}</option>
        ) : null}
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {formatCategoryName(category.id, category)}
          </option>
        ))}
      </Select>
    </Field>
  );

  const iconField = (
    <AdminPoiIconPicker
      defaultIconFileName={selectedCategory?.iconMapping.defaultIconFileName}
      disabled={disabled}
      hidden={iconHidden}
      iconBaseUrl={iconBaseUrl}
      options={selectedCategory?.iconMapping.iconFileNames ?? []}
      value={form.iconFileName}
      onChange={(iconFileName) => onChange({ iconFileName })}
      onHiddenChange={(hidden) =>
        onChange({
          spatial: compactPoiSpatialMetadata({
            ...form.spatial,
            hideMarkerIcon: hidden || undefined,
          }),
        })
      }
    />
  );

  const renderDetailField = (field: string) => {
    if (field === 'openingHours') {
      return (
        <Field label={<>营业时间</>}>
          <Input
            disabled={disabled}
            maxLength={500}
            placeholder="例如：周一至周五 09:00-18:00"
            value={form.openingHours}
            onChange={(event) => onChange({ openingHours: event.currentTarget.value })}
          />
        </Field>
      );
    }
    if (field === 'address') {
      return (
        <Field label={<>文字地址</>}>
          <Input
            disabled={disabled}
            maxLength={300}
            placeholder="例如：青年大街 18 号"
            value={form.address}
            onChange={(event) => onChange({ address: event.currentTarget.value })}
          />
        </Field>
      );
    }
    if (field === 'floorLabel') {
      return (
        <Field label={<>楼层</>}>
          <Input
            disabled={disabled}
            maxLength={40}
            placeholder="例如：B1、3F、站厅层"
            value={form.floorLabel}
            onChange={(event) => onChange({ floorLabel: event.currentTarget.value })}
          />
        </Field>
      );
    }
    return (
      <Field label={<>地址道路</>}>
        <Select
          disabled={disabled || !form.address.trim()}
          value={form.addressRoadMarkerId}
          onChange={(event) => onChange({ addressRoadMarkerId: event.currentTarget.value })}
        >
          <option value="">不绑定道路</option>
          {form.addressRoadMarkerId &&
          !roadMarkerOptions.some((marker) => marker.id === form.addressRoadMarkerId) ? (
            <option value={form.addressRoadMarkerId}>{form.addressRoadMarkerId}</option>
          ) : null}
          {roadMarkerOptions.map((marker) => (
            <option key={marker.id} value={marker.id}>
              {marker.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  };

  const renderImageField = (index: number) => {
    const value = form.imageUrls[index] ?? '';
    return (
      <>
        <Field label={<>{`图片 ${index + 1} 链接`}</>}>
          <Input
            disabled={disabled}
            placeholder="https://... 或 /api/map/poi-submission-images/..."
            value={value}
            onChange={(event) => updateImageAt(index, event.currentTarget.value)}
          />
        </Field>
        {value.trim() ? (
          <ButtonLink
            variant="secondary"
            href={resolvePoiSubmissionImageUrl(value)}
            rel="noreferrer"
            target="_blank"
            icon="open_in_new"
          >
            预览图片
          </ButtonLink>
        ) : null}
        <div className="poi-visual-inspector-actions">
          <button disabled={index === 0} type="button" onClick={() => moveImage(index, -1)}>
            上移
          </button>
          <button
            disabled={index >= form.imageUrls.length - 1}
            type="button"
            onClick={() => moveImage(index, 1)}
          >
            下移
          </button>
          <button type="button" onClick={() => removeImage(index)}>
            移除
          </button>
        </div>
      </>
    );
  };

  const descriptionField = (
    <>
      <Field label={<>简介</>}>
        <Textarea
          disabled={disabled}
          maxLength={1000}
          placeholder="填写地点简介，保存后展示在公开端详情卡。"
          value={form.description}
          onChange={(event) => onChange({ description: event.currentTarget.value })}
        />
      </Field>
      <p className="muted">{`${descriptionLength} 字，最多 1000 字。`}</p>
    </>
  );

  const linkField = (
    <Field label={<>链接</>}>
      <Input
        disabled={disabled}
        placeholder="https://..."
        value={form.href}
        onChange={(event) => onChange({ href: event.currentTarget.value })}
      />
    </Field>
  );

  const renderFacilityField = (index: number) => {
    const facility = form.facilities[index];
    if (!facility) {
      return <p className="poi-visual-panel-empty">该设施已不存在。</p>;
    }
    return (
      <div className="poi-facility-editor-list">
        <PoiFacilityRow
          disabled={disabled}
          facility={facility}
          index={index}
          onChange={(next) => updateFacility(index, next)}
          onRemove={() => removeFacility(index)}
        />
      </div>
    );
  };

  const renderChildrenList = () => (
    <>
      {childMarkers.length > 0 ? (
        <ul className="poi-intro-child-list">
          {childMarkers.map((child) => {
            const category = categories.find((item) => item.id === child.categoryId);
            return (
              <li key={child.id}>
                <a
                  href={appPath(
                    `/admin/map-poi/intro-editor?markerId=${encodeURIComponent(child.id)}`,
                  )}
                >
                  <PoiCategoryIcon
                    category={category}
                    iconBaseUrl={iconBaseUrl}
                    iconFileName={child.iconFileName}
                  />
                  <span>
                    <strong>{child.label}</strong>
                    <small>
                      {formatCategoryName(child.categoryId ?? 'uncategorized', category)}
                    </small>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="poi-visual-panel-empty">暂无子地点；新增子地点请回 POI 主列表。</p>
      )}
      <ButtonLink variant="secondary" href={appPath('/admin/map-poi')} icon="list">
        回主列表新增子地点
      </ButtonLink>
    </>
  );

  const renderPreviewChildGroups = () =>
    childGroups.length > 0 ? (
      <div className="map-poi-related-list" aria-label="子地点">
        {childGroups.map((group) => (
          <section className="map-poi-related-group" key={group.categoryId || 'uncategorized'}>
            <h4>
              <span>{categoryLabelFor(group.categoryId)}</span>
              <small>{`${group.markers.length} 个`}</small>
            </h4>
            <div className="map-poi-related-group-items">
              {group.markers.map((child) => (
                <PoiIntroPreviewTarget
                  className="map-poi-related-item"
                  key={child.id}
                  label={`选择子地点 ${child.label}`}
                  onSelect={() => setSelection({ chapter: 'relation', field: 'children' })}
                >
                  <PoiCategoryIcon
                    category={categories.find((item) => item.id === child.categoryId)}
                    iconBaseUrl={iconBaseUrl}
                    iconFileName={child.iconFileName}
                  />
                  <span>
                    <strong>{child.label}</strong>
                    <small>
                      {`${categoryLabelFor(child.categoryId ?? '')}${
                        child.floorLabel ? ` · ${child.floorLabel}` : ''
                      }`}
                    </small>
                  </span>
                </PoiIntroPreviewTarget>
              ))}
            </div>
          </section>
        ))}
      </div>
    ) : null;

  const renderSelectionInspector = () => {
    if (!selection) {
      return null;
    }
    const { chapter, field } = selection;
    if (chapter === 'header') {
      if (field === 'title') {
        return nameField;
      }
      if (field === 'category') {
        return categoryField;
      }
      if (field === 'icon') {
        return iconField;
      }
      return (
        <>
          {nameField}
          {categoryField}
          {iconField}
        </>
      );
    }
    if (chapter === 'images') {
      if (field?.startsWith('image:')) {
        return renderImageField(Number(field.slice('image:'.length)));
      }
      return (
        <AdminPoiImageEditor
          disabled={disabled}
          values={form.imageUrls}
          onChange={(imageUrls) => onChange({ imageUrls })}
        />
      );
    }
    if (chapter === 'description') {
      return descriptionField;
    }
    if (chapter === 'details') {
      if (field) {
        return renderDetailField(field);
      }
      return (
        <>
          <AdminPoiBusinessDetailsFields
            disabled={disabled}
            excludedParentMarkerId={excludedParentMarkerId}
            form={form}
            parentMarkerOptions={parentMarkerOptions}
            roadMarkerOptions={roadMarkerOptions}
            showFacilities={false}
            onChange={onChange}
          />
          <p className="poi-visual-panel-empty">建造者信息：等待后续 PR 接入后补充。</p>
        </>
      );
    }
    if (chapter === 'facilities') {
      if (field?.startsWith('facility:')) {
        return renderFacilityField(Number(field.slice('facility:'.length)));
      }
      return (
        <PoiFacilityEditor
          disabled={disabled}
          facilities={form.facilities}
          onChange={(facilities) => onChange({ facilities })}
        />
      );
    }
    if (chapter === 'relation') {
      const parentField = (
        <ParentMarkerSelect
          categories={categories}
          excludedMarkerId={excludedParentMarkerId}
          iconBaseUrl={iconBaseUrl}
          markerOptions={parentMarkerOptions}
          selectedId={form.parentMarkerId}
          onChange={(parentMarkerId) => onChange({ parentMarkerId })}
        />
      );
      if (field === 'parent') {
        return parentField;
      }
      if (field === 'children') {
        return renderChildrenList();
      }
      return (
        <>
          {parentField}
          {renderChildrenList()}
        </>
      );
    }
    return linkField;
  };

  const previewWidthItems: EditorToolbarOverflowItem[] = poiIntroPreviewWidthOptions.map(
    (option) => ({
      id: `preview-${option.value}`,
      icon: option.icon,
      label: option.label,
      active: previewWidth === option.value,
      onClick: () => setPreviewWidth(option.value),
    }),
  );

  const renderIntroToolbar = (inHeader = false) => (
    <EditorToolbar
      activeToolId=""
      ariaLabel="简介编辑视图"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={() => undefined}
      sections={[
        {
          id: 'view',
          ariaLabel: '预览视图',
          actions: previewWidthItems.map((item) => (
            <EditorToolbarActionButton item={item} key={item.id} />
          )),
        },
      ]}
    />
  );

  return (
    <div
      className={`poi-visual-workspace poi-intro-workspace${panelStateClass}${
        selection ? ' has-layer-selection' : ''
      }`}
    >
      <section className="poi-intro-canvas" aria-label="简介预览">
        <article
          className={`map-poi-detail-panel poi-intro-preview-panel is-width-${previewWidth}`}
        >
          <div className="map-poi-detail-header">
            <PoiIntroPreviewTarget
              className="poi-intro-preview-icon-target"
              label="编辑图标"
              onSelect={() => setSelection({ chapter: 'header', field: 'icon' })}
            >
              {iconUrl ? (
                <img alt="" src={iconUrl} />
              ) : (
                <span className="material-symbols-outlined" aria-hidden="true">
                  {iconHidden ? 'visibility_off' : 'category'}
                </span>
              )}
            </PoiIntroPreviewTarget>
            <div>
              <PoiIntroPreviewTarget
                label="编辑名称"
                onSelect={() => setSelection({ chapter: 'header', field: 'title' })}
              >
                <h2>{form.title.trim() || '未命名地点'}</h2>
              </PoiIntroPreviewTarget>
              <PoiIntroPreviewTarget
                className="poi-intro-preview-subtitle"
                label="编辑分类"
                onSelect={() => setSelection({ chapter: 'header', field: 'category' })}
              >
                <span>{previewCategoryName}</span>
              </PoiIntroPreviewTarget>
            </div>
          </div>
          <div className="map-poi-detail-tabs" aria-label="简介预览页签">
            <button
              className={previewTab === 'summary' ? 'is-active' : ''}
              type="button"
              aria-pressed={previewTab === 'summary'}
              onClick={() => setPreviewTab('summary')}
            >
              <span className="material-interaction-label">简介</span>
            </button>
            <button
              className={previewTab === 'facilities' ? 'is-active' : ''}
              type="button"
              aria-pressed={previewTab === 'facilities'}
              onClick={() => setPreviewTab('facilities')}
            >
              <span className="material-interaction-label">设施/出入口</span>
            </button>
          </div>
          <div className="map-poi-detail-body">
            {previewTab === 'summary' ? (
              <>
                {imageUrls.length > 0 ? (
                  <div
                    className={`map-poi-detail-gallery${
                      imageUrls.length > 1 ? ' is-multiple' : ''
                    }`}
                  >
                    <PoiIntroPreviewTarget
                      className="poi-intro-preview-image-target"
                      label="编辑图片"
                      onSelect={() =>
                        setSelection({ chapter: 'images', field: `image:${activeImageRawIndex}` })
                      }
                    >
                      <ProgressiveImage
                        alt="地点主图"
                        className="map-poi-detail-image"
                        draggable={false}
                        loading="lazy"
                        maxDisplayWidth={1024}
                        src={resolvePoiSubmissionImageUrl(imageUrls[safeImageIndex])}
                      />
                    </PoiIntroPreviewTarget>
                    {imageUrls.length > 1 ? (
                      <>
                        <button
                          className="map-poi-detail-gallery-button is-previous"
                          type="button"
                          aria-label="上一张图片"
                          onClick={() =>
                            setActiveImageIndex(
                              (safeImageIndex - 1 + imageUrls.length) % imageUrls.length,
                            )
                          }
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            chevron_left
                          </span>
                        </button>
                        <button
                          className="map-poi-detail-gallery-button is-next"
                          type="button"
                          aria-label="下一张图片"
                          onClick={() =>
                            setActiveImageIndex((safeImageIndex + 1) % imageUrls.length)
                          }
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            chevron_right
                          </span>
                        </button>
                        <span className="map-poi-detail-gallery-counter">
                          {`${safeImageIndex + 1} / ${imageUrls.length}`}
                        </span>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {form.description.trim() ? (
                  <PoiIntroPreviewTarget
                    label="编辑简介"
                    onSelect={() => setSelection({ chapter: 'description', field: 'description' })}
                  >
                    <p>{form.description.trim()}</p>
                  </PoiIntroPreviewTarget>
                ) : null}
                {form.address.trim() ||
                form.floorLabel.trim() ||
                form.openingHours.trim() ||
                parentMarker ? (
                  <dl>
                    {form.address.trim() ? (
                      <PoiIntroPreviewTarget
                        label="编辑地址"
                        onSelect={() => setSelection({ chapter: 'details', field: 'address' })}
                      >
                        <dt>地址</dt>
                        <dd>{form.address.trim()}</dd>
                      </PoiIntroPreviewTarget>
                    ) : null}
                    {form.floorLabel.trim() ? (
                      <PoiIntroPreviewTarget
                        label="编辑楼层"
                        onSelect={() => setSelection({ chapter: 'details', field: 'floorLabel' })}
                      >
                        <dt>楼层</dt>
                        <dd>{form.floorLabel.trim()}</dd>
                      </PoiIntroPreviewTarget>
                    ) : null}
                    {form.openingHours.trim() ? (
                      <PoiIntroPreviewTarget
                        label="编辑营业时间"
                        onSelect={() => setSelection({ chapter: 'details', field: 'openingHours' })}
                      >
                        <dt>营业时间</dt>
                        <dd>{form.openingHours.trim()}</dd>
                      </PoiIntroPreviewTarget>
                    ) : null}
                    {parentMarker ? (
                      <PoiIntroPreviewTarget
                        label="编辑所属地点"
                        onSelect={() => setSelection({ chapter: 'relation', field: 'parent' })}
                      >
                        <dt>所属地点</dt>
                        <dd>{parentMarker.label}</dd>
                      </PoiIntroPreviewTarget>
                    ) : null}
                  </dl>
                ) : null}
                {childGroups.length > 0 ? (
                  <div className="poi-intro-preview-related">
                    <div className="poi-intro-preview-section-title">子地点</div>
                    {renderPreviewChildGroups()}
                  </div>
                ) : null}
                {form.href.trim() ? (
                  <Button
                    variant="secondary"
                    icon="link"
                    onClick={() => setSelection({ chapter: 'link', field: 'href' })}
                  >
                    编辑链接
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {form.facilities.length > 0 ? (
                  <div className="map-poi-facility-list">
                    {form.facilities.map((facility, index) => (
                      <PoiIntroPreviewTarget
                        className="map-poi-facility-item"
                        key={`${facility.symbolIcon}-${index}`}
                        label={`编辑设施 ${index + 1}`}
                        onSelect={() =>
                          setSelection({ chapter: 'facilities', field: `facility:${index}` })
                        }
                      >
                        <MaterialSymbol name={facility.symbolIcon || 'info'} aria-hidden="true" />
                        <span>{facility.description || '未填写描述'}</span>
                      </PoiIntroPreviewTarget>
                    ))}
                  </div>
                ) : null}
                {renderPreviewChildGroups()}
                {form.facilities.length === 0 && childGroups.length === 0 ? (
                  <p>当前没有设施或子地点。</p>
                ) : null}
              </>
            )}
          </div>
        </article>
      </section>

      <EditorRailBridge
        activeToolId=""
        ownerId="poi-intro-editor"
        panels={{ visible: panelsVisible, onToggle: togglePanels }}
        sections={[{ id: 'view', priority: 60, items: previewWidthItems }]}
        tools={[]}
        onToolChange={() => undefined}
      />

      {panelsVisible ? (
        <aside className="poi-visual-layer-panel" aria-label="简介结构">
          <EditorPanelHeading
            meta={`${form.imageUrls.length} 张图片 · ${descriptionLength} 字简介`}
            title="结构"
          >
            <EditorInspectorEntry onOpen={openInspector} />
          </EditorPanelHeading>
          <div className="poi-visual-layer-body" ref={layerBodyRef}>
            <ul className="poi-visual-layer-tree">
              {poiIntroChapters.map((chapter) => (
                <li key={chapter.id}>
                  <div
                    className={`poi-visual-layer-row${
                      selection?.chapter === chapter.id ? ' is-active' : ''
                    }`}
                  >
                    <button
                      aria-pressed={selection?.chapter === chapter.id && !selection?.field}
                      className="poi-visual-layer-group"
                      type="button"
                      onClick={() => setSelection({ chapter: chapter.id })}
                      onDoubleClick={() => handleTreeDoubleClick(chapter.id)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {chapter.icon}
                      </span>
                      <span className="poi-visual-layer-label">{chapter.label}</span>
                      <span className="poi-visual-layer-count">{chapterMeta(chapter.id)}</span>
                    </button>
                  </div>
                  {renderChapterFields(chapter.id)}
                </li>
              ))}
            </ul>
          </div>
          <div className="poi-visual-layer-footer">
            <button
              disabled={disabled || form.imageUrls.length >= 12}
              type="button"
              onClick={addImage}
            >
              添加图片
            </button>
            <button
              disabled={disabled || form.facilities.length >= 64}
              type="button"
              onClick={addFacility}
            >
              添加设施
            </button>
          </div>
        </aside>
      ) : null}

      {panelsVisible ? (
        <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
          <EditorPanelHeading
            meta={
              selection
                ? selection.field
                  ? `字段 · ${selectedFieldLabel ?? ''}`
                  : `章节 · ${selectedChapter?.label ?? ''}`
                : `${imageCount} 张图片 · ${descriptionLength} 字简介`
            }
            title={
              selection ? (selectedFieldLabel ?? selectedChapter?.label ?? '属性') : '全局属性'
            }
          >
            <button
              aria-label="返回图层"
              className="poi-visual-inspector-back"
              onClick={() => {
                setSelection(null);
                closeInspector();
              }}
              title="返回图层"
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_back
              </span>
            </button>
          </EditorPanelHeading>
          <div className="poi-visual-coordinate-panel-body">
            {selection ? (
              renderSelectionInspector()
            ) : (
              <>
                <dl className="poi-visual-global-summary">
                  <div>
                    <dt>POI 名称</dt>
                    <dd>{form.title.trim() || '未命名地点'}</dd>
                  </div>
                  <div>
                    <dt>分类</dt>
                    <dd>{categoryName}</dd>
                  </div>
                  <div>
                    <dt>简介</dt>
                    <dd>{`${descriptionLength} 字`}</dd>
                  </div>
                  <div>
                    <dt>图片</dt>
                    <dd>{`${imageCount} 张`}</dd>
                  </div>
                  <div>
                    <dt>设施</dt>
                    <dd>{`${form.facilities.length} 项`}</dd>
                  </div>
                  <div>
                    <dt>子地点</dt>
                    <dd>{`${childMarkers.length} 个`}</dd>
                  </div>
                  <div>
                    <dt>营业时间</dt>
                    <dd>{form.openingHours.trim() ? '已填写' : '未填写'}</dd>
                  </div>
                  <div>
                    <dt>地址</dt>
                    <dd>{form.address.trim() ? '已填写' : '未填写'}</dd>
                  </div>
                  <div>
                    <dt>营业 / 地址完成度</dt>
                    <dd>{`${[form.openingHours.trim(), form.address.trim()].filter(Boolean).length}/2`}</dd>
                  </div>
                </dl>
                <p className="poi-visual-panel-empty">
                  单击预览卡中的区域即可选中字段；编辑在右侧检查器完成。
                </p>
              </>
            )}
          </div>
        </aside>
      ) : null}

      <EditorHeaderToolsPortal>
        <EditorHeaderToolbar compact={renderIntroToolbar(true)} full={renderIntroToolbar(true)} />
      </EditorHeaderToolsPortal>

      {renderIntroToolbar()}
    </div>
  );
}

function PoiNonPointGeometryEditor({
  contextMarkers,
  draft,
  entityLabel = 'POI',
  onChange,
  showMap = true,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  draft: PoiGeometryDraft;
  entityLabel?: string;
  onChange: (draft: PoiGeometryDraft) => void;
  showMap?: boolean;
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
      {showMap ? (
        <PoiGeometryVisualEditor
          contextMarkers={contextMarkers}
          draft={draft}
          entityLabel={entityLabel}
          tilePreviewConfig={tilePreviewConfig}
          onChange={onChange}
        />
      ) : null}
      {fields}
    </div>
  );
}

interface PoiGeometryLayerGroup {
  /** 与 ringTargetValue 相同的路径标识，例如 "0:1"。 */
  path: string;
  label: string;
  icon: string;
  /** 图层树里展示的真实顶点（闭合环不含末位副本）。 */
  points: CoordinateDraft[];
  /** 地图预览里该组占用的点数（闭合环包含末位副本），用于画布高亮对齐。 */
  canvasPointCount: number;
  canDuplicate: boolean;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/** 矩形在图层树里按 4 个顶点展示，顶点与 min/max 边界字段一一对应。 */
function rectangleBoundsToCornerDrafts(bounds: RectangleBoundsDraft): CoordinateDraft[] {
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ];
}

/** 把几何草稿展开成「形状 → 边界 / 环 → 控制点」的图层树数据。 */
function buildPoiGeometryLayerGroups(draft: PoiGeometryDraft): PoiGeometryLayerGroup[] {
  if (draft.type === 'Point') {
    return [
      {
        path: '0:0',
        label: '控制点 1',
        icon: 'location_on',
        points: [draft.coordinate],
        canvasPointCount: 1,
        canDuplicate: false,
        canRemove: false,
        canMoveUp: false,
        canMoveDown: false,
      },
    ];
  }
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    return [
      {
        path: '0:0',
        label: draft.type === 'LineString' ? '点序' : '点组',
        icon: 'polyline',
        points: draft.coordinates,
        canvasPointCount: draft.coordinates.length,
        canDuplicate: false,
        canRemove: false,
        canMoveUp: false,
        canMoveDown: false,
      },
    ];
  }
  if (draft.type === 'Polygon') {
    return draft.rings.map((ring, index) => ({
      path: `0:${index}`,
      label: index === 0 ? '外边界' : `减去图形 ${index}`,
      icon: index === 0 ? 'pentagon' : 'donut_large',
      // 闭合环末位是首点副本，图层树只列真实顶点。
      points: ring.slice(0, getPoiRingUniqueCount(ring)),
      canvasPointCount: ring.length,
      canDuplicate: true,
      canRemove: draft.rings.length > 1,
      canMoveUp: index > 0,
      canMoveDown: index < draft.rings.length - 1,
    }));
  }
  if (draft.type === 'MultiPolygon') {
    return draft.polygons.flatMap((rings, polygonIndex) =>
      rings.map((ring, ringIndex) => ({
        path: `${polygonIndex}:${ringIndex}`,
        label: `多边形 ${polygonIndex + 1} · ${ringIndex === 0 ? '外边界' : `减去图形 ${ringIndex}`}`,
        icon: 'pentagon',
        points: ring.slice(0, getPoiRingUniqueCount(ring)),
        canvasPointCount: ring.length,
        canDuplicate: true,
        canRemove: rings.length > 1 || draft.polygons.length > 1,
        canMoveUp: ringIndex > 0,
        canMoveDown: ringIndex < rings.length - 1,
      })),
    );
  }
  if (draft.type === 'Rectangle') {
    return [
      {
        path: '0:0',
        label: '矩形边界',
        icon: 'rectangle',
        points: rectangleBoundsToCornerDrafts(draft.bounds),
        canvasPointCount: 4,
        canDuplicate: false,
        canRemove: false,
        canMoveUp: false,
        canMoveDown: false,
      },
    ];
  }
  return draft.rectangles.map((bounds, index) => ({
    path: `${index}:0`,
    label: `矩形 ${index + 1}`,
    icon: 'rectangle',
    points: rectangleBoundsToCornerDrafts(bounds),
    canvasPointCount: 4,
    canDuplicate: true,
    canRemove: draft.rectangles.length > 1,
    canMoveUp: index > 0,
    canMoveDown: index < draft.rectangles.length - 1,
  }));
}

/** 复制结构时给坐标一个可见的偏移，避免副本与原对象完全重合。 */
function offsetDraftCoordinateValue(value: string, delta: number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round((numeric + delta) * 100) / 100) : value;
}

function offsetDraftCoordinate(coordinate: CoordinateDraft, delta: number): CoordinateDraft {
  return {
    ...coordinate,
    x: offsetDraftCoordinateValue(coordinate.x, delta),
    z: offsetDraftCoordinateValue(coordinate.z, delta),
  };
}

function PoiLayerRowActions({
  canDuplicate,
  canMoveDown,
  canMoveUp,
  canRemove,
  onDuplicate,
  onInsert,
  onMoveDown,
  onMoveUp,
  onRemove,
}: Readonly<{
  canDuplicate: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  canRemove: boolean;
  onDuplicate: () => void;
  onInsert?: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}>) {
  const actions: EditorLayerRowAction[] = [
    ...(onInsert
      ? [{ id: 'insert', icon: 'playlist_add', label: '在此后插入', onClick: onInsert }]
      : []),
    {
      id: 'duplicate',
      icon: 'content_copy',
      label: '创建副本',
      title: '创建副本（Ctrl+D）',
      disabled: !canDuplicate,
      onClick: onDuplicate,
    },
    {
      id: 'move-up',
      icon: 'arrow_upward',
      label: '上移',
      title: '上移（Alt+↑）',
      disabled: !canMoveUp,
      onClick: onMoveUp,
    },
    {
      id: 'move-down',
      icon: 'arrow_downward',
      label: '下移',
      title: '下移（Alt+↓）',
      disabled: !canMoveDown,
      onClick: onMoveDown,
    },
    {
      id: 'remove',
      icon: 'delete',
      label: '移除',
      title: '移除（Delete）',
      disabled: !canRemove,
      onClick: onRemove,
    },
  ];
  return <EditorLayerRowActions actions={actions} />;
}

export function RegionGeometryEditor({
  geometryType,
  markers,
  onChange,
  tilePreviewConfig,
  value,
}: Readonly<{
  geometryType: RegionMapGeometry['type'];
  markers: AdminMapMarker[];
  onChange: (value: RegionMapGeometry) => void;
  tilePreviewConfig: PoiTilePreviewConfig;
  value?: RegionMapGeometry;
}>) {
  const [draft, setDraft] = useState<PoiGeometryDraft>(() =>
    value?.type === geometryType
      ? createPoiGeometryDraft(value)
      : createEmptyPoiGeometryDraft(geometryType),
  );

  useEffect(() => {
    setDraft(
      value?.type === geometryType
        ? createPoiGeometryDraft(value)
        : createEmptyPoiGeometryDraft(geometryType),
    );
  }, [geometryType, value]);

  const contextMarkers = useMemo(() => {
    const center = value ? getGeometryRepresentativeCoordinate(value) : null;
    if (!center) {
      return [];
    }
    return markers
      .flatMap((marker) => {
        const coordinate = getGeometryRepresentativeCoordinate(marker.geometry);
        if (!coordinate) {
          return [];
        }
        return [
          {
            marker,
            coordinate,
            distanceBlocks: Math.hypot(coordinate[0] - center[0], coordinate[1] - center[1]),
            relation: 'nearby' as const,
          },
        ];
      })
      .sort((left, right) => left.distanceBlocks - right.distanceBlocks)
      .slice(0, 24);
  }, [markers, value]);

  const update = (nextDraft: PoiGeometryDraft) => {
    setDraft(nextDraft);
    const geometry = buildMapGeometryFromDraft(nextDraft).geometry;
    if (geometry && isRegionGeometry(geometry)) {
      onChange(geometry);
    }
  };

  return (
    <PoiNonPointGeometryEditor
      contextMarkers={contextMarkers}
      draft={draft}
      entityLabel="行政区划"
      onChange={update}
      tilePreviewConfig={tilePreviewConfig}
    />
  );
}

function AdminPoiImageEditor({
  disabled,
  onChange,
  values,
}: Readonly<{
  disabled: boolean;
  onChange: (imageUrls: string[]) => void;
  values: string[];
}>) {
  const [inputKey, setInputKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');

  const upload = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    const availableSlots = Math.max(0, 12 - values.length);
    const selectedFiles = files.slice(0, availableSlots);
    if (selectedFiles.length === 0) {
      setStatus('每个 POI 最多可保存 12 张图片');
      return;
    }
    setIsUploading(true);
    setStatus(`正在上传 ${selectedFiles.length} 张图片`);
    const nextValues = [...values];
    try {
      for (const file of selectedFiles) {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch(appPath('/api/admin/map/poi-submission-images/upload'), {
          method: 'POST',
          body,
        });
        const data = (await response.json()) as { imageUrl?: string; message?: string };
        if (!response.ok || !data.imageUrl) {
          onChange(nextValues);
          setStatus(data.message ?? `图片 ${file.name} 上传失败`);
          return;
        }
        nextValues.push(data.imageUrl);
      }
      onChange(normalizePoiImageUrlList(nextValues));
      setStatus(`已上传 ${selectedFiles.length} 张图片`);
    } catch {
      setStatus('图片上传失败');
    } finally {
      setIsUploading(false);
      setInputKey((current) => current + 1);
    }
  };

  return (
    <div className="admin-poi-image-edit-block">
      <p className="muted">图片（最多 12 张，顺序即地图展示顺序）</p>
      {values.map((value, index) => (
        <div className="admin-poi-image-url-row" key={index}>
          <Field label={`图片 ${index + 1}`}>
            <Input
              value={value}
              disabled={disabled || isUploading}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? event.currentTarget.value : item,
                  ),
                )
              }
              placeholder="https://... 或 /api/map/poi-submission-images/..."
              aria-label={`第 ${index + 1} 张图片链接`}
            />
          </Field>
          {value.trim() ? (
            <ButtonLink
              variant="secondary"
              href={resolvePoiSubmissionImageUrl(value)}
              rel="noreferrer"
              target="_blank"
              icon="open_in_new"
            >
              预览
            </ButtonLink>
          ) : null}
          <IconButton
            icon="arrow_back"
            label="向前移动图片"
            title="向前移动"
            disabled={disabled || isUploading || index === 0}
            onClick={() => onChange(moveListItem(values, index, index - 1))}
          />
          <IconButton
            icon="arrow_forward"
            label="向后移动图片"
            title="向后移动"
            disabled={disabled || isUploading || index === values.length - 1}
            onClick={() => onChange(moveListItem(values, index, index + 1))}
          />
          <IconButton
            icon="delete"
            label="删除图片"
            disabled={disabled || isUploading}
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <Button
        variant="secondary"
        icon="add"
        disabled={disabled || isUploading || values.length >= 12}
        onClick={() => onChange([...values, ''])}
      >
        添加图片链接
      </Button>
      <Field
        label="上传图片"
        className="admin-poi-image-upload"
        hint={<span className="muted">支持多选，最多 12 张</span>}
      >
        <Input
          key={inputKey}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          disabled={disabled || isUploading}
          onChange={(event) => void upload(Array.from(event.currentTarget.files ?? []))}
        />
      </Field>
      {status ? (
        <p className="muted" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function ParentMarkerSelect({
  categories,
  excludedMarkerId,
  iconBaseUrl,
  markerOptions,
  onChange,
  selectedId,
}: Readonly<{
  categories: PoiCategory[];
  excludedMarkerId?: string;
  iconBaseUrl: string;
  markerOptions: MapMarker[];
  onChange: (markerId: string) => void;
  selectedId: string;
}>) {
  const [query, setQuery] = useState('');
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category] as const)),
    [categories],
  );
  const options = useMemo(() => {
    const normalized = normalizeSearchText(query);
    return markerOptions.filter((marker) => {
      if (marker.id === excludedMarkerId) {
        return false;
      }
      if (marker.id === selectedId || !normalized) {
        return true;
      }
      return normalizeSearchText(
        [
          marker.label,
          marker.id,
          marker.categoryId,
          categoryById.get(marker.categoryId ?? '')?.name,
          ...Object.values(marker.localizedLabels ?? {}),
        ].join(' '),
      ).includes(normalized);
    });
  }, [categoryById, excludedMarkerId, markerOptions, query, selectedId]);

  const selectedMarker = markerOptions.find((marker) => marker.id === selectedId);
  const visibleOptions = options.slice(0, query.trim() ? 12 : 6);

  return (
    <PoiEditorSection
      summary={selectedMarker ? `已绑定：${selectedMarker.label}` : '不建立地点层级关系'}
      title="父地点"
    >
      <label className="poi-editor-search">
        <span className="material-symbols-outlined" aria-hidden="true">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="输入地点名称、译名或 ID"
        />
      </label>
      <div className="poi-editor-option-list" role="listbox" aria-label="父地点候选">
        <button
          className={!selectedId ? 'is-selected' : ''}
          type="button"
          role="option"
          aria-selected={!selectedId}
          onClick={() => onChange('')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            block
          </span>
          <span>
            <strong>无父地点</strong>
            <small>不建立地点层级关系</small>
          </span>
        </button>
        {visibleOptions.map((marker) => {
          const category = categoryById.get(marker.categoryId ?? '');
          const categoryName = formatCategoryName(marker.categoryId ?? 'uncategorized', category);
          const isSelected = marker.id === selectedId;
          return (
            <button
              className={isSelected ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={isSelected}
              key={marker.id}
              onClick={() => onChange(marker.id)}
            >
              <PoiCategoryIcon
                category={category}
                iconBaseUrl={iconBaseUrl}
                iconFileName={marker.iconFileName}
              />
              <span>
                <strong>{marker.label}</strong>
                <small>{`${categoryName} · ${marker.id}`}</small>
              </span>
            </button>
          );
        })}
      </div>
      {visibleOptions.length === 0 ? (
        <p className="muted">没有匹配的父地点。</p>
      ) : options.length > visibleOptions.length ? (
        <p className="muted">{`共 ${options.length} 个候选，继续输入关键词缩小范围。`}</p>
      ) : null}
    </PoiEditorSection>
  );
}

function PoiRegionBindingsFieldset({
  markerOptions,
  onChange,
  selectedIds,
}: Readonly<{
  markerOptions: MapMarker[];
  onChange: (selectedIds: string[]) => void;
  selectedIds: string[];
}>) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const filteredMarkers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    const ordered = [...markerOptions].sort((left, right) => {
      const selectedDifference =
        Number(selectedIds.includes(right.id)) - Number(selectedIds.includes(left.id));
      return selectedDifference || left.label.localeCompare(right.label, 'zh-CN');
    });
    return normalized
      ? ordered.filter((marker) =>
          `${marker.label}\u0000${marker.id}`.toLocaleLowerCase('zh-CN').includes(normalized),
        )
      : ordered;
  }, [markerOptions, query, selectedIds]);
  const visibleMarkers = filteredMarkers.slice(0, query.trim() ? 12 : 6);

  return (
    <PoiEditorSection
      actions={
        <button
          className="poi-editor-section-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : '选择区域'}
        </button>
      }
      summary={selectedIds.length > 0 ? `已绑定 ${selectedIds.length} 个区域` : '未绑定区域'}
      title="绑定区域"
    >
      {selectedIds.length > 0 ? (
        <div className="poi-editor-chip-row">
          {selectedIds.map((id) => {
            const marker = markerOptions.find((item) => item.id === id);
            return (
              <span className="poi-editor-chip" key={id}>
                <span>{marker?.label ?? id}</span>
                <button
                  type="button"
                  aria-label={`移除区域 ${marker?.label ?? id}`}
                  onClick={() => onChange(selectedIds.filter((item) => item !== id))}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      {expanded ? (
        markerOptions.length > 0 ? (
          <>
            <label className="poi-editor-search">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="搜索区域名称或 ID"
              />
            </label>
            <div className="poi-editor-checkbox-list">
              {visibleMarkers.map((marker) => (
                <CheckboxRow
                  key={marker.id}
                  checked={selectedIds.includes(marker.id)}
                  onChange={(event) =>
                    onChange(
                      event.currentTarget.checked
                        ? Array.from(new Set([...selectedIds, marker.id]))
                        : selectedIds.filter((id) => id !== marker.id),
                    )
                  }
                  label={
                    <>
                      <strong>{marker.label}</strong>
                      <small>{marker.id}</small>
                    </>
                  }
                />
              ))}
            </div>
            {visibleMarkers.length === 0 ? <p className="muted">没有匹配的区域。</p> : null}
            {filteredMarkers.length > visibleMarkers.length ? (
              <p className="muted">
                {`共 ${filteredMarkers.length} 个区域，继续输入关键词缩小范围。`}
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted">当前地图数据中没有可绑定的区域 POI。</p>
        )
      ) : null}
    </PoiEditorSection>
  );
}

function PoiGeometryVisualEditor({
  contextMarkers,
  draft,
  entityLabel,
  onChange,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>;
  entityLabel: string;
  onChange: (draft: PoiGeometryDraft) => void;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const autoPreview = buildPoiGeometryDraftMapPreview(draft, contextMarkers);
  const [tool, setTool] = useState<'pan' | 'move' | 'draw'>('pan');
  const [viewBounds, setViewBounds] = useState(autoPreview.bounds);
  const gestureRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBounds: PoiAuditMapBounds;
    moved: boolean;
    nodeIndex?: number;
  } | null>(null);
  const preview = buildPoiGeometryDraftMapPreview(draft, contextMarkers, viewBounds);
  const coordinateAtClientPoint = (
    clientX: number,
    clientY: number,
    element: HTMLElement,
  ): [number, number] => {
    const rect = element.getBoundingClientRect();
    return unprojectAuditMapPreviewCoordinate(
      [
        ((clientX - rect.left) / rect.width) * poiAuditPreviewWidth,
        ((clientY - rect.top) / rect.height) * poiAuditPreviewHeight,
      ],
      preview.bounds,
    );
  };
  const zoom = (factor: number) => setViewBounds((current) => scalePoiAuditBounds(current, factor));
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nodeElement =
      event.target instanceof Element
        ? event.target.closest<SVGGElement>('[data-poi-node-index]')
        : null;
    const nodeIndex = nodeElement ? Number(nodeElement.dataset.poiNodeIndex) : undefined;
    gestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds: viewBounds,
      moved: false,
      nodeIndex: tool === 'move' && Number.isInteger(nodeIndex) ? nodeIndex : undefined,
    };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (tool === 'move' && gesture.nodeIndex !== undefined) {
      gesture.moved = true;
      onChange(
        replacePoiGeometryDraftCoordinate(
          draft,
          gesture.nodeIndex,
          coordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget),
        ),
      );
      return;
    }
    if (tool !== 'pan') {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - gesture.startClientX;
    const deltaY = event.clientY - gesture.startClientY;
    if (Math.hypot(deltaX, deltaY) > 5) {
      gesture.moved = true;
    }
    const width = gesture.startBounds.maxX - gesture.startBounds.minX;
    const height = gesture.startBounds.maxZ - gesture.startBounds.minZ;
    const worldDeltaX = (deltaX / Math.max(1, rect.width)) * width;
    const worldDeltaZ = (deltaY / Math.max(1, rect.height)) * height;
    setViewBounds({
      minX: gesture.startBounds.minX - worldDeltaX,
      maxX: gesture.startBounds.maxX - worldDeltaX,
      minZ: gesture.startBounds.minZ - worldDeltaZ,
      maxZ: gesture.startBounds.maxZ - worldDeltaZ,
    });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (tool === 'draw' && !gesture.moved) {
      onChange(
        appendPoiGeometryDraftCoordinate(
          draft,
          coordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget),
        ),
      );
    }
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 0.8 : 1.25);
  };
  const removable = canRemovePoiGeometryDraftCoordinate(draft);

  return (
    <section className="admin-poi-geometry-map-editor" aria-label={`${entityLabel}几何地图编辑`}>
      <div className="admin-poi-audit-map-header">
        <strong>地图编辑</strong>
        <span>{geometryLabelFromDraft(draft)}</span>
      </div>
      <div
        className={`admin-poi-geometry-map-stage is-tool-${tool}`}
        role="application"
        aria-label={
          tool === 'pan'
            ? `拖移${entityLabel}几何地图`
            : tool === 'move'
              ? `拖移${entityLabel}几何控制点`
              : '在地图上添加几何节点'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <PoiAuditTileLayer bounds={preview.bounds} tilePreviewConfig={tilePreviewConfig} />
        <svg
          viewBox={`0 0 ${poiAuditPreviewWidth} ${poiAuditPreviewHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            className="admin-poi-audit-map-grid"
            x="0"
            y="0"
            width={poiAuditPreviewWidth}
            height={poiAuditPreviewHeight}
          />
          <PoiShapeLayer
            className="admin-poi-audit-map-submission-shape"
            height={poiAuditPreviewHeight}
            preview={preview}
            width={poiAuditPreviewWidth}
          />
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
              data-poi-node-index={index}
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
      </div>
      <div className="admin-poi-geometry-map-controls" aria-label="几何地图工具">
        <button
          className={tool === 'pan' ? 'is-active' : ''}
          type="button"
          aria-pressed={tool === 'pan'}
          title="拖移地图"
          onClick={() => setTool('pan')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            pan_tool
          </span>
        </button>
        <button
          className={tool === 'move' ? 'is-active' : ''}
          type="button"
          aria-pressed={tool === 'move'}
          title="拖移控制点"
          onClick={() => setTool('move')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            open_with
          </span>
        </button>
        <button
          className={tool === 'draw' ? 'is-active' : ''}
          type="button"
          aria-pressed={tool === 'draw'}
          title="添加边界节点"
          onClick={() => setTool('draw')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add_location_alt
          </span>
        </button>
        <button type="button" title="放大" onClick={() => zoom(0.8)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
        </button>
        <button type="button" title="缩小" onClick={() => zoom(1.25)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            remove
          </span>
        </button>
        <button
          type="button"
          title="适配全部几何"
          onClick={() => setViewBounds(autoPreview.bounds)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            fit_screen
          </span>
        </button>
        <button
          type="button"
          disabled={!removable}
          title="撤销末节点"
          onClick={() => onChange(removeLastPoiGeometryDraftCoordinate(draft))}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            undo
          </span>
        </button>
        <CurrentPlayerLocationButton
          title="追加当前绑定玩家的位置"
          onUse={(coordinate) => onChange(appendPoiGeometryDraftCoordinate(draft, coordinate))}
        />
      </div>
    </section>
  );
}

function PoiStandaloneGeometryWorkspace({
  contextMarkers,
  draft,
  draftTypeOptions,
  entityLabel,
  globalFields,
  layerRoot,
  layerStatus,
  onChange,
  onPointYChange,
  pointYText,
  showCoordinateY = true,
  showGroupStructureActions = false,
  tilePreviewConfig,
}: Readonly<{
  contextMarkers: PoiAuditContextMarker[];
  draft: PoiGeometryDraft;
  /** 限制可切换的几何类型；区划工作台只开放 4 种区域几何。 */
  draftTypeOptions?: Array<{ label: string; value: PoiGeometryDraft['type'] }>;
  entityLabel: string;
  /** 未选中对象时追加到「全局属性」的字段，由业务方提供。 */
  globalFields?: ReactNode;
  /** 图层树顶部的业务根节点，例如「区划」。 */
  layerRoot?: { icon: string; label: string; meta?: string };
  /** 图层面板里的状态文案，复用线路工作台的状态条样式。 */
  layerStatus?: string;
  onChange: (draft: PoiGeometryDraft) => void;
  onPointYChange: (value: string) => void;
  pointYText: string;
  /** 区划没有高度，隐藏坐标里的 Y 字段。 */
  showCoordinateY?: boolean;
  /** 选中边界时在检查器里直接提供结构操作。 */
  showGroupStructureActions?: boolean;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  const [tool, setTool] = useState<'pan' | 'select' | 'draw'>('pan');
  const [spacePressed, setSpacePressed] = useState(false);
  const { panelsVisible, panelStateClass, togglePanels, openInspector, closeInspector } =
    useEditorPanels();
  const [layerSelection, setLayerSelection] = useState<{
    path: string;
    index: number | null;
  } | null>(null);
  const locationProxyRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layerBodyRef = useRef<HTMLDivElement | null>(null);
  useEditorLayerScroll(
    layerBodyRef,
    layerSelection ? `${layerSelection.path}:${layerSelection.index ?? ''}` : null,
  );
  const [viewportSize, setViewportSize] = useState<PoiMapViewport>(poiAuditPreviewViewport);
  const [insertionMode, setInsertionMode] = useState<PoiCoordinateInsertionMode>('append');
  const insertionSupported = supportsPoiCoordinateInsertion(draft);
  const [ringTargetValue, setRingTargetValue] = useState('0:0');
  const [rectangleIndex, setRectangleIndex] = useState(0);
  const ringOptions = useMemo(() => {
    if (draft.type === 'Polygon') {
      return draft.rings.map((_, ringIndex) => ({
        label: ringIndex === 0 ? '外边界' : `减去图形 ${ringIndex}`,
        value: `0:${ringIndex}`,
      }));
    }
    if (draft.type === 'MultiPolygon') {
      return draft.polygons.flatMap((polygon, polygonIndex) =>
        polygon.map((_, ringIndex) => ({
          label: `多边形 ${polygonIndex + 1} · ${ringIndex === 0 ? '外边界' : `减去图形 ${ringIndex}`}`,
          value: `${polygonIndex}:${ringIndex}`,
        })),
      );
    }
    return [];
  }, [draft]);
  const effectiveRingTargetValue = ringOptions.some((option) => option.value === ringTargetValue)
    ? ringTargetValue
    : (ringOptions[0]?.value ?? '0:0');
  const editingRing = useMemo(() => {
    if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
      return {
        apply: (ring: CoordinateDraft[]): PoiGeometryDraft => ({
          type: draft.type,
          coordinates: ring,
        }),
        ring: draft.coordinates,
      };
    }
    if (draft.type === 'Polygon') {
      const [, rawRingIndex] = effectiveRingTargetValue.split(':').map(Number);
      const ringIndex = clamp(
        Number.isFinite(rawRingIndex) ? rawRingIndex : 0,
        0,
        Math.max(0, draft.rings.length - 1),
      );
      return {
        apply: (ring: CoordinateDraft[]): PoiGeometryDraft => ({
          type: 'Polygon',
          rings: draft.rings.map((item, index) => (index === ringIndex ? ring : item)),
        }),
        ring: draft.rings[ringIndex] ?? [],
      };
    }
    if (draft.type === 'MultiPolygon') {
      const [rawPolygonIndex, rawRingIndex] = effectiveRingTargetValue.split(':').map(Number);
      const polygonIndex = clamp(
        Number.isFinite(rawPolygonIndex) ? rawPolygonIndex : 0,
        0,
        Math.max(0, draft.polygons.length - 1),
      );
      const polygon = draft.polygons[polygonIndex] ?? [];
      const ringIndex = clamp(
        Number.isFinite(rawRingIndex) ? rawRingIndex : 0,
        0,
        Math.max(0, polygon.length - 1),
      );
      return {
        apply: (ring: CoordinateDraft[]): PoiGeometryDraft => ({
          type: 'MultiPolygon',
          polygons: draft.polygons.map((item, index) =>
            index !== polygonIndex
              ? item
              : item.map((ringItem, itemRingIndex) =>
                  itemRingIndex === ringIndex ? ring : ringItem,
                ),
          ),
        }),
        ring: polygon[ringIndex] ?? [],
      };
    }
    return null;
  }, [draft, effectiveRingTargetValue]);
  const previewDraft: Exclude<PoiGeometryDraft, { type: 'Point' }> =
    draft.type === 'Point' ? { type: 'MultiPoint', coordinates: [draft.coordinate] } : draft;
  const autoPreview = buildPoiGeometryDraftMapPreview(previewDraft, contextMarkers);
  const [viewBounds, setViewBounds] = useState(() =>
    fitPoiAuditBoundsToViewport(autoPreview.bounds, poiAuditPreviewViewport),
  );
  const preview = buildPoiGeometryDraftMapPreview(
    previewDraft,
    contextMarkers,
    viewBounds,
    viewportSize,
  );

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;

    const applySize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setViewportSize((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { height, width },
      );
    };

    applySize(element.clientWidth, element.clientHeight);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setViewBounds((current) => fitPoiAuditBoundsToViewport(current, viewportSize));
  }, [viewportSize]);

  const geometryTools = useMemo<EditorTool[]>(() => {
    const drawLabel =
      draft.type === 'Point'
        ? '选择坐标'
        : insertionSupported
          ? '增删控制点（左键添加 / 右键或长按删除）'
          : '添加控制点';
    return [
      {
        id: 'pan',
        icon: 'pan_tool',
        label: EDITOR_SHORTCUT_CATALOG.toolPan.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolPan.displayKeys[0],
      },
      {
        id: 'select',
        // Material Symbols 里最接近「去掉箭柄的光标」的实心箭头。
        icon: 'near_me',
        label: EDITOR_SHORTCUT_CATALOG.toolSelect.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolSelect.displayKeys[0],
      },
      {
        id: 'draw',
        icon: 'add_location_alt',
        label: drawLabel,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolDraw.displayKeys[0],
      },
    ];
  }, [draft.type, insertionSupported]);

  const coordinateAtClientPoint = (
    clientX: number,
    clientY: number,
    element: HTMLElement,
  ): [number, number] => {
    const rect = element.getBoundingClientRect();
    return unprojectAuditMapPreviewCoordinate(
      [
        ((clientX - rect.left) / Math.max(1, rect.width)) * viewportSize.width,
        ((clientY - rect.top) / Math.max(1, rect.height)) * viewportSize.height,
      ],
      preview.bounds,
      viewportSize,
    );
  };
  const gestureRef = useRef<{
    longPressTimer?: number;
    longPressTriggered?: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBounds: PoiAuditMapBounds;
    moved: boolean;
    nodeIndex?: number;
    /** 中键 / 空格 / 手型工具触发的纯平移，不参与选中与绘制。 */
    panOnly?: boolean;
  } | null>(null);

  // 空格按住时临时切换到手型，松开恢复原工具。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) {
        return;
      }
      // 不抢走按钮 / 链接的 Space 激活行为。
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, summary, [role="button"]')
      ) {
        return;
      }
      event.preventDefault();
      setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePressed(false);
      }
    };
    const handleBlur = () => setSpacePressed(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const updateCoordinateAtIndex = (index: number, coordinate: [number, number]) => {
    if (draft.type === 'Point') {
      onChange({ type: 'Point', coordinate: { ...coordinateToDraft(coordinate), y: pointYText } });
      return;
    }
    onChange(replacePoiGeometryDraftCoordinate(draft, index, coordinate));
  };
  const addCoordinate = (coordinate: [number, number]) => {
    if (draft.type === 'Point') {
      onChange({ type: 'Point', coordinate: { ...coordinateToDraft(coordinate), y: pointYText } });
      return;
    }
    if (draft.type === 'MultiRectangle') {
      const rectangles =
        draft.rectangles.length > 0 ? [...draft.rectangles] : [createEmptyRectangleBoundsDraft()];
      const index = clamp(rectangleIndex, 0, rectangles.length - 1);
      rectangles[index] = expandRectangleDraft(rectangles[index], coordinate);
      onChange({ type: 'MultiRectangle', rectangles });
      return;
    }

    if (!editingRing) {
      onChange(appendPoiGeometryDraftCoordinate(draft, coordinate));
      return;
    }
    onChange(
      editingRing.apply(
        insertPoiRingSlot(
          editingRing.ring,
          coordinateToDraft(coordinate),
          insertionMode,
          coordinate,
        ),
      ),
    );
  };
  const removeCoordinateAtClientPoint = (
    clientX: number,
    clientY: number,
    element: HTMLElement,
  ) => {
    if (draft.type === 'Point' || !editingRing) {
      return;
    }

    const ring = editingRing.ring;
    if (ring.length === 0) {
      return;
    }

    let localIndex: number;
    if (insertionMode === 'prepend') {
      localIndex = 0;
    } else if (insertionMode === 'append') {
      localIndex = getPoiRingUniqueCount(ring) - 1;
    } else {
      const rect = element.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      let bestIndex = -1;
      let bestDistance = 22;
      // 闭合环末位是首点副本，只匹配真实顶点，避免命中副本后删不掉。
      ring.slice(0, getPoiRingUniqueCount(ring)).forEach((item, index) => {
        const coordinate = parseCoordinateDraft(item);
        if (!coordinate) {
          return;
        }
        const point = projectAuditMapPreviewCoordinate(coordinate, preview.bounds, viewportSize);
        const distance = Math.hypot(point[0] - localX, point[1] - localY);
        if (distance <= bestDistance) {
          bestIndex = index;
          bestDistance = distance;
        }
      });
      if (bestIndex < 0) {
        return;
      }
      localIndex = bestIndex;
    }

    const nextRing = removePoiRingSlotAt(ring, localIndex);
    if (nextRing) {
      onChange(editingRing.apply(nextRing));
      navigator.vibrate?.(20);
    }
  };
  const undoCoordinate = () => {
    if (draft.type === 'Point') {
      return;
    }
    if (!editingRing) {
      onChange(removeLastPoiGeometryDraftCoordinate(draft));
      return;
    }

    const ring = editingRing.ring;
    const localIndex = insertionMode === 'prepend' ? 0 : getPoiRingUniqueCount(ring) - 1;
    const nextRing = removePoiRingSlotAt(ring, localIndex);
    if (nextRing) {
      onChange(editingRing.apply(nextRing));
    }
  };
  const zoom = (factor: number, anchor?: [number, number]) =>
    setViewBounds((current) =>
      anchor
        ? scalePoiAuditBoundsAtCoordinate(current, factor, anchor)
        : scalePoiAuditBounds(current, factor),
    );
  /** 双击进入编辑：选中对象并把焦点送进属性检查器的第一个字段。 */
  const focusInspector = useEditorInspectorFocus(inspectorRef);

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (tool !== 'select') {
      return;
    }
    const nodeElement =
      event.target instanceof Element
        ? event.target.closest<SVGGElement>('[data-poi-node-index]')
        : null;
    if (!nodeElement) {
      return;
    }
    const nodeIndex = Number(nodeElement.dataset.poiNodeIndex);
    const selection = flatPointSelectionMap.get(nodeIndex);
    if (!selection) {
      return;
    }
    setRingTargetValue(selection.path);
    setLayerSelection(selection);
    focusInspector();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isMiddleButton = event.button === 1;
    if (event.button !== 0 && !isMiddleButton) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // 中键、按住空格、手型工具都走纯平移，不触发选中或绘制。
    const panOnly = isMiddleButton || spacePressed || tool === 'pan';
    const nodeElement =
      event.target instanceof Element
        ? event.target.closest<SVGGElement>('[data-poi-node-index]')
        : null;
    const nodeIndex = nodeElement ? Number(nodeElement.dataset.poiNodeIndex) : undefined;
    // 选择工具单击即选定：画布上的控制点与图层树保持同一份选中状态。
    if (!panOnly && tool === 'select' && nodeIndex !== undefined) {
      const selection = flatPointSelectionMap.get(nodeIndex);
      if (selection) {
        setRingTargetValue(selection.path);
        setLayerSelection(selection);
      }
    }
    const gesture: NonNullable<typeof gestureRef.current> = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds: viewBounds,
      moved: false,
      nodeIndex:
        !panOnly && tool === 'select' && Number.isInteger(nodeIndex) ? nodeIndex : undefined,
      panOnly,
    };
    if (!panOnly && tool === 'draw' && insertionSupported) {
      gesture.longPressTimer = window.setTimeout(() => {
        const current = gestureRef.current;
        if (!current || current.pointerId !== event.pointerId || current.moved) {
          return;
        }
        current.longPressTriggered = true;
        removeCoordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget);
      }, 500);
    }
    gestureRef.current = gesture;
  };
  const clearGestureTimer = (gesture: NonNullable<typeof gestureRef.current>) => {
    if (gesture.longPressTimer) {
      window.clearTimeout(gesture.longPressTimer);
      gesture.longPressTimer = undefined;
    }
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.panOnly && tool === 'select' && gesture.nodeIndex !== undefined) {
      gesture.moved = true;
      clearGestureTimer(gesture);
      updateCoordinateAtIndex(
        gesture.nodeIndex,
        coordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget),
      );
      return;
    }
    if (!gesture.panOnly) return;
    const deltaX = event.clientX - gesture.startClientX;
    const deltaY = event.clientY - gesture.startClientY;
    if (Math.hypot(deltaX, deltaY) > 5) {
      gesture.moved = true;
      clearGestureTimer(gesture);
    }
    const gestureScale = buildPoiAuditMapView(gesture.startBounds, viewportSize).scale;
    const worldDeltaX = deltaX / gestureScale;
    const worldDeltaZ = deltaY / gestureScale;
    setViewBounds({
      minX: gesture.startBounds.minX - worldDeltaX,
      maxX: gesture.startBounds.maxX - worldDeltaX,
      minZ: gesture.startBounds.minZ - worldDeltaZ,
      maxZ: gesture.startBounds.maxZ - worldDeltaZ,
    });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearGestureTimer(gesture);
    if (!gesture.panOnly && tool === 'draw' && !gesture.moved && !gesture.longPressTriggered) {
      addCoordinate(coordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget));
    }
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (tool !== 'draw') {
      return;
    }
    removeCoordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget);
  };
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(
      event.deltaY < 0 ? 0.8 : 1.25,
      coordinateAtClientPoint(event.clientX, event.clientY, event.currentTarget),
    );
  };
  const removable = draft.type === 'Point' ? false : canRemovePoiGeometryDraftCoordinate(draft);
  // 缩放比例以「适配全部几何」为 100%，避免暴露内部世界单位。
  const fittedViewBounds = fitPoiAuditBoundsToViewport(autoPreview.bounds, viewportSize);
  const viewBoundsWidth = Math.max(0, viewBounds.maxX - viewBounds.minX);
  const fittedBoundsWidth = Math.max(0, fittedViewBounds.maxX - fittedViewBounds.minX);
  const zoomScale = viewBoundsWidth > 0 ? fittedBoundsWidth / viewBoundsWidth : 1;

  const layerGroups = useMemo(() => buildPoiGeometryLayerGroups(draft), [draft]);
  const layerPointOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let cursor = 0;
    layerGroups.forEach((group) => {
      offsets.set(group.path, cursor);
      cursor += group.canvasPointCount;
    });
    return offsets;
  }, [layerGroups]);
  const flatPointSelectionMap = useMemo(() => {
    const map = new Map<number, { path: string; index: number }>();
    layerGroups.forEach((group) => {
      const base = layerPointOffsets.get(group.path) ?? 0;
      group.points.forEach((_, index) => map.set(base + index, { path: group.path, index }));
    });
    return map;
  }, [layerGroups, layerPointOffsets]);
  const geometrySizeLabel = `${Math.round((autoPreview.bounds.maxX - autoPreview.bounds.minX) * 10) / 10} × ${
    Math.round((autoPreview.bounds.maxZ - autoPreview.bounds.minZ) * 10) / 10
  }`;
  const selectedLayerGroup = layerSelection
    ? (layerGroups.find((group) => group.path === layerSelection.path) ?? null)
    : null;
  const selectedPointIndex = layerSelection?.index ?? null;
  const selectedPoint =
    selectedLayerGroup && selectedPointIndex !== null
      ? (selectedLayerGroup.points[selectedPointIndex] ?? null)
      : null;
  const selectedRingMinPoints = draft.type === 'Polygon' || draft.type === 'MultiPolygon' ? 4 : 2;
  const selectedFlatPointIndex =
    layerSelection && layerSelection.index !== null
      ? (layerPointOffsets.get(layerSelection.path) ?? -1) + layerSelection.index
      : -1;
  const inspectorSubtitle =
    selectedPoint && selectedPointIndex !== null
      ? `${selectedLayerGroup?.label ?? '控制点'} · 点 ${selectedPointIndex + 1}`
      : (selectedLayerGroup?.label ?? '未选择对象');

  // 切换几何类型后旧的路径会失效，直接清空选择避免属性面板指向不存在的点。
  useEffect(() => {
    setLayerSelection(null);
  }, [draft.type]);

  const selectLayerGroup = (path: string) => {
    const [leadingIndex] = path.split(':').map(Number);
    if (draft.type === 'MultiRectangle') {
      setRectangleIndex(clamp(leadingIndex, 0, Math.max(0, draft.rectangles.length - 1)));
    }
    setRingTargetValue(path);
    setLayerSelection({ path, index: null });
  };

  const selectLayerPoint = (path: string, index: number) => {
    setRingTargetValue(path);
    setLayerSelection({ path, index });
  };

  /** 矩形按 4 个顶点编辑：顶点坐标映射回 min/max 边界，等价于同时更新相邻两条边。 */
  const updateRectangleCorner = (
    cornerIndex: number,
    patch: Partial<CoordinateDraft>,
    rectangleIndexOverride?: number,
  ) => {
    const applyBounds = (bounds: RectangleBoundsDraft): RectangleBoundsDraft => {
      const next = { ...bounds };
      if (patch.x !== undefined) {
        if (cornerIndex === 0 || cornerIndex === 3) {
          next.minX = patch.x;
        } else {
          next.maxX = patch.x;
        }
      }
      if (patch.z !== undefined) {
        if (cornerIndex === 0 || cornerIndex === 1) {
          next.minZ = patch.z;
        } else {
          next.maxZ = patch.z;
        }
      }
      return next;
    };
    if (draft.type === 'Rectangle') {
      onChange({ type: 'Rectangle', bounds: applyBounds(draft.bounds) });
      return;
    }
    if (draft.type !== 'MultiRectangle') {
      return;
    }
    const target = clamp(
      rectangleIndexOverride ?? rectangleIndex,
      0,
      Math.max(0, draft.rectangles.length - 1),
    );
    onChange({
      type: 'MultiRectangle',
      rectangles: draft.rectangles.map((bounds, index) =>
        index === target ? applyBounds(bounds) : bounds,
      ),
    });
  };

  const updateSelectedPoint = (patch: Partial<CoordinateDraft>) => {
    if (selectedPointIndex === null) {
      return;
    }
    if (draft.type === 'Rectangle' || draft.type === 'MultiRectangle') {
      const rectangleIndexValue =
        draft.type === 'MultiRectangle'
          ? Number(selectedLayerGroup?.path.split(':')[0] ?? rectangleIndex)
          : undefined;
      updateRectangleCorner(selectedPointIndex, patch, rectangleIndexValue);
      return;
    }
    if (!editingRing) {
      return;
    }
    onChange(
      editingRing.apply(
        editingRing.ring.map((item, index) =>
          index === selectedPointIndex ? { ...item, ...patch } : item,
        ),
      ),
    );
  };

  /** 按图层路径读取控制点数组，供悬停行操作复用，不必先切换选中态。 */
  const getRingByPath = (path: string): CoordinateDraft[] | null => {
    if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
      return draft.coordinates;
    }
    if (draft.type === 'Polygon') {
      return draft.rings[Number(path.split(':')[1])] ?? null;
    }
    if (draft.type === 'MultiPolygon') {
      const [polygonIndex, ringIndex] = path.split(':').map(Number);
      return draft.polygons[polygonIndex]?.[ringIndex] ?? null;
    }
    return null;
  };

  const applyRingByPath = (path: string, ring: CoordinateDraft[]) => {
    if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
      onChange({ type: draft.type, coordinates: ring });
      return;
    }
    if (draft.type === 'Polygon') {
      const ringIndex = Number(path.split(':')[1]);
      onChange({
        type: 'Polygon',
        rings: draft.rings.map((item, index) => (index === ringIndex ? ring : item)),
      });
      return;
    }
    if (draft.type === 'MultiPolygon') {
      const [polygonIndex, ringIndex] = path.split(':').map(Number);
      onChange({
        type: 'MultiPolygon',
        polygons: draft.polygons.map((rings, index) =>
          index === polygonIndex
            ? rings.map((item, current) => (current === ringIndex ? ring : item))
            : rings,
        ),
      });
    }
  };

  const movePointAt = (path: string, index: number, offset: -1 | 1) => {
    const ring = getRingByPath(path);
    if (!ring) return;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= ring.length) return;
    const next = [...ring];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    applyRingByPath(path, next);
    setRingTargetValue(path);
    setLayerSelection({ path, index: nextIndex });
  };

  const insertPointAt = (path: string, index: number) => {
    const ring = getRingByPath(path);
    if (!ring) return;
    const next = [...ring];
    next.splice(index + 1, 0, createInsertedCoordinateDraft(ring, index));
    applyRingByPath(path, next);
    setRingTargetValue(path);
    setLayerSelection({ path, index: index + 1 });
  };

  const removePointAt = (path: string, index: number) => {
    const ring = getRingByPath(path);
    if (!ring || ring.length <= selectedRingMinPoints) return;
    const next = ring.filter((_, current) => current !== index);
    applyRingByPath(path, next);
    setRingTargetValue(path);
    setLayerSelection({ path, index: Math.min(index, next.length - 1) });
  };

  const duplicatePointAt = (path: string, index: number) => {
    const ring = getRingByPath(path);
    const source = ring?.[index];
    if (!ring || !source) return;
    const next = [...ring];
    next.splice(index + 1, 0, offsetDraftCoordinate(source, 1));
    applyRingByPath(path, next);
    setRingTargetValue(path);
    setLayerSelection({ path, index: index + 1 });
  };

  const moveSelectedPoint = (offset: -1 | 1) => {
    if (!selectedLayerGroup || selectedPointIndex === null) return;
    movePointAt(selectedLayerGroup.path, selectedPointIndex, offset);
  };

  const insertSelectedPoint = () => {
    if (!selectedLayerGroup || selectedPointIndex === null) return;
    insertPointAt(selectedLayerGroup.path, selectedPointIndex);
  };

  const removeSelectedPoint = () => {
    if (!selectedLayerGroup || selectedPointIndex === null) return;
    removePointAt(selectedLayerGroup.path, selectedPointIndex);
  };

  const duplicateSelectedPoint = () => {
    if (!selectedLayerGroup || selectedPointIndex === null) return;
    duplicatePointAt(selectedLayerGroup.path, selectedPointIndex);
  };

  const reverseSelectedRing = () => {
    if (!editingRing) {
      return;
    }
    onChange(editingRing.apply([...editingRing.ring].reverse()));
  };

  const appendPointToSelectedRing = () => {
    if (!editingRing) {
      return;
    }
    onChange(
      editingRing.apply([...editingRing.ring, createInsertedCoordinateDraft(editingRing.ring)]),
    );
  };

  const duplicateSelectedGroup = (targetPath = selectedLayerGroup?.path) => {
    if (!targetPath) {
      return;
    }
    if (draft.type === 'Polygon') {
      const ringIndex = Number(targetPath.split(':')[1]);
      const ring = draft.rings[ringIndex];
      if (!ring) {
        return;
      }
      const rings = [...draft.rings];
      rings.splice(
        ringIndex + 1,
        0,
        ring.map((item) => offsetDraftCoordinate(item, 1)),
      );
      onChange({ type: 'Polygon', rings });
      const path = `0:${ringIndex + 1}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
      return;
    }
    if (draft.type === 'MultiPolygon') {
      const [polygonIndex, ringIndex] = targetPath.split(':').map(Number);
      const source = draft.polygons[polygonIndex]?.[ringIndex];
      if (!source) {
        return;
      }
      const polygons = draft.polygons.map((rings, index) => {
        if (index !== polygonIndex) {
          return rings;
        }
        const copy = [...rings];
        copy.splice(
          ringIndex + 1,
          0,
          source.map((item) => offsetDraftCoordinate(item, 1)),
        );
        return copy;
      });
      onChange({ type: 'MultiPolygon', polygons });
      const path = `${polygonIndex}:${ringIndex + 1}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
      return;
    }
    if (draft.type === 'MultiRectangle') {
      const rectangleIndexValue = Number(targetPath.split(':')[0]);
      const bounds = draft.rectangles[rectangleIndexValue];
      if (!bounds) {
        return;
      }
      const rectangles = [...draft.rectangles];
      rectangles.splice(rectangleIndexValue + 1, 0, {
        minX: offsetDraftCoordinateValue(bounds.minX, 1),
        minZ: offsetDraftCoordinateValue(bounds.minZ, 1),
        maxX: offsetDraftCoordinateValue(bounds.maxX, 1),
        maxZ: offsetDraftCoordinateValue(bounds.maxZ, 1),
      });
      onChange({ type: 'MultiRectangle', rectangles });
      const path = `${rectangleIndexValue + 1}:0`;
      setRectangleIndex(rectangleIndexValue + 1);
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
    }
  };

  const removeSelectedGroup = (targetPath = selectedLayerGroup?.path) => {
    if (!targetPath) {
      return;
    }
    if (draft.type === 'Polygon') {
      const ringIndex = Number(targetPath.split(':')[1]);
      if (draft.rings.length <= 1) {
        return;
      }
      const rings = draft.rings.filter((_, index) => index !== ringIndex);
      onChange({ type: 'Polygon', rings });
      setRingTargetValue(`0:${Math.min(ringIndex, rings.length - 1)}`);
      setLayerSelection(null);
      return;
    }
    if (draft.type === 'MultiPolygon') {
      const [polygonIndex, ringIndex] = targetPath.split(':').map(Number);
      const rings = draft.polygons[polygonIndex] ?? [];
      let polygons;
      if (rings.length > 1) {
        polygons = draft.polygons.map((item, index) =>
          index === polygonIndex ? item.filter((_, current) => current !== ringIndex) : item,
        );
      } else if (draft.polygons.length > 1) {
        polygons = draft.polygons.filter((_, index) => index !== polygonIndex);
      } else {
        return;
      }
      onChange({ type: 'MultiPolygon', polygons });
      setLayerSelection(null);
      return;
    }
    if (draft.type === 'MultiRectangle') {
      const rectangleIndexValue = Number(targetPath.split(':')[0]);
      if (draft.rectangles.length <= 1) {
        return;
      }
      const rectangles = draft.rectangles.filter((_, index) => index !== rectangleIndexValue);
      onChange({ type: 'MultiRectangle', rectangles });
      setRectangleIndex(0);
      setLayerSelection(null);
    }
  };

  const moveSelectedGroup = (offset: -1 | 1, targetPath = selectedLayerGroup?.path) => {
    if (!targetPath) {
      return;
    }
    if (draft.type === 'Polygon') {
      const ringIndex = Number(targetPath.split(':')[1]);
      const nextIndex = ringIndex + offset;
      if (nextIndex < 0 || nextIndex >= draft.rings.length) {
        return;
      }
      const rings = [...draft.rings];
      [rings[ringIndex], rings[nextIndex]] = [rings[nextIndex], rings[ringIndex]];
      onChange({ type: 'Polygon', rings });
      const path = `0:${nextIndex}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
      return;
    }
    if (draft.type === 'MultiPolygon') {
      const [polygonIndex, ringIndex] = targetPath.split(':').map(Number);
      const rings = draft.polygons[polygonIndex] ?? [];
      const nextIndex = ringIndex + offset;
      if (nextIndex < 0 || nextIndex >= rings.length) {
        return;
      }
      const polygons = draft.polygons.map((item, index) => {
        if (index !== polygonIndex) {
          return item;
        }
        const copy = [...item];
        [copy[ringIndex], copy[nextIndex]] = [copy[nextIndex], copy[ringIndex]];
        return copy;
      });
      onChange({ type: 'MultiPolygon', polygons });
      const path = `${polygonIndex}:${nextIndex}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
      return;
    }
    if (draft.type === 'MultiRectangle') {
      const rectangleIndexValue = Number(targetPath.split(':')[0]);
      const nextIndex = rectangleIndexValue + offset;
      if (nextIndex < 0 || nextIndex >= draft.rectangles.length) {
        return;
      }
      const rectangles = [...draft.rectangles];
      [rectangles[rectangleIndexValue], rectangles[nextIndex]] = [
        rectangles[nextIndex],
        rectangles[rectangleIndexValue],
      ];
      onChange({ type: 'MultiRectangle', rectangles });
      const path = `${nextIndex}:0`;
      setRectangleIndex(nextIndex);
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
    }
  };

  const addRingToPolygon = () => {
    if (draft.type === 'Polygon') {
      const rings = [...draft.rings, createDefaultPolygonRingDraft(draft.rings.at(-1)?.[0])];
      onChange({ type: 'Polygon', rings });
      const path = `0:${rings.length - 1}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
      return;
    }
    if (draft.type === 'MultiPolygon') {
      const polygonIndex = clamp(
        Number(layerSelection?.path.split(':')[0] ?? draft.polygons.length - 1),
        0,
        Math.max(0, draft.polygons.length - 1),
      );
      const polygons = draft.polygons.map((rings, index) =>
        index === polygonIndex
          ? [...rings, createDefaultPolygonRingDraft(rings.at(-1)?.[0])]
          : rings,
      );
      onChange({ type: 'MultiPolygon', polygons });
      const path = `${polygonIndex}:${polygons[polygonIndex].length - 1}`;
      setRingTargetValue(path);
      setLayerSelection({ path, index: null });
    }
  };

  const addPolygon = () => {
    if (draft.type !== 'MultiPolygon') {
      return;
    }
    const polygons = [
      ...draft.polygons,
      [createDefaultPolygonRingDraft(draft.polygons.at(-1)?.[0]?.[0])],
    ];
    onChange({ type: 'MultiPolygon', polygons });
    const path = `${polygons.length - 1}:0`;
    setRingTargetValue(path);
    setLayerSelection({ path, index: null });
  };

  const addRectangle = () => {
    if (draft.type !== 'MultiRectangle') {
      return;
    }
    const rectangles = [...draft.rectangles, createNextRectangleDraft(draft.rectangles)];
    onChange({ type: 'MultiRectangle', rectangles });
    const path = `${rectangles.length - 1}:0`;
    setRectangleIndex(rectangles.length - 1);
    setRingTargetValue(path);
    setLayerSelection({ path, index: null });
  };

  const duplicateLayerSelection = () => {
    if (selectedPointIndex !== null) {
      duplicateSelectedPoint();
      return;
    }
    duplicateSelectedGroup();
  };

  const removeLayerSelection = () => {
    if (selectedPointIndex !== null) {
      removeSelectedPoint();
      return;
    }
    removeSelectedGroup();
  };

  const moveLayerSelection = (offset: -1 | 1) => {
    if (selectedPointIndex !== null) {
      moveSelectedPoint(offset);
      return;
    }
    moveSelectedGroup(offset);
  };

  // 结构操作依赖当前草稿与选择，因此每次都刷新绑定表，不做 memo。
  useEditorShortcuts([
    defineShortcut('toolPan', () => setTool('pan')),
    defineShortcut('toolSelect', () => setTool('select')),
    defineShortcut('toolDraw', () => setTool('draw')),
    defineShortcut('insertPrepend', () => setInsertionMode('prepend')),
    defineShortcut('insertAppend', () => setInsertionMode('append')),
    defineShortcut('insertNearest', () => setInsertionMode('nearest')),
    defineShortcut('duplicateSelection', duplicateLayerSelection),
    defineShortcut('moveUp', () => moveLayerSelection(-1)),
    defineShortcut('moveDown', () => moveLayerSelection(1)),
    defineShortcut('deleteSelection', removeLayerSelection),
    defineShortcut('deleteSelection', removeLayerSelection, {
      id: `${EDITOR_SHORTCUT_CATALOG.deleteSelection.id}-backspace`,
      keys: 'backspace',
    }),
  ]);

  // 工具栏分组单一来源：桌面端标题栏平铺到各自胶囊，窄屏收进各自的图标菜单。
  const insertionActionItems: EditorToolbarOverflowItem[] = insertionSupported
    ? [
        {
          id: 'prepend',
          icon: 'first_page',
          label: '反向追加模式（[）',
          active: insertionMode === 'prepend',
          onClick: () => setInsertionMode('prepend'),
        },
        {
          id: 'append',
          icon: 'last_page',
          label: '追加模式（]）',
          active: insertionMode === 'append',
          onClick: () => setInsertionMode('append'),
        },
        {
          id: 'nearest',
          icon: 'conversion_path',
          label: '就近模式（\\）',
          active: insertionMode === 'nearest',
          onClick: () => setInsertionMode('nearest'),
        },
      ]
    : [];

  const historyActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'undo',
      icon: 'undo',
      label: insertionMode === 'prepend' ? '撤销首个控制点' : '撤销末控制点',
      disabled: !removable,
      onClick: undoCoordinate,
    },
  ];

  const locationActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'location',
      icon: 'my_location',
      label: draft.type === 'Point' ? '使用当前位置' : '追加当前位置',
      onClick: () => locationProxyRef.current?.querySelector('button')?.click(),
    },
  ];

  const renderPoiToolbar = (variant: 'full' | 'compact', inHeader: boolean) => (
    <EditorToolbar
      activeToolId={tool}
      ariaLabel="几何编辑工具"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={(nextTool) => setTool(nextTool as 'pan' | 'select' | 'draw')}
      sections={buildEditorToolbarSections({
        variant,
        tools: geometryTools,
        toolsAriaLabel: '几何编辑工具',
        compactAriaLabel: '几何编辑操作',
        groups: [
          ...(insertionSupported
            ? [{ id: 'insertion', ariaLabel: '插入模式', items: insertionActionItems }]
            : []),
          { id: 'history', ariaLabel: '历史', items: historyActionItems },
          { id: 'location', ariaLabel: '定位', items: locationActionItems },
        ],
      })}
    />
  );

  return (
    <div
      className={`poi-visual-workspace is-tool-${tool}${panelStateClass}${
        spacePressed ? ' is-space-pan' : ''
      }${selectedPoint ? ' is-point-selected' : ''}${layerSelection ? ' has-layer-selection' : ''}`}
    >
      <div
        className="poi-visual-map-stage"
        ref={stageRef}
        role="application"
        aria-label={`${entityLabel}几何地图编辑`}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        <PoiAuditTileLayer
          bounds={preview.bounds}
          tilePreviewConfig={tilePreviewConfig}
          viewport={viewportSize}
        />
        <svg
          viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            className="admin-poi-audit-map-grid"
            x="0"
            y="0"
            width={viewportSize.width}
            height={viewportSize.height}
          />
          <PoiShapeLayer
            className="admin-poi-audit-map-submission-shape"
            height={viewportSize.height}
            preview={preview}
            width={viewportSize.width}
          />
          {preview.lines.map((line, index) => (
            <polyline
              className="admin-poi-audit-map-submission-line"
              key={`workspace-line-${index}`}
              points={line}
            />
          ))}
          {preview.contextMarkers.map((marker) => (
            <g
              className={`admin-poi-audit-map-context-marker is-${marker.relation}`}
              key={marker.marker.id}
              transform={`translate(${roundPreviewValue(marker.point[0])} ${roundPreviewValue(marker.point[1])})`}
            >
              <circle r="7" />
              <title>{marker.marker.label}</title>
            </g>
          ))}
          {preview.points.map((point, index) => (
            <g
              className={`admin-poi-geometry-map-node${index === selectedFlatPointIndex ? ' is-selected' : ''}`}
              data-poi-node-index={index}
              key={`workspace-point-${index}`}
              transform={`translate(${roundPreviewValue(point[0])} ${roundPreviewValue(point[1])})`}
            >
              <circle r="11" />
              <text x="15" y="5">
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="poi-visual-rail-proxy" ref={locationProxyRef} aria-hidden="true">
        <CurrentPlayerLocationButton
          title={draft.type === 'Point' ? '使用当前绑定玩家的位置' : '追加当前绑定玩家的位置'}
          onUse={(coordinate) => addCoordinate(coordinate)}
        />
      </div>

      <EditorRailBridge
        activeToolId={tool}
        ownerId="poi-geometry-editor"
        panels={{ visible: panelsVisible, onToggle: togglePanels }}
        sections={[
          ...(insertionSupported
            ? [{ id: 'insertion', priority: 50, items: insertionActionItems }]
            : []),
          { id: 'history', priority: 70, items: historyActionItems },
          { id: 'location', priority: 60, items: locationActionItems },
        ]}
        tools={geometryTools}
        onToolChange={(toolId) => setTool(toolId as 'pan' | 'select' | 'draw')}
      />

      {panelsVisible ? (
        <aside className="poi-visual-layer-panel" aria-label="图层与控制点">
          <EditorPanelHeading
            meta={`${geometryLabelFromDraft(draft)} · ${preview.points.length} 个控制点`}
            title="图层"
          >
            <EditorInspectorEntry onOpen={openInspector} />
          </EditorPanelHeading>
          <div className="poi-visual-layer-body" ref={layerBodyRef}>
            {layerStatus ? (
              <p className="transit-visual-panel-status" role="status">
                {layerStatus}
              </p>
            ) : null}
            {layerRoot ? (
              <div className={`poi-visual-layer-row${layerSelection ? '' : ' is-active'}`}>
                <button
                  aria-pressed={!layerSelection}
                  className="poi-visual-layer-group"
                  type="button"
                  onClick={() => setLayerSelection(null)}
                  onDoubleClick={() => {
                    setLayerSelection(null);
                    focusInspector();
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {layerRoot.icon}
                  </span>
                  <span className="poi-visual-layer-label">{layerRoot.label}</span>
                  {layerRoot.meta ? (
                    <span className="poi-visual-layer-count">{layerRoot.meta}</span>
                  ) : null}
                </button>
              </div>
            ) : null}
            {layerGroups.length === 0 ? (
              <p className="poi-visual-panel-empty">当前几何没有可列出的控制点。</p>
            ) : (
              <ul className="poi-visual-layer-tree">
                {layerGroups.map((group) => {
                  const groupSelected =
                    layerSelection?.path === group.path && layerSelection.index === null;
                  return (
                    <li key={group.path}>
                      <div className={`poi-visual-layer-row${groupSelected ? ' is-active' : ''}`}>
                        <button
                          aria-pressed={groupSelected}
                          className="poi-visual-layer-group"
                          type="button"
                          onClick={() => selectLayerGroup(group.path)}
                          onDoubleClick={() => {
                            selectLayerGroup(group.path);
                            focusInspector();
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {group.icon}
                          </span>
                          <span className="poi-visual-layer-label">{group.label}</span>
                          <span className="poi-visual-layer-count">{group.points.length}</span>
                        </button>
                        <PoiLayerRowActions
                          canDuplicate={group.canDuplicate}
                          canMoveDown={group.canMoveDown}
                          canMoveUp={group.canMoveUp}
                          canRemove={group.canRemove}
                          onDuplicate={() => duplicateSelectedGroup(group.path)}
                          onMoveDown={() => moveSelectedGroup(1, group.path)}
                          onMoveUp={() => moveSelectedGroup(-1, group.path)}
                          onRemove={() => removeSelectedGroup(group.path)}
                        />
                      </div>
                      {group.points.length > 0 ? (
                        <ul className="poi-visual-layer-points">
                          {group.points.map((point, index) => {
                            const pointSelected =
                              layerSelection?.path === group.path && layerSelection.index === index;
                            return (
                              <li key={index}>
                                <div
                                  className={`poi-visual-layer-row${pointSelected ? ' is-active' : ''}`}
                                >
                                  <button
                                    aria-pressed={pointSelected}
                                    className="poi-visual-layer-point"
                                    type="button"
                                    onClick={() => selectLayerPoint(group.path, index)}
                                    onDoubleClick={() => {
                                      selectLayerPoint(group.path, index);
                                      focusInspector();
                                    }}
                                  >
                                    <span className="poi-visual-layer-index">{index + 1}</span>
                                    <span className="poi-visual-layer-coordinate">
                                      {formatDraftCoordinatePair(point)}
                                    </span>
                                  </button>
                                  {draft.type === 'Rectangle' ||
                                  draft.type === 'MultiRectangle' ? null : (
                                    <PoiLayerRowActions
                                      canDuplicate
                                      canMoveDown={index < group.points.length - 1}
                                      canMoveUp={index > 0}
                                      canRemove={group.points.length > selectedRingMinPoints}
                                      onDuplicate={() => duplicatePointAt(group.path, index)}
                                      onInsert={() => insertPointAt(group.path, index)}
                                      onMoveDown={() => movePointAt(group.path, index, 1)}
                                      onMoveUp={() => movePointAt(group.path, index, -1)}
                                      onRemove={() => removePointAt(group.path, index)}
                                    />
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {draft.type === 'MultiPoint' || draft.type === 'LineString' ? (
            <div className="poi-visual-layer-footer">
              <button disabled={!editingRing} type="button" onClick={appendPointToSelectedRing}>
                添加点
              </button>
              <button disabled={!editingRing} type="button" onClick={reverseSelectedRing}>
                反转点序
              </button>
            </div>
          ) : null}
          {draft.type === 'Polygon' || draft.type === 'MultiPolygon' ? (
            <div className="poi-visual-layer-footer">
              <button type="button" onClick={addRingToPolygon}>
                添加减去图形
              </button>
              {draft.type === 'MultiPolygon' ? (
                <button type="button" onClick={addPolygon}>
                  添加多边形
                </button>
              ) : null}
              <button disabled={!editingRing} type="button" onClick={reverseSelectedRing}>
                反转点序
              </button>
            </div>
          ) : null}
          {draft.type === 'MultiRectangle' ? (
            <div className="poi-visual-layer-footer">
              <button type="button" onClick={addRectangle}>
                添加矩形
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}

      {panelsVisible ? (
        <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
          <EditorPanelHeading
            meta={
              layerSelection
                ? inspectorSubtitle
                : `${geometryLabelFromDraft(draft)} · ${preview.points.length} 个控制点`
            }
            title={layerSelection ? '属性' : '全局属性'}
          >
            <button
              aria-label="返回图层"
              className="poi-visual-inspector-back"
              onClick={() => {
                setLayerSelection(null);
                closeInspector();
              }}
              title="返回图层"
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_back
              </span>
            </button>
          </EditorPanelHeading>
          <div className="poi-visual-coordinate-panel-body">
            <Field label={<>POI 形式</>}>
              <Select
                value={draft.type}
                onChange={(event) =>
                  onChange(
                    createEmptyPoiGeometryDraft(
                      event.currentTarget.value as PoiGeometryDraft['type'],
                      getGeometryDraftRepresentativeCoordinate(draft),
                    ),
                  )
                }
              >
                {(
                  draftTypeOptions ?? [
                    { value: 'Point', label: '点状 POI' },
                    { value: 'MultiPoint', label: '多点对象' },
                    { value: 'LineString', label: '道路 / 线性 POI' },
                    { value: 'Rectangle', label: '矩形区域' },
                    { value: 'MultiRectangle', label: '多矩形区域' },
                    { value: 'Polygon', label: '多边形区域' },
                    { value: 'MultiPolygon', label: '多重多边形区域' },
                  ]
                ).map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.type === 'MultiRectangle' && draft.rectangles.length > 1 ? (
              <Field label={<>当前矩形</>}>
                <Select
                  value={String(clamp(rectangleIndex, 0, draft.rectangles.length - 1))}
                  onChange={(event) => setRectangleIndex(Number(event.currentTarget.value))}
                >
                  {draft.rectangles.map((_, index) => (
                    <option value={index} key={index}>{`矩形 ${index + 1}`}</option>
                  ))}
                </Select>
              </Field>
            ) : ringOptions.length > 1 ? (
              <Field label={<>{draft.type === 'MultiPolygon' ? '当前多边形 / 环' : '当前边界'}</>}>
                <Select
                  value={effectiveRingTargetValue}
                  onChange={(event) => setRingTargetValue(event.currentTarget.value)}
                >
                  {ringOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {draft.type === 'Point' ? (
              <div className="poi-visual-point-fields">
                <Field label={<>X</>}>
                  <Input
                    inputMode="decimal"
                    value={draft.coordinate.x}
                    onChange={(event) =>
                      onChange({
                        type: 'Point',
                        coordinate: { ...draft.coordinate, x: event.currentTarget.value },
                      })
                    }
                  />
                </Field>
                <Field label={<>Y</>}>
                  <Input
                    inputMode="decimal"
                    value={pointYText}
                    placeholder="继承默认"
                    onChange={(event) => onPointYChange(event.currentTarget.value)}
                  />
                </Field>
                <Field label={<>Z</>}>
                  <Input
                    inputMode="decimal"
                    value={draft.coordinate.z}
                    onChange={(event) =>
                      onChange({
                        type: 'Point',
                        coordinate: { ...draft.coordinate, z: event.currentTarget.value },
                      })
                    }
                  />
                </Field>
              </div>
            ) : selectedPoint && selectedPointIndex !== null && selectedLayerGroup ? (
              <>
                <div className="poi-visual-inspector-heading">
                  <strong>
                    {draft.type === 'Rectangle' || draft.type === 'MultiRectangle'
                      ? `顶点 ${selectedPointIndex + 1}`
                      : `点 ${selectedPointIndex + 1}`}
                  </strong>
                  <span>{`${selectedLayerGroup.label} · ${formatDraftCoordinatePair(selectedPoint)}`}</span>
                </div>
                <div
                  className="poi-visual-point-fields"
                  style={
                    showCoordinateY || draft.type === 'Rectangle' || draft.type === 'MultiRectangle'
                      ? undefined
                      : { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
                  }
                >
                  <Field label={<>X</>}>
                    <Input
                      inputMode="decimal"
                      value={selectedPoint.x}
                      onChange={(event) => updateSelectedPoint({ x: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label={<>Z</>}>
                    <Input
                      inputMode="decimal"
                      value={selectedPoint.z}
                      onChange={(event) => updateSelectedPoint({ z: event.currentTarget.value })}
                    />
                  </Field>
                  {showCoordinateY &&
                  draft.type !== 'Rectangle' &&
                  draft.type !== 'MultiRectangle' ? (
                    <Field label={<>高度 Y</>}>
                      <Input
                        inputMode="decimal"
                        placeholder="继承默认"
                        value={selectedPoint.y ?? ''}
                        onChange={(event) => updateSelectedPoint({ y: event.currentTarget.value })}
                      />
                    </Field>
                  ) : null}
                </div>
              </>
            ) : selectedLayerGroup ? (
              <>
                <div className="poi-visual-inspector-heading">
                  <strong>{selectedLayerGroup.label}</strong>
                  <span>{`${selectedLayerGroup.points.length} 个控制点`}</span>
                </div>
                {showGroupStructureActions ? (
                  <div className="poi-visual-inspector-actions">
                    {draft.type === 'Polygon' || draft.type === 'MultiPolygon' ? (
                      <button type="button" onClick={addRingToPolygon}>
                        添加减去图形
                      </button>
                    ) : null}
                    {draft.type === 'MultiPolygon' ? (
                      <button type="button" onClick={addPolygon}>
                        添加多边形
                      </button>
                    ) : null}
                    {draft.type === 'MultiRectangle' ? (
                      <button type="button" onClick={addRectangle}>
                        添加矩形
                      </button>
                    ) : null}
                    <button type="button" onClick={() => duplicateSelectedGroup()}>
                      创建副本
                    </button>
                    <button
                      type="button"
                      disabled={!selectedLayerGroup.canMoveUp}
                      onClick={() => moveSelectedGroup(-1)}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      disabled={!selectedLayerGroup.canMoveDown}
                      onClick={() => moveSelectedGroup(1)}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      disabled={!selectedLayerGroup.canRemove}
                      onClick={() => removeSelectedGroup()}
                    >
                      移除
                    </button>
                    {draft.type === 'Polygon' || draft.type === 'MultiPolygon' ? (
                      <button type="button" onClick={reverseSelectedRing}>
                        反转点序
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <p className="poi-visual-panel-empty">
                  {draft.type === 'Rectangle' || draft.type === 'MultiRectangle'
                    ? '在左侧选择矩形的 4 个顶点之一编辑坐标；修改顶点会同步更新它所在的两条边。'
                    : '在左侧图层树选择具体控制点后编辑坐标；结构操作集中在图层树底部的按钮区。'}
                </p>
              </>
            ) : (
              <>
                <div className="poi-visual-inspector-heading">
                  <strong>全局</strong>
                  <span>{geometryLabelFromDraft(draft)}</span>
                </div>
                <dl className="poi-visual-global-summary">
                  <div>
                    <dt>控制点</dt>
                    <dd>{`${preview.points.length} 个`}</dd>
                  </div>
                  <div>
                    <dt>包围盒</dt>
                    <dd>{geometrySizeLabel}</dd>
                  </div>
                </dl>
                {globalFields}
                <p className="poi-visual-panel-empty">
                  在画布或图层树中单击选中，双击直接进入编辑。
                </p>
              </>
            )}
          </div>
        </aside>
      ) : null}

      <EditorHeaderToolsPortal>
        <EditorHeaderToolbar
          compact={renderPoiToolbar('compact', true)}
          full={renderPoiToolbar('full', true)}
        />
      </EditorHeaderToolsPortal>

      {renderPoiToolbar('compact', false)}

      <EditorZoomControls
        scale={zoomScale}
        onZoomIn={() => zoom(0.8)}
        onZoomOut={() => zoom(1.25)}
        onFit={() => setViewBounds(fitPoiAuditBoundsToViewport(autoPreview.bounds, viewportSize))}
      />
    </div>
  );
}

/** 区划工作台使用的区域几何草稿：与 POI 几何共用同一套草稿与渲染内核。 */
export type RegionGeometryDraft = Extract<
  PoiGeometryDraft,
  { type: 'Rectangle' | 'MultiRectangle' | 'Polygon' | 'MultiPolygon' }
>;

const regionGeometryDraftTypeOptions: Array<{
  label: string;
  value: PoiGeometryDraft['type'];
}> = [
  { value: 'Rectangle', label: '矩形区域' },
  { value: 'MultiRectangle', label: '多矩形区域' },
  { value: 'Polygon', label: '多边形区域' },
  { value: 'MultiPolygon', label: '多重多边形区域' },
];

/**
 * 区划几何工作台：直接复用 POI 几何内核（工具胶囊、图层树、检查器、遮罩挖洞），
 * 只把几何类型限制在区域几何，并通过槽位注入区划字段与业务根节点。
 */
export function RegionGeometryWorkspace({
  draft,
  entityLabel,
  globalFields,
  layerRoot,
  layerStatus,
  onChange,
  tilePreviewConfig,
}: Readonly<{
  draft: RegionGeometryDraft;
  entityLabel: string;
  globalFields?: ReactNode;
  layerRoot?: { icon: string; label: string; meta?: string };
  layerStatus?: string;
  onChange: (draft: RegionGeometryDraft) => void;
  tilePreviewConfig: PoiTilePreviewConfig;
}>) {
  return (
    <PoiStandaloneGeometryWorkspace
      contextMarkers={[]}
      draft={draft}
      draftTypeOptions={regionGeometryDraftTypeOptions}
      entityLabel={entityLabel}
      globalFields={globalFields}
      layerRoot={layerRoot}
      layerStatus={layerStatus}
      onChange={(next) => onChange(next as RegionGeometryDraft)}
      onPointYChange={() => undefined}
      pointYText=""
      showCoordinateY={false}
      showGroupStructureActions
      tilePreviewConfig={tilePreviewConfig}
    />
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
            <label>
              <span>高度 Y</span>
              <input
                inputMode="decimal"
                value={coordinate.y ?? ''}
                onChange={(event) => updateCoordinate(index, { y: event.currentTarget.value })}
                placeholder="继承默认"
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
            <span>{index === 0 ? '外边界' : `减去图形 ${index}`}</span>
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
          添加减去图形
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

interface PoiCategoryDraft {
  id: string;
  name: string;
  acceptsPublicSubmissions: boolean;
  sortOrder: number;
  defaultIconFileName: string;
  iconFileNamesText: string;
  /** 地图区域标记的语义色；留空表示沿用内置分类色。 */
  color: string;
}

function AdminPoiIconPicker({
  defaultIconFileName,
  disabled,
  hidden,
  iconBaseUrl,
  onChange,
  onHiddenChange,
  options,
  value,
}: Readonly<{
  defaultIconFileName?: string;
  disabled: boolean;
  /** 是否「不使用图标」：地图上只显示居中的名称标签。 */
  hidden: boolean;
  iconBaseUrl: string;
  onChange: (value: string) => void;
  onHiddenChange: (hidden: boolean) => void;
  options: string[];
  value: string;
}>) {
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/admin/map/poi-category-icons'), { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          items?: Array<{ fileName: string; displayName: string }>;
        };
        if (!response.ok || cancelled) {
          return;
        }
        setDisplayNames(
          Object.fromEntries((data.items ?? []).map((item) => [item.fileName, item.displayName])),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedOptions = Array.from(new Set(options));
  const defaultPreview = defaultIconFileName || normalizedOptions[0];
  return (
    <fieldset className="admin-poi-icon-picker" disabled={disabled}>
      <legend>展示图标</legend>
      <div className="admin-poi-icon-picker-grid">
        <button
          className={
            !value && !hidden ? 'admin-poi-icon-option is-selected' : 'admin-poi-icon-option'
          }
          type="button"
          aria-pressed={!value && !hidden}
          onClick={() => {
            onChange('');
            onHiddenChange(false);
          }}
        >
          {defaultPreview ? (
            <img src={toMarkerIconUrl(defaultPreview, iconBaseUrl)} alt="" draggable={false} />
          ) : (
            <span className="material-symbols-outlined" aria-hidden="true">
              category
            </span>
          )}
          <span>跟随分类默认</span>
        </button>
        <button
          className={hidden ? 'admin-poi-icon-option is-selected' : 'admin-poi-icon-option'}
          type="button"
          aria-pressed={hidden}
          title="地图上只显示名称标签"
          onClick={() => onHiddenChange(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            visibility_off
          </span>
          <span>不使用图标</span>
        </button>
        {normalizedOptions.map((iconValue) => {
          const iconKey = getPoiCategoryIconMetadataKey(iconValue);
          const displayName =
            (iconKey ? displayNames[iconKey] : undefined) ??
            getDefaultPoiCategoryIconDisplayName(iconValue);
          return (
            <button
              className={
                !hidden && value === iconValue
                  ? 'admin-poi-icon-option is-selected'
                  : 'admin-poi-icon-option'
              }
              type="button"
              aria-pressed={!hidden && value === iconValue}
              title={`${displayName} · ${iconValue}`}
              key={iconValue}
              onClick={() => {
                onChange(iconValue);
                onHiddenChange(false);
              }}
            >
              <img src={toMarkerIconUrl(iconValue, iconBaseUrl)} alt="" draggable={false} />
              <span>{displayName}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
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
  const [renamingIconKey, setRenamingIconKey] = useState<string | null>(null);
  const [iconDisplayNames, setIconDisplayNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(createCategoryDrafts(categories));
  }, [categories]);

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/admin/map/poi-category-icons'), { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          items?: Array<{ fileName: string; displayName: string }>;
        };
        if (!response.ok || cancelled) {
          return;
        }
        setIconDisplayNames(
          Object.fromEntries((data.items ?? []).map((item) => [item.fileName, item.displayName])),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

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
      const invalidDraft = drafts.find((draft) => {
        const iconFileNames = splitIconFileNames(draft.iconFileNamesText);
        return (
          !draft.id.trim() ||
          iconFileNames.length === 0 ||
          !iconFileNames.includes(draft.defaultIconFileName.trim())
        );
      });
      if (invalidDraft) {
        setLocalStatus(`分类 ${invalidDraft.id || '未命名'} 必须先配置至少一个真实图标文件。`);
        return;
      }
      const invalidColor = drafts.find(
        (draft) =>
          draft.color.trim() && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(draft.color.trim()),
      );
      if (invalidColor) {
        setLocalStatus(`分类 ${invalidColor.id} 的地图色必须是 #RRGGBB 或 #RRGGBBAA。`);
        return;
      }
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
      const data = (await response.json()) as {
        displayName?: string;
        iconUrl?: string;
        message?: string;
      };
      if (!response.ok || !data.iconUrl) {
        setLocalStatus(data.message ?? '图标上传失败');
        return;
      }

      const iconUrl = data.iconUrl;
      const iconKey = getPoiCategoryIconMetadataKey(iconUrl);
      if (iconKey) {
        setIconDisplayNames((current) => ({
          ...current,
          [iconKey]: data.displayName ?? getDefaultPoiCategoryIconDisplayName(file.name),
        }));
      }
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

  const renameCategoryIcon = async (iconValue: string) => {
    const iconKey = getPoiCategoryIconMetadataKey(iconValue);
    const displayName = iconKey ? iconDisplayNames[iconKey]?.trim() : '';
    if (!iconKey || !displayName) {
      setLocalStatus('图标显示名称不能为空。');
      return;
    }

    setRenamingIconKey(iconKey);
    setLocalStatus('');
    try {
      const response = await fetch(appPath('/api/admin/map/poi-category-icons'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iconFileName: iconValue, displayName }),
      });
      const data = (await response.json()) as { displayName?: string; message?: string };
      if (!response.ok || !data.displayName) {
        setLocalStatus(data.message ?? '图标重命名失败');
        return;
      }
      setIconDisplayNames((current) => ({ ...current, [iconKey]: data.displayName! }));
      setLocalStatus(`已将图标命名为：${data.displayName}`);
      publishAdminDataChanged({
        resource: 'poi',
        reason: 'record_updated',
        occurredAt: new Date().toISOString(),
      });
    } finally {
      setRenamingIconKey(null);
    }
  };

  const deleteCategoryIcon = async (categoryId: string, iconValue: string) => {
    const uploadedFileName = extractUploadedPoiIconFileName(iconValue);
    if (!uploadedFileName) {
      setLocalStatus('只能删除通过后台上传的运行时图标。');
      return;
    }

    if (
      !(await requestConfirmation(
        `确认删除图标 ${uploadedFileName}？这会同步移除分类配置中的引用。`,
      ))
    ) {
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
      setIconDisplayNames((current) => {
        const next = { ...current };
        delete next[deletedFileName];
        return next;
      });
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
    <Modal
      labelledBy="admin-poi-category-title"
      className="admin-poi-category-dialog"
      onBackdropClick={onClose}
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
        {!selectedCategoryId && !drafts.some((draft) => draft.id === 'water') ? (
          <button
            type="button"
            disabled={isSaving || isBusy}
            onClick={() =>
              setDrafts((current) => [
                ...current,
                {
                  id: 'water',
                  name: '水域',
                  acceptsPublicSubmissions: true,
                  sortOrder: 20,
                  defaultIconFileName: '',
                  iconFileNamesText: '',
                  color: '',
                },
              ])
            }
          >
            新增水域分类
          </button>
        ) : null}
      </div>
      <div className="admin-poi-category-grid">
        {visibleDrafts.map((draft) => (
          <article className="admin-poi-category-row" key={draft.id}>
            <PoiCategoryIcon category={categoryDraftToPreview(draft)} iconBaseUrl={iconBaseUrl} />
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
            <label className="admin-poi-category-color">
              <span>地图色</span>
              <span className="admin-poi-category-color-field">
                <input
                  value={draft.color}
                  placeholder="#3f8f5b"
                  onChange={(event) => updateDraft(draft.id, { color: event.currentTarget.value })}
                />
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: draft.color.trim() || '#9aa8a4' }}
                />
              </span>
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
                const iconKey = getPoiCategoryIconMetadataKey(iconValue);
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
                    <span className="admin-poi-category-icon-identity">
                      <input
                        aria-label={`${iconValue} 的显示名称`}
                        value={
                          (iconKey ? iconDisplayNames[iconKey] : undefined) ??
                          getDefaultPoiCategoryIconDisplayName(iconValue)
                        }
                        maxLength={80}
                        onChange={(event) => {
                          if (!iconKey) {
                            return;
                          }
                          const displayName = event.currentTarget.value;
                          setIconDisplayNames((current) => ({
                            ...current,
                            [iconKey]: displayName,
                          }));
                        }}
                      />
                      <code title={iconValue}>{iconValue}</code>
                    </span>
                    {isDefault ? <small>默认</small> : null}
                    <button
                      type="button"
                      disabled={!iconKey || renamingIconKey === iconKey}
                      onClick={() => void renameCategoryIcon(iconValue)}
                    >
                      {renamingIconKey === iconKey ? '保存中' : '保存名称'}
                    </button>
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
            <CheckboxRow
              className="admin-poi-category-checkbox"
              checked={draft.acceptsPublicSubmissions}
              onChange={(event) =>
                updateDraft(draft.id, {
                  acceptsPublicSubmissions: event.currentTarget.checked,
                })
              }
              label="允许公开投稿"
            />
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
    </Modal>
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
  imageReviews,
  isBusy,
  onReview,
  submission,
}: Readonly<{
  imageReviews: PoiSubmissionImageReview[];
  isBusy: boolean;
  onReview: (imageUrl: string, decision: PoiSubmissionImageReviewInput) => void;
  submission: AdminPoiSubmission;
}>) {
  const imageUrls = getPoiImageUrls(submission);
  if (imageUrls.length === 0) {
    return null;
  }

  return (
    <div className="admin-poi-image-preview-list">
      {imageUrls.map((sourceImageUrl, index) => {
        const imageUrl = resolvePoiSubmissionImageUrl(sourceImageUrl);
        const imageReview = imageReviews.find((review) => review.imageUrl === sourceImageUrl);
        const metadata = submission.imageMetadataByUrl?.[sourceImageUrl];
        return (
          <article className="admin-poi-image-preview" key={sourceImageUrl}>
            <a href={imageUrl} target="_blank" rel="noreferrer">
              <ProgressiveImage
                src={imageUrl}
                alt={`${submission.title} 投稿图片 ${index + 1}`}
                loading="lazy"
                decoding="async"
              />
            </a>
            <div className="admin-poi-image-preview-copy">
              <div className="admin-poi-image-preview-heading">
                <span className="admin-poi-image-preview-title">
                  投稿图片 {index + 1} / {imageUrls.length}
                </span>
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
                  {sourceImageUrl.startsWith('/')
                    ? '本地图片元数据暂不可用'
                    : '外部图片链接，无法读取本地元数据'}
                </small>
              )}
              <div className="admin-poi-image-review-actions">
                {imageReview ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onReview(sourceImageUrl, 'unreviewed')}
                  >
                    重置图片审核
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onReview(sourceImageUrl, 'approved')}
                    >
                      图片可用
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onReview(sourceImageUrl, 'rejected')}
                    >
                      图片不合格
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function resolvePoiSubmissionImageUrl(value: string): string {
  return value.startsWith('/') ? appPath(value) : value;
}

function getPoiImageUrls(value: { imageUrls?: string[]; imageUrl?: string }): string[] {
  return normalizePoiImageUrlList([
    ...(value.imageUrls ?? []),
    ...(value.imageUrl ? [value.imageUrl] : []),
  ]);
}

function getPoiImageReviews(
  submission: PoiSubmission,
  imageReviewByKey: Map<string, PoiSubmissionImageReview>,
): PoiSubmissionImageReview[] {
  return getPoiImageUrls(submission)
    .map((imageUrl) => imageReviewByKey.get(imageReviewKey(submission.id, imageUrl)))
    .filter((review): review is PoiSubmissionImageReview => Boolean(review));
}

function hasRejectedPoiImage(
  submission: PoiSubmission,
  imageReviewByKey: Map<string, PoiSubmissionImageReview>,
): boolean {
  return getPoiImageReviews(submission, imageReviewByKey).some(
    (review) => review.decision === 'rejected',
  );
}

function normalizePoiImageUrlList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
}

function moveListItem(values: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= values.length ||
    toIndex < 0 ||
    toIndex >= values.length
  ) {
    return values;
  }
  const next = [...values];
  const [item] = next.splice(fromIndex, 1);
  if (item !== undefined) {
    next.splice(toIndex, 0, item);
  }
  return next;
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

interface PolygonGroupPaths {
  /** 外边界路径。 */
  outer: string;
  /** 减去图形路径；渲染时通过遮罩从外边界中挖掉。 */
  holes: string[];
}

interface GeometryPreviewModel {
  points: Array<[number, number]>;
  lines: string[];
  polygons: string[];
  /** 每个多边形一条外边界 + 若干减去图形。 */
  polygonGroups: PolygonGroupPaths[];
}

/** 把投影后的环转换成 SVG 路径片段。 */
function ringToPathData(points: Array<[number, number]>): string {
  return `M${points
    .map(([x, y]) => `${roundPreviewValue(x)},${roundPreviewValue(y)}`)
    .join(' L')} Z`;
}

interface PoiAuditMapBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface PoiAuditMapPreviewModel extends GeometryPreviewModel {
  bounds: PoiAuditMapBounds;
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

  const polygonGroups = buildPolygonGroupPaths(getGeometryPolygonRingGroups(geometry), project);

  return {
    bounds,
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    lines,
    points,
    polygons,
    polygonGroups,
  };
}

/** 把「一个多边形一组环」拆成外边界与减去图形路径。 */
function buildPolygonGroupPaths(
  groups: Array<Array<Array<[number, number]>>>,
  project: (coordinate: [number, number]) => [number, number],
): PolygonGroupPaths[] {
  return groups
    .map((rings) => {
      const paths = rings
        .filter((ring) => ring.length >= 3)
        .map((ring) => ringToPathData(ring.map(project)));
      if (paths.length === 0) {
        return null;
      }
      return { outer: paths[0], holes: paths.slice(1) };
    })
    .filter((value): value is PolygonGroupPaths => value !== null);
}

/**
 * 多边形填充层：先画外边界，再用遮罩扣掉减去图形。
 * 这样即使减去图形有一部分伸到外边界之外，也不会被填充成“负面积”。
 */
function PoiShapeLayer({
  className,
  height,
  preview,
  width,
}: Readonly<{
  className: string;
  height: number | string;
  preview: GeometryPreviewModel;
  width: number | string;
}>) {
  const maskPrefix = useId().replace(/[:]/g, '');
  if (preview.polygonGroups.length === 0) {
    return null;
  }
  return (
    <>
      <defs>
        {preview.polygonGroups.map((group, index) => (
          <mask
            id={`${maskPrefix}-hole-${index}`}
            key={`shape-mask-${index}`}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <path d={group.outer} fill="#fff" />
            {group.holes.map((hole, holeIndex) => (
              <path d={hole} fill="#000" key={`shape-hole-${holeIndex}`} />
            ))}
          </mask>
        ))}
      </defs>
      {preview.polygonGroups.map((group, index) => (
        <path
          className={className}
          d={group.outer}
          key={`shape-${index}`}
          mask={`url(#${maskPrefix}-hole-${index})`}
        />
      ))}
    </>
  );
}

function buildPoiGeometryDraftMapPreview(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
  contextMarkers: PoiAuditContextMarker[],
  viewBounds?: PoiAuditMapBounds,
  viewport?: PoiMapViewport,
): PoiAuditMapPreviewModel {
  const coordinateSets = getPoiGeometryDraftCoordinateSets(draft);
  const draftCoordinates = coordinateSets.flatMap((set) => set.coordinates);
  const contextCoordinates = contextMarkers.map((item) => item.coordinate);
  const allCoordinates = [...draftCoordinates, ...contextCoordinates];
  const bounds =
    viewBounds ??
    expandCoordinateBounds(
      getCoordinateBounds(allCoordinates.length > 0 ? allCoordinates : [[0, 0]]),
      120,
    );
  const project = (coordinate: [number, number]) =>
    projectAuditMapPreviewCoordinate(coordinate, bounds, viewport);
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

  const polygonGroups = buildPolygonGroupPaths(getDraftPolygonRingGroups(draft), project);

  return {
    bounds,
    contextMarkers: contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    lines,
    points,
    polygons,
    polygonGroups,
  };
}

/** 按「一个多边形一组环」整理草稿，用于 evenodd 复合路径。 */
function getDraftPolygonRingGroups(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
): Array<Array<Array<[number, number]>>> {
  if (draft.type === 'Polygon') {
    return [draft.rings.map(parseValidCoordinateDrafts)];
  }
  if (draft.type === 'MultiPolygon') {
    return draft.polygons.map((polygon) => polygon.map(parseValidCoordinateDrafts));
  }
  if (draft.type === 'Rectangle') {
    const bounds = parseRectangleBoundsDraft(draft.bounds);
    return bounds ? [[rectangleBoundsToCoordinates(bounds)]] : [];
  }
  if (draft.type === 'MultiRectangle') {
    return draft.rectangles.flatMap((item) => {
      const bounds = parseRectangleBoundsDraft(item);
      return bounds ? [[rectangleBoundsToCoordinates(bounds)]] : [];
    });
  }
  return [];
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
  fallbackUrl?: string;
  freshUrl?: string;
  id: string;
  left: number;
  top: number;
}

const poiAuditPreviewWidth = 220;
const poiAuditPreviewHeight = 152;
const poiAuditPreviewPadding = 16;
const poiPreviewTileSize = 256;
const poiPreviewMinZoom = -7;
const poiPreviewMaxZoom = 3;

interface PoiMapViewport {
  height: number;
  width: number;
}

const poiAuditPreviewViewport: PoiMapViewport = {
  height: poiAuditPreviewHeight,
  width: poiAuditPreviewWidth,
};

function resolvePoiMapViewport(viewport?: PoiMapViewport): PoiMapViewport {
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
    return poiAuditPreviewViewport;
  }

  return viewport;
}

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
  viewport?: PoiMapViewport,
): PoiVisibleTile[] {
  if (!config.tileTemplate && !config.freshTileTemplate) {
    return [];
  }

  const { height: viewportHeight, width: viewportWidth } = resolvePoiMapViewport(viewport);
  const view = buildPoiAuditMapView(bounds, { height: viewportHeight, width: viewportWidth });
  const tileZoom = clampPoiPreviewTileZoom(Math.round(view.zoom), config.tileZoomRange);
  const tileScale = getPoiPreviewScale(tileZoom);
  const tileDisplaySize = poiPreviewTileSize * (view.scale / tileScale);
  const worldMinX = view.centerX - viewportWidth / (2 * view.scale);
  const worldMaxX = view.centerX + viewportWidth / (2 * view.scale);
  const worldMinZ = view.centerZ - viewportHeight / (2 * view.scale);
  const worldMaxZ = view.centerZ + viewportHeight / (2 * view.scale);
  const minTileX = Math.floor((worldMinX * tileScale) / poiPreviewTileSize) - 1;
  const maxTileX = Math.floor((worldMaxX * tileScale) / poiPreviewTileSize) + 1;
  const minTileZ = Math.floor((worldMinZ * tileScale) / poiPreviewTileSize) - 1;
  const maxTileZ = Math.floor((worldMaxZ * tileScale) / poiPreviewTileSize) + 1;
  const tiles: PoiVisibleTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      const hasFallbackTile =
        Boolean(config.tileTemplate) &&
        (!config.regionIndex || hasPoiPreviewTile(tileX, tileZ, tileZoom, config.regionIndex));
      if (!hasFallbackTile && !config.freshTileTemplate) {
        continue;
      }

      tiles.push({
        displaySize: tileDisplaySize,
        fallbackUrl: hasFallbackTile
          ? buildPoiPreviewTileUrl(config.tileTemplate!, tileZoom, tileX, tileZ)
          : undefined,
        freshUrl: config.freshTileTemplate
          ? buildPoiPreviewTileUrl(config.freshTileTemplate, tileZoom, tileX, tileZ)
          : undefined,
        id: `${tileZoom}:${tileX}:${tileZ}`,
        left:
          viewportWidth / 2 +
          (tileX * poiPreviewTileSize * view.scale) / tileScale -
          view.centerX * view.scale,
        top:
          viewportHeight / 2 +
          (tileZ * poiPreviewTileSize * view.scale) / tileScale -
          view.centerZ * view.scale,
      });
    }
  }

  return tiles;
}

function buildPoiTileStyle(tile: PoiVisibleTile, viewport?: PoiMapViewport) {
  const { height: viewportHeight, width: viewportWidth } = resolvePoiMapViewport(viewport);

  return {
    height: `${(tile.displaySize / viewportHeight) * 100}%`,
    left: `${(tile.left / viewportWidth) * 100}%`,
    top: `${(tile.top / viewportHeight) * 100}%`,
    width: `${(tile.displaySize / viewportWidth) * 100}%`,
  };
}

/** 把视图 bounds 调整到与视口同宽高比，避免 fit 投影在视口两侧留下无法命中的留白。 */
function fitPoiAuditBoundsToViewport(
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  viewport: PoiMapViewport,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  // 与 project/unproject 保持一致：可用区域要先扣掉四周内边距，否则仍会残留一圈无法命中的留白。
  const ratio = Math.max(
    0.2,
    (viewport.width - poiAuditPreviewPadding * 2) /
      Math.max(1, viewport.height - poiAuditPreviewPadding * 2),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const nextSpanX = Math.max(spanX, spanZ * ratio);
  const nextSpanZ = nextSpanX / ratio;
  return {
    maxX: centerX + nextSpanX / 2,
    maxZ: centerZ + nextSpanZ / 2,
    minX: centerX - nextSpanX / 2,
    minZ: centerZ - nextSpanZ / 2,
  };
}

function buildPoiAuditMapView(
  bounds: {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  },
  viewport?: PoiMapViewport,
): PoiAuditMapView {
  const { height: viewportHeight, width: viewportWidth } = resolvePoiMapViewport(viewport);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min(
    (viewportWidth - poiAuditPreviewPadding * 2) / spanX,
    (viewportHeight - poiAuditPreviewPadding * 2) / spanZ,
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

function clampPoiPreviewTileZoom(zoom: number, zoomRange?: TileZoomRange | null): number {
  if (zoomRange) {
    return clamp(zoom, zoomRange.minZoom, zoomRange.maxZoom);
  }

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

  return {
    points,
    lines,
    polygons,
    polygonGroups: buildPolygonGroupPaths(getGeometryPolygonRingGroups(geometry), project),
  };
}

/** 按「一个多边形一组环」整理已保存几何。 */
function getGeometryPolygonRingGroups(
  geometry: MapGeometry,
): Array<Array<Array<[number, number]>>> {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  if (geometry.type === 'Rectangle') {
    return [[rectangleBoundsToCoordinates(geometry.bounds)]];
  }
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.map((bounds) => [rectangleBoundsToCoordinates(bounds)]);
  }
  return [];
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

/** 几何入口卡片用的摘要：中点坐标 + 长度/面积 + 控制点数量。 */
function describePoiGeometry(geometry: MapGeometry | null): {
  center: string;
  detail: string;
} {
  if (!geometry) {
    return { center: '未设置', detail: '尚未填写坐标' };
  }

  const sets = getGeometryPreviewCoordinateSets(geometry);
  const coordinates = sets.flatMap((set) => set.coordinates);
  if (coordinates.length === 0) {
    return { center: '未设置', detail: '尚未填写坐标' };
  }

  const bounds = getCoordinateBounds(coordinates);
  const center = `${formatPoiGeometryMetric((bounds.minX + bounds.maxX) / 2)}, ${formatPoiGeometryMetric(
    (bounds.minZ + bounds.maxZ) / 2,
  )}`;
  const pointLabel = `${coordinates.length} 个控制点`;

  const polygonArea = sets
    .filter((set) => set.kind === 'polygon')
    .reduce((total, set) => total + Math.abs(getPolygonArea(set.coordinates)), 0);
  if (polygonArea > 0) {
    return { center, detail: `面积 ${formatPoiGeometryMetric(polygonArea)} 格 · ${pointLabel}` };
  }

  const lineLength = sets
    .filter((set) => set.kind === 'line')
    .reduce((total, set) => total + getPolylineLength(set.coordinates), 0);
  if (lineLength > 0) {
    return { center, detail: `长度 ${formatPoiGeometryMetric(lineLength)} 格 · ${pointLabel}` };
  }

  return { center, detail: pointLabel };
}

function getPolygonArea(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const [currentX, currentZ] = coordinates[index];
    const [nextX, nextZ] = coordinates[(index + 1) % coordinates.length];
    sum += currentX * nextZ - nextX * currentZ;
  }
  return sum / 2;
}

function getPolylineLength(coordinates: Array<[number, number]>): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [previousX, previousZ] = coordinates[index - 1];
    const [currentX, currentZ] = coordinates[index];
    total += Math.hypot(currentX - previousX, currentZ - previousZ);
  }
  return total;
}

function formatPoiGeometryMetric(value: number): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return String(rounded);
}

function describePoiIntroSummary(
  form: Pick<PoiSubmissionFormInput, 'description' | 'imageUrls'>,
): string {
  const descriptionLength = form.description.trim().length;
  const imageCount = form.imageUrls.filter((url) => url.trim()).length;
  return `${descriptionLength > 0 ? `${descriptionLength} 字简介` : '未填写简介'} · ${imageCount} 张图片`;
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
  viewport?: PoiMapViewport,
): [number, number] {
  const { height, width } = resolvePoiMapViewport(viewport);
  const padding = poiAuditPreviewPadding;
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
  viewport?: PoiMapViewport,
): [number, number] {
  const { height, width } = resolvePoiMapViewport(viewport);
  const padding = poiAuditPreviewPadding;
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

function scalePoiAuditBounds(bounds: PoiAuditMapBounds, factor: number): PoiAuditMapBounds {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfWidth = Math.max(1, ((bounds.maxX - bounds.minX) * factor) / 2);
  const halfHeight = Math.max(1, ((bounds.maxZ - bounds.minZ) * factor) / 2);
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minZ: centerZ - halfHeight,
    maxZ: centerZ + halfHeight,
  };
}

function scalePoiAuditBoundsAtCoordinate(
  bounds: PoiAuditMapBounds,
  factor: number,
  anchor: [number, number],
): PoiAuditMapBounds {
  return {
    minX: anchor[0] + (bounds.minX - anchor[0]) * factor,
    maxX: anchor[0] + (bounds.maxX - anchor[0]) * factor,
    minZ: anchor[1] + (bounds.minZ - anchor[1]) * factor,
    maxZ: anchor[1] + (bounds.maxZ - anchor[1]) * factor,
  };
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
  return (
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'published'
  );
}

function canDeletePoiSubmission(status: PoiSubmissionStatus): boolean {
  return status !== 'archived';
}

function getPoiEditDialogHint(status: PoiSubmissionStatus): string {
  if (status === 'draft') {
    return '当前为草稿：可继续在几何/简介工作台完善，确认后再提交审核。';
  }

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
  return /\b(road|roadpoint|highway|toll-gate)\b/.test(text);
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
      color: category.color ?? '',
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
    ...(draft.color.trim() ? { color: draft.color.trim() } : {}),
  };
}

function categoryDraftToPreview(draft: PoiCategoryDraft): PoiCategory | undefined {
  const iconFileNames = splitIconFileNames(draft.iconFileNamesText);
  const defaultIconFileName = draft.defaultIconFileName.trim() || iconFileNames[0];
  if (!defaultIconFileName || iconFileNames.length === 0) {
    return undefined;
  }
  return {
    id: draft.id,
    name: draft.name.trim() || draft.id,
    acceptsPublicSubmissions: draft.acceptsPublicSubmissions,
    sortOrder: Number.isFinite(draft.sortOrder) ? Math.max(0, Math.floor(draft.sortOrder)) : 0,
    iconMapping: {
      categoryId: draft.id,
      defaultIconFileName,
      iconFileNames: Array.from(new Set([defaultIconFileName, ...iconFileNames])),
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

function getPoiCategoryIconMetadataKey(value: string): string | null {
  return extractUploadedPoiIconFileName(value) ?? (value.trim() || null);
}

function getDefaultPoiCategoryIconDisplayName(value: string): string {
  const key = getPoiCategoryIconMetadataKey(value) ?? '未命名图标';
  const fileName = key.split('/').pop() ?? key;
  return fileName.replace(/\.[^.]+$/, '') || '未命名图标';
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

export function createPoiGeometryDraft(
  geometry: MapGeometry,
  coordinateY?: Array<number | null>,
): PoiGeometryDraft {
  let coordinateIndex = 0;
  const toDraftWithY = (coordinate: [number, number]): CoordinateDraft => {
    const y = coordinateY?.[coordinateIndex];
    coordinateIndex += 1;
    return { ...coordinateToDraft(coordinate), y: y === null || y === undefined ? '' : String(y) };
  };
  if (geometry.type === 'Point') {
    return {
      type: 'Point',
      coordinate: toDraftWithY(geometry.coordinates),
    };
  }

  if (geometry.type === 'MultiPoint') {
    return {
      type: 'MultiPoint',
      coordinates: geometry.coordinates.map(toDraftWithY),
    };
  }

  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map(toDraftWithY),
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
      rings: geometry.coordinates.map((ring) => ring.map(toDraftWithY)),
    };
  }

  return {
    type: 'MultiPolygon',
    polygons: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(toDraftWithY))),
  };
}

export function isRegionGeometry(geometry: MapGeometry): geometry is RegionMapGeometry {
  return (
    geometry.type === 'Rectangle' ||
    geometry.type === 'MultiRectangle' ||
    geometry.type === 'Polygon' ||
    geometry.type === 'MultiPolygon'
  );
}

export function createEmptyPoiGeometryDraft(
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

function replacePoiGeometryDraftCoordinate(
  draft: Exclude<PoiGeometryDraft, { type: 'Point' }>,
  targetIndex: number,
  coordinate: [number, number],
): Exclude<PoiGeometryDraft, { type: 'Point' }> {
  if (draft.type === 'MultiPoint' || draft.type === 'LineString') {
    return {
      type: draft.type,
      coordinates: replaceValidCoordinateDraft(draft.coordinates, targetIndex, coordinate),
    };
  }
  if (draft.type === 'Rectangle') {
    return {
      type: 'Rectangle',
      bounds: replaceRectangleDraftCorner(draft.bounds, targetIndex, coordinate),
    };
  }
  if (draft.type === 'MultiRectangle') {
    const rectangleIndex = Math.floor(targetIndex / 4);
    const cornerIndex = targetIndex % 4;
    return {
      type: 'MultiRectangle',
      rectangles: draft.rectangles.map((bounds, index) =>
        index === rectangleIndex
          ? replaceRectangleDraftCorner(bounds, cornerIndex, coordinate)
          : bounds,
      ),
    };
  }

  const cursor = { index: 0, found: false };
  if (draft.type === 'Polygon') {
    return {
      type: 'Polygon',
      rings: draft.rings.map((ring) =>
        replacePolygonRingCoordinate(ring, targetIndex, coordinate, cursor),
      ),
    };
  }
  return {
    type: 'MultiPolygon',
    polygons: draft.polygons.map((polygon) =>
      polygon.map((ring) => replacePolygonRingCoordinate(ring, targetIndex, coordinate, cursor)),
    ),
  };
}

function replaceValidCoordinateDraft(
  drafts: CoordinateDraft[],
  targetIndex: number,
  coordinate: [number, number],
): CoordinateDraft[] {
  let validIndex = 0;
  return drafts.map((draft) => {
    if (!parseCoordinateDraft(draft)) {
      return draft;
    }
    const shouldReplace = validIndex === targetIndex;
    validIndex += 1;
    return shouldReplace ? { ...coordinateToDraft(coordinate), y: draft.y } : draft;
  });
}

function replaceRectangleDraftCorner(
  draft: RectangleBoundsDraft,
  cornerIndex: number,
  coordinate: [number, number],
): RectangleBoundsDraft {
  const bounds = parseRectangleBoundsDraft(draft);
  if (!bounds || cornerIndex < 0 || cornerIndex > 3) {
    return draft;
  }
  const corners = rectangleBoundsToCoordinates(bounds);
  const opposite = corners[(cornerIndex + 2) % 4];
  if (!opposite) {
    return draft;
  }
  return rectangleBoundsToDraft({
    minX: Math.min(coordinate[0], opposite[0]),
    minZ: Math.min(coordinate[1], opposite[1]),
    maxX: Math.max(coordinate[0], opposite[0]),
    maxZ: Math.max(coordinate[1], opposite[1]),
  });
}

function replacePolygonRingCoordinate(
  ring: CoordinateDraft[],
  targetIndex: number,
  coordinate: [number, number],
  cursor: { index: number; found: boolean },
): CoordinateDraft[] {
  if (cursor.found) {
    return ring;
  }
  const validRawIndexes = ring.flatMap((draft, rawIndex) =>
    parseCoordinateDraft(draft) ? [rawIndex] : [],
  );
  const localIndex = targetIndex - cursor.index;
  cursor.index += validRawIndexes.length;
  const rawIndex = validRawIndexes[localIndex];
  if (rawIndex === undefined) {
    return ring;
  }

  cursor.found = true;
  const next = [...ring];
  const replacement = { ...coordinateToDraft(coordinate), y: ring[rawIndex]?.y };
  const firstCoordinate = ring[0] ? parseCoordinateDraft(ring[0]) : null;
  const lastCoordinate = ring.at(-1) ? parseCoordinateDraft(ring.at(-1)!) : null;
  const isClosed = Boolean(
    firstCoordinate &&
    lastCoordinate &&
    firstCoordinate[0] === lastCoordinate[0] &&
    firstCoordinate[1] === lastCoordinate[1],
  );
  next[rawIndex] = replacement;
  if (isClosed && (rawIndex === 0 || rawIndex === ring.length - 1)) {
    next[0] = replacement;
    next[ring.length - 1] = replacement;
  }
  return next;
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

/** 控制点增删模式：反向追加 / 追加 / 就近插入。 */
type PoiCoordinateInsertionMode = 'prepend' | 'append' | 'nearest';

function supportsPoiCoordinateInsertion(draft: PoiGeometryDraft): boolean {
  return (
    draft.type === 'MultiPoint' ||
    draft.type === 'LineString' ||
    draft.type === 'Polygon' ||
    draft.type === 'MultiPolygon'
  );
}

function isPoiRingClosed(ring: CoordinateDraft[]): boolean {
  if (ring.length < 2) {
    return false;
  }
  const first = parseCoordinateDraft(ring[0]);
  const last = parseCoordinateDraft(ring[ring.length - 1]);
  return Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
}

function getPoiRingUniqueCount(ring: CoordinateDraft[]): number {
  return isPoiRingClosed(ring) ? Math.max(0, ring.length - 1) : ring.length;
}

function insertPoiRingSlot(
  ring: CoordinateDraft[],
  slot: CoordinateDraft,
  mode: PoiCoordinateInsertionMode,
  coordinate: [number, number],
): CoordinateDraft[] {
  const closed = isPoiRingClosed(ring);
  const next = [...ring];
  const index =
    mode === 'prepend'
      ? 0
      : mode === 'append'
        ? getPoiRingUniqueCount(ring)
        : findPoiRingNearestInsertIndex(ring, coordinate);
  next.splice(clamp(index, 0, getPoiRingUniqueCount(ring)), 0, slot);
  if (closed && next.length > 1) {
    // 闭合环的末位是首点副本，首尾插入后需要重新对齐，否则环会被“悄悄打开”。
    next[next.length - 1] = { ...next[0] };
  }
  return next;
}

function findPoiRingNearestInsertIndex(ring: CoordinateDraft[], target: [number, number]): number {
  const slots = ring
    .map((item, index) => ({ coordinate: parseCoordinateDraft(item), index }))
    .filter((entry): entry is { coordinate: [number, number]; index: number } =>
      Boolean(entry.coordinate),
    );
  if (slots.length < 2) {
    return getPoiRingUniqueCount(ring);
  }

  let bestIndex = getPoiRingUniqueCount(ring);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < slots.length - 1; index += 1) {
    const start = slots[index];
    const end = slots[index + 1];
    const distance = getPoiPointSegmentDistance(target, start.coordinate, end.coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = end.index;
    }
  }
  return bestIndex;
}

function removePoiRingSlotAt(
  ring: CoordinateDraft[],
  localIndex: number,
): CoordinateDraft[] | null {
  const closed = isPoiRingClosed(ring);
  const uniqueCount = getPoiRingUniqueCount(ring);
  if (localIndex < 0 || localIndex >= uniqueCount || uniqueCount <= 3) {
    return null;
  }

  const next = ring.filter((_, index) => index !== localIndex);
  if (!closed) {
    return next;
  }
  const head = next.slice(0, -1);
  const first = next[0];
  return first ? [...head, { ...first }] : null;
}

function getPoiPointSegmentDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const segmentX = end[0] - start[0];
  const segmentZ = end[1] - start[1];
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const projection =
    ((point[0] - start[0]) * segmentX + (point[1] - start[1]) * segmentZ) / lengthSquared;
  const ratio = clamp(projection, 0, 1);
  return Math.hypot(
    point[0] - (start[0] + segmentX * ratio),
    point[1] - (start[1] + segmentZ * ratio),
  );
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
  return { x: '', y: '', z: '' };
}

function createEmptyRectangleBoundsDraft(): RectangleBoundsDraft {
  return { minX: '', minZ: '', maxX: '', maxZ: '' };
}

export function buildMapGeometryFromDraft(draft: PoiGeometryDraft): {
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
    y: '',
    z: roundCoordinateForQuery(z),
  };
}

function extractCoordinateYDraftValues(draft: PoiGeometryDraft): Array<number | null> | undefined {
  const coordinates =
    draft.type === 'MultiPoint' || draft.type === 'LineString'
      ? draft.coordinates
      : draft.type === 'Polygon'
        ? draft.rings.flat()
        : draft.type === 'MultiPolygon'
          ? draft.polygons.flat(2)
          : [];
  const values = coordinates.map((coordinate) => {
    const text = coordinate.y?.trim() ?? '';
    if (!text) {
      return null;
    }
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  });
  return values.some((value) => value !== null) ? values : undefined;
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
    return status === 'draft' || status === 'pending_review' || status === 'approved';
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
  const hasRejectedImage = hasRejectedPoiImage(submission, imageReviewByKey);
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
