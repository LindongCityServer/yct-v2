'use client';

import type {
  MaterialGlyphConfig,
  MaterialTransitNetworkSnapshot,
  TileProviderDescriptor,
} from '@yct/contracts';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { trackAnalyticsEvent } from '../lib/analytics/client';
import { appPath } from '../lib/app-paths';
import { PREVIEW_DIALOG_MEDIA_QUERY, SINGLE_COLUMN_MEDIA_QUERY } from '../lib/breakpoints';
import {
  createMaterialOfflineDraftId,
  readLatestMaterialOfflineDraft,
  readMaterialOfflineDraftForTemplate,
  upsertMaterialOfflineDraft,
  type MaterialOfflineDraftRecord,
} from '../lib/client-material-offline-drafts';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import { findTextContinuation } from '../lib/text-continuation';
import {
  publishMaterialStudioActionBlocked,
  publishMaterialStudioState,
  requestMaterialStudioAction,
  subscribeMaterialStudioActions,
} from '../lib/client-material-studio-events';
import {
  dispatchMetroWayfindingCompositionAction,
  subscribeMetroWayfindingImportLifecycleEvents,
} from '../lib/client-metro-wayfinding-events';
import {
  publishTransitNetworkLineNameEditorRequested,
  publishTransitNetworkSourceChanged,
  subscribeTransitNetworkProjectSnapshotChanged,
  subscribeTransitNetworkSourceChanged,
  type TransitNetworkProjectOrigin,
} from '../lib/client-transit-network-events';
import {
  buildMetroWayfindingProjectFileName,
  buildMetroWayfindingTextSignature,
  createMetroWayfindingProjectFile,
  METRO_WAYFINDING_TEMPLATE_ID,
  metroWayfindingBackgroundPalette,
  parseMetroWayfindingLayout,
  serializeMetroWayfindingLayout,
  serializeMetroWayfindingProjectFile,
} from '../lib/metro-wayfinding';
import {
  BUS_STOP_DETAIL_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
  BUILDING_ADDRESS_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  isMetroLineMapVerticalTemplateId,
} from '../lib/material-template-ids';
import {
  buildMetroWayfindingTemplateExamples,
  type MetroWayfindingExample,
  type MetroWayfindingExampleStation,
} from '../lib/metro-wayfinding-examples';
import { formatServiceTimeRange, parseServiceTimeRange } from '../lib/material-service-time';
import { composeMaterialTemplateSvg } from '../lib/material-svg';
import {
  resolveMetroSignTextRegions,
  resolveTransitHorizontalStationRegions,
} from '../lib/material-glyphs';
import { createBrowserMaterialGlyphAssets } from '../lib/material-glyph-browser-assets';
import {
  resolveMaterialCanvasLocks,
  resolveMaterialMaxPxPerMeter,
} from '../lib/material-canvas-policy';
import { buildMaterialTemplateTextSignature } from '../lib/material-text-signature';
import { parseMaterialTransitLineDisplay } from '../lib/material-line-display';
import { toUppercasePinyin } from '../lib/chinese-pinyin';
import { resolveMaterialWorkspaceAdapter } from '../lib/material-workspace-adapter';
import {
  findMaterialTransitNetworkLineByKey,
  listMaterialTransitNetworkLines,
  listMaterialTransitNetworkLineStations,
  listMaterialTransitNetworkNodeDirections,
  listMaterialTransitNetworkNodeLineDirections,
  listMaterialTransitNetworkNodeLines,
  type MaterialTransitNetworkNodeLineOption,
} from '../lib/rmp-transit-network';
import { EmbeddedMapLocationPicker } from './embedded-map-location-picker';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { publishToastRequested } from '../lib/client-toast-events';
import { MetroWayfindingEditor, mergeMetroColorOptions } from './metro-wayfinding-editor';
import { MetroWayfindingInspector } from './metro-wayfinding-inspector';
import { SegmentedControl } from './segmented-control';
import { TransitWayfindingWorkspace } from './transit-wayfinding-workspace';
import {
  TransitMaterialFormWorkspace,
  type TransitMaterialFormGroup,
  type TransitMaterialFormRegion,
  type TransitMaterialFormStationNode,
} from './transit-material-form-workspace';
import { VisualEditorShell } from './visual-editor-shell';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { TransitNetworkSourceControl } from './transit-network-source-control';
import { MaterialPreviewErrorNotice } from './material-save-download-dialog';
import { Button, IconButton } from './ui/button';
import { Eyebrow } from './ui/status';
import { CheckboxRow, RadioRow } from './ui/checkbox-row';
import { Field, FieldGroup, Input, Select } from './ui/field';
import { Modal } from './ui/modal';

type MaterialFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'metro_line' | 'custom';

/** 二级入口：一个「版式」下按「样式」（新版 / 旧版）继续切换。 */
export interface MaterialTemplateLayoutGroup {
  id: string;
  label?: string;
  labelKey?: CommonMessageKey;
  templateIds: string[];
}

/** 把多套版式收进同一个模板入口，入口下方再用「版式 / 样式」切换具体模板。 */
export interface MaterialTemplateGroup {
  id: string;
  title?: string;
  titleKey?: CommonMessageKey;
  templateIds: string[];
  variantLabel?: string;
  variantLabelKey?: CommonMessageKey;
  /** 第一维标签，例如「版式」；配合 `layoutGroups` 使用。 */
  layoutLabel?: string;
  layoutLabelKey?: CommonMessageKey;
  /** 第一维选项：每个版式下各自包含新版 / 旧版模板。 */
  layoutGroups?: MaterialTemplateLayoutGroup[];
}
type MaterialServerSource = 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';

/** 路牌落点提示使用的中文方位文案（翻译键）。 */
const roadSideLabelKeys: Record<'north' | 'south' | 'east' | 'west', CommonMessageKey> = {
  north: 'materialStudio.roadSideNorth',
  south: 'materialStudio.roadSideSouth',
  east: 'materialStudio.roadSideEast',
  west: 'materialStudio.roadSideWest',
};

/** 首末班车时间字段：项目线网来源下需要用户补录（见 `offerProjectServiceTimeInput`）。 */
const SERVICE_TIME_FIELD_KEY = 'routeServiceTime';

interface MaterialField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'color';
  required?: boolean;
  defaultValue?: string;
  userEditable?: boolean;
  serverOverride?: boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: Array<{ value: string; label: string }>;
  /** 地铁线路图 / 导视牌等专用字形渲染配置。 */
  glyph?: MaterialGlyphConfig;
}

interface MaterialCanvas {
  widthM: number;
  heightM: number;
  pxPerMeter: number;
  alignToTile: boolean;
  tileSizePx: number;
}

interface MaterialTemplate {
  version: number;
  title: string;
  description?: string;
  family: MaterialFamily;
  fields: MaterialField[];
  defaultCanvas: MaterialCanvas;
}

interface PublishedMaterialTemplate {
  id: string;
  template: MaterialTemplate;
}

interface TransitLineOption {
  id: string;
  name: string;
  mode: string;
  operationStatus: 'operating' | 'planned' | 'closed';
  color?: string;
  operator?: string;
  stationCount: number;
  stations: Array<{
    stationSourceId: string;
    stationName: string;
  }>;
}

interface TransitStationLineOption {
  id: string;
  lineId: string;
  travelDirection: 'forward' | 'reverse';
  name: string;
  operator?: string;
  firstLastBus: string;
  destinationName: string;
  stationNames: string[];
  currentStationIndex: number;
  nextStationName?: string;
  direction: 'east' | 'west' | 'north' | 'south' | 'unknown';
  isOriginAtStation: boolean;
  isTerminalAtStation: boolean;
}

interface TransitStationOption {
  markerId: string;
  stationSourceId: string;
  stationName: string;
  /** 导入项目里的副站名（通常为英文）；服务器线网没有该字段。 */
  stationSecondaryName?: string;
  coordinate?: [number, number];
  directionOptions: Array<{
    value: 'east' | 'west' | 'north' | 'south';
    label: string;
  }>;
  lines: TransitStationLineOption[];
  projectLines?: MaterialTransitNetworkNodeLineOption[];
}

interface ImportedTransitLineOption {
  id: string;
  lineKey: string;
  direction: 'east' | 'west' | 'north' | 'south';
  name: string;
  secondaryName?: string;
  color: string;
}

interface MaterialLocationOption {
  id: string;
  label: string;
  categoryId: string;
  address?: string;
  coordinate?: [number, number];
}

interface MaterialDraft {
  id: string;
  clientDraftId?: string;
  templateId: string;
  templateVersion: number;
  input: Record<string, string>;
  canvas: MaterialCanvas;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

type StudioMode = 'manual' | 'server';

type Translate = ReturnType<typeof useI18n>['t'];

const MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY = PREVIEW_DIALOG_MEDIA_QUERY;

/**
 * 导视牌编辑器的固定标识。
 * 编辑器与宿主容器（宽屏下预览面板下方的 Inspector）需要用同一个 editorId 通过事件总线通信，
 * 因此不能依赖编辑器内部的 useId()，改为在此显式约定。
 */
const METRO_WAYFINDING_EDITOR_ID = 'transit-materials-metro-wayfinding';

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 安全读取 JSON：401 / 重定向可能返回 HTML，直接 `json()` 会抛解析异常。 */
async function readJsonResponse<T>(response: Response): Promise<T | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/** 输入防抖：本地 SVG 合成按最后一次输入执行，避免逐字重复排版长站点列表。 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);
  return debounced;
}

function listRmpLineTerminalStations(
  snapshot: MaterialTransitNetworkSnapshot,
  lineKey: string,
): Array<{ name: string; secondaryName?: string }> {
  const degreeByNodeId = new Map<string, number>();
  for (const edge of snapshot.edges) {
    if (!edge.lineKeys.includes(lineKey)) continue;
    degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
    degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
  }
  return snapshot.nodes.flatMap((node) =>
    node.kind === 'station' && degreeByNodeId.get(node.id) === 1 && node.names[0]
      ? [{ name: node.names[0], secondaryName: node.names[1] }]
      : [],
  );
}

export function MaterialStudioPanel({
  studioId,
  title,
  titleKey,
  families,
  serverSource,
  serverSources,
  serverFamilies,
  includedTemplateIds,
  templateGroups,
  defaultTemplateId,
  compactCanvasControls = false,
  allowTransitNetworkImport = false,
  workspace = false,
}: Readonly<{
  studioId: string;
  title: string;
  titleKey?: CommonMessageKey;
  families: MaterialFamily[];
  serverSource?: MaterialServerSource;
  serverSources?: Partial<Record<MaterialFamily, MaterialServerSource>>;
  serverFamilies?: MaterialFamily[];
  includedTemplateIds?: string[];
  templateGroups?: MaterialTemplateGroup[];
  /** 工作台首次加载优先选中的模板；未指定时沿用「地铁导视牌优先」。 */
  defaultTemplateId?: string;
  /** 仅保留「长度 + 对齐单位」，隐藏宽高输入（公交导视工作台使用）。 */
  compactCanvasControls?: boolean;
  allowTransitNetworkImport?: boolean;
  /** 使用统一可视化工作台外壳（标题栏 + 三栏 + 面板开关 + 保存语义）。 */
  workspace?: boolean;
}>) {
  const [items, setItems] = useState<PublishedMaterialTemplate[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLineOption[]>([]);
  const [transitStations, setTransitStations] = useState<TransitStationOption[]>([]);
  const [locations, setLocations] = useState<MaterialLocationOption[]>([]);
  /** 门牌模板专用：只包含地址里带可解析门牌号的 POI。 */
  const [addressPoiLocations, setAddressPoiLocations] = useState<MaterialLocationOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<StudioMode>('manual');
  const [input, setInput] = useState<Record<string, string>>({});
  const [canvas, setCanvas] = useState<MaterialCanvas | null>(null);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedStationSourceId, setSelectedStationSourceId] = useState('');
  const [selectedTransitStationMarkerId, setSelectedTransitStationMarkerId] = useState('');
  const [selectedImportedStationNodeId, setSelectedImportedStationNodeId] = useState('');
  const [transitDirection, setTransitDirection] = useState<'east' | 'west' | 'north' | 'south'>(
    'east',
  );
  const [transitTerminalRole, setTransitTerminalRole] = useState<'origin' | 'terminal' | ''>(
    'origin',
  );
  const [selectedTransitLineIds, setSelectedTransitLineIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [roadCoordinate, setRoadCoordinate] = useState<[number, number] | null>(null);
  /** 路牌落点提示：最近道路名、所在侧与安装点，由服务端按地图几何计算。 */
  const [roadSideHint, setRoadSideHint] = useState<{
    roadName: string;
    side: 'north' | 'south' | 'east' | 'west';
    installation: [number, number];
    distance: number;
  } | null>(null);
  const [isRoadSideHintLoading, setIsRoadSideHintLoading] = useState(false);
  /** 至少完成过一次落点匹配，避免请求返回前先显示“附近没有道路”。 */
  const [isRoadSideHintChecked, setIsRoadSideHintChecked] = useState(false);
  const [freshTileTemplate, setFreshTileTemplate] = useState<string | null>(null);
  const [tileTemplate, setTileTemplate] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [isPreviewDialogViewport, setIsPreviewDialogViewport] = useState(false);
  const [isSingleColumnViewport, setIsSingleColumnViewport] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isApplyWizardOpen, setIsApplyWizardOpen] = useState(false);
  /** 模板库当前预览的模板入口（可能与当前画布模板不同，用于跨入口切换）。 */
  const [applyWizardEntryId, setApplyWizardEntryId] = useState('');
  const [applyWizardStyleIndex, setApplyWizardStyleIndex] = useState(0);
  const [applyWizardTemplateId, setApplyWizardTemplateId] = useState('');
  const [pendingWizardApply, setPendingWizardApply] = useState<{
    templateId: string;
    values: Record<string, string>;
    /** reset：以新模板默认值为底合并；merge：在用户当前输入上增量合并服务端补充值。 */
    mode?: 'reset' | 'merge';
  } | null>(null);
  const [workspaceBlockMessage, setWorkspaceBlockMessage] = useState('');
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  /** 工作台初始数据（模板 / 车站 / 线路）加载中：此时控件不可用属于「加载中」而非「彻底不可用」。 */
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isPreviewRendering, setIsPreviewRendering] = useState(false);
  const [transitNetworkSource, setTransitNetworkSource] = useState<'server' | 'rmp'>('rmp');
  // RMP 项目来源：示例线网 vs 用户导入，线路选项按它区分。
  const [transitProjectOrigin, setTransitProjectOrigin] =
    useState<TransitNetworkProjectOrigin>('none');
  const [importedTransitNetwork, setImportedTransitNetwork] =
    useState<MaterialTransitNetworkSnapshot>();
  const [localDraft, setLocalDraft] = useState<MaterialOfflineDraftRecord | null>(null);
  const [localDraftReady, setLocalDraftReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const { t, locale } = useI18n();
  const panelTitle = titleKey ? t(titleKey) : title;
  const localDraftRef = useRef<MaterialOfflineDraftRecord | null>(null);
  // 路牌 / 门牌来回切样式时，目标模板没有的同名字段（如怀旧没有拼音）靠这里保留。
  const materialFieldMemoryRef = useRef<Record<string, string>>({});
  const transitNetworkSourceIntentRevisionRef = useRef(0);
  // 数据源切换时按来源切到公交站牌的默认样式，这里保存最新的版式与模板，避免闭包取到旧值。
  const activeLayoutGroupRef = useRef<MaterialTemplateLayoutGroup | undefined>(undefined);
  const selectedTemplateIdRef = useRef<string | null>(null);
  const [isSyncingLocalDraft, setIsSyncingLocalDraft] = useState(false);
  const [metroExampleStationName, setMetroExampleStationName] = useState('');
  const [metroExampleLineId, setMetroExampleLineId] = useState('');
  const [metroLineMapProjectLineKey, setMetroLineMapProjectLineKey] = useState('');
  const [metroLineMapProjectNodeId, setMetroLineMapProjectNodeId] = useState('');
  /** 模板源码：键为 `${templateId}:${version}`，初始化时一次性拉取，用于本地 SVG 预览。 */
  const [templateSources, setTemplateSources] = useState<Record<string, string>>({});
  /** 最近一次本地渲染失败原因；同时用于预览区常驻提示。 */
  const [previewError, setPreviewError] = useState('');
  /** 套用模板时的文本基线：「未修改」免审核判断的唯一依据。 */
  const [materialBaseline, setMaterialBaseline] = useState<{
    signature: string;
    input: Record<string, string>;
  } | null>(null);
  const [accountSession, setAccountSession] = useState<{
    accountStatus?: 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
    serverAccountVerified?: boolean;
  }>({});

  const templates = useMemo(
    () =>
      items.filter(
        (item) =>
          families.includes(item.template.family) ||
          includedTemplateIds?.includes(item.id) === true,
      ),
    [families, includedTemplateIds, items],
  );
  // 模板入口：先按 templateGroups 的声明顺序排合并入口，再追加未合并的独立模板。
  const templateEntries = useMemo(() => {
    const groupedTemplateIds = new Set(
      (templateGroups ?? []).flatMap((group) => group.templateIds),
    );
    const entries: MaterialTemplateGroup[] = [];
    for (const group of templateGroups ?? []) {
      if (
        group.templateIds.some((templateId) => templates.some((item) => item.id === templateId))
      ) {
        entries.push(group);
      }
    }
    for (const item of templates) {
      if (groupedTemplateIds.has(item.id)) {
        continue;
      }
      entries.push({
        id: item.id,
        title: item.template.title,
        templateIds: [item.id],
      });
    }
    return entries;
  }, [templateGroups, templates]);
  const selected = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const selectedEntry =
    templateEntries.find((entry) => entry.templateIds.includes(selected?.id ?? '')) ??
    templateEntries[0];
  const selectedEntryVariants = selectedEntry?.templateIds
    .map((templateId) => templates.find((item) => item.id === templateId))
    .filter((item): item is PublishedMaterialTemplate => Boolean(item));
  const selectedEntryVariantLabel = selectedEntry?.variantLabelKey
    ? t(selectedEntry.variantLabelKey)
    : (selectedEntry?.variantLabel ?? t('materialStudio.variant'));
  // 模板库可以跨入口切换：入口、变体与版式都按「目标入口」派生，而不是当前画布入口。
  const applyWizardEntry =
    templateEntries.find((entry) => entry.id === applyWizardEntryId) ?? selectedEntry;
  const applyWizardVariants = applyWizardEntry?.templateIds
    .map((templateId) => templates.find((item) => item.id === templateId))
    .filter((item): item is PublishedMaterialTemplate => Boolean(item));
  const applyWizardLayoutGroups = applyWizardEntry?.layoutGroups?.filter((group) =>
    group.templateIds.some((templateId) =>
      applyWizardVariants?.some((item) => item.id === templateId),
    ),
  );
  const activeCanvas = canvas ?? selected?.template.defaultCanvas ?? null;
  // 特殊画布模板统一走 adapter，未来高可塑性路牌模板只需在 adapter 里登记。
  const workspaceAdapter = resolveMaterialWorkspaceAdapter(selected?.id);
  const isMetroWayfinding = workspaceAdapter.usesDedicatedCanvas;
  const isMetroLineMap = selected?.template.family === 'metro_line';
  // 竖版地铁线路图宽度固定 1 米，只允许调节高度。
  const isMetroVerticalLineMap = selected ? isMetroLineMapVerticalTemplateId(selected.id) : false;
  // 拟真公交站牌画布高 180（128×180），对齐到 128 的整数倍会改变比例，因此禁用该选项。
  const isRealisticBusStop =
    selected?.id === BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID ||
    selected?.id === BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID;
  // 画布锁规则：被锁维度不显示输入，服务端也会拒绝修改。
  const canvasLocks = resolveMaterialCanvasLocks({
    templateId: selected?.id ?? '',
    layout: input.layout,
  });
  const canvasSizeMode: 'full' | 'length' | 'none' =
    canvasLocks.width && canvasLocks.height
      ? 'none'
      : canvasLocks.width || canvasLocks.height
        ? 'length'
        : compactCanvasControls
          ? 'none'
          : 'full';
  // 浏览器本地 SVG 合成：字段变化后防抖重算，不再请求预览接口。
  const browserGlyphAssets = useMemo(() => createBrowserMaterialGlyphAssets(), []);
  const templateSource = selected
    ? templateSources[`${selected.id}:${selected.template.version}`]
    : undefined;
  const debouncedPreviewInput = useDebouncedValue(input, 120);
  /** 字体加载完成后重算一次，避免首帧用回退字体测量字形宽度。 */
  const [previewFontEpoch, setPreviewFontEpoch] = useState(0);
  useEffect(() => {
    void document.fonts?.ready.then(() => setPreviewFontEpoch((current) => current + 1));
  }, []);
  const localPreview = useMemo<{
    svg: string;
    error: string;
    invalidFieldKeys: string[];
  }>(() => {
    if (!workspace || !selected || !activeCanvas || isMetroWayfinding) {
      return { svg: '', error: '', invalidFieldKeys: [] };
    }
    if (!templateSource) {
      return { svg: '', error: '模板源码尚未加载完成，请稍候。', invalidFieldKeys: [] };
    }
    try {
      // 只保留当前模板的字段，避免切换模板的瞬间旧模板字段触发「字段不属于当前模板」。
      const previewValues = Object.fromEntries(
        selected.template.fields.map((field) => [
          field.key,
          debouncedPreviewInput[field.key] ?? '',
        ]),
      );
      const result = composeMaterialTemplateSvg({
        template: { ...selected.template, source: templateSource },
        values: previewValues,
        canvas: activeCanvas,
        assets: browserGlyphAssets,
        validation: { allowMissingRequiredValues: true },
        // 字段级错误不清空整张画布：保留版面并在出错位置画占位，同时把问题汇总到预览提示。
        tolerateFieldErrors: true,
      });
      // 必填但用户可填的字段为空时也标红：预览继续出图，由用户补齐内容。
      const missingFieldKeys = new Set<string>();
      const missingLabels: string[] = [];
      for (const field of selected.template.fields) {
        if (!field.required || field.defaultValue !== undefined) {
          continue;
        }
        if ((previewValues[field.key] ?? '').trim()) {
          continue;
        }
        const userCanFill =
          mode !== 'server' || (field.serverOverride === true && field.userEditable !== false);
        if (!userCanFill) {
          continue;
        }
        missingFieldKeys.add(field.key);
        missingLabels.push(field.label);
      }
      const problems: string[] = [];
      if (result.errors.length) {
        problems.push(
          `以下区域渲染失败：${result.errors
            .map((item) => `${item.label}（${item.message}）`)
            .join('；')}`,
        );
      }
      if (missingLabels.length) {
        problems.push(`以下必填内容尚未填写：${missingLabels.join('、')}`);
      }
      return {
        svg: result.svg,
        error: problems.join('；'),
        invalidFieldKeys: [
          ...new Set([...result.errors.map((item) => item.fieldKey), ...missingFieldKeys]),
        ],
      };
    } catch (error) {
      return {
        svg: '',
        error: error instanceof Error ? error.message : '预览渲染失败。',
        invalidFieldKeys: [],
      };
    }
  }, [
    activeCanvas,
    browserGlyphAssets,
    debouncedPreviewInput,
    isMetroWayfinding,
    mode,
    previewFontEpoch,
    selected,
    templateSource,
    workspace,
  ]);
  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPreviewError(localPreview.error);
    // 字段级错误已经画在画布上并在预览区常驻提示；只有整张预览无法生成时才弹 toast。
    if (
      !localPreview.svg &&
      localPreview.error &&
      !localPreview.error.includes('模板源码尚未加载')
    ) {
      publishToastRequested({
        dedupeKey: `material-preview-error:${studioId}`,
        message: `预览失败：${localPreview.error}`,
        tone: 'warning',
      });
    }
  }, [localPreview.error, localPreview.svg, studioId, workspace]);
  const maxPxPerMeter = activeCanvas ? resolveMaterialMaxPxPerMeter(activeCanvas) : 4096;
  // 所有模板统一按「文本签名」判断是否未修改：只改尺寸、颜色、图标、空白都不算修改。
  const serverAccountReady =
    accountSession.accountStatus === 'active' && accountSession.serverAccountVerified === true;
  const currentTextSignature = selected
    ? buildMaterialTemplateTextSignature(selected.template, input)
    : null;
  const materialTextUnmodified =
    materialBaseline !== null && currentTextSignature === materialBaseline.signature;
  // 服务器线网导出需要已验证账号；文本未修改的手动物料对所有访问者开放免水印下载，
  // 未验证账号由服务端压到标准清晰度（≤128 px/m、长边 ≤2048 px）。
  const canDownloadWatermarkFree =
    (mode === 'manual' && materialTextUnmodified) || (serverAccountReady && mode === 'server');
  // 宽屏（≥960px）时预览区以独立面板常驻页面，此时把插入建议/宽度警告下移到预览下方。
  // 窄屏时预览退化为弹窗，页面上没有预览面板可依附，改由编辑器本体就地渲染。
  const isMetroInspectorDetached = isMetroWayfinding && !isPreviewDialogViewport;
  const metroWayfindingLayoutMode = isMetroWayfinding
    ? parseMetroWayfindingLayout(input.layout ?? '').mode
    : undefined;
  const serverOverrideFields =
    selected?.template.fields.filter(
      (field) => field.serverOverride && field.userEditable !== false,
    ) ?? [];
  const serviceTimeField = selected?.template.fields.find(
    (field) => field.key === SERVICE_TIME_FIELD_KEY,
  );
  /**
   * 项目线网（示例线网 / 导入项目）里**没有**首末班车时间这一项：
   * `MaterialTransitNetworkSnapshot` 只保留 nodes / edges / lineNames，
   * 服务端解析对 `routeServiceTime` 固定写入空串
   * （`resolveTransitNetworkStationMaterialInput`），即项目来源下必然「没有读取到」。
   * 这时给一组「首班 / 末班」输入，是它唯一的数据入口；服务器线网自带首末班时间，
   * 不需要补，沿用通用字段编辑器即可。
   * 将来项目存档若带上运营时间，这里改成按所选线路判定即可。
   *
   * 判定**不看** `serverOverride`：模板存档里这条字段可能还没带上该标记
   * （历史上就丢过），那样它连通用字段组都进不去，界面上就彻底没有入口了。
   */
  const offerProjectServiceTimeInput =
    mode === 'server' && transitNetworkSource === 'rmp' && Boolean(serviceTimeField);
  /**
   * 允许随请求覆盖的字段：`serverOverride` 字段，加上项目来源下补录的首末班车时间。
   * 后者要**替换**掉通用字段组里的同名项，否则同一字段会出现两个输入框。
   */
  const overridableFields = offerProjectServiceTimeInput
    ? [
        ...serverOverrideFields.filter((field) => field.key !== SERVICE_TIME_FIELD_KEY),
        serviceTimeField!,
      ]
    : serverOverrideFields;
  const existingDraft = drafts
    .filter(
      (draft) =>
        draft.templateId === selected?.id &&
        draft.templateVersion === selected?.template.version &&
        draft.status === 'approved',
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const templateVersionByKey = useMemo(() => {
    const map = new Map<string, MaterialTemplate>();
    for (const item of items) {
      map.set(`${item.id}:${item.template.version}`, item.template);
    }
    return map;
  }, [items]);
  const historyDrafts = useMemo(
    () => [...drafts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [drafts],
  );
  // 地铁线路图 / 导视牌也允许套用有轨与专用线；换乘信息在解析时只取同类型线路。
  const serverTransitLineOptions = useMemo(
    () =>
      isMetroLineMap
        ? transitLines.filter(
            (line) => line.mode === 'metro' || line.mode === 'tram' || line.mode === 'custom',
          )
        : transitLines,
    [isMetroLineMap, transitLines],
  );
  /** 模板库跨家族套用时的线路候选：目标为地铁线路图时只列轨道类线路。 */
  const resolveStudioSourceLineOptions = (sourceKindOverride?: MaterialServerSource) =>
    sourceKindOverride === 'transit_line' && !isMetroLineMap
      ? transitLines.filter(
          (line) => line.mode === 'metro' || line.mode === 'tram' || line.mode === 'custom',
        )
      : serverTransitLineOptions;
  const selectedLine =
    serverTransitLineOptions.find((line) => line.id === selectedLineId) ??
    (isMetroLineMap ? undefined : transitLines.find((line) => line.id === selectedLineId));
  useEffect(() => {
    if (!isMetroLineMap || !serverTransitLineOptions.length) {
      return;
    }
    if (serverTransitLineOptions.some((line) => line.id === selectedLineId)) {
      return;
    }
    const firstLine = serverTransitLineOptions[0];
    setSelectedLineId(firstLine.id);
    setSelectedStationSourceId(firstLine.stations[0]?.stationSourceId ?? '');
  }, [isMetroLineMap, selectedLineId, serverTransitLineOptions]);
  // 线路选项**只**来自当前选定的数据来源：
  // - 服务器线网 → 服务器线路
  // - 示例线网 / 导入项目 → RMP 项目线路
  // 不再把两个来源的线路合并，否则色板里会同时出现服务器线路和项目线路。
  const metroLineColorOptions = useMemo(() => {
    if (transitNetworkSource === 'rmp') {
      if (!importedTransitNetwork) return [];
      return listMaterialTransitNetworkLines(importedTransitNetwork).map((line) => ({
        value: line.color.toUpperCase(),
        label: `${line.label}${line.secondaryLabel ? ` / ${line.secondaryLabel}` : ''} · ${line.color.toUpperCase()}`,
        // 已配置正式线路名 → 用它做候选名；未配置 → 留空，
        // 由「线路编号选择器」从 lineKey 剥离字母前缀推导（`sh2` → 2 号线）。
        // 这里**不**把 `lineKey` 塞进别名：它整体不是线路名，
        // 直接参与编号提取会得到 `sh2` 这种伪编号。
        aliases: line.hasConfiguredName
          ? [line.label, line.secondaryLabel].filter((value): value is string => Boolean(value))
          : [],
      }));
    }
    return transitLines
      .filter(
        (line) =>
          line.mode === 'metro' && Boolean(line.color && /^#[0-9A-Fa-f]{6}$/.test(line.color)),
      )
      .map((line) => ({
        value: line.color!.toUpperCase(),
        label: `${line.name}${
          line.operationStatus === 'planned' ? `（${t('materialStudio.notOpened')}）` : ''
        } · ${line.color!.toUpperCase()}`,
        aliases: [line.name],
      }));
  }, [importedTransitNetwork, transitLines, transitNetworkSource, t]);
  // 颜色 → RMP 线路键（`#8CC220` → `sh2`）。线路键是唯一能推导出线路编号的原料：
  // RMP 存档不含线路名，但 `sh2` 的字母前缀是城市代号、数字部分就是 2 号线的编号。
  // 「线路编号选择器」在选项没有正式线路名时，靠它剥离前缀取编号。
  const metroLineKeysByColor = useMemo(() => {
    if (transitNetworkSource !== 'rmp' || !importedTransitNetwork) return undefined;
    return new Map(
      listMaterialTransitNetworkLines(importedTransitNetwork).map((line) => [
        line.color.toUpperCase(),
        line.lineKey,
      ]),
    );
  }, [importedTransitNetwork, transitNetworkSource]);
  // 地名输入建议**只**来自当前选定的数据来源，切换来源会实时重算：
  // - 服务器线网 → 服务器 POI + 服务器线网的主站名 / 副站名
  // - 自定义线网（示例线网 / 导入项目）→ 自定义线网的主站名 / 副站名
  // 两个来源的候选不再混在一起，否则会出现「切到项目数据却仍建议服务器站名」的错配。
  const metroTextSuggestions = useMemo(() => {
    const values =
      transitNetworkSource === 'rmp'
        ? // 自定义线网：node.names 依次是主站名、副站名、换乘/别名……
          (importedTransitNetwork?.nodes
            .filter((node) => node.kind === 'station')
            .flatMap((node) => node.names) ?? [])
        : [
            // 服务器线网：POI 名称
            ...locations.map((location) => location.label),
            // 服务器线网：线路站序里的主站名
            ...transitLines.flatMap((line) => line.stations.map((station) => station.stationName)),
            // 服务器线网：站点检索接口返回的主站名（含未挂在选定线路上的）
            ...transitStations.map((station) => station.stationName),
          ];
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    );
  }, [importedTransitNetwork, locations, transitLines, transitStations, transitNetworkSource]);
  const metroExampleStationOptions = useMemo(() => {
    if (transitNetworkSource === 'rmp') {
      return Array.from(
        new Set(
          importedTransitNetwork?.nodes
            .filter((node) => node.kind === 'station')
            .map((node) => node.names[0]?.trim() ?? '') ?? [],
        ),
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }
    return Array.from(
      new Set(
        transitLines
          .filter((line) => line.mode === 'metro')
          .flatMap((line) => line.stations.map((station) => station.stationName.trim())),
      ),
    )
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [importedTransitNetwork, transitLines, transitNetworkSource]);

  const metroExampleStations = useMemo<MetroWayfindingExampleStation[]>(() => {
    if (transitNetworkSource === 'rmp') {
      if (!importedTransitNetwork) return [];
      return importedTransitNetwork.nodes
        .filter((node) => node.kind === 'station' && node.names[0])
        .map((node) => ({
          name: node.names[0]!,
          secondaryName: node.names[1],
          lines: listMaterialTransitNetworkNodeLines(importedTransitNetwork, node.id).map(
            (line) => ({
              id: line.id,
              name: line.label,
              secondaryName: line.secondaryLabel,
              color: line.color,
              terminalStations: listRmpLineTerminalStations(importedTransitNetwork, line.lineKey),
            }),
          ),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    }
    return transitLines
      .filter((line) => line.mode === 'metro')
      .flatMap((line) =>
        line.stations.map((station) => ({
          name: station.stationName,
          lines: [
            {
              id: line.id,
              name: line.name,
              color: line.color ?? '#0A124D',
              terminalStations: [line.stations[0], line.stations.at(-1)].flatMap((terminal) =>
                terminal?.stationName ? [{ name: terminal.stationName }] : [],
              ),
            },
          ],
        })),
      )
      .reduce<MetroWayfindingExampleStation[]>((result, station) => {
        const existing = result.find((item) => item.name === station.name);
        if (existing) {
          existing.lines = [...existing.lines, ...station.lines];
          return result;
        }
        result.push(station);
        return result;
      }, [])
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }, [importedTransitNetwork, transitLines, transitNetworkSource]);

  const selectedMetroExampleStation =
    metroExampleStations.find((station) => station.name === metroExampleStationName) ??
    metroExampleStations[0];
  const metroExampleLineOptions = useMemo(
    () =>
      [...(selectedMetroExampleStation?.lines ?? [])]
        .sort((left, right) =>
          left.name.localeCompare(right.name, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          }),
        )
        .map((line) => ({
          value: line.id,
          label: [line.name, line.secondaryName].filter(Boolean).join(' / '),
        })),
    [selectedMetroExampleStation],
  );
  const selectedMetroExampleLineId = metroExampleLineOptions.some(
    (line) => line.value === metroExampleLineId,
  )
    ? metroExampleLineId
    : (metroExampleLineOptions[0]?.value ?? '');
  const metroWayfindingExamples = useMemo(
    () =>
      buildMetroWayfindingTemplateExamples(selectedMetroExampleStation, selectedMetroExampleLineId),
    [selectedMetroExampleLineId, selectedMetroExampleStation],
  );

  useEffect(() => {
    setMetroExampleStationName((current) =>
      metroExampleStationOptions.includes(current)
        ? current
        : (metroExampleStationOptions[0] ?? ''),
    );
  }, [metroExampleStationOptions]);
  useEffect(() => {
    setMetroExampleLineId((current) =>
      metroExampleLineOptions.some((line) => line.value === current)
        ? current
        : (metroExampleLineOptions[0]?.value ?? ''),
    );
  }, [metroExampleLineOptions]);
  const serverLocationSuggestions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.label.trim()).filter(Boolean))),
    [locations],
  );
  const requiresTransitTerminalRole = Boolean(
    selected?.template.fields.some((field) => field.key === 'terminalRole'),
  );
  const selectedTransitStation = transitStations.find(
    (station) => station.markerId === selectedTransitStationMarkerId,
  );
  const importedTransitStations = useMemo<TransitStationOption[]>(() => {
    if (!importedTransitNetwork) return [];
    return importedTransitNetwork.nodes
      .filter((node) => node.kind === 'station' && node.names.length)
      .map((node) => {
        const directions = new Set(
          listMaterialTransitNetworkNodeDirections(importedTransitNetwork, node.id),
        );
        return {
          markerId: node.id,
          stationSourceId: '',
          stationName: node.names[0]!,
          stationSecondaryName: node.names[1],
          coordinate: [node.x, node.y] as [number, number],
          directionOptions: listDiagramDirectionOptions(t).filter((option) =>
            directions.has(option.value),
          ),
          lines: [],
          projectLines: listMaterialTransitNetworkNodeLines(importedTransitNetwork, node.id),
        };
      })
      .sort((left, right) => left.stationName.localeCompare(right.stationName, 'zh-CN'));
  }, [importedTransitNetwork, t]);
  const selectedImportedTransitStation = importedTransitStations.find(
    (station) => station.markerId === selectedImportedStationNodeId,
  );
  const metroLineMapProjectLines = useMemo(
    () =>
      isMetroLineMap && importedTransitNetwork
        ? listMaterialTransitNetworkLines(importedTransitNetwork)
        : [],
    [importedTransitNetwork, isMetroLineMap],
  );
  const metroLineMapProjectLine = useMemo(
    () =>
      importedTransitNetwork && metroLineMapProjectLineKey
        ? findMaterialTransitNetworkLineByKey(importedTransitNetwork, metroLineMapProjectLineKey)
        : undefined,
    [importedTransitNetwork, metroLineMapProjectLineKey],
  );
  const metroLineMapProjectStations = useMemo(() => {
    if (!importedTransitNetwork || !metroLineMapProjectLine) {
      return [];
    }
    return listMaterialTransitNetworkLineStations(
      importedTransitNetwork,
      metroLineMapProjectLine.lineKey,
    ).map((station) => ({ id: station.id, name: station.name }));
  }, [importedTransitNetwork, metroLineMapProjectLine]);
  useEffect(() => {
    if (!metroLineMapProjectLines.length) {
      return;
    }
    setMetroLineMapProjectLineKey((current) =>
      metroLineMapProjectLines.some((line) => line.lineKey === current)
        ? current
        : metroLineMapProjectLines[0].lineKey,
    );
  }, [metroLineMapProjectLines]);
  useEffect(() => {
    setMetroLineMapProjectNodeId((current) =>
      metroLineMapProjectStations.some((station) => station.id === current)
        ? current
        : (metroLineMapProjectStations[0]?.id ?? ''),
    );
  }, [metroLineMapProjectStations]);
  const activeTransitStation =
    transitNetworkSource === 'rmp' ? selectedImportedTransitStation : selectedTransitStation;
  // 始发终点版式只对线路端点站开放；普通中途站不提供该版式。
  const stationSupportsTerminalVariant = useMemo(() => {
    if (mode !== 'server' || !activeTransitStation) {
      return true;
    }
    if (transitNetworkSource === 'rmp') {
      if (!importedTransitNetwork) {
        return true;
      }
      return (activeTransitStation.projectLines ?? []).some((line) =>
        listRmpLineTerminalStations(importedTransitNetwork, line.lineKey).some(
          (terminal) => terminal.name === activeTransitStation.stationName,
        ),
      );
    }
    return activeTransitStation.lines.some(
      (line) => line.isOriginAtStation || line.isTerminalAtStation,
    );
  }, [activeTransitStation, importedTransitNetwork, mode, transitNetworkSource]);
  /** 单条线路在本站的角色：起点→始发，终点→终到，中途站→未定。 */
  const resolveLineTerminalRole = (lineId: string): 'origin' | 'terminal' | undefined => {
    if (transitNetworkSource === 'rmp') {
      const lineKey = lineId.split('\u0000')[0];
      if (!importedTransitNetwork || !selectedImportedTransitStation || !lineKey) {
        return undefined;
      }
      const stations = listMaterialTransitNetworkLineStations(importedTransitNetwork, lineKey);
      const index = stations.findIndex(
        (station) => station.id === selectedImportedTransitStation.markerId,
      );
      if (index === 0) {
        return 'origin';
      }
      if (index >= 0 && index === stations.length - 1) {
        return 'terminal';
      }
      return undefined;
    }
    const line = selectedTransitStation?.lines.find((item) => item.id === lineId);
    if (line?.isOriginAtStation) {
      return 'origin';
    }
    if (line?.isTerminalAtStation) {
      return 'terminal';
    }
    return undefined;
  };

  /**
   * 多条线路的统一判定：
   * 全部始发→始发站；全部终到→终点站；方向混合→保持未选并提示用户手动选择。
   */
  const derivedTerminalRole = useMemo<{
    role?: 'origin' | 'terminal';
    mixed: boolean;
  }>(() => {
    // 表单模板工作台统一以 manual 模式编辑，数据来源通过「模板库」套用，
    // 因此这里不能再用 mode === 'server' 作为门槛。
    if (!requiresTransitTerminalRole || !selectedTransitLineIds.length) {
      return { mixed: false };
    }
    const roles = selectedTransitLineIds
      .map((lineId) => resolveLineTerminalRole(lineId))
      .filter((role): role is 'origin' | 'terminal' => Boolean(role));
    if (!roles.length) {
      return { mixed: false };
    }
    if (roles.every((role) => role === 'origin')) {
      return { role: 'origin', mixed: false };
    }
    if (roles.every((role) => role === 'terminal')) {
      return { role: 'terminal', mixed: false };
    }
    return { mixed: true };
  }, [
    importedTransitNetwork,
    requiresTransitTerminalRole,
    selectedImportedTransitStation,
    selectedTransitLineIds,
    selectedTransitStation,
    transitNetworkSource,
  ]);

  useEffect(() => {
    if (!requiresTransitTerminalRole) {
      return;
    }
    if (derivedTerminalRole.mixed) {
      // 方向混合时不猜：清空选择，由用户在「其他 → 站点属性」里手动指定。
      setTransitTerminalRole((current) => (current ? '' : current));
      return;
    }
    if (derivedTerminalRole.role && derivedTerminalRole.role !== transitTerminalRole) {
      setTransitTerminalRole(derivedTerminalRole.role);
    }
  }, [derivedTerminalRole, requiresTransitTerminalRole, transitTerminalRole]);

  /**
   * 把自动判定结果写进真实字段 `terminalRole`（模板里是「始发站 / 终点站」）。
   * 用户手动改过之后不再覆盖；方向混合时清空为未选。
   */
  const terminalRoleAutoRef = useRef('');
  useEffect(() => {
    if (!requiresTransitTerminalRole) {
      return;
    }
    const autoValue = derivedTerminalRole.mixed
      ? ''
      : derivedTerminalRole.role === 'origin'
        ? '始发站'
        : derivedTerminalRole.role === 'terminal'
          ? '终点站'
          : '';
    setInput((current) => {
      const currentValue = current.terminalRole ?? '';
      if (!autoValue) {
        return currentValue && currentValue === terminalRoleAutoRef.current
          ? { ...current, terminalRole: '' }
          : current;
      }
      // 用户手动选过（且与上次自动值不同）时尊重用户选择。
      if (currentValue && currentValue !== terminalRoleAutoRef.current) {
        return current;
      }
      return currentValue === autoValue ? current : { ...current, terminalRole: autoValue };
    });
    terminalRoleAutoRef.current = autoValue;
  }, [derivedTerminalRole, requiresTransitTerminalRole]);

  /** 线路详情模板：行车方向决定起终点与下一站，切换方向时自动重算。 */
  useEffect(() => {
    if (!selected || selected.template.family !== 'bus_stop') {
      return;
    }
    const fieldKeys = new Set(selected.template.fields.map((field) => field.key));
    if (!fieldKeys.has('travelDirection') || !fieldKeys.has('routeOrigin')) {
      return;
    }
    const stations = (input.routeStations ?? '')
      .split(/\r?\n|\s*\/\s*/u)
      .map((station) => station.trim())
      .filter(Boolean);
    if (stations.length < 2) {
      return;
    }
    const index = Number(input.currentStationIndex ?? 0);
    if (!Number.isFinite(index) || index < 0 || index >= stations.length) {
      return;
    }
    const direction = input.travelDirection === 'first' ? 'first' : 'last';
    const nextIndex = direction === 'first' ? index - 1 : index + 1;
    const nextName = stations[nextIndex];
    const isBoundary = nextIndex < 0 || nextIndex >= stations.length;
    const terminalName = direction === 'first' ? (stations[0] ?? '') : (stations.at(-1) ?? '');
    const candidates: Record<string, string> = {
      travelDirection: direction,
      routeOrigin: direction === 'first' ? (stations.at(-1) ?? '') : (stations[0] ?? ''),
      routeTerminal: direction === 'first' ? (stations[0] ?? '') : (stations.at(-1) ?? ''),
      nextStation: isBoundary ? '终 点 站' : (nextName ?? ''),
      nextStationName: isBoundary ? '' : (nextName ?? ''),
      routeStationState: isBoundary ? 'terminal_station' : 'next_station',
      stationNamePinyin: toUppercasePinyin(stations[index] ?? ''),
      nextStationPinyin: toUppercasePinyin(nextName ?? ''),
      terminalNamePinyin: toUppercasePinyin(terminalName),
      // 底部行车方向文字随方向自动推断，不再让用户手填。
      footerText: terminalName ? `开往 ${terminalName}` : '',
    };
    const updates = Object.fromEntries(
      Object.entries(candidates).filter(([key]) => fieldKeys.has(key)),
    );
    setInput((current) => {
      const changed = Object.entries(updates).some(
        ([key, value]) => current[key] !== undefined && current[key] !== value,
      );
      return changed ? { ...current, ...updates } : current;
    });
  }, [input.currentStationIndex, input.routeStations, input.travelDirection, selected?.id]);
  const availableEntryVariants = selectedEntryVariants?.filter(
    (item) =>
      stationSupportsTerminalVariant ||
      !item.template.fields.some((field) => field.key === 'terminalRole'),
  );
  const travelDirectionStationNames = useMemo(() => {
    if (mode === 'server' && isMetroLineMap) {
      if (transitNetworkSource === 'rmp') {
        const projectStations = metroLineMapProjectStations.map((station) => station.name);
        if (projectStations.length >= 2) {
          return projectStations;
        }
      } else {
        const lineStations = selectedLine?.stations.map((station) => station.stationName) ?? [];
        if (lineStations.length >= 2) {
          return lineStations;
        }
      }
      // 站台站名标志等模板没有完整站序字段，继续走下面的真实站序兜底。
    }
    const manualStations = (input.routeStations ?? '')
      .split(/\r?\n|\s*\/\s*/u)
      .map((station) => station.trim())
      .filter(Boolean);
    if (manualStations.length >= 2) {
      return manualStations;
    }
    // 只有公交站牌模板允许回落到公交站所属线路的站序；
    // 地铁模板不能拿公交线路的站名当地铁方向选项。
    return selected?.template.family === 'bus_stop'
      ? (activeTransitStation?.lines[0]?.stationNames ?? manualStations)
      : manualStations;
  }, [
    activeTransitStation,
    input.routeStations,
    isMetroLineMap,
    metroLineMapProjectStations,
    mode,
    selected?.template.family,
    selectedLine,
    transitNetworkSource,
  ]);
  const travelDirectionOptions =
    travelDirectionStationNames.length >= 2
      ? [
          {
            value: 'last',
            label: `开往${travelDirectionStationNames[travelDirectionStationNames.length - 1]}`,
          },
          { value: 'first', label: `开往${travelDirectionStationNames[0]}` },
        ]
      : undefined;
  // 地铁站名 / 方向版式：开往终点由行车方向与线路站序自动推断，不再手填。
  useEffect(() => {
    if (!selected || selected.template.family !== 'metro_line') {
      return;
    }
    const fieldKeys = new Set(selected.template.fields.map((field) => field.key));
    if (!fieldKeys.has('terminalName') || !fieldKeys.has('travelDirection')) {
      return;
    }
    if (travelDirectionStationNames.length < 2) {
      return;
    }
    const direction = input.travelDirection === 'first' ? 'first' : 'last';
    const terminal =
      direction === 'first'
        ? travelDirectionStationNames[0]!
        : travelDirectionStationNames[travelDirectionStationNames.length - 1]!;
    const terminalPinyin = toUppercasePinyin(terminal);
    setInput((current) => {
      const nextTerminal = current.terminalName ?? '';
      const nextPinyin = current.terminalNamePinyin ?? '';
      if (
        nextTerminal === terminal &&
        (!fieldKeys.has('terminalNamePinyin') || nextPinyin === terminalPinyin)
      ) {
        return current;
      }
      return {
        ...current,
        terminalName: terminal,
        ...(fieldKeys.has('terminalNamePinyin') ? { terminalNamePinyin: terminalPinyin } : {}),
      };
    });
  }, [input.travelDirection, selected, travelDirectionStationNames]);
  const verticalTrackPosition = isMetroVerticalLineMap
    ? input.trackPosition === 'right' || input.trackPosition === 'both'
      ? input.trackPosition
      : 'left'
    : undefined;
  const isVerticalBothTracks = verticalTrackPosition === 'both';
  // 旧版竖版线路图只提供「两侧」轨道样式，其余取值统一收敛到两侧。
  const isVerticalOldLineMap = selected?.id === METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID;
  const trackPositionOptions = isVerticalOldLineMap
    ? [{ value: 'both', label: '两侧' }]
    : undefined;
  useEffect(() => {
    if (!isVerticalOldLineMap) {
      return;
    }
    // 依赖 trackPosition：切换旧版模板时 pendingWizardApply 会用默认值覆盖一次，
    // 这里在覆盖后再次收敛回「两侧」。
    setInput((current) =>
      current.trackPosition === 'both' ? current : { ...current, trackPosition: 'both' },
    );
  }, [input.trackPosition, isVerticalOldLineMap]);
  const verticalPrimaryDirection = input.travelDirection === 'first' ? 'first' : 'last';
  const verticalSecondaryDirectionOptions = (
    travelDirectionOptions ??
    selected?.template.fields.find((field) => field.key === 'travelDirectionSecondary')?.options ??
    []
  ).filter((option) => option.value !== verticalPrimaryDirection);
  const isMaterialFieldVisible = (field: MaterialField) =>
    (field.key !== 'travelDirectionSecondary' || isVerticalBothTracks) &&
    // 站台站名标志改用「相邻站选择」控制方向，不再显示原始方向下拉。
    !(selected?.id === METRO_PLATFORM_SIGN_TEMPLATE_ID && field.key === 'travelDirection');
  const materialFieldLabelOverride = (field: MaterialField) => {
    if (!isMetroVerticalLineMap) {
      return undefined;
    }
    if (field.key === 'travelDirection' && isVerticalBothTracks) {
      return '左侧方向';
    }
    if (field.key === 'travelDirectionSecondary') {
      return '右侧方向';
    }
    return undefined;
  };
  const updateMaterialFieldValue = (
    key: string,
    value: string,
    options?: { keepPreview?: boolean },
  ) => {
    setInput((current) => {
      const next = { ...current, [key]: value };
      if (!isMetroVerticalLineMap) {
        return next;
      }
      const primary = current.travelDirection === 'first' ? 'first' : 'last';
      if (key === 'trackPosition' && value === 'both') {
        const secondary = current.travelDirectionSecondary;
        if ((secondary !== 'first' && secondary !== 'last') || secondary === primary) {
          next.travelDirectionSecondary = primary === 'first' ? 'last' : 'first';
        }
      }
      if (
        key === 'travelDirection' &&
        current.trackPosition === 'both' &&
        current.travelDirectionSecondary === value
      ) {
        next.travelDirectionSecondary = value === 'first' ? 'last' : 'first';
      }
      return next;
    });
    if (!options?.keepPreview) {
      clearPreview();
    }
  };
  const selectableImportedTransitLines = useMemo<ImportedTransitLineOption[]>(() => {
    if (!importedTransitNetwork || !selectedImportedTransitStation) return [];
    const stationId = selectedImportedTransitStation.markerId;
    return (selectedImportedTransitStation.projectLines ?? []).flatMap((line) => {
      // 始发终到版式只能选端点站所在的线路，中途站不进入候选。
      if (requiresTransitTerminalRole) {
        const stations = listMaterialTransitNetworkLineStations(
          importedTransitNetwork,
          line.lineKey,
        );
        const index = stations.findIndex((station) => station.id === stationId);
        if (index !== 0 && index !== stations.length - 1) {
          return [];
        }
      }
      return listMaterialTransitNetworkNodeLineDirections(
        importedTransitNetwork,
        stationId,
        line.lineKey,
      ).map((direction) => ({
        id: `${line.lineKey}\u0000${direction}`,
        lineKey: line.lineKey,
        direction,
        name: line.label,
        secondaryName: line.secondaryLabel,
        color: line.color,
      }));
    });
  }, [importedTransitNetwork, requiresTransitTerminalRole, selectedImportedTransitStation]);
  const selectableServerTransitLines = useMemo(
    () =>
      (selectedTransitStation?.lines ?? []).filter(
        (line) =>
          line.direction === transitDirection &&
          (!requiresTransitTerminalRole || line.isOriginAtStation || line.isTerminalAtStation),
      ),
    [requiresTransitTerminalRole, selectedTransitStation, transitDirection],
  );
  const selectableTransitLines = useMemo(
    () =>
      transitNetworkSource === 'rmp'
        ? selectableImportedTransitLines.filter((line) => line.direction === transitDirection)
        : selectableServerTransitLines,
    [
      selectableImportedTransitLines,
      selectableServerTransitLines,
      transitDirection,
      transitNetworkSource,
    ],
  );
  const primarySelectedTransitLine = selectedTransitStation?.lines.find(
    (line) => line.id === selectedTransitLineIds[0],
  );
  const primarySelectedImportedLine = selectableImportedTransitLines.find(
    (line) => line.id === selectedTransitLineIds[0],
  );
  const primaryServerTransitLine = transitLines.find(
    (line) => line.id === primarySelectedTransitLine?.lineId,
  );
  const activeTransitLineColor =
    transitNetworkSource === 'rmp'
      ? primarySelectedImportedLine?.color
      : primaryServerTransitLine?.color?.toUpperCase();
  // 数据来源标签：服务器线网 / 示例项目 / 导入项目 三态，与线路选项的过滤口径一致。
  const linkedDataModeLabel =
    transitNetworkSource === 'rmp'
      ? transitProjectOrigin === 'sample'
        ? t('materialStudio.sampleProject')
        : t('materialStudio.importedProject')
      : t('materialStudio.serverNetwork');
  const activeServerSource = selected
    ? (serverSources?.[selected.template.family] ?? serverSource)
    : serverSource;
  const canUseServerSource = Boolean(
    activeServerSource &&
    selected &&
    (!serverFamilies || serverFamilies.includes(selected.template.family)),
  );
  // 门牌模板只列「带门牌号的 POI」，其余模板仍用完整地点列表。
  const usesAddressPoiSource = selected?.template.family === 'address_sign';
  const locationOptions = usesAddressPoiSource ? addressPoiLocations : locations;
  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLocaleLowerCase();
    return locationOptions
      .filter((location) => {
        if (!query) {
          return true;
        }
        return [location.label, location.categoryId, location.address]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice(0, 100);
  }, [locationQuery, locationOptions]);
  const maximumTransitLineCount = useMemo(() => {
    // 套用向导里可能切换到线路概览等 6 线路版式，线路选择上限取整个模板入口的最大值。
    const templates = isApplyWizardOpen
      ? (applyWizardVariants?.map((item) => item.template) ?? [])
      : selected
        ? [selected.template]
        : [];
    const slots = templates.flatMap((template) =>
      template.fields
        .map((field) => field.key.match(/^route(\d+)Number$/)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(Number),
    );
    return slots.length ? Math.max(...slots) : 1;
  }, [applyWizardVariants, isApplyWizardOpen, selected?.id, selected?.template.fields]);
  const usesSingleTransitLineSelection = maximumTransitLineCount === 1;

  /**
   * 把当前站点 / 线路数据换算成目标模板的字段值。
   * 不做拼音推导（客户端没有可靠拼音源），其余无法推导的字段保持用户原值。
   */
  const buildTransitNetworkFieldValues = (
    fields: ReadonlyArray<MaterialField>,
    /** 目标模板家族：模板库跨入口切换时按目标模板的数据来源口径换算。 */
    templateFamily?: MaterialFamily,
  ): Record<string, string> => {
    const sourceKind = templateFamily
      ? (serverSources?.[templateFamily] ?? serverSource)
      : activeServerSource;
    const fieldKeys = new Set(fields.map((field) => field.key));
    const lineSlots = fields
      .map((field) => field.key.match(/^route(\d+)Number$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    const maxLineCount = lineSlots.length ? Math.max(...lineSlots) : 1;
    const values: Record<string, string> = {};
    const setField = (key: string, value: string | number | undefined) => {
      if (!fieldKeys.has(key) || value === undefined || value === null) {
        return;
      }
      values[key] = String(value);
    };

    // 线路图 / 线路类模板：数据来源是「线路」，不是站点。
    if (sourceKind === 'transit_line') {
      const lineName =
        transitNetworkSource === 'rmp'
          ? (metroLineMapProjectLine?.lineName ?? '')
          : (selectedLine?.name ?? '');
      const lineNumber = resolveMetroLineNumber(lineName);
      const lineEnglish =
        transitNetworkSource === 'rmp'
          ? metroLineMapProjectLine?.secondaryLineName?.trim() || `Line ${lineNumber}`.trim()
          : `Line ${lineNumber}`.trim();
      const stationNames =
        transitNetworkSource === 'rmp'
          ? metroLineMapProjectStations.map((station) => station.name)
          : (selectedLine?.stations.map((station) => station.stationName) ?? []);
      const currentIndex =
        transitNetworkSource === 'rmp'
          ? metroLineMapProjectStations.findIndex(
              (station) => station.id === metroLineMapProjectNodeId,
            )
          : (selectedLine?.stations.findIndex(
              (station) => station.stationSourceId === selectedStationSourceId,
            ) ?? -1);
      setField('lineLabel', lineNumber);
      setField('lineEnglishLabel', lineEnglish);
      setField('routeNumber', lineNumber);
      setField('stationName', stationNames[currentIndex]);
      setField('routeStations', stationNames.join('\n'));
      // 换乘线路：用同站名出现在其它线路里的事实推导，格式「站名=编号:颜色」。
      if (transitNetworkSource !== 'rmp') {
        const transferEntries = stationNames.flatMap((stationName) => {
          // 换乘只写与当前线路同类型的线路（地铁不写公交接驳，公交不写地铁）。
          const otherLines = transitLines.filter(
            (line) =>
              line.id !== selectedLine?.id &&
              line.mode === selectedLine?.mode &&
              line.stations.some((station) => station.stationName === stationName),
          );
          if (!otherLines.length) {
            return [];
          }
          const tokens = otherLines.map((line) => {
            const display = parseMaterialTransitLineDisplay(line.name);
            return line.color ? `${display.number}:${line.color.toUpperCase()}` : display.number;
          });
          return [`${stationName}=${tokens.join(',')}`];
        });
        setField('transferLines', transferEntries.join(';'));
      }
      if (currentIndex >= 0) {
        setField('currentStationIndex', currentIndex);
        setField('nextStationName', stationNames[currentIndex + 1]);
        // 地铁站名拼音没有现成数据时用统一拼音工具兜底。
        setField('stationNamePinyin', toUppercasePinyin(stationNames[currentIndex] ?? ''));
        setField('nextStationPinyin', toUppercasePinyin(stationNames[currentIndex + 1] ?? ''));
        setField('terminalNamePinyin', toUppercasePinyin(stationNames.at(-1) ?? ''));
      }
      setField(
        'accentColor',
        (transitNetworkSource === 'rmp'
          ? metroLineMapProjectLine?.color
          : selectedLine?.color
        )?.toUpperCase(),
      );
      setField('operator', selectedLine?.operator);
      return values;
    }

    setField('stationName', activeTransitStation?.stationName);
    setField(
      'stationNamePinyin',
      activeTransitStation?.stationSecondaryName ||
        toUppercasePinyin(activeTransitStation?.stationName ?? ''),
    );

    // 不再回落到“全部可选线路”：没选线路时宁可留空让用户补选，
    // 否则跨模板切换会静默套用默认的第一条线路。
    const lineIds = selectedTransitLineIds.slice(0, maxLineCount);
    const lineNames = lineIds.map((lineId) =>
      transitNetworkSource === 'rmp'
        ? (selectableImportedTransitLines.find((line) => line.id === lineId)?.name ?? '')
        : (selectedTransitStation?.lines.find((line) => line.id === lineId)?.name ?? ''),
    );
    lineNames.forEach((name, index) => {
      const display = parseMaterialTransitLineDisplay(name);
      if (display.number) {
        setField(`route${index + 1}Number`, display.number);
        setField(`route${index + 1}Suffix`, display.suffix);
      }
    });

    const primaryLineId = lineIds[0];
    if (transitNetworkSource === 'rmp') {
      const primaryLine = selectableImportedTransitLines.find((line) => line.id === primaryLineId);
      const lineKey = primaryLineId?.split('\u0000')[0];
      if (primaryLine && lineKey && importedTransitNetwork && selectedImportedTransitStation) {
        const stations = listMaterialTransitNetworkLineStations(importedTransitNetwork, lineKey);
        const currentIndex = stations.findIndex(
          (station) => station.id === selectedImportedTransitStation.markerId,
        );
        // 到终点站时按「开往首站」方向取下一站与起终点。
        const direction =
          currentIndex >= 0 && currentIndex === stations.length - 1 ? 'first' : 'last';
        const nextIndex = direction === 'first' ? currentIndex - 1 : currentIndex + 1;
        const nextName = stations[nextIndex]?.name;
        const isBoundary = nextIndex < 0 || nextIndex >= stations.length;
        const display = parseMaterialTransitLineDisplay(primaryLine.name);
        setField('routeNumber', display.number);
        setField('routeSuffix', display.suffix);
        setField('lineLabel', resolveMetroLineNumber(primaryLine.name));
        setField(
          'lineEnglishLabel',
          primaryLine.secondaryName?.trim() ||
            `Line ${resolveMetroLineNumber(primaryLine.name)}`.trim(),
        );
        setField('routeStations', stations.map((station) => station.name).join('\n'));
        if (currentIndex >= 0) {
          setField('currentStationIndex', currentIndex);
          setField('nextStation', isBoundary ? '终 点 站' : nextName);
          setField('nextStationName', isBoundary ? '' : nextName);
          setField('routeStationState', isBoundary ? 'terminal_station' : 'next_station');
          setField('stationNamePinyin', toUppercasePinyin(stations[currentIndex]?.name ?? ''));
          setField('nextStationPinyin', toUppercasePinyin(nextName ?? ''));
        }
        const originName = direction === 'first' ? stations.at(-1)?.name : stations[0]?.name;
        const terminalName = direction === 'first' ? stations[0]?.name : stations.at(-1)?.name;
        setField('travelDirection', direction);
        setField('routeOrigin', originName);
        setField('routeTerminal', terminalName);
        setField('terminalName', terminalName);
        setField('terminalNamePinyin', toUppercasePinyin(terminalName ?? ''));
        setField('accentColor', primaryLine.color);
      }
    } else {
      const primaryLine = selectedTransitStation?.lines.find((line) => line.id === primaryLineId);
      if (primaryLine) {
        const stationNames = primaryLine.stationNames;
        const direction = primaryLine.isTerminalAtStation ? 'first' : 'last';
        const nextIndex =
          direction === 'first'
            ? primaryLine.currentStationIndex - 1
            : primaryLine.currentStationIndex + 1;
        const nextName = stationNames[nextIndex];
        const isBoundary = nextIndex < 0 || nextIndex >= stationNames.length;
        const display = parseMaterialTransitLineDisplay(primaryLine.name);
        setField('routeNumber', display.number);
        setField('routeSuffix', display.suffix);
        setField('lineLabel', resolveMetroLineNumber(primaryLine.name));
        setField('lineEnglishLabel', `Line ${resolveMetroLineNumber(primaryLine.name)}`.trim());
        setField('routeStations', stationNames.join('\n'));
        setField('currentStationIndex', primaryLine.currentStationIndex);
        setField('routeOrigin', direction === 'first' ? stationNames.at(-1) : stationNames[0]);
        setField('routeTerminal', direction === 'first' ? stationNames[0] : stationNames.at(-1));
        setField('nextStation', isBoundary ? '终 点 站' : nextName);
        setField('nextStationName', isBoundary ? '' : nextName);
        setField(
          'terminalName',
          direction === 'first'
            ? stationNames[0]
            : primaryLine.destinationName || stationNames.at(-1),
        );
        setField('travelDirection', direction);
        setField('routeStationState', isBoundary ? 'terminal_station' : 'next_station');
        setField(
          'stationNamePinyin',
          toUppercasePinyin(stationNames[primaryLine.currentStationIndex] ?? ''),
        );
        setField('nextStationPinyin', toUppercasePinyin(nextName ?? ''));
        setField(
          'terminalNamePinyin',
          toUppercasePinyin(
            direction === 'first' ? (stationNames[0] ?? '') : (stationNames.at(-1) ?? ''),
          ),
        );
        setField('routeFirstLast', primaryLine.firstLastBus);
        setField('operator', primaryLine.operator);
        setField('accentColor', primaryServerTransitLine?.color?.toUpperCase());
      }
    }

    // 站点属性自动回填：与界面上的「站点属性」下拉保持一致；方向混合时留空。
    setField(
      'terminalRole',
      derivedTerminalRole.role === 'origin'
        ? '始发站'
        : derivedTerminalRole.role === 'terminal'
          ? '终点站'
          : '',
    );

    return values;
  };

  const applyTransitNetworkToFields = () => {
    if (!selected || !activeTransitStation) {
      blockAction('请先在数据来源中选择站点。');
      return;
    }
    const values = buildTransitNetworkFieldValues(selected.template.fields);
    if (!Object.keys(values).length) {
      blockAction('当前模板没有可套用的线网字段。');
      return;
    }
    setInput((current) => ({ ...current, ...values }));
    clearPreview();
    publishToastRequested({
      message: `已从线网套用 ${Object.keys(values).length} 个字段。`,
      tone: 'success',
    });
  };

  const loadWorkspace = async () => {
    setIsWorkspaceLoading(true);
    try {
      const templateResponse = await fetch(appPath('/api/materials/templates'), {
        cache: 'no-store',
      });
      const templateData =
        (await readJsonResponse<{
          items?: PublishedMaterialTemplate[];
          message?: string;
        }>(templateResponse)) ?? {};
      if (!templateResponse.ok) {
        setWorkspaceBlockMessage(templateData.message ?? t('materialStudio.templateReadFailed'));
        return;
      }

      const nextItems = templateData.items ?? [];
      setItems(nextItems);
      const availableTemplates = nextItems.filter(
        (item) =>
          families.includes(item.template.family) ||
          includedTemplateIds?.includes(item.id) === true,
      );
      // 工作台以导视牌编辑为主入口，默认选中它；路牌等工作台可通过 defaultTemplateId 覆盖。
      const configuredDefaultTemplateId =
        defaultTemplateId ?? (workspace ? METRO_WAYFINDING_TEMPLATE_ID : undefined);
      const preferredTemplateId =
        (configuredDefaultTemplateId &&
        availableTemplates.some((item) => item.id === configuredDefaultTemplateId)
          ? configuredDefaultTemplateId
          : undefined) ??
        // 有合并入口时，默认选第一个入口里的第一套版式，而不是按 ID 排序的第一条。
        (templateGroups ?? [])
          .flatMap((group) => group.templateIds)
          .find((templateId) => availableTemplates.some((item) => item.id === templateId)) ??
        availableTemplates[0]?.id;
      if (preferredTemplateId) {
        setSelectedTemplateId((current) => current || preferredTemplateId);
      }

      const pendingRequests: Array<Promise<void>> = [
        fetch(appPath('/api/materials/drafts'), { cache: 'no-store' })
          .then(async (response) => {
            const data = (await readJsonResponse<{ items?: MaterialDraft[] }>(response)) ?? {};
            if (response.ok) {
              setDrafts(data.items ?? []);
            }
          })
          .catch(() => undefined),
      ];
      const requiresTransitLineList =
        serverSource === 'transit_line' ||
        serverSource === 'transit_station' ||
        Object.values(serverSources ?? {}).includes('transit_line') ||
        Object.values(serverSources ?? {}).includes('transit_station') ||
        nextItems.some(
          (item) =>
            (families.includes(item.template.family) ||
              includedTemplateIds?.includes(item.id) === true) &&
            item.id === METRO_WAYFINDING_TEMPLATE_ID,
        );
      if (requiresTransitLineList) {
        pendingRequests.push(
          fetch(appPath('/api/materials/transit-lines'), { cache: 'no-store' })
            .then(async (response) => {
              const data =
                (await readJsonResponse<{ items?: TransitLineOption[] }>(response)) ?? {};
              if (response.ok) {
                const lines = data.items ?? [];
                setTransitLines(lines);
                setSelectedLineId((current) => current || lines[0]?.id || '');
                setSelectedStationSourceId(
                  (current) => current || lines[0]?.stations[0]?.stationSourceId || '',
                );
              }
            })
            .catch(() => undefined),
        );
      }
      if (
        serverSource === 'transit_station' ||
        Object.values(serverSources ?? {}).includes('transit_station')
      ) {
        pendingRequests.push(
          fetch(appPath('/api/materials/transit-stations'), { cache: 'no-store' })
            .then(async (response) => {
              const data =
                (await readJsonResponse<{ items?: TransitStationOption[] }>(response)) ?? {};
              if (response.ok) {
                const stations = data.items ?? [];
                setTransitStations(stations);
                setSelectedTransitStationMarkerId(
                  (current) => current || stations[0]?.markerId || '',
                );
              }
            })
            .catch(() => undefined),
        );
      }
      const requiresLocationList =
        allowTransitNetworkImport ||
        serverSource === 'map_location' ||
        serverSource === 'road_coordinate' ||
        Object.values(serverSources ?? {}).some(
          (source) => source === 'map_location' || source === 'road_coordinate',
        );
      if (requiresLocationList) {
        pendingRequests.push(
          fetch(appPath('/api/materials/locations'), { cache: 'no-store' })
            .then(async (response) => {
              const data =
                (await readJsonResponse<{ items?: MaterialLocationOption[] }>(response)) ?? {};
              if (response.ok) {
                const nextLocations = data.items ?? [];
                setLocations(nextLocations);
                setSelectedLocationId((current) => current || nextLocations[0]?.id || '');
              }
            })
            .catch(() => undefined),
        );
      }
      // 门牌模板只列「带门牌号的 POI」：服务端按地址解析结果过滤，前端不再重复判断。
      if (families.includes('address_sign')) {
        pendingRequests.push(
          fetch(appPath('/api/materials/locations?kind=address'), { cache: 'no-store' })
            .then(async (response) => {
              const data =
                (await readJsonResponse<{ items?: MaterialLocationOption[] }>(response)) ?? {};
              if (response.ok) {
                setAddressPoiLocations(data.items ?? []);
              }
            })
            .catch(() => undefined),
        );
      }
      if (
        serverSource === 'map_location' ||
        serverSource === 'road_coordinate' ||
        Object.values(serverSources ?? {}).some(
          (source) => source === 'map_location' || source === 'road_coordinate',
        )
      ) {
        pendingRequests.push(
          fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' })
            .then(async (response) => {
              const data =
                (await readJsonResponse<{ items?: TileProviderDescriptor[] }>(response)) ?? {};
              if (!response.ok) {
                return;
              }
              const tileTemplates = selectMapTileTemplates(data.items ?? []);
              setTileTemplate(tileTemplates.tileTemplate);
              setFreshTileTemplate(tileTemplates.freshTileTemplate);
            })
            .catch(() => undefined),
        );
      }
      await Promise.all(pendingRequests);
      setWorkspaceBlockMessage(availableTemplates.length ? '' : t('materialStudio.noTemplates'));
    } catch {
      setItems([]);
      setWorkspaceBlockMessage(t('materialStudio.workspaceUnavailable'));
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  // 模板源码只在初始化时取一次：之后字段变化由浏览器本地合成 SVG，不再请求预览接口。
  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/materials/template-sources'), { cache: 'no-store' })
      .then(async (response) => {
        const data =
          (await readJsonResponse<{
            items?: Array<{ id: string; version: number; source: string }>;
          }>(response)) ?? {};
        if (!response.ok || cancelled) {
          return;
        }
        const next: Record<string, string> = {};
        for (const item of data.items ?? []) {
          next[`${item.id}:${item.version}`] = item.source;
        }
        setTemplateSources(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sourceIntentRevision = transitNetworkSourceIntentRevisionRef.current;
    void readLatestMaterialOfflineDraft(studioId).then((record) => {
      if (cancelled) {
        return;
      }
      localDraftRef.current = record ?? null;
      setLocalDraft(record ?? null);
      if (record) {
        setSelectedTemplateId(record.templateId);
        setMode(record.mode);
        if (transitNetworkSourceIntentRevisionRef.current === sourceIntentRevision) {
          setTransitNetworkSource(record.transitNetworkSource);
          setImportedTransitNetwork(record.importedTransitNetwork);
        }
        // 恢复上次套用的车站 / 线路，模板库打开时才能预填。
        const selection = record.transitSelection;
        if (selection) {
          if (selection.stationMarkerId) {
            setSelectedTransitStationMarkerId(selection.stationMarkerId);
          }
          if (selection.importedStationNodeId) {
            setSelectedImportedStationNodeId(selection.importedStationNodeId);
          }
          if (selection.direction) {
            setTransitDirection(selection.direction);
          }
          if (selection.lineIds?.length) {
            setSelectedTransitLineIds(selection.lineIds);
          }
          if (selection.projectLineKey) {
            setMetroLineMapProjectLineKey(selection.projectLineKey);
          }
          if (selection.projectNodeId) {
            setMetroLineMapProjectNodeId(selection.projectNodeId);
          }
          if (selection.terminalRole !== undefined) {
            setTransitTerminalRole(selection.terminalRole);
          }
        }
      }
      setLocalDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(
    () =>
      subscribeTransitNetworkSourceChanged(
        studioId,
        ({ source, reason, snapshot, clearSnapshot, projectOrigin }) => {
          if (reason !== 'initialization') {
            transitNetworkSourceIntentRevisionRef.current += 1;
            // 换数据来源后，为上一个来源补录的首末班车时间就失效了；留着会盖掉
            // 服务器线网真实解析出来的值（初始化时不能清，草稿里可能就存着它）。
            setInput((current) => {
              if (!current[SERVICE_TIME_FIELD_KEY]) return current;
              const next = { ...current };
              delete next[SERVICE_TIME_FIELD_KEY];
              return next;
            });
          }
          if (reason !== 'initialization' || transitNetworkSourceIntentRevisionRef.current === 0) {
            setTransitNetworkSource(source);
          }
          if (reason !== 'initialization') {
            // 公交站牌：服务器线网默认方块样式，导入 / 示例项目默认拟真样式。
            const layoutGroup = activeLayoutGroupRef.current;
            const isBusStopStyleGroup =
              layoutGroup &&
              (layoutGroup.id === 'terminal' || layoutGroup.id === 'overview') &&
              layoutGroup.templateIds.some((templateId) =>
                templateId.startsWith('system_material_bus_stop_'),
              );
            if (isBusStopStyleGroup) {
              const targetTemplateId = layoutGroup.templateIds[source === 'rmp' ? 1 : 0];
              if (targetTemplateId && targetTemplateId !== selectedTemplateIdRef.current) {
                setSelectedTemplateId(targetTemplateId);
              }
            }
          }
          if (projectOrigin) setTransitProjectOrigin(projectOrigin);
          if (snapshot) setImportedTransitNetwork(snapshot);
          if (clearSnapshot) {
            setImportedTransitNetwork(undefined);
            setTransitProjectOrigin('none');
          }
          setSelectedTransitLineIds([]);
          clearPreview();
        },
      ),
    [studioId],
  );

  useEffect(
    () =>
      subscribeTransitNetworkProjectSnapshotChanged(studioId, ({ snapshot }) => {
        setImportedTransitNetwork(snapshot);
        setSelectedTransitLineIds([]);
        clearPreview();
      }),
    [studioId],
  );

  useEffect(() => {
    if (!selected || !localDraftReady) {
      return;
    }
    const savedDraft =
      localDraft?.templateId === selected.id &&
      localDraft.templateVersion === selected.template.version
        ? localDraft
        : undefined;
    const fieldKeys = new Set(selected.template.fields.map((field) => field.key));
    const restoredInput = savedDraft?.input
      ? Object.fromEntries(Object.entries(savedDraft.input).filter(([key]) => fieldKeys.has(key)))
      : undefined;
    const nextInput =
      restoredInput ??
      Object.fromEntries(
        selected.template.fields.map((field) => [field.key, field.defaultValue ?? '']),
      );
    setInput(nextInput);
    // 初始化 / 恢复草稿即视为「套用完成」，此刻的文本就是免审核基线。
    setMaterialBaseline({
      signature: buildMaterialTemplateTextSignature(selected.template, nextInput),
      input: nextInput,
    });
    setCanvas((current) => {
      const locked = resolveMaterialCanvasLocks({
        templateId: selected.id,
        layout: nextInput.layout,
      });
      // 导视牌双行版式的高度由版式决定（2 米）。
      const lockedHeightM =
        selected.id === METRO_WAYFINDING_TEMPLATE_ID &&
        parseMetroWayfindingLayout(nextInput.layout ?? '').mode === 'double'
          ? 2
          : selected.template.defaultCanvas.heightM;
      if (savedDraft?.canvas) {
        // 旧草稿可能保存了被锁维度的旧值：恢复时按当前模板规则纠正。
        return {
          ...savedDraft.canvas,
          widthM: locked.width ? selected.template.defaultCanvas.widthM : savedDraft.canvas.widthM,
          heightM: locked.height ? lockedHeightM : savedDraft.canvas.heightM,
        };
      }
      const base = {
        ...selected.template.defaultCanvas,
        heightM: locked.height ? lockedHeightM : selected.template.defaultCanvas.heightM,
        pxPerMeter: selected.template.defaultCanvas.tileSizePx,
      };
      // 切换模板/版式时保留当前对齐单位，只重置版式自身的默认尺寸。
      if (!current) {
        return base;
      }
      return {
        ...base,
        tileSizePx: current.tileSizePx,
        pxPerMeter: current.tileSizePx,
      };
    });
  }, [localDraft?.localDraftId, localDraftReady, selected?.id, selected?.template.version]);

  useEffect(() => {
    if (!localDraftReady || !selected || !activeCanvas) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const current = localDraftRef.current;
      const now = new Date().toISOString();
      const isDifferentTemplate = Boolean(
        current &&
        (current.templateId !== selected.id ||
          current.templateVersion !== selected.template.version),
      );
      const nextRecord: MaterialOfflineDraftRecord = {
        localDraftId:
          isDifferentTemplate || !current ? createMaterialOfflineDraftId() : current.localDraftId,
        studioId,
        templateId: selected.id,
        templateVersion: selected.template.version,
        input,
        canvas: activeCanvas,
        mode,
        transitNetworkSource,
        importedTransitNetwork,
        transitSelection: {
          stationMarkerId: selectedTransitStationMarkerId || undefined,
          importedStationNodeId: selectedImportedStationNodeId || undefined,
          direction: transitDirection,
          lineIds: selectedTransitLineIds.length ? selectedTransitLineIds : undefined,
          projectLineKey: metroLineMapProjectLineKey || undefined,
          projectNodeId: metroLineMapProjectNodeId || undefined,
          terminalRole: transitTerminalRole,
        },
        createdAt: isDifferentTemplate || !current ? now : current.createdAt,
        updatedAt: now,
        syncStatus: 'local',
        serverDraftId: isDifferentTemplate ? undefined : current?.serverDraftId,
      };
      localDraftRef.current = nextRecord;
      setLocalDraft(nextRecord);
      void upsertMaterialOfflineDraft(nextRecord);
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeCanvas,
    importedTransitNetwork,
    input,
    localDraftReady,
    metroLineMapProjectLineKey,
    metroLineMapProjectNodeId,
    mode,
    selected,
    selectedImportedStationNodeId,
    selectedTransitLineIds,
    selectedTransitStationMarkerId,
    studioId,
    transitDirection,
    transitNetworkSource,
    transitTerminalRole,
  ]);

  useEffect(() => {
    if (!isMetroWayfinding) {
      return;
    }
    setCanvas((current) =>
      current && (current.pxPerMeter !== 128 || current.tileSizePx !== 128 || current.alignToTile)
        ? { ...current, pxPerMeter: 128, tileSizePx: 128, alignToTile: false }
        : current,
    );
  }, [isMetroWayfinding]);

  useEffect(() => {
    if (!canUseServerSource && mode === 'server') {
      setMode('manual');
    }
  }, [canUseServerSource, mode]);

  // 非地铁模板改为「从线网套用」向导，不再保留隐藏的服务器模式。
  useEffect(() => {
    if (workspace && !isMetroWayfinding && mode === 'server') {
      setMode('manual');
    }
  }, [isMetroWayfinding, mode, workspace]);

  useEffect(() => {
    if (activeServerSource === 'road_coordinate' && !roadCoordinate) {
      const initialCoordinate = locations.find((location) => location.coordinate)?.coordinate;
      if (initialCoordinate) {
        setRoadCoordinate(initialCoordinate);
      }
    }
  }, [activeServerSource, locations, roadCoordinate]);

  // 路牌落点提示：坐标变化后去服务端匹配最近道路，告诉用户将套用到哪条路的哪一侧。
  useEffect(() => {
    if (!roadCoordinate) {
      setRoadSideHint(null);
      setIsRoadSideHintLoading(false);
      setIsRoadSideHintChecked(false);
      return undefined;
    }
    let cancelled = false;
    const [x, z] = roadCoordinate;
    setIsRoadSideHintLoading(true);
    setIsRoadSideHintChecked(false);
    const timer = window.setTimeout(() => {
      void fetch(appPath(`/api/materials/road-match?x=${x}&z=${z}`), { cache: 'no-store' })
        .then((response) =>
          response.ok
            ? readJsonResponse<{
                hint?: {
                  roadName: string;
                  side: 'north' | 'south' | 'east' | 'west';
                  installation: [number, number];
                  distance: number;
                } | null;
              }>(response)
            : null,
        )
        .then((data) => {
          if (!cancelled) {
            setRoadSideHint(data?.hint ?? null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRoadSideHint(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsRoadSideHintLoading(false);
            setIsRoadSideHintChecked(true);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roadCoordinate]);

  // 门牌模板：当前选中的地点如果不在「带门牌号 POI」列表里，自动落到第一条可用项。
  useEffect(() => {
    if (!usesAddressPoiSource || !addressPoiLocations.length) {
      return;
    }
    setSelectedLocationId((current) =>
      addressPoiLocations.some((location) => location.id === current)
        ? current
        : addressPoiLocations[0]!.id,
    );
  }, [usesAddressPoiSource, addressPoiLocations]);

  useEffect(() => {
    if (transitNetworkSource !== 'rmp' || !importedTransitStations.length) return;
    setSelectedImportedStationNodeId((current) =>
      importedTransitStations.some((station) => station.markerId === current)
        ? current
        : (importedTransitStations[0]?.markerId ?? ''),
    );
  }, [importedTransitStations, transitNetworkSource]);

  useEffect(() => {
    // 数据尚未加载时不清理已恢复的线路选择，否则会丢掉草稿里预填的车站 / 线路。
    if (!selectableTransitLines.length) {
      return;
    }
    const selectableIds = new Set(selectableTransitLines.map((line) => line.id));
    setSelectedTransitLineIds((current) => {
      const retained = current.filter((lineId) => selectableIds.has(lineId));
      const next =
        retained.length > 0
          ? retained.slice(0, maximumTransitLineCount)
          : selectableTransitLines.slice(0, maximumTransitLineCount).map((line) => line.id);
      return arraysEqual(current, next) ? current : next;
    });
  }, [maximumTransitLineCount, selectableTransitLines]);

  useEffect(() => {
    const options = activeTransitStation?.directionOptions ?? [];
    if (options.length && !options.some((option) => option.value === transitDirection)) {
      setTransitDirection(options[0]!.value);
    }
  }, [activeTransitStation, transitDirection]);

  useEffect(() => {
    if (
      !activeTransitLineColor ||
      !selected?.template.fields.some((field) => field.key === 'accentColor')
    ) {
      return;
    }
    setInput((current) =>
      current.accentColor === activeTransitLineColor
        ? current
        : { ...current, accentColor: activeTransitLineColor },
    );
    clearPreview();
  }, [activeTransitLineColor, selected?.id]);

  useEffect(() => {
    if (!isMetroVerticalLineMap || input.trackPosition !== 'both') {
      return;
    }
    const primary = input.travelDirection === 'first' ? 'first' : 'last';
    const secondary = input.travelDirectionSecondary;
    if ((secondary === 'first' || secondary === 'last') && secondary !== primary) {
      return;
    }
    setInput((current) => ({
      ...current,
      travelDirectionSecondary: primary === 'first' ? 'last' : 'first',
    }));
  }, [
    input.trackPosition,
    input.travelDirection,
    input.travelDirectionSecondary,
    isMetroVerticalLineMap,
  ]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  useEffect(() => {
    const previewDialogQuery = window.matchMedia(MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY);
    const singleColumnQuery = window.matchMedia(SINGLE_COLUMN_MEDIA_QUERY);
    const syncViewport = () => {
      setIsPreviewDialogViewport(previewDialogQuery.matches);
      setIsSingleColumnViewport(singleColumnQuery.matches);
      if (!previewDialogQuery.matches) {
        setIsPreviewDialogOpen(false);
      }
    };

    syncViewport();
    previewDialogQuery.addEventListener('change', syncViewport);
    singleColumnQuery.addEventListener('change', syncViewport);
    return () => {
      previewDialogQuery.removeEventListener('change', syncViewport);
      singleColumnQuery.removeEventListener('change', syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!isPreviewDialogOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewDialogOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isPreviewDialogOpen]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    clearPreview();
  };

  // 「版式」与「样式」是两个独立维度：切换版式时尽量保留当前样式（新版 / 旧版）。
  const layoutSwitchLabel = selectedEntry?.layoutLabelKey
    ? t(selectedEntry.layoutLabelKey)
    : (selectedEntry?.layoutLabel ?? t('materialStudio.variant'));
  const availableLayoutGroups = selectedEntry?.layoutGroups?.filter((group) =>
    group.templateIds.some((templateId) =>
      availableEntryVariants?.some((item) => item.id === templateId),
    ),
  );
  const activeLayoutGroup = availableLayoutGroups?.find((group) =>
    group.templateIds.includes(selected?.id ?? ''),
  );
  useEffect(() => {
    activeLayoutGroupRef.current = activeLayoutGroup;
    selectedTemplateIdRef.current = selected?.id ?? null;
  });
  const layoutStyleVariants = activeLayoutGroup
    ? availableEntryVariants?.filter((item) => activeLayoutGroup.templateIds.includes(item.id))
    : availableEntryVariants;
  const selectLayoutGroup = (group: MaterialTemplateLayoutGroup) => {
    if (!availableEntryVariants?.length) {
      return;
    }
    const styleIndex = activeLayoutGroup
      ? Math.max(activeLayoutGroup.templateIds.indexOf(selected?.id ?? ''), 0)
      : 0;
    const candidates = [group.templateIds[styleIndex], ...group.templateIds];
    const next = candidates
      .map(
        (templateId) => templateId && availableEntryVariants.find((item) => item.id === templateId),
      )
      .find((item): item is PublishedMaterialTemplate => Boolean(item));
    if (next) {
      applyTemplateDirect(next.id);
    }
  };

  useEffect(() => {
    if (
      stationSupportsTerminalVariant ||
      !selected?.template.fields.some((field) => field.key === 'terminalRole')
    ) {
      return;
    }
    const fallback = selectedEntryVariants?.find(
      (item) => !item.template.fields.some((field) => field.key === 'terminalRole'),
    );
    if (fallback) {
      setSelectedTemplateId(fallback.id);
      clearPreview();
    }
  }, [selected?.id, selectedEntryVariants, stationSupportsTerminalVariant]);

  /**
   * 模板库跨入口切换时把已选线路 / 站点带到目标数据来源。
   *
   * 线路图来源选的是「线路 + 该线路上的站」，公交站牌来源选的是「站点 + 该站的线路」，
   * 两者字段口径不同；不做映射的话，向导里看起来就像“已选内容忽然变成另一条线”。
   */
  const carryTransitSelectionToSourceKind = (nextSourceKind: MaterialServerSource | undefined) => {
    if (!nextSourceKind || nextSourceKind === activeServerSource) {
      return;
    }
    // 项目线网与服务器线网是两套数据，无法按名称可靠映射。
    if (transitNetworkSource !== 'server') {
      return;
    }
    if (nextSourceKind === 'transit_station') {
      // 只认当前「线路来源」上真正选中的那个站；当前来源不是线路时不拿站点来源的
      // 默认值凑数，否则又会变相套用一条没选过的公交线路。
      const stationName =
        activeServerSource === 'transit_line'
          ? (selectedLine?.stations.find(
              (station) => station.stationSourceId === selectedStationSourceId,
            )?.stationName ?? '')
          : '';
      const station = stationName
        ? transitStations.find((item) => item.stationName === stationName)
        : undefined;
      if (!station) {
        // 目标站点网络里没有同名站点（例如地铁站切到公交站牌）：
        // 清空选择而不是静默套用默认的第一条公交线路。
        setSelectedTransitStationMarkerId('');
        setSelectedTransitLineIds([]);
        return;
      }
      setSelectedTransitStationMarkerId(station.markerId);
      const lineIds = selectedLineId
        ? station.lines.filter((line) => line.lineId === selectedLineId).map((line) => line.id)
        : station.lines
            .filter((line) => line.direction === transitDirection)
            .map((line) => line.id);
      setSelectedTransitLineIds(lineIds.slice(0, maximumTransitLineCount));
      const primaryLine = station.lines.find((line) => line.id === lineIds[0]);
      if (primaryLine && primaryLine.direction !== 'unknown') {
        setTransitDirection(primaryLine.direction);
      }
      return;
    }
    if (nextSourceKind === 'transit_line') {
      const station = selectedTransitStation;
      const lineId = primarySelectedTransitLine?.lineId ?? station?.lines[0]?.lineId;
      if (!lineId) {
        return;
      }
      setSelectedLineId(lineId);
      if (station?.stationSourceId) {
        setSelectedStationSourceId(station.stationSourceId);
      }
    }
  };

  /**
   * 打开「模板库」：预填当前（或目标）模板的版式 / 样式，确认后才真正切换。
   * 取消不做任何修改，字段与画布因此自然保持切换前的状态。
   */
  const openApplyWizard = (targetTemplateId?: string) => {
    if (!selected) {
      return;
    }
    const targetId = targetTemplateId ?? selected.id;
    const targetEntry =
      templateEntries.find((entry) => entry.templateIds.includes(targetId)) ?? selectedEntry;
    const targetGroup = targetEntry?.layoutGroups?.find((group) =>
      group.templateIds.includes(targetId),
    );
    const targetTemplate = templates.find((item) => item.id === targetId);
    carryTransitSelectionToSourceKind(
      targetTemplate
        ? (serverSources?.[targetTemplate.template.family] ?? serverSource)
        : undefined,
    );
    setApplyWizardEntryId(targetEntry?.id ?? '');
    setApplyWizardStyleIndex(
      targetGroup ? Math.max(targetGroup.templateIds.indexOf(targetId), 0) : 0,
    );
    setApplyWizardTemplateId(targetId);
    setIsApplyWizardOpen(true);
  };

  /** 切换到地铁导视牌：不弹套用向导，直接恢复该模板上次的本机草稿。 */
  const openWayfindingTemplate = (templateId: string) => {
    setMode('manual');
    setPendingWizardApply(null);
    selectTemplate(templateId);
    void readMaterialOfflineDraftForTemplate(studioId, templateId).then((record) => {
      if (!record) {
        return;
      }
      // 草稿版本可能落后于当前发布版本：按当前版本号恢复，避免被初始化逻辑当成不匹配。
      const targetVersion = templates.find((item) => item.id === templateId)?.template.version;
      setLocalDraft(
        targetVersion !== undefined ? { ...record, templateVersion: targetVersion } : record,
      );
    });
  };

  /** 跨模板切换：弹新模板的模板库确认，避免直接把旧模板字段搬过去。 */
  const requestTemplateChange = (templateId: string) => {
    if (!templateId || templateId === selected?.id) {
      return;
    }
    if (templateId === METRO_WAYFINDING_TEMPLATE_ID) {
      setIsApplyWizardOpen(false);
      openWayfindingTemplate(templateId);
      return;
    }
    openApplyWizard(templateId);
  };

  /** 路牌与门牌共用道路名称/拼音：切模板时把目标模板里存在的同名字段带过去。 */
  const buildCarriedRoadValues = (
    targetFields: ReadonlyArray<{ key: string }>,
    targetFamily: MaterialFamily | undefined,
  ) => {
    if (targetFamily !== 'road_sign' && targetFamily !== 'address_sign') {
      return {};
    }
    const targetKeys = new Set(targetFields.map((field) => field.key));
    const source = { ...materialFieldMemoryRef.current, ...input };
    return Object.fromEntries(
      Object.entries(source).filter(([key, value]) => targetKeys.has(key) && Boolean(value)),
    );
  };

  /** 同入口内改版式 / 样式：直接切换，并按当前套用的车站重新套入字段。 */
  const applyTemplateDirect = (templateId: string) => {
    if (!templateId || templateId === selected?.id) {
      return;
    }
    const target = templates.find((item) => item.id === templateId);
    if (!target) {
      selectTemplate(templateId);
      return;
    }
    // 先记住当前模板的全部输入，再切走；否则目标模板没有的字段（如怀旧没有拼音）会丢失。
    materialFieldMemoryRef.current = { ...materialFieldMemoryRef.current, ...input };
    const values = {
      ...buildCarriedRoadValues(target.template.fields, target.template.family),
      ...buildTransitNetworkFieldValues(target.template.fields, target.template.family),
    };
    setPendingWizardApply({ templateId, values });
    setMode('manual');
    selectTemplate(templateId);
  };

  // 样式维度：方块 / 拟真、新版 / 旧版等，取自模板标题后缀。
  // 只从「含多个样式变体」的版式组里取，避免把「线路详情」这种版式名误当成样式。
  const applyWizardStyleOptions = useMemo(() => {
    const labels = new Map<string, number>();
    // 没有版式分组时（如门牌），样式变体就是入口下的全部模板。
    const styleGroups = applyWizardLayoutGroups?.length
      ? applyWizardLayoutGroups
      : [{ id: 'all', templateIds: applyWizardVariants?.map((item) => item.id) ?? [] }];
    for (const group of styleGroups) {
      if (group.templateIds.length < 2) {
        continue;
      }
      group.templateIds.forEach((templateId, index) => {
        const item = applyWizardVariants?.find((candidate) => candidate.id === templateId);
        const label = item?.template.title.match(/（([^）]+)）\s*$/u)?.[1];
        if (label && !labels.has(label)) {
          labels.set(label, index);
        }
      });
    }
    if (!labels.size) {
      return [{ value: '0', label: '默认样式' }];
    }
    return [...labels.entries()].map(([label, index]) => ({
      value: String(index),
      label,
    }));
  }, [applyWizardLayoutGroups, applyWizardVariants]);

  const applyWizardLayoutCards = useMemo(() => {
    const groups = applyWizardLayoutGroups?.length
      ? applyWizardLayoutGroups
      : [
          {
            id: 'all',
            label: t('materialStudio.preview'),
            templateIds: applyWizardVariants?.map((item) => item.id) ?? [],
          },
        ];
    return groups.flatMap((group) => {
      const templateId =
        group.templateIds[applyWizardStyleIndex] ??
        group.templateIds.find((candidate) => candidate) ??
        '';
      const item = applyWizardVariants?.find((candidate) => candidate.id === templateId);
      if (!item) {
        return [];
      }
      return [
        {
          id: group.id,
          label: group.labelKey ? t(group.labelKey) : (group.label ?? group.id),
          templateId: item.id,
          template: item.template,
        },
      ];
    });
  }, [applyWizardStyleIndex, applyWizardLayoutGroups, applyWizardVariants, t]);

  useEffect(() => {
    if (!isApplyWizardOpen) {
      return;
    }
    if (!applyWizardLayoutCards.some((card) => card.templateId === applyWizardTemplateId)) {
      setApplyWizardTemplateId(applyWizardLayoutCards[0]?.templateId ?? '');
    }
  }, [applyWizardLayoutCards, applyWizardTemplateId, isApplyWizardOpen]);

  /**
   * 按目标模板家族构建数据来源：模板库允许公交 ↔ 地铁互转，
   * 不能沿用当前画布家族的数据来源类型。
   */
  const buildServerSourceForFamily = (
    family: MaterialFamily,
    fields: ReadonlyArray<MaterialField>,
  ): { source: unknown; networkGeometry?: MaterialTransitNetworkSnapshot } | undefined => {
    const sourceKind = serverSources?.[family] ?? serverSource;
    const networkGeometry = transitNetworkSource === 'rmp' ? importedTransitNetwork : undefined;
    if (sourceKind === 'transit_line') {
      if (transitNetworkSource === 'rmp') {
        if (!metroLineMapProjectLine) {
          return undefined;
        }
        return {
          source: {
            kind: 'transit_line',
            lineId: metroLineMapProjectLine.lineKey,
            networkLineKey: metroLineMapProjectLine.lineKey,
            networkNodeId: metroLineMapProjectNodeId || undefined,
          },
          networkGeometry,
        };
      }
      if (!selectedLine) {
        return undefined;
      }
      return {
        source: {
          kind: 'transit_line',
          lineId: selectedLine.id,
          stationSourceId: selectedStationSourceId || undefined,
        },
      };
    }
    if (sourceKind === 'transit_station') {
      const requiresTerminalRole = fields.some((field) => field.key === 'terminalRole');
      if (transitNetworkSource === 'rmp') {
        if (!selectedImportedStationNodeId) {
          return undefined;
        }
        const lineSelections = selectedTransitLineIds.flatMap((lineId) => {
          const line = selectableImportedTransitLines.find((candidate) => candidate.id === lineId);
          return line ? [{ lineKey: line.lineKey, direction: line.direction }] : [];
        });
        return {
          source: {
            kind: 'transit_station',
            networkNodeId: selectedImportedStationNodeId,
            lineSelections,
            terminalRole: requiresTerminalRole ? transitTerminalRole : undefined,
          },
          networkGeometry,
        };
      }
      if (!selectedTransitStationMarkerId || !selectedTransitLineIds.length) {
        return undefined;
      }
      return {
        source: {
          kind: 'transit_station',
          stationMarkerId: selectedTransitStationMarkerId,
          direction: transitDirection,
          lineIds: selectedTransitLineIds,
          terminalRole: requiresTerminalRole ? transitTerminalRole : undefined,
        },
      };
    }
    // 路牌 / 门牌：地点或坐标同样可以交给服务端解析出完整字段。
    if (sourceKind === 'map_location' && selectedLocationId) {
      return { source: { kind: 'map_location', locationId: selectedLocationId } };
    }
    if (sourceKind === 'road_coordinate' && roadCoordinate) {
      return { source: { kind: 'road_coordinate', x: roadCoordinate[0], z: roadCoordinate[1] } };
    }
    return undefined;
  };

  const confirmApplyWizard = (templateIdOverride?: string) => {
    const targetTemplateId = templateIdOverride ?? applyWizardTemplateId;
    const card =
      applyWizardLayoutCards.find((item) => item.templateId === targetTemplateId) ??
      applyWizardLayoutCards[0];
    if (!card) {
      blockAction('当前没有可套用的模板版式。');
      return;
    }
    // 地铁导视牌有独立工作台与草稿，切过去时直接恢复上次编辑内容。
    if (card.templateId === METRO_WAYFINDING_TEMPLATE_ID) {
      setIsApplyWizardOpen(false);
      openWayfindingTemplate(card.templateId);
      return;
    }
    const isSwitching = card.templateId !== selected?.id;
    // 切模板前先记住当前输入，保证来回切换时目标模板缺少的字段也能还原。
    materialFieldMemoryRef.current = { ...materialFieldMemoryRef.current, ...input };
    const clientValues = {
      ...buildCarriedRoadValues(card.template.fields, card.template.family),
      ...buildTransitNetworkFieldValues(card.template.fields, card.template.family),
    };
    // 切换模板允许在没有站点数据时先进入编辑；只在「不换模板」时要求有可套用数据。
    if (!isSwitching && !activeTransitStation && activeServerSource === 'transit_station') {
      blockAction('请先在数据来源中选择站点。');
      return;
    }
    // 路牌等工作台没有线网字段，套用只负责切换模板，不要求存在可套用值。
    if (allowTransitNetworkImport && !isSwitching && !Object.keys(clientValues).length) {
      blockAction('当前模板没有可套用的线网字段。');
      return;
    }
    setIsApplyWizardOpen(false);
    setMode('manual');
    if (!isSwitching && selected) {
      setInput((current) => {
        const next = { ...current, ...clientValues };
        // 套用后的文本就是新的免审核基线。
        setMaterialBaseline({
          signature: buildMaterialTemplateTextSignature(selected.template, next),
          input: next,
        });
        return next;
      });
      clearPreview();
      publishToastRequested({
        message: `已从线网套用 ${Object.keys(clientValues).length} 个字段。`,
        tone: 'success',
      });
      return;
    }

    // 换模板：先用客户端推导值立即完成切换，不阻塞在服务端解析上；
    // 服务端字段（线路走向、换乘、开往终点等）返回后再增量合并进当前输入。
    setPendingWizardApply({
      templateId: card.templateId,
      values: clientValues,
      mode: 'reset',
    });
    selectTemplate(card.templateId);
    const targetSource = buildServerSourceForFamily(card.template.family, card.template.fields);
    if (!targetSource) {
      return;
    }
    void (async () => {
      try {
        const response = await fetch(appPath('/api/materials/resolved-input'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: card.templateId,
            templateVersion: card.template.version,
            source: targetSource.source,
            networkGeometry: targetSource.networkGeometry,
          }),
        });
        const data = await readJsonResponse<{ values?: Record<string, string> }>(response);
        if (!response.ok || !data?.values) {
          return;
        }
        setPendingWizardApply({
          templateId: card.templateId,
          values: data.values,
          mode: 'merge',
        });
      } catch {
        // 解析失败时保留客户端推导值，模板切换已经完成。
      }
    })();
  };

  useEffect(() => {
    if (!pendingWizardApply) {
      return;
    }
    if (!selected || selected.id !== pendingWizardApply.templateId) {
      // 用户又切到了别的模板：丢弃这次异步补充值，避免之后切回来时被旧数据覆盖。
      setPendingWizardApply(null);
      return;
    }
    const appliedValues = pendingWizardApply.values;
    // reset：以新模板默认值为底再合并，避免跨模板切换时带入旧模板字段。
    // merge：模板已经切换完成，服务端补充值只增量覆盖到当前输入上。
    const next =
      pendingWizardApply.mode === 'merge'
        ? { ...input, ...appliedValues }
        : {
            ...Object.fromEntries(
              selected.template.fields.map((field) => [field.key, field.defaultValue ?? '']),
            ),
            ...appliedValues,
          };
    materialFieldMemoryRef.current = { ...materialFieldMemoryRef.current, ...next };
    setInput(next);
    setMaterialBaseline({
      signature: buildMaterialTemplateTextSignature(selected.template, next),
      input: next,
    });
    setPendingWizardApply(null);
    clearPreview();
    const appliedCount = Object.keys(appliedValues).length;
    publishToastRequested({
      message:
        pendingWizardApply.mode === 'merge'
          ? t('materialStudio.serverFieldsMerged', { count: appliedCount })
          : appliedCount
            ? `已从线网套用 ${appliedCount} 个字段。`
            : '已切换模板，请选择站点后套用数据。',
      tone: 'success',
    });
  }, [pendingWizardApply, selected]);

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/account/status'), { cache: 'no-store' })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              accountStatus?:
                'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
              serverAccountVerified?: boolean;
            })
          : {},
      )
      .then((payload) => {
        if (!cancelled) {
          setAccountSession(payload);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 导入外部模板后记录基线；之后任何 layout / 画布尺寸改动都会让「未修改」标签失效。
  useEffect(
    () =>
      subscribeMetroWayfindingImportLifecycleEvents(METRO_WAYFINDING_EDITOR_ID, (event) => {
        if (event.type !== 'MetroWayfindingProjectImported') {
          return;
        }
        const preview = event.payload.preview;
        const importedLayout = serializeMetroWayfindingLayout(preview.layout);
        // 导入工程后，导入时的文本就是新的免审核基线。
        setMaterialBaseline({
          signature: buildMetroWayfindingTextSignature(importedLayout),
          input: { layout: importedLayout },
        });
      }),
    [],
  );

  const loadMetroWayfindingExample = (example: MetroWayfindingExample) => {
    if (!isMetroWayfinding) return;
    const layout = serializeMetroWayfindingLayout(example.project.layout);
    setMode('manual');
    setInput((current) => ({
      ...current,
      layout,
    }));
    setCanvas({ ...example.project.canvas });
    setMaterialBaseline({
      signature: buildMetroWayfindingTextSignature(layout),
      input: { layout },
    });
    clearPreview();
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setPreviewSize(null);
    setIsPreviewDialogOpen(false);
  };

  const updateCanvas = <TKey extends keyof MaterialCanvas>(
    key: TKey,
    value: MaterialCanvas[TKey],
  ) => {
    setCanvas((current) => {
      if (!current) {
        return current;
      }
      if (key === 'tileSizePx') {
        const resolution = Number(value);
        return { ...current, pxPerMeter: resolution, tileSizePx: resolution };
      }
      return { ...current, [key]: value };
    });
    clearPreview();
  };

  const downloadBlob = async (
    response: Response,
    fallbackFileName = `${selected?.template.title ?? title}.png`,
  ) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resolveMaterialDownloadFileName(response, fallbackFileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const exportMetroWayfindingProject = () => {
    if (!selected || !activeCanvas || !isMetroWayfinding || mode !== 'manual') {
      blockAction(t('materialStudio.exportOnlyManual'));
      return;
    }
    const project = createMetroWayfindingProjectFile({
      templateId: selected.id,
      templateVersion: selected.template.version,
      canvas: activeCanvas,
      layout: parseMetroWayfindingLayout(input.layout ?? ''),
    });
    const blob = new Blob([serializeMetroWayfindingProjectFile(project)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = buildMetroWayfindingProjectFileName({
      title: selected.template.title,
      canvas: activeCanvas,
      layout: project.layout,
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const showPreviewBlob = async (response: Response, openDialog = true, signal?: AbortSignal) => {
    const blob = await response.blob();
    if (signal?.aborted) {
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setPreviewUrl(objectUrl);
    setPreviewSize({
      width: Number(response.headers.get('X-Yct-Material-Preview-Width')) || 0,
      height: Number(response.headers.get('X-Yct-Material-Preview-Height')) || 0,
    });
    if (openDialog && window.matchMedia(MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY).matches) {
      setIsPreviewDialogOpen(true);
    }
  };

  const buildServerSource = () => {
    if (activeServerSource === 'transit_line') {
      if (transitNetworkSource === 'rmp') {
        if (!metroLineMapProjectLine) {
          return undefined;
        }
        return {
          kind: 'transit_line' as const,
          lineId: metroLineMapProjectLine.lineKey,
          networkLineKey: metroLineMapProjectLine.lineKey,
          networkNodeId: metroLineMapProjectNodeId || undefined,
        };
      }
      if (selectedLine) {
        return {
          kind: 'transit_line' as const,
          lineId: selectedLine.id,
          stationSourceId: selectedStationSourceId || undefined,
        };
      }
    }
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'rmp' &&
      selectedImportedStationNodeId
    ) {
      const lineSelections = selectedTransitLineIds.flatMap((selectedLineId) => {
        const line = selectableImportedTransitLines.find(
          (candidate) => candidate.id === selectedLineId,
        );
        return line ? [{ lineKey: line.lineKey, direction: line.direction }] : [];
      });
      return {
        kind: 'transit_station' as const,
        networkNodeId: selectedImportedStationNodeId,
        lineSelections,
        terminalRole: requiresTransitTerminalRole ? transitTerminalRole : undefined,
      };
    }
    if (activeServerSource === 'transit_station' && selectedTransitStationMarkerId) {
      return {
        kind: 'transit_station' as const,
        stationMarkerId: selectedTransitStationMarkerId,
        direction: transitDirection,
        lineIds: selectedTransitLineIds,
        terminalRole: requiresTransitTerminalRole ? transitTerminalRole : undefined,
      };
    }
    if (activeServerSource === 'map_location' && selectedLocationId) {
      return { kind: 'map_location' as const, locationId: selectedLocationId };
    }
    if (activeServerSource === 'road_coordinate' && roadCoordinate) {
      return { kind: 'road_coordinate' as const, x: roadCoordinate[0], z: roadCoordinate[1] };
    }
    return undefined;
  };

  const buildServerOverrides = () =>
    Object.fromEntries(
      overridableFields.flatMap((field) => {
        const value = input[field.key] ?? field.defaultValue ?? '';
        return value.trim() ? [[field.key, value]] : [];
      }),
    );

  /**
   * 把地点 / 坐标解析成模板字段值，再由本地 SVG 出图。
   * 仅解析字段、不生成 PNG，所以不会进入预览审计链路。
   */
  const applyResolvedSourceValues = async () => {
    if (!selected) {
      return;
    }
    const source = buildServerSource();
    if (!source) {
      blockAction('请先选择地点或填写坐标。');
      return;
    }
    setIsResolvingSource(true);
    try {
      const response = await fetch(appPath('/api/materials/resolved-input'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selected.id,
          templateVersion: selected.template.version,
          source,
        }),
      });
      const data =
        (await readJsonResponse<{ values?: Record<string, string>; message?: string }>(response)) ??
        {};
      if (!response.ok || !data.values) {
        publishToastRequested({
          message: data.message ?? '数据来源解析失败。',
          tone: 'error',
        });
        return;
      }
      const nextInput = { ...input, ...data.values };
      setInput(nextInput);
      // 套用后的文本就是新的免审核基线。
      setMaterialBaseline({
        signature: buildMaterialTemplateTextSignature(selected.template, nextInput),
        input: nextInput,
      });
      clearPreview();
      publishToastRequested({
        message: `已套用 ${Object.keys(data.values).length} 个字段。`,
        tone: 'success',
      });
    } catch {
      publishToastRequested({ message: '数据来源解析失败。', tone: 'error' });
    } finally {
      setIsResolvingSource(false);
    }
  };

  const blockAction = (message: string) => {
    publishMaterialStudioActionBlocked({ studioId, message });
  };

  const requireOnline = (): boolean => {
    if (navigator.onLine) {
      return true;
    }
    blockAction(t('materialStudio.offlineBlocked'));
    return false;
  };

  const syncLocalDraft = async (): Promise<boolean> => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || t('materialStudio.noSyncTemplate'));
      return false;
    }
    if (!requireOnline()) {
      return false;
    }
    if (mode !== 'manual') {
      blockAction(t('materialStudio.serverSubmitOnlineOnly'));
      return false;
    }

    const current = localDraftRef.current;
    const now = new Date().toISOString();
    const record: MaterialOfflineDraftRecord = {
      localDraftId: current?.localDraftId ?? createMaterialOfflineDraftId(),
      studioId,
      templateId: selected.id,
      templateVersion: selected.template.version,
      input,
      canvas: activeCanvas,
      mode,
      transitNetworkSource,
      importedTransitNetwork,
      transitSelection: {
        stationMarkerId: selectedTransitStationMarkerId || undefined,
        importedStationNodeId: selectedImportedStationNodeId || undefined,
        direction: transitDirection,
        lineIds: selectedTransitLineIds.length ? selectedTransitLineIds : undefined,
        projectLineKey: metroLineMapProjectLineKey || undefined,
        projectNodeId: metroLineMapProjectNodeId || undefined,
        terminalRole: transitTerminalRole,
      },
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      syncStatus: 'syncing',
      serverDraftId: current?.serverDraftId,
    };
    localDraftRef.current = record;
    setLocalDraft(record);
    await upsertMaterialOfflineDraft(record);
    setIsSyncingLocalDraft(true);
    try {
      const response = await fetch(appPath('/api/materials/drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: record.templateId,
          templateVersion: record.templateVersion,
          input: record.input,
          canvas: record.canvas,
          clientDraftId: record.localDraftId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as MaterialDraft & {
        message?: string;
      };
      if (publishLoginRequiredForResponse(response)) {
        const failed = {
          ...record,
          syncStatus: 'failed' as const,
          errorMessage: t('materialStudio.loginFirst'),
        };
        localDraftRef.current = failed;
        setLocalDraft(failed);
        await upsertMaterialOfflineDraft(failed);
        return false;
      }
      if (!response.ok || !data.id) {
        const status = response.status === 409 ? 'conflict' : 'failed';
        const failed = {
          ...record,
          syncStatus: status as 'conflict' | 'failed',
          errorMessage: data.message,
        };
        localDraftRef.current = failed;
        setLocalDraft(failed);
        await upsertMaterialOfflineDraft(failed);
        blockAction(data.message ?? t('materialStudio.localSyncFailed'));
        return false;
      }
      const synced: MaterialOfflineDraftRecord = {
        ...record,
        syncStatus: 'synced',
        serverDraftId: data.id,
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      };
      localDraftRef.current = synced;
      setLocalDraft(synced);
      await upsertMaterialOfflineDraft(synced);
      setDrafts((currentDrafts) => [data, ...currentDrafts.filter((item) => item.id !== data.id)]);
      blockAction(t('materialStudio.localSyncedSubmitHint'));
      return true;
    } catch {
      const failed = {
        ...record,
        syncStatus: 'failed' as const,
        errorMessage: t('materialStudio.networkError'),
      };
      localDraftRef.current = failed;
      setLocalDraft(failed);
      await upsertMaterialOfflineDraft(failed);
      blockAction(t('materialStudio.localSyncNetworkError'));
      return false;
    } finally {
      setIsSyncingLocalDraft(false);
    }
  };

  /**
   * 工作台脏状态：以「模板 + 版本 + 输入 + 画布」的签名对比最近一次保存。
   * 本地草稿本来就会自动落库，这里只用于离开确认与 Ctrl+S 是否真的有改动。
   */
  const workspaceStateSignature = useMemo(
    () =>
      JSON.stringify({
        templateId: selected?.id,
        templateVersion: selected?.template.version,
        input,
        canvas: activeCanvas,
      }),
    [activeCanvas, input, selected?.id, selected?.template.version],
  );
  const workspaceBaselineRef = useRef<string | null>(null);
  const [isWorkspaceDirty, setIsWorkspaceDirty] = useState(false);
  useEffect(() => {
    if (!workspace || !localDraftReady || !selected || !activeCanvas) {
      return;
    }
    if (workspaceBaselineRef.current === null) {
      workspaceBaselineRef.current = workspaceStateSignature;
      setIsWorkspaceDirty(false);
      return;
    }
    setIsWorkspaceDirty(workspaceStateSignature !== workspaceBaselineRef.current);
  }, [
    activeCanvas,
    isMetroWayfinding,
    localDraftReady,
    selected,
    workspace,
    workspaceStateSignature,
  ]);

  const saveWorkspace = async (): Promise<boolean> => {
    if (isBusy || isSyncingLocalDraft) {
      return false;
    }
    if (mode !== 'manual') {
      // 链接数据模式每次出图都从服务器线网实时解析，没有可保存的草稿。
      publishToastRequested({ message: '链接数据模式无需保存草稿。', tone: 'info' });
      return true;
    }
    const saved = await syncLocalDraft();
    if (!saved) {
      return false;
    }
    workspaceBaselineRef.current = workspaceStateSignature;
    setIsWorkspaceDirty(false);
    return true;
  };

  /** 工作台工具条的一键切换：服务器线网 ↔ 自定义项目（示例 / 导入）。 */
  const toggleTransitSource = () => {
    const next = transitNetworkSource === 'server' ? 'rmp' : 'server';
    if (next === 'rmp' && !importedTransitNetwork) {
      blockAction('当前没有自定义项目或示例线网，已保持在服务器线网。');
      publishTransitNetworkSourceChanged({
        studioId,
        source: 'server',
        reason: 'selection',
        projectOrigin: 'none',
      });
      return;
    }
    publishTransitNetworkSourceChanged({
      studioId,
      source: next,
      reason: 'selection',
      snapshot: next === 'rmp' ? importedTransitNetwork : undefined,
      projectOrigin: next === 'rmp' ? transitProjectOrigin : 'none',
    });
  };

  const getServerSelectionBlockMessage = (): string | null => {
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'rmp' &&
      !selectedImportedStationNodeId
    ) {
      return t('materialStudio.noProjectStations');
    }
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'server' &&
      !selectedTransitStationMarkerId
    ) {
      return t('materialStudio.selectServerStation');
    }
    if (activeServerSource === 'transit_station' && !selectedTransitLineIds.length) {
      return transitNetworkSource === 'rmp'
        ? t('materialStudio.selectProjectLine')
        : t('materialStudio.selectDirectionLine');
    }
    if (activeServerSource === 'transit_line') {
      if (transitNetworkSource === 'rmp') {
        if (!metroLineMapProjectLine) {
          return '请先在「网络数据」中选择导入的项目线路。';
        }
        if (!metroLineMapProjectNodeId) {
          return '请选择项目当前站。';
        }
        return null;
      }
      if (!selectedLine) {
        return t('materialStudio.selectServerLine');
      }
    }
    if (activeServerSource === 'map_location' && !selectedLocationId) {
      return t('materialStudio.selectServerPlace');
    }
    if (activeServerSource === 'road_coordinate' && !roadCoordinate) {
      return t('materialStudio.selectCoordinate');
    }
    return null;
  };

  const buildPreviewRequestBody = () => {
    if (!selected || !activeCanvas) {
      return undefined;
    }
    const source = mode === 'server' ? buildServerSource() : undefined;
    if (mode === 'server' && (!source || getServerSelectionBlockMessage())) {
      return undefined;
    }
    return mode === 'server'
      ? {
          mode: 'server' as const,
          templateId: selected.id,
          templateVersion: selected.template.version,
          canvas: activeCanvas,
          source: source!,
          networkGeometry: transitNetworkSource === 'rmp' ? importedTransitNetwork : undefined,
          input: buildServerOverrides(),
        }
      : {
          mode: 'manual' as const,
          templateId: selected.id,
          templateVersion: selected.template.version,
          canvas: activeCanvas,
          input,
        };
  };

  const fetchWatermarkedPreview = async (signal?: AbortSignal): Promise<Response | undefined> => {
    if (!requireOnline()) {
      return undefined;
    }
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || t('materialStudio.noTemplates'));
      return undefined;
    }
    const selectionBlockMessage = mode === 'server' ? getServerSelectionBlockMessage() : null;
    if (selectionBlockMessage) {
      blockAction(selectionBlockMessage);
      return undefined;
    }
    const source = mode === 'server' ? buildServerSource() : undefined;
    if (mode === 'server' && !source) {
      blockAction(t('materialStudio.selectLinkedMode', { mode: linkedDataModeLabel }));
      return undefined;
    }

    const requestBody = buildPreviewRequestBody();
    if (!requestBody) {
      return undefined;
    }
    const response = await fetch(appPath('/api/materials/previews'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });
    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      blockAction(data.message ?? t('materialStudio.previewFailed'));
      return undefined;
    }
    return response;
  };

  const livePreviewRequestKey = JSON.stringify(buildPreviewRequestBody() ?? null);
  useEffect(() => {
    // 工作台使用浏览器本地 SVG 实时预览，不再轮询服务端预览接口。
    if (workspace) {
      return;
    }
    if (!isOnline || livePreviewRequestKey === 'null') {
      setIsPreviewRendering(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsPreviewRendering(true);
      void fetch(appPath('/api/materials/previews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: livePreviewRequestKey,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || controller.signal.aborted) {
            return;
          }
          await showPreviewBlob(response, false, controller.signal);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setIsPreviewRendering(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsPreviewRendering(false);
          }
        });
    }, 300);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isOnline, livePreviewRequestKey, workspace]);

  const downloadWatermarkedPreview = async () => {
    const response = await fetchWatermarkedPreview();
    if (!response) {
      return;
    }
    const rawSummary = response.headers.get('X-Yct-Material-Content-Summary') ?? '';
    let summary = '';
    try {
      summary = decodeURIComponent(rawSummary);
    } catch {
      summary = rawSummary;
    }
    const previewId = response.headers.get('X-Yct-Material-Preview-Id')?.trim() ?? '';
    const fallbackFileName =
      [selected?.template.title ?? title, summary, previewId.slice(-8)].filter(Boolean).join('_') +
      `${t('materialStudio.watermarkedPreviewSuffix')}.png`;
    await downloadBlob(response, fallbackFileName);
  };

  const requestPreview = async () => {
    const startedAt = Date.now();
    let succeeded = false;
    if (isPreviewDialogViewport || workspace) {
      // 窄屏 / 工作台没有常驻预览区：先打开弹窗承载加载动画，拿到结果后再替换为图片。
      setIsPreviewDialogOpen(true);
    }
    setIsBusy(true);
    setIsPreviewRendering(true);
    try {
      const response = await fetchWatermarkedPreview();
      if (!response) {
        return;
      }
      await showPreviewBlob(response);
      succeeded = true;
    } catch {
      blockAction(t('materialStudio.previewNetworkError'));
    } finally {
      // 避免本地渲染太快导致加载动画一闪而过。
      const remainingMs = 260 - (Date.now() - startedAt);
      if (remainingMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
      }
      setIsBusy(false);
      setIsPreviewRendering(false);
      if (!succeeded) {
        setIsPreviewDialogOpen(false);
      }
    }
  };

  const submitManualDraft = async () => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || t('materialStudio.noSubmittableTemplate'));
      return;
    }
    if (!requireOnline()) {
      return;
    }
    setIsBusy(true);
    try {
      const localServerDraftId = localDraftRef.current?.serverDraftId;
      let created: MaterialDraft & { message?: string };
      if (localServerDraftId) {
        created = localDraftRef.current?.serverDraftId
          ? ({ id: localServerDraftId } as MaterialDraft)
          : ({} as MaterialDraft);
      } else {
        const createResponse = await fetch(appPath('/api/materials/drafts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selected.id,
            templateVersion: selected.template.version,
            input,
            canvas: activeCanvas,
            clientDraftId: localDraftRef.current?.localDraftId,
          }),
        });
        created = (await createResponse.json()) as MaterialDraft & { message?: string };
        if (publishLoginRequiredForResponse(createResponse)) {
          return;
        }
        if (!createResponse.ok || !created.id) {
          blockAction(created.message ?? t('materialStudio.saveCustomFailed'));
          return;
        }
        const synced = localDraftRef.current
          ? {
              ...localDraftRef.current,
              syncStatus: 'synced' as const,
              serverDraftId: created.id,
              updatedAt: new Date().toISOString(),
            }
          : null;
        if (synced) {
          localDraftRef.current = synced;
          setLocalDraft(synced);
          await upsertMaterialOfflineDraft(synced);
        }
      }
      const submitResponse = await fetch(
        appPath(`/api/materials/drafts/${encodeURIComponent(created.id)}/submit`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const submitted = (await submitResponse.json()) as MaterialDraft & { message?: string };
      if (publishLoginRequiredForResponse(submitResponse)) {
        return;
      }
      if (!submitResponse.ok) {
        blockAction(submitted.message ?? t('materialStudio.savedSubmitFailed'));
        return;
      }
      setDrafts((current) => [submitted, ...current.filter((item) => item.id !== submitted.id)]);
      // 提交成功必须给出唯一一次明确反馈，否则用户会误以为没提交而重复点击。
      publishToastRequested({
        dedupeKey: `material-submit-success:${studioId}`,
        message: '已提交审核',
        tone: 'success',
      });
    } catch {
      blockAction(t('materialStudio.submitNetworkError'));
    } finally {
      setIsBusy(false);
    }
  };

  const exportDraft = async (draft: MaterialDraft) => {
    if (!requireOnline()) {
      return;
    }
    setIsBusy(true);
    trackAnalyticsEvent('material.export.started', {
      template_id: draft.templateId,
      source_kind: 'draft',
    });
    let reported = false;
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'custom', draftId: draft.id }),
      });
      if (response.status === 401 || response.status === 403) {
        reported = true;
        trackAnalyticsEvent('material.export.failed', { reason: 'fallback_watermark' });
        await downloadWatermarkedPreview();
        return;
      }
      if (!response.ok) {
        reported = true;
        trackAnalyticsEvent('material.export.failed', { reason: 'server_rejected' });
        const data = (await response.json()) as { message?: string };
        blockAction(data.message ?? t('materialStudio.downloadFailed'));
        return;
      }
      await downloadBlob(response);
      reported = true;
      trackAnalyticsEvent('material.export.succeeded', { source_kind: 'draft' });
    } catch {
      if (!reported) {
        trackAnalyticsEvent('material.export.failed', { reason: 'network' });
      }
      blockAction(t('materialStudio.downloadNetworkError'));
    } finally {
      setIsBusy(false);
    }
  };

  const exportUnmodifiedTemplate = async () => {
    if (!requireOnline()) {
      return;
    }
    if (!selected || !activeCanvas || !materialBaseline) {
      blockAction(t('materialStudio.downloadFailed'));
      return;
    }
    setIsBusy(true);
    trackAnalyticsEvent('material.export.started', {
      template_id: selected.id,
      source_kind: 'manual',
    });
    let reported = false;
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          templateId: selected.id,
          templateVersion: selected.template.version,
          canvas: activeCanvas,
          input,
          unmodifiedTemplateBaseline: {
            ...(materialBaseline.input.layout !== undefined
              ? { layout: materialBaseline.input.layout }
              : {}),
            input: materialBaseline.input,
            widthM: activeCanvas.widthM,
            heightM: activeCanvas.heightM,
          },
        }),
      });
      if (!response.ok) {
        reported = true;
        trackAnalyticsEvent('material.export.failed', { reason: 'server_rejected' });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        blockAction(data.message ?? t('materialStudio.downloadFailed'));
        return;
      }
      await downloadBlob(response);
      reported = true;
      trackAnalyticsEvent('material.export.succeeded', { source_kind: 'manual' });
    } catch {
      if (!reported) {
        trackAnalyticsEvent('material.export.failed', { reason: 'network' });
      }
      blockAction(t('materialStudio.downloadNetworkError'));
    } finally {
      setIsBusy(false);
    }
  };

  const exportManualDraft = async () => {
    if (canDownloadWatermarkFree) {
      await exportUnmodifiedTemplate();
      return;
    }
    if (!existingDraft) {
      setIsBusy(true);
      try {
        await downloadWatermarkedPreview();
      } catch {
        blockAction(t('materialStudio.downloadPreviewNetworkError'));
      } finally {
        setIsBusy(false);
      }
      return;
    }
    await exportDraft(existingDraft);
  };

  const exportFromServer = async () => {
    if (!requireOnline()) {
      return;
    }
    const selectionBlockMessage = getServerSelectionBlockMessage();
    if (selectionBlockMessage) {
      blockAction(selectionBlockMessage);
      return;
    }
    const source = buildServerSource();
    if (!selected || !activeCanvas || !source) {
      blockAction(t('materialStudio.selectTemplateAndMode', { mode: linkedDataModeLabel }));
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'server',
          templateId: selected.id,
          templateVersion: selected.template.version,
          canvas: activeCanvas,
          source,
          networkGeometry: transitNetworkSource === 'rmp' ? importedTransitNetwork : undefined,
          input: buildServerOverrides(),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        if (response.status === 403) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (data.error === 'server_account_not_verified_for_material_export') {
            blockAction(data.message ?? t('materialStudio.serverVerifiedDownloadHint'));
          }
        }
        await downloadWatermarkedPreview();
        return;
      }
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        blockAction(data.message ?? t('materialStudio.downloadFailed'));
        return;
      }
      await downloadBlob(response);
    } catch {
      blockAction(t('materialStudio.downloadNetworkError'));
    } finally {
      setIsBusy(false);
    }
  };

  // 材料工作室快捷动作：预览、导出工程、切换样式模板、切换数据源。
  const studioKeyboardHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  studioKeyboardHandlerRef.current = (event) => {
    if (isEditableKeyboardTarget(event.target)) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === 'Enter') {
      // 工作台下的 Ctrl+Enter 由 VisualEditorShell 统一接管为「保存并返回」。
      if (workspace) {
        return;
      }
      // 旧版非工作台页面仍以 Ctrl+Enter 触发服务端预览。
      event.preventDefault();
      void requestPreview();
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      requestMaterialStudioAction({ studioId, action: 'export-project' });
      return;
    }
    if (event.altKey && !modifier && !event.shiftKey && event.key.toLowerCase() === 'm') {
      if (!canUseServerSource) {
        return;
      }
      event.preventDefault();
      setMode(mode === 'manual' ? 'server' : 'manual');
      clearPreview();
      return;
    }
    if (!modifier && !event.altKey && !event.shiftKey && (event.key === '[' || event.key === ']')) {
      if (!layoutStyleVariants || layoutStyleVariants.length < 2) {
        return;
      }
      event.preventDefault();
      const currentIndex = layoutStyleVariants.findIndex((item) => item.id === selected?.id);
      const offset = event.key === ']' ? 1 : -1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + offset + layoutStyleVariants.length) % layoutStyleVariants.length;
      applyTemplateDirect(layoutStyleVariants[nextIndex].id);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => studioKeyboardHandlerRef.current(event);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    publishMaterialStudioState({
      studioId,
      mode,
      transitNetworkSource,
      hasPreview: workspace ? Boolean(localPreview.svg) : Boolean(previewUrl),
      isBusy,
      canExportProject: isMetroWayfinding && mode === 'manual',
      canDownloadWatermarkFree,
    });
  }, [
    canDownloadWatermarkFree,
    isBusy,
    isMetroWayfinding,
    localPreview.svg,
    mode,
    previewUrl,
    studioId,
    transitNetworkSource,
    workspace,
  ]);

  useEffect(() =>
    subscribeMaterialStudioActions(studioId, (action) => {
      if (action === 'history') {
        setIsHistoryDialogOpen(true);
        return;
      }
      if (isBusy) {
        blockAction(t('materialStudio.operationBusy'));
        return;
      }
      if (action === 'submit') {
        if (mode !== 'manual') {
          blockAction(t('materialStudio.modeNoReviewNeeded', { mode: linkedDataModeLabel }));
          return;
        }
        void submitManualDraft();
        return;
      }
      if (action === 'export-project') {
        exportMetroWayfindingProject();
        return;
      }
      if (mode === 'server') {
        void exportFromServer();
      } else {
        void exportManualDraft();
      }
    }),
  );

  /**
   * 导视牌编辑器实例。
   *
   * - `engine=false`：原有「表单 + 行列表 + 元素面板」完整形态，供非工作台页面使用。
   * - `engine=true`：只保留编辑内核（版式状态、撤销栈、导入生命周期、快照广播与弹窗），
   *   工具条 / 行列表 / 元素面板全部关闭，由工作台的三栏接管；实例本身隐藏挂载。
   */
  const renderMetroWayfindingEditor = (engine: boolean) => (
    <MetroWayfindingEditor
      editorId={METRO_WAYFINDING_EDITOR_ID}
      value={input.layout ?? ''}
      canvasWidth={activeCanvas ? activeCanvas.widthM * 128 : 128}
      canvasHeight={activeCanvas?.heightM ?? 1}
      disabled={isBusy}
      lineColorOptions={metroLineColorOptions}
      lineKeysByColor={metroLineKeysByColor}
      textSuggestions={metroTextSuggestions}
      examples={metroWayfindingExamples}
      onLoadExample={loadMetroWayfindingExample}
      stationOptions={metroExampleStationOptions}
      selectedStationName={metroExampleStationName}
      onStationChange={setMetroExampleStationName}
      lineOptions={metroExampleLineOptions}
      selectedLineId={selectedMetroExampleLineId}
      onLineChange={setMetroExampleLineId}
      onCanvasHeightChange={(height) => updateCanvas('heightM', height)}
      onCanvasWidthChange={(width) => updateCanvas('widthM', width)}
      onChange={(value) => {
        setInput((current) => ({ ...current, layout: value }));
        clearPreview();
      }}
      rendersElementPanel={!engine}
      rendersInspector={engine ? false : !isMetroInspectorDetached}
      rendersRowLists={!engine}
      rendersToolbar={!engine}
    />
  );

  const studioDialogs = (
    <>
      {(isPreviewDialogViewport || workspace) && isPreviewDialogOpen ? (
        <EditorDialogPortal>
          <Modal
            labelledBy="material-preview-dialog-heading"
            backdropClassName="editor-dialog-backdrop"
            className="material-preview"
            panelStyle={{ width: 'min(760px, 100%)' }}
            onBackdropClick={() => setIsPreviewDialogOpen(false)}
          >
            <div className="material-preview-heading">
              <div style={{ display: 'grid', gap: 2 }}>
                <h2 id="material-preview-dialog-heading">{t('materialStudio.preview')}</h2>
                <MaterialPreviewDescription
                  previewSize={previewSize}
                  isRendering={isPreviewRendering}
                />
              </div>
              <IconButton
                variant="icon"
                icon="close"
                label={t('materialStudio.closePreview')}
                title={t('materialStudio.closePreview')}
                autoFocus
                onClick={() => setIsPreviewDialogOpen(false)}
                style={{ flex: '0 0 40px', width: 40 }}
              />
            </div>
            <MaterialPreviewStage
              previewUrl={previewUrl}
              isRendering={isPreviewRendering}
              alt={t('materialStudio.previewAlt', {
                title: selected?.template.title ?? title,
              })}
            />
          </Modal>
        </EditorDialogPortal>
      ) : null}

      {isHistoryDialogOpen ? (
        <EditorDialogPortal>
          <Modal
            labelledBy="material-history-heading"
            backdropClassName="editor-dialog-backdrop"
            className="material-history-dialog"
            onBackdropClick={() => setIsHistoryDialogOpen(false)}
          >
            <div className="material-history-heading">
              <div>
                <h2 id="material-history-heading">{t('materialStudio.historyTitle')}</h2>
                <p className="muted">{t('materialStudio.historyHint')}</p>
              </div>
              <div className="material-history-heading-actions">
                <span>{t('services.itemCount', { count: historyDrafts.length })}</span>
                <IconButton
                  variant="icon"
                  icon="close"
                  label={t('materialStudio.closeHistory')}
                  title={t('materialStudio.closeHistory')}
                  autoFocus
                  onClick={() => setIsHistoryDialogOpen(false)}
                />
              </div>
            </div>
            {historyDrafts.length ? (
              <div className="material-history-list">
                {historyDrafts.map((draft) => {
                  const template = templateVersionByKey.get(
                    `${draft.templateId}:${draft.templateVersion}`,
                  );
                  return (
                    <article className="material-history-item" key={draft.id}>
                      <div>
                        <strong>
                          {template?.title ?? draft.templateId} · v{draft.templateVersion} ·{' '}
                          {materialDraftStatusLabel(draft.status, t)}
                        </strong>
                        <p>{formatStudioDraftInput(draft, template, t)}</p>
                        <small>
                          {t('materialStudio.submittedAt', {
                            time: formatTime(draft.submittedAt ?? draft.createdAt, locale),
                          })}
                          {draft.reviewedAt
                            ? ` · ${t('materialStudio.reviewedAt', {
                                time: formatTime(draft.reviewedAt, locale),
                              })}`
                            : ''}
                          {draft.reviewReason ? ` · ${draft.reviewReason}` : ''}
                        </small>
                      </div>
                      {draft.status === 'approved' ? (
                        <button
                          type="button"
                          className="is-primary"
                          onClick={() => void exportDraft(draft)}
                          disabled={isBusy}
                          title={t('materialStudio.download')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            download
                          </span>
                          {t('materialStudio.download')}
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="material-history-empty">{t('materialStudio.noSubmittedYet')}</p>
            )}
          </Modal>
        </EditorDialogPortal>
      ) : null}
    </>
  );

  /**
   * 数据来源选择器。
   * `sourceKindOverride` 用于模板库：目标模板家族可能和当前画布不同，
   * 必须按目标家族渲染对应的套用组件（线路 / 车站 / 地点 / 坐标）。
   */
  const renderStudioSourceSelection = (
    requireServerMode: boolean,
    sourceKindOverride?: MaterialServerSource,
  ) =>
    !selected ? (
      <p className="material-studio-empty">{t('materialStudio.noTemplates')}</p>
    ) : (!requireServerMode || mode === 'server') &&
      (sourceKindOverride ?? activeServerSource) === 'transit_station' ? (
      <>
        <Field
          label={
            <>
              {transitNetworkSource === 'rmp'
                ? t('materialStudio.projectStation')
                : t('materialStudio.selectServerStation')}
            </>
          }
        >
          <Select
            value={
              transitNetworkSource === 'rmp'
                ? selectedImportedStationNodeId
                : selectedTransitStationMarkerId
            }
            onChange={(event) => {
              if (transitNetworkSource === 'rmp') {
                setSelectedImportedStationNodeId(event.currentTarget.value);
              } else {
                setSelectedTransitStationMarkerId(event.currentTarget.value);
              }
              setSelectedTransitLineIds([]);
              clearPreview();
            }}
            disabled={
              isBusy ||
              (transitNetworkSource === 'rmp'
                ? !importedTransitStations.length
                : !transitStations.length)
            }
          >
            {(transitNetworkSource === 'rmp' ? importedTransitStations : transitStations).map(
              (station) => (
                <option key={station.markerId} value={station.markerId}>
                  {station.stationName} ·
                  {transitNetworkSource === 'rmp'
                    ? t('materialStudio.projectLineCount', {
                        count: station.projectLines?.length ?? 0,
                      })
                    : t('materialStudio.busLineCount', { count: station.lines.length })}
                </option>
              ),
            )}
          </Select>
        </Field>
        {transitNetworkSource === 'rmp' && activeTransitStation?.projectLines?.length ? (
          <div
            className="transit-network-station-lines"
            aria-label={t('materialStudio.stationProjectLines')}
          >
            <span>{t('materialStudio.projectLines')}</span>
            <div>
              {activeTransitStation.projectLines.map((line) => (
                <span key={line.id} title={`${line.lineKey} · ${line.color}`}>
                  <i style={{ backgroundColor: line.color }} aria-hidden="true" /> {line.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <FieldGroup
          label={
            transitNetworkSource === 'rmp'
              ? t('materialStudio.mapDrivingDirection')
              : t('materialStudio.roadDrivingDirection')
          }
        >
          <SegmentedControl
            ariaLabel={
              transitNetworkSource === 'rmp'
                ? t('materialStudio.mapDrivingDirection')
                : t('materialStudio.roadDrivingDirection')
            }
            className="material-mode-switch material-variant-switch material-field-segmented"
            value={transitDirection}
            onChange={(next) => {
              setTransitDirection(next as 'east' | 'west' | 'north' | 'south');
              setSelectedTransitLineIds([]);
              clearPreview();
            }}
            disabled={
              isBusy || !activeTransitStation || !activeTransitStation.directionOptions.length
            }
            options={activeTransitStation?.directionOptions ?? []}
          />
        </FieldGroup>
        <fieldset className="material-canvas-editor" disabled={isBusy || !activeTransitStation}>
          <legend>
            {transitNetworkSource === 'rmp'
              ? t('materialStudio.projectLines')
              : t('materialStudio.sameDirectionLines')}
            {usesSingleTransitLineSelection
              ? t('materialStudio.singleSelect')
              : t('materialStudio.maxLines', { count: maximumTransitLineCount })}
          </legend>
          {transitNetworkSource === 'rmp' && selectableTransitLines.length ? (
            selectableImportedTransitLines
              .filter((line) => line.direction === transitDirection)
              .map((line) => {
                const checked = selectedTransitLineIds.includes(line.id);
                const Row = usesSingleTransitLineSelection ? RadioRow : CheckboxRow;
                return (
                  <Row
                    key={line.id}
                    variant="material"
                    name={
                      usesSingleTransitLineSelection
                        ? `material-transit-line-${activeTransitStation?.markerId ?? ''}`
                        : undefined
                    }
                    checked={checked}
                    disabled={
                      !usesSingleTransitLineSelection &&
                      !checked &&
                      selectedTransitLineIds.length >= maximumTransitLineCount
                    }
                    onChange={(event) => {
                      const nextChecked = event.currentTarget.checked;
                      setSelectedTransitLineIds((current) =>
                        usesSingleTransitLineSelection
                          ? [line.id]
                          : nextChecked
                            ? [...current, line.id].slice(0, maximumTransitLineCount)
                            : current.filter((lineId) => lineId !== line.id),
                      );
                      clearPreview();
                    }}
                    icon={
                      <i
                        className="transit-network-line-swatch"
                        style={{ backgroundColor: line.color }}
                        aria-hidden="true"
                      />
                    }
                    label={
                      <>
                        {line.name} {line.secondaryName ? ` / ${line.secondaryName}` : ''}
                      </>
                    }
                  />
                );
              })
          ) : transitNetworkSource === 'server' && selectableServerTransitLines.length ? (
            selectableServerTransitLines.map((line) => {
              const checked = selectedTransitLineIds.includes(line.id);
              const Row = usesSingleTransitLineSelection ? RadioRow : CheckboxRow;
              return (
                <Row
                  key={line.id}
                  variant="material"
                  name={
                    usesSingleTransitLineSelection
                      ? `material-transit-line-${activeTransitStation?.markerId ?? ''}`
                      : undefined
                  }
                  checked={checked}
                  disabled={
                    !usesSingleTransitLineSelection &&
                    !checked &&
                    selectedTransitLineIds.length >= maximumTransitLineCount
                  }
                  onChange={(event) => {
                    const nextChecked = event.currentTarget.checked;
                    setSelectedTransitLineIds((current) =>
                      usesSingleTransitLineSelection
                        ? [line.id]
                        : nextChecked
                          ? [...current, line.id].slice(0, maximumTransitLineCount)
                          : current.filter((lineId) => lineId !== line.id),
                    );
                    clearPreview();
                  }}
                  label={
                    <>
                      {line.name} · {t('materialStudio.directionTo')}
                      {line.destinationName || t('materialStudio.destinationPending')} ·
                      {line.firstLastBus} {line.operator ? ` · ${line.operator}` : ''}
                      {line.isOriginAtStation ? ` · ${t('materialStudio.originAtStation')}` : ''}
                      {line.isTerminalAtStation
                        ? ` · ${t('materialStudio.terminalAtStation')}`
                        : ''}
                    </>
                  }
                />
              );
            })
          ) : (
            <div className="transit-network-match-empty">
              <p className="muted">
                {transitNetworkSource === 'rmp'
                  ? t('materialStudio.noProjectConnection')
                  : t('materialStudio.noDirectionLine')}
              </p>
              {transitNetworkSource === 'rmp' && activeTransitStation?.projectLines?.length ? (
                <button
                  type="button"
                  onClick={() => publishTransitNetworkLineNameEditorRequested({ studioId })}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    edit
                  </span>
                  {t('materialStudio.configureLineName')}
                </button>
              ) : null}
            </div>
          )}
        </fieldset>
      </>
    ) : (!requireServerMode || mode === 'server') &&
      (sourceKindOverride ?? activeServerSource) === 'transit_line' ? (
      transitNetworkSource === 'rmp' ? (
        <div className="material-field-grid">
          <Field label={t('materialStudio.projectLines')}>
            <Select
              value={metroLineMapProjectLineKey}
              onChange={(event) => setMetroLineMapProjectLineKey(event.currentTarget.value)}
              disabled={isBusy || !metroLineMapProjectLines.length}
            >
              {metroLineMapProjectLines.map((line) => (
                <option key={line.lineKey} value={line.lineKey}>
                  {line.label} {line.secondaryLabel ? ` / ${line.secondaryLabel}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('materialStudio.projectCurrentStation')}>
            <Select
              value={metroLineMapProjectNodeId}
              onChange={(event) => setMetroLineMapProjectNodeId(event.currentTarget.value)}
              disabled={isBusy || !metroLineMapProjectStations.length}
            >
              {metroLineMapProjectStations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <>
          <Field label={<>{t('materialStudio.serverLines')}</>}>
            <Select
              value={selectedLineId}
              onChange={(event) => {
                const lineId = event.currentTarget.value;
                const line = transitLines.find((item) => item.id === lineId);
                setSelectedLineId(lineId);
                setSelectedStationSourceId(line?.stations[0]?.stationSourceId ?? '');
                clearPreview();
              }}
              disabled={isBusy || !resolveStudioSourceLineOptions(sourceKindOverride).length}
            >
              {resolveStudioSourceLineOptions(sourceKindOverride).map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name} · {t('materialStudio.stationsCount', { count: line.stationCount })}
                  {line.operationStatus === 'planned' ? ` · ${t('materialStudio.notOpened')}` : ''}
                  {line.operator ? ` · ${line.operator}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<>{t('materialStudio.serverStations')}</>}>
            <Select
              value={selectedStationSourceId}
              onChange={(event) => {
                setSelectedStationSourceId(event.currentTarget.value);
                clearPreview();
              }}
              disabled={isBusy || !selectedLine?.stations.length}
            >
              {selectedLine?.stations.map((station) => (
                <option key={station.stationSourceId} value={station.stationSourceId}>
                  {station.stationName}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )
    ) : (!requireServerMode || mode === 'server') &&
      (sourceKindOverride ?? activeServerSource) === 'map_location' ? (
      <>
        <Field
          label={
            usesAddressPoiSource
              ? t('materialStudio.addressPoiSearch')
              : t('materialStudio.searchServerPlace')
          }
        >
          <Input
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.currentTarget.value)}
            disabled={isBusy}
          />
        </Field>
        <Field
          label={
            usesAddressPoiSource
              ? t('materialStudio.addressPoiPlaces')
              : t('materialStudio.serverPlaces')
          }
        >
          <Select
            value={selectedLocationId}
            onChange={(event) => {
              setSelectedLocationId(event.currentTarget.value);
              clearPreview();
            }}
            disabled={isBusy || !visibleLocations.length}
          >
            {visibleLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label} · {location.categoryId}
                {location.address ? ` · ${location.address}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {usesAddressPoiSource && !addressPoiLocations.length ? (
          <small className="material-field-hint">{t('materialStudio.addressPoiEmpty')}</small>
        ) : null}
      </>
    ) : (!requireServerMode || mode === 'server') &&
      (sourceKindOverride ?? activeServerSource) === 'road_coordinate' ? (
      <>
        <div className="material-field-grid">
          <Field label={<>{t('materialStudio.coordinateX')}</>}>
            <Input
              type="number"
              inputMode="decimal"
              value={roadCoordinate?.[0] ?? ''}
              disabled={isBusy}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (!Number.isFinite(value)) {
                  return;
                }
                setRoadCoordinate((current) => [value, current?.[1] ?? 0]);
                clearPreview();
              }}
            />
          </Field>
          <Field label={<>{t('materialStudio.coordinateZ')}</>}>
            <Input
              type="number"
              inputMode="decimal"
              value={roadCoordinate?.[1] ?? ''}
              disabled={isBusy}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (!Number.isFinite(value)) {
                  return;
                }
                setRoadCoordinate((current) => [current?.[0] ?? 0, value]);
                clearPreview();
              }}
            />
          </Field>
        </div>
        <EmbeddedMapLocationPicker
          ariaLabel={t('materialStudio.pickCoordinateHint')}
          footer={
            roadCoordinate
              ? t('materialStudio.clickMapCoordinate', {
                  x: formatCoordinate(roadCoordinate[0]),
                  z: formatCoordinate(roadCoordinate[1]),
                })
              : t('materialStudio.fillCoordinateFirst')
          }
          onChange={(coordinate) => {
            setRoadCoordinate(coordinate);
            clearPreview();
          }}
          freshTileTemplate={freshTileTemplate}
          tileTemplate={tileTemplate}
          value={roadCoordinate}
        />
        <small className="material-field-hint" role="status">
          {isRoadSideHintLoading
            ? t('materialStudio.roadSideHintLoading')
            : isRoadSideHintChecked
              ? roadSideHint
                ? t('materialStudio.roadSideHintMatched', {
                    road: roadSideHint.roadName,
                    side: t(roadSideLabelKeys[roadSideHint.side]),
                    x: formatCoordinate(roadSideHint.installation[0]),
                    z: formatCoordinate(roadSideHint.installation[1]),
                  })
                : t('materialStudio.roadSideHintMissing')
              : null}
        </small>
      </>
    ) : null;

  const studioSourceSelection = renderStudioSourceSelection(true);

  const studioContent = (
    <section
      className={isBusy ? 'material-studio is-busy' : 'material-studio'}
      aria-label={panelTitle}
      aria-busy={isBusy}
    >
      <div className="section-heading material-studio-heading">
        <div>
          <Eyebrow>{t('materialStudio.workspaceEyebrow')}</Eyebrow>
          <h1>{panelTitle}</h1>
        </div>
        <div className="settings-action-row" role="status" aria-live="polite">
          <span className="muted">
            {isOnline ? t('materialStudio.online') : t('materialStudio.offline')}
            {localDraft
              ? ` · ${t('materialStudio.localDraft')}${materialOfflineDraftStatusLabel(
                  localDraft.syncStatus,
                  t,
                )}`
              : ''}
          </span>
          <IconButton
            variant="icon"
            icon="cloud_upload"
            label={t('materialStudio.syncLocalDraft')}
            title={t('materialStudio.syncLocalDraft')}
            onClick={() => void syncLocalDraft()}
            disabled={
              !localDraft || !isOnline || isBusy || isSyncingLocalDraft || mode !== 'manual'
            }
          />
        </div>
      </div>

      <div
        className="material-studio-layout"
        style={
          isPreviewDialogViewport && !isSingleColumnViewport
            ? { gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr)' }
            : undefined
        }
      >
        <aside className="material-studio-sidebar">
          <label>
            <span>{t('materialStudio.templates')}</span>
            <select
              value={selectedEntry?.id ?? ''}
              onChange={(event) => {
                const entry = templateEntries.find(
                  (candidate) => candidate.id === event.currentTarget.value,
                );
                if (!entry) {
                  return;
                }
                const nextTemplateId =
                  entry.templateIds.find((templateId) =>
                    templates.some((item) => item.id === templateId),
                  ) ?? entry.templateIds[0];
                if (nextTemplateId) {
                  requestTemplateChange(nextTemplateId);
                }
              }}
              disabled={!templateEntries.length || isBusy}
            >
              {templateEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.titleKey ? t(entry.titleKey) : (entry.title ?? '')}
                </option>
              ))}
            </select>
          </label>
          {selected?.template.description ? <p>{selected.template.description}</p> : null}
          {allowTransitNetworkImport ? (
            <ResponsiveSidebarDisclosure
              title={t('materialStudio.networkData')}
              isCompact={isSingleColumnViewport}
            >
              <TransitNetworkSourceControl
                studioId={studioId}
                initialSource={localDraftReady ? localDraft?.transitNetworkSource : undefined}
                initialSnapshot={
                  localDraftReady && localDraft?.transitNetworkSource === 'rmp'
                    ? localDraft.importedTransitNetwork
                    : undefined
                }
              />
            </ResponsiveSidebarDisclosure>
          ) : null}
          {activeCanvas ? (
            <ResponsiveSidebarDisclosure
              title={t('materialStudio.dimensions')}
              isCompact={isSingleColumnViewport}
            >
              <CanvasEditor
                canvas={activeCanvas}
                onChange={updateCanvas}
                disabled={isBusy || !selected}
                sizeMode={canvasSizeMode}
                isMetroWayfinding={isMetroWayfinding}
                isVerticalLineMap={isMetroVerticalLineMap}
                lockAlignToTile={isRealisticBusStop}
                metroWayfindingLayoutMode={metroWayfindingLayoutMode}
              />
            </ResponsiveSidebarDisclosure>
          ) : null}
        </aside>

        <div className="material-studio-editor">
          {availableLayoutGroups && availableLayoutGroups.length > 1 ? (
            <FieldGroup label={layoutSwitchLabel}>
              <div
                className="material-mode-switch material-variant-switch"
                role="group"
                aria-label={layoutSwitchLabel}
              >
                {availableLayoutGroups.map((group) => (
                  <button
                    key={group.id}
                    className={activeLayoutGroup?.id === group.id ? 'is-active' : ''}
                    type="button"
                    onClick={() => selectLayoutGroup(group)}
                    disabled={isBusy}
                  >
                    {group.labelKey ? t(group.labelKey) : (group.label ?? group.id)}
                  </button>
                ))}
              </div>
            </FieldGroup>
          ) : null}
          {layoutStyleVariants && layoutStyleVariants.length > 1 ? (
            <FieldGroup label={selectedEntryVariantLabel}>
              <div
                className="material-mode-switch material-variant-switch"
                role="group"
                aria-label={selectedEntryVariantLabel}
              >
                {layoutStyleVariants.map((item) => (
                  <button
                    key={item.id}
                    className={selected?.id === item.id ? 'is-active' : ''}
                    type="button"
                    onClick={() => applyTemplateDirect(item.id)}
                    disabled={isBusy}
                  >
                    {item.template.title.match(/（([^）]+)）\s*$/u)?.[1] ?? item.template.title}
                  </button>
                ))}
              </div>
            </FieldGroup>
          ) : null}
          {canUseServerSource ? (
            <div
              className="material-mode-switch"
              role="group"
              aria-label={t('materialStudio.dataSource')}
            >
              <button
                className={mode === 'manual' ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setMode('manual');
                  clearPreview();
                }}
              >
                {t('materialStudio.manualInput')}
              </button>
              <button
                className={mode === 'server' ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setMode('server');
                  clearPreview();
                }}
              >
                {linkedDataModeLabel}
              </button>
            </div>
          ) : null}
          {mode === 'server' && overridableFields.length ? (
            <div className="material-field-grid">
              {overridableFields.filter(isMaterialFieldVisible).map((field) =>
                field.key === SERVICE_TIME_FIELD_KEY && offerProjectServiceTimeInput ? (
                  // 项目线网不带运营时间，这里换成「首班 / 末班」两个输入补数据，
                  // 免得用户只能对着一个空文本框猜格式。
                  <MaterialServiceTimeFields
                    key={field.key}
                    label={field.label}
                    value={input[field.key] ?? ''}
                    disabled={isBusy}
                    onChange={updateMaterialFieldValue.bind(null, field.key)}
                  />
                ) : (
                  <MaterialFieldEditor
                    key={field.key}
                    field={field}
                    labelOverride={materialFieldLabelOverride(field)}
                    value={input[field.key] ?? field.defaultValue ?? ''}
                    disabled={isBusy}
                    suggestions={field.key === 'roadName' ? serverLocationSuggestions : undefined}
                    optionsOverride={
                      field.key === 'trackPosition'
                        ? trackPositionOptions
                        : field.key === 'travelDirection'
                          ? travelDirectionOptions
                          : field.key === 'travelDirectionSecondary'
                            ? verticalSecondaryDirectionOptions
                            : undefined
                    }
                    onChange={updateMaterialFieldValue.bind(null, field.key)}
                  />
                ),
              )}
            </div>
          ) : null}
          {studioSourceSelection ?? (
            <>
              {isMetroWayfinding ? (
                renderMetroWayfindingEditor(false)
              ) : (
                <div className="material-field-grid">
                  {selected.template.fields
                    .filter(
                      (field) => field.userEditable !== false && isMaterialFieldVisible(field),
                    )
                    .map((field) => (
                      <MaterialFieldEditor
                        key={field.key}
                        field={field}
                        labelOverride={materialFieldLabelOverride(field)}
                        value={input[field.key] ?? field.defaultValue ?? ''}
                        disabled={isBusy}
                        suggestions={
                          field.key === 'roadName' ? serverLocationSuggestions : undefined
                        }
                        optionsOverride={
                          field.key === 'trackPosition'
                            ? trackPositionOptions
                            : field.key === 'travelDirection'
                              ? travelDirectionOptions
                              : field.key === 'travelDirectionSecondary'
                                ? verticalSecondaryDirectionOptions
                                : undefined
                        }
                        onChange={updateMaterialFieldValue.bind(null, field.key)}
                      />
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        {/*
          宽屏（≥960px）下预览与导视牌辅助面板共用同一条右侧轨道：预览在上、辅助面板在下。
          这样整页始终只有三列，辅助面板不会被挤到第二行、把 material-studio-layout 拉高。
          断点由 `isPreviewDialogViewport`（matchMedia `(max-width: 959px)`）驱动，
          与预览是否退化为弹窗共用同一个判定，避免 CSS/JS 两套断点出现中间态（如 959.5px）。
          窄屏下轨道容器整体透明（display: contents），预览与辅助面板都不在轨道内，
          堆叠顺序与改动前完全一致。
        */}
        <div
          className={`material-studio-preview-track${isPreviewDialogViewport ? ' is-stacked' : ''}`}
        >
          {!isPreviewDialogViewport ? (
            <section className="material-preview" aria-label={t('materialStudio.previewAria')}>
              <div className="material-preview-heading">
                <h2>{t('materialStudio.preview')}</h2>
                <MaterialPreviewDescription
                  previewSize={previewSize}
                  isRendering={isPreviewRendering}
                />
              </div>
              <MaterialPreviewStage
                previewUrl={previewUrl}
                isRendering={isPreviewRendering}
                alt={t('materialStudio.previewAlt', {
                  title: selected?.template.title ?? title,
                })}
              />
            </section>
          ) : null}

          {/*
            宽屏下把「插入建议」「宽度警告」放在预览面板正下方：用户在预览里看到结果的同时，
            相关操作建议就在旁边，不必回到左侧编辑器来回滚动。窄屏时预览会退化成弹窗，
            此时由编辑器本体渲染这两个面板（rendersInspector 传 true）。
          */}
          {isMetroInspectorDetached ? (
            <MetroWayfindingInspector
              editorId={METRO_WAYFINDING_EDITOR_ID}
              lineKeysByColor={metroLineKeysByColor}
              onAction={(rowIndex, action) =>
                dispatchMetroWayfindingCompositionAction({
                  editorId: METRO_WAYFINDING_EDITOR_ID,
                  action: { ...action, rowIndex },
                })
              }
            />
          ) : null}
        </div>
      </div>

      {studioDialogs}
    </section>
  );

  if (!workspace) {
    return studioContent;
  }

  const workspaceTemplateControls = (
    <>
      <Field label={<>{t('materialStudio.templates')}</>}>
        <Select
          value={selectedEntry?.id ?? ''}
          onChange={(event) => {
            const entry = templateEntries.find(
              (candidate) => candidate.id === event.currentTarget.value,
            );
            if (!entry) {
              return;
            }
            const nextTemplateId =
              entry.templateIds.find((templateId) =>
                templates.some((item) => item.id === templateId),
              ) ?? entry.templateIds[0];
            if (nextTemplateId) {
              requestTemplateChange(nextTemplateId);
            }
          }}
          disabled={!templateEntries.length || isBusy}
        >
          {templateEntries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.titleKey ? t(entry.titleKey) : (entry.title ?? '')}
            </option>
          ))}
        </Select>
      </Field>
      {availableLayoutGroups && availableLayoutGroups.length > 1 ? (
        <FieldGroup label={layoutSwitchLabel}>
          <SegmentedControl
            ariaLabel={layoutSwitchLabel}
            className="transit-visual-segmented"
            disabled={isBusy}
            value={activeLayoutGroup?.id ?? availableLayoutGroups[0]!.id}
            options={availableLayoutGroups.map((group) => ({
              value: group.id,
              label: group.labelKey ? t(group.labelKey) : (group.label ?? group.id),
            }))}
            onChange={(groupId) => {
              const group = availableLayoutGroups.find((item) => item.id === groupId);
              if (group) {
                selectLayoutGroup(group);
              }
            }}
            wrapperClassName=""
          />
        </FieldGroup>
      ) : null}
      {layoutStyleVariants && layoutStyleVariants.length > 1 ? (
        <FieldGroup label={selectedEntryVariantLabel}>
          <SegmentedControl
            ariaLabel={selectedEntryVariantLabel}
            className="transit-visual-segmented"
            disabled={isBusy}
            value={selected?.id ?? ''}
            options={layoutStyleVariants.map((item) => ({
              value: item.id,
              label: item.template.title.match(/（([^）]+)）\s*$/u)?.[1] ?? item.template.title,
            }))}
            onChange={applyTemplateDirect}
            wrapperClassName=""
          />
        </FieldGroup>
      ) : null}
    </>
  );

  // 非地铁模板：数据来源选择器常驻，配合「从线网套用」向导使用。
  const workspaceSourceSelection = renderStudioSourceSelection(false);

  const workspaceDataSourceControls = (
    <>
      {allowTransitNetworkImport ? (
        <TransitNetworkSourceControl
          studioId={studioId}
          initialSource={localDraftReady ? localDraft?.transitNetworkSource : undefined}
          initialSnapshot={
            localDraftReady && localDraft?.transitNetworkSource === 'rmp'
              ? localDraft.importedTransitNetwork
              : undefined
          }
        />
      ) : (
        // 路牌等工作台没有线网导入，直接把地点 / 坐标选择器放进全局属性的数据来源。
        <>
          {workspaceSourceSelection}
          <Button
            variant="secondary"
            icon="download_done"
            className="material-source-apply"
            disabled={isBusy || isResolvingSource || !selected}
            onClick={() => void applyResolvedSourceValues()}
          >
            {isResolvingSource ? '正在套用…' : '套用位置信息'}
          </Button>
        </>
      )}
    </>
  );

  // 模板库内嵌的数据来源：目标模板决定选「线路」还是「车站 + 线路」，
  // 公交 ↔ 地铁互转时也能在同一个弹窗里完成选线选站。
  const wizardTargetCard =
    applyWizardLayoutCards.find((card) => card.templateId === applyWizardTemplateId) ??
    applyWizardLayoutCards[0];
  const wizardTargetFamily = wizardTargetCard?.template.family;
  // 模板库的目标家族可能和当前画布不同，线路候选必须按目标家族过滤，
  // 否则公交模板切地铁时会列出公交线路。
  const wizardMetroLineOptions = transitLines.filter(
    (line) => line.mode === 'metro' || line.mode === 'tram' || line.mode === 'custom',
  );
  // 数据来源优先：先选线网来源与线路 / 车站（路牌则为地点），再看样式与版式。
  const wizardStyleStep = 2;
  const wizardLayoutStep = 3;
  const wizardSourceControls =
    wizardTargetFamily === 'metro_line' ? (
      <div className="material-apply-wizard-source">
        <Field label={<>套用线路</>}>
          <Select
            value={transitNetworkSource === 'rmp' ? metroLineMapProjectLineKey : selectedLineId}
            onChange={(event) => {
              const lineId = event.currentTarget.value;
              if (transitNetworkSource === 'rmp') {
                setMetroLineMapProjectLineKey(lineId);
                return;
              }
              setSelectedLineId(lineId);
              const line = wizardMetroLineOptions.find((item) => item.id === lineId);
              setSelectedStationSourceId(line?.stations[0]?.stationSourceId ?? '');
            }}
          >
            {(transitNetworkSource === 'rmp'
              ? metroLineMapProjectLines
              : wizardMetroLineOptions
            ).map((line) =>
              'lineKey' in line ? (
                <option key={line.lineKey} value={line.lineKey}>
                  {line.label}
                  {line.secondaryLabel ? ` / ${line.secondaryLabel}` : ''}
                </option>
              ) : (
                <option key={line.id} value={line.id}>
                  {line.name}
                  {line.mode === 'tram' ? '（有轨）' : line.mode === 'custom' ? '（专用线）' : ''}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={<>当前站</>}>
          <Select
            value={
              transitNetworkSource === 'rmp' ? metroLineMapProjectNodeId : selectedStationSourceId
            }
            onChange={(event) => {
              if (transitNetworkSource === 'rmp') {
                setMetroLineMapProjectNodeId(event.currentTarget.value);
                return;
              }
              setSelectedStationSourceId(event.currentTarget.value);
            }}
          >
            {(transitNetworkSource === 'rmp'
              ? metroLineMapProjectStations.map((station) => ({
                  value: station.id,
                  label: station.name,
                }))
              : (selectedLine?.stations ?? []).map((station) => ({
                  value: station.stationSourceId,
                  label: station.stationName,
                }))
            ).map((station) => (
              <option key={station.value} value={station.value}>
                {station.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    ) : wizardTargetFamily === 'bus_stop' ? (
      <div className="material-apply-wizard-source">
        <Field label={<>套用车站</>}>
          <Select
            value={
              transitNetworkSource === 'rmp'
                ? selectedImportedStationNodeId
                : selectedTransitStationMarkerId
            }
            onChange={(event) => {
              if (transitNetworkSource === 'rmp') {
                setSelectedImportedStationNodeId(event.currentTarget.value);
              } else {
                setSelectedTransitStationMarkerId(event.currentTarget.value);
              }
              setSelectedTransitLineIds([]);
            }}
          >
            {(transitNetworkSource === 'rmp' ? importedTransitStations : transitStations).map(
              (station) => (
                <option key={station.markerId} value={station.markerId}>
                  {station.stationName}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={<>道路方向</>}>
          <Select
            value={transitDirection}
            onChange={(event) => {
              setTransitDirection(event.currentTarget.value as 'east' | 'west' | 'north' | 'south');
              setSelectedTransitLineIds([]);
            }}
          >
            {(activeTransitStation?.directionOptions ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="material-canvas-editor">
          <legend>套用线路（最多 {maximumTransitLineCount} 条）</legend>
          {selectableTransitLines.map((line) => (
            <CheckboxRow
              key={line.id}
              variant="material"
              checked={selectedTransitLineIds.includes(line.id)}
              onChange={() =>
                setSelectedTransitLineIds((current) =>
                  current.includes(line.id)
                    ? current.filter((id) => id !== line.id)
                    : [...current, line.id].slice(0, maximumTransitLineCount),
                )
              }
              label={line.name}
            />
          ))}
          {!selectableTransitLines.length ? (
            <p className="poi-visual-panel-empty">当前站点在该方向下没有可选线路。</p>
          ) : null}
        </fieldset>
      </div>
    ) : wizardTargetFamily ? (
      // 路牌 / 门牌等非线网模板：按目标模板渲染对应来源组件（地点搜索或坐标选点），
      // 避免切换模板时仍显示当前模板的套用控件。
      <div className="material-apply-wizard-source">
        {renderStudioSourceSelection(false, serverSources?.[wizardTargetFamily] ?? serverSource)}
      </div>
    ) : null;

  const applyWizardDialog = isApplyWizardOpen ? (
    <EditorDialogPortal>
      <Modal
        labelledBy="material-apply-wizard-title"
        backdropClassName="editor-dialog-backdrop"
        className="metro-wayfinding-project-dialog material-apply-wizard"
        onBackdropClick={() => setIsApplyWizardOpen(false)}
      >
        <header>
          <div>
            <span>{t('materialStudio.templateLibrary')}</span>
            <h2 id="material-apply-wizard-title">{t('materialStudio.applyWizardTitle')}</h2>
          </div>
          <IconButton
            variant="icon"
            icon="close"
            label={t('materialStudio.close')}
            title={t('materialStudio.close')}
            onClick={() => setIsApplyWizardOpen(false)}
          />
        </header>
        <div className="metro-wayfinding-project-dialog-body material-apply-wizard-body">
          <section className="material-apply-wizard-section">
            <h3>{t('materialStudio.template')}</h3>
            <Field label={<>{t('materialStudio.templateEntry')}</>}>
              <Select
                value={applyWizardEntry?.id ?? ''}
                onChange={(event) => {
                  const entry = templateEntries.find(
                    (candidate) => candidate.id === event.currentTarget.value,
                  );
                  if (!entry) {
                    return;
                  }
                  const nextTemplateId =
                    entry.templateIds.find((templateId) =>
                      templates.some((item) => item.id === templateId),
                    ) ?? entry.templateIds[0];
                  const nextTemplate = templates.find((item) => item.id === nextTemplateId);
                  // 入口跨数据来源时，把当前已选线路 / 站点映射到目标来源，避免变成另一条线。
                  carryTransitSelectionToSourceKind(
                    nextTemplate
                      ? (serverSources?.[nextTemplate.template.family] ?? serverSource)
                      : undefined,
                  );
                  setApplyWizardEntryId(entry.id);
                  setApplyWizardStyleIndex(0);
                  setApplyWizardTemplateId(nextTemplateId ?? '');
                }}
              >
                {templateEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.titleKey ? t(entry.titleKey) : (entry.title ?? '')}
                  </option>
                ))}
              </Select>
            </Field>
          </section>
          <section className="material-apply-wizard-section">
            <h3>{t('materialStudio.applyStepSource', { step: 1 })}</h3>
            {allowTransitNetworkImport ? workspaceDataSourceControls : null}
            {wizardSourceControls}
          </section>
          <section className="material-apply-wizard-section">
            <h3>{t('materialStudio.applyStepStyle', { step: wizardStyleStep })}</h3>
            <div className="material-apply-wizard-style">
              <FieldGroup label={t('materialStudio.style')}>
                <SegmentedControl
                  ariaLabel={t('materialStudio.style')}
                  className="transit-visual-segmented"
                  value={String(applyWizardStyleIndex)}
                  options={applyWizardStyleOptions}
                  onChange={(value) => setApplyWizardStyleIndex(Number(value))}
                  wrapperClassName=""
                />
              </FieldGroup>
            </div>
          </section>
          <section className="material-apply-wizard-section">
            <h3>{t('materialStudio.applyStepLayout', { step: wizardLayoutStep })}</h3>
            <div className="material-apply-wizard-layouts">
              {applyWizardLayoutCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`material-template-example${
                    card.templateId === applyWizardTemplateId ? ' is-active' : ''
                  }`}
                  // 点击卡片即视为确认套用，不再需要底部操作按钮。
                  onClick={() => {
                    setApplyWizardTemplateId(card.templateId);
                    confirmApplyWizard(card.templateId);
                  }}
                >
                  <MaterialLayoutThumbnail
                    source={templateSources[`${card.templateId}:${card.template.version}`]}
                    template={card.template}
                    values={buildTransitNetworkFieldValues(card.template.fields)}
                  />
                  <div className="material-template-example-heading">
                    <strong>{card.label}</strong>
                    <span>{card.template.title}</span>
                  </div>
                  <small className="material-template-example-meta">
                    {card.template.defaultCanvas.widthM} × {card.template.defaultCanvas.heightM} m
                  </small>
                  <span className="material-template-example-load">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      file_open
                    </span>
                    {t('materialStudio.useThisLayout')}
                  </span>
                </button>
              ))}
              {!applyWizardLayoutCards.length ? (
                <p className="poi-visual-panel-empty">{t('materialStudio.noLayouts')}</p>
              ) : null}
            </div>
          </section>
        </div>
        {/* 点击版式卡片即确认套用，不再提供底部操作按钮。 */}
      </Modal>
    </EditorDialogPortal>
  ) : null;

  if (!isMetroWayfinding) {
    // 公交线路详情：起终点、下一站、当前站状态全部由「站点列表 + 行车方向」派生，
    // 不再在属性面板提供手动输入，避免和自动计算结果打架。
    const isBusStopDetailTemplate =
      selected?.template.family === 'bus_stop' &&
      selected.template.fields.some((field) => field.key === 'routeStations');
    const derivedOnlyFieldKeys = new Set([
      'routeOrigin',
      'routeTerminal',
      'nextStation',
      'routeStationState',
    ]);
    const workspaceFieldDefinitions = (selected?.template.fields ?? []).filter(
      (field) => !(isBusStopDetailTemplate && derivedOnlyFieldKeys.has(field.key)),
    );
    const workspaceFields = workspaceFieldDefinitions
      .filter((field) => field.userEditable !== false && isMaterialFieldVisible(field))
      .map((field) => ({
        key: field.key,
        label: materialFieldLabelOverride(field) ?? field.label,
      }));
    const workspaceFieldKeys = new Set(workspaceFieldDefinitions.map((field) => field.key));
    const workspaceGroups = selected
      ? groupMaterialFormFields(
          selected.id,
          selected.template,
          workspaceFieldDefinitions.filter(
            (field) => field.userEditable !== false && isMaterialFieldVisible(field),
          ),
        )
      : [];
    const canonicalStationNames = workspaceFieldKeys.has('routeStations')
      ? splitMaterialStationNames(input.routeStations ?? '')
      : [];
    // 公交线路详情：站点列表按行车方向展示；「开往首站」时倒序显示，
    // 但输入框里仍保存线路原始顺序，避免来回切换方向时把数据改坏。
    const reverseWorkspaceStations =
      selected?.template.family === 'bus_stop' &&
      canonicalStationNames.length > 1 &&
      selected.template.fields.some((field) => field.key === 'travelDirection') &&
      input.travelDirection === 'first';
    const workspaceStationNames = reverseWorkspaceStations
      ? [...canonicalStationNames].reverse()
      : canonicalStationNames;
    const toCanonicalStationIndex = (displayIndex: number) =>
      reverseWorkspaceStations ? canonicalStationNames.length - 1 - displayIndex : displayIndex;
    const canonicalCurrentStationIndex = Number(input.currentStationIndex);
    const workspaceCurrentStationIndex = Number.isFinite(canonicalCurrentStationIndex)
      ? toCanonicalStationIndex(canonicalCurrentStationIndex)
      : canonicalCurrentStationIndex;
    const workspaceStations: TransitMaterialFormStationNode[] = workspaceStationNames.map(
      (name, index) => ({
        index,
        name,
        isCurrent: index === workspaceCurrentStationIndex,
      }),
    );
    const hasTransferField = workspaceFieldKeys.has('transferLines');
    const hasCurrentStationField = workspaceFieldKeys.has('currentStationIndex');

    const updateWorkspaceStationName = (index: number, nextName: string) => {
      const names = [...canonicalStationNames];
      const canonicalIndex = toCanonicalStationIndex(index);
      const previousName = names[canonicalIndex] ?? '';
      names[canonicalIndex] = nextName;
      setInput((current) => {
        let transfer = current.transferLines ?? '';
        if (previousName && previousName !== nextName) {
          transfer = renameMaterialTransferStation(transfer, previousName, nextName);
        }
        return { ...current, routeStations: names.join('\n'), transferLines: transfer };
      });
    };

    const updateWorkspaceStationTransfer = (stationName: string, lines: string) => {
      setInput((current) => ({
        ...current,
        transferLines: setMaterialTransferLine(current.transferLines ?? '', stationName, lines),
      }));
    };

    const updateWorkspaceCurrentStation = (index: number) => {
      setInput((current) => ({
        ...current,
        currentStationIndex: String(toCanonicalStationIndex(index)),
      }));
    };

    const renderWorkspaceStation = (index: number) => {
      const stationName = workspaceStationNames[index] ?? '';
      const transferLines =
        parseMaterialTransferLines(input.transferLines ?? '').get(stationName) ?? '';
      return (
        <div className="material-field-grid transit-material-field-grid">
          <Field label="站点名称">
            <Input
              value={stationName}
              disabled={isBusy}
              onChange={(event) => updateWorkspaceStationName(index, event.currentTarget.value)}
            />
          </Field>
          {hasTransferField ? (
            <Field label="换乘线路（如 2,4 或 2:#EC6941）">
              <Input
                value={transferLines}
                disabled={isBusy}
                placeholder="留空表示无换乘"
                onChange={(event) =>
                  updateWorkspaceStationTransfer(stationName, event.currentTarget.value)
                }
              />
            </Field>
          ) : null}
          {hasCurrentStationField ? (
            <CheckboxRow
              variant="material"
              checked={index === workspaceCurrentStationIndex}
              disabled={isBusy}
              onChange={() => updateWorkspaceCurrentStation(index)}
              label="设为当前站"
            />
          ) : null}
        </div>
      );
    };
    const workspaceRegionResult = selected
      ? buildMaterialFormRegions(
          selected.id,
          selected.template,
          activeCanvas ?? selected.template.defaultCanvas,
          workspaceStationNames,
          input,
        )
      : { regions: [], viewBox: { width: 1, height: 1 } };
    const workspaceRegionValue = (region: TransitMaterialFormRegion) => {
      if (region.stationIndex !== undefined) {
        return workspaceStationNames[region.stationIndex] ?? '';
      }
      return region.fieldKey ? (input[region.fieldKey] ?? '') : '';
    };
    const editWorkspaceRegion = (region: TransitMaterialFormRegion, value: string) => {
      if (region.stationIndex !== undefined) {
        updateWorkspaceStationName(region.stationIndex, value);
        return;
      }
      if (region.fieldKey) {
        // 就地改字时保留当前预览，避免输入框提交后整张预览消失。
        updateMaterialFieldValue(region.fieldKey, value, { keepPreview: true });
      }
    };

    // 站台站名标志：当前线路当前站的前后两站，作为「下一站」的可选来源。
    const platformSignStationNames =
      selected?.id === METRO_PLATFORM_SIGN_TEMPLATE_ID
        ? transitNetworkSource === 'rmp'
          ? metroLineMapProjectStations.map((station) => station.name)
          : (selectedLine?.stations.map((station) => station.stationName) ?? [])
        : [];
    const platformSignCurrentIndex =
      selected?.id === METRO_PLATFORM_SIGN_TEMPLATE_ID
        ? transitNetworkSource === 'rmp'
          ? metroLineMapProjectStations.findIndex(
              (station) => station.id === metroLineMapProjectNodeId,
            )
          : (selectedLine?.stations.findIndex(
              (station) => station.stationSourceId === selectedStationSourceId,
            ) ?? -1)
        : -1;
    const platformSignAdjacentStations =
      platformSignCurrentIndex >= 0
        ? [
            platformSignStationNames[platformSignCurrentIndex - 1],
            platformSignStationNames[platformSignCurrentIndex + 1],
          ].filter((name): name is string => Boolean(name))
        : [];

    const renderWorkspaceField = (fieldKey: string) => {
      const field =
        workspaceFieldDefinitions.find((item) => item.key === fieldKey) ??
        selected?.template.fields.find((item) => item.key === fieldKey);
      if (!field) {
        return null;
      }
      // 站台站名标志：下一站既可手输，也可直接从当前站的前后两站中选择。
      if (selected?.id === METRO_PLATFORM_SIGN_TEMPLATE_ID && field.key === 'nextStationName') {
        const hasPinyinField = workspaceFieldKeys.has('nextStationPinyin');
        return (
          <>
            <MaterialFieldEditor
              key={field.key}
              field={field}
              value={input[field.key] ?? field.defaultValue ?? ''}
              disabled={isBusy}
              onChange={updateMaterialFieldValue.bind(null, field.key)}
            />
            <Field label={<>从相邻站选择</>}>
              <Select
                value={input.nextStationName ?? ''}
                disabled={isBusy || !platformSignAdjacentStations.length}
                onChange={(event) => {
                  const stationName = event.currentTarget.value;
                  const stationIndex = platformSignStationNames.indexOf(stationName);
                  setInput((current) => ({
                    ...current,
                    nextStationName: stationName,
                    ...(hasPinyinField
                      ? { nextStationPinyin: toUppercasePinyin(stationName) }
                      : {}),
                    travelDirection: stationIndex > platformSignCurrentIndex ? 'last' : 'first',
                  }));
                  clearPreview();
                }}
              >
                <option value="">请选择相邻站</option>
                {platformSignAdjacentStations.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        );
      }
      if (field.key === SERVICE_TIME_FIELD_KEY && offerProjectServiceTimeInput) {
        return (
          <MaterialServiceTimeFields
            key={field.key}
            label={field.label}
            value={input[field.key] ?? ''}
            disabled={isBusy}
            onChange={updateMaterialFieldValue.bind(null, field.key)}
          />
        );
      }
      return (
        <>
          <MaterialFieldEditor
            key={field.key}
            field={field}
            labelOverride={materialFieldLabelOverride(field)}
            value={input[field.key] ?? field.defaultValue ?? ''}
            disabled={isBusy}
            suggestions={field.key === 'roadName' ? serverLocationSuggestions : undefined}
            optionsOverride={
              field.key === 'trackPosition'
                ? trackPositionOptions
                : field.key === 'travelDirection'
                  ? travelDirectionOptions
                  : field.key === 'travelDirectionSecondary'
                    ? verticalSecondaryDirectionOptions
                    : undefined
            }
            onChange={updateMaterialFieldValue.bind(null, field.key)}
          />
          {field.key === 'terminalRole' && derivedTerminalRole.mixed ? (
            <small className="material-field-hint">
              所选线路方向不一致（部分始发、部分终到），请手动选择站点属性。
            </small>
          ) : null}
        </>
      );
    };
    return (
      <VisualEditorShell
        actions={<></>}
        backHref="/services"
        editorKind="transit-material"
        isBusy={isBusy || isWorkspaceLoading}
        isDirty={isWorkspaceDirty}
        onSave={saveWorkspace}
        sessionId={`transit-materials:${studioId}`}
        title={panelTitle}
        workspace
      >
        <TransitMaterialFormWorkspace
          studioId={studioId}
          title={panelTitle}
          templateTitle={selected?.template.title ?? panelTitle}
          templateMeta={selected?.template.description}
          fields={workspaceFields}
          groups={workspaceGroups}
          stations={workspaceStations}
          regions={workspaceRegionResult.regions}
          regionViewBox={workspaceRegionResult.viewBox}
          regionValue={workspaceRegionValue}
          onRegionEdit={editWorkspaceRegion}
          renderField={renderWorkspaceField}
          renderStation={renderWorkspaceStation}
          sourceControls={workspaceSourceSelection}
          onOpenApplyWizard={() => openApplyWizard()}
          canApplySource={
            activeServerSource === 'transit_station'
              ? Boolean(activeTransitStation)
              : canUseServerSource
          }
          canvasSettings={
            activeCanvas ? (
              <CanvasEditor
                canvas={activeCanvas}
                disabled={isBusy || !selected}
                isMetroWayfinding={false}
                isVerticalLineMap={isMetroVerticalLineMap}
                lockAlignToTile={isRealisticBusStop}
                metroWayfindingLayoutMode={metroWayfindingLayoutMode}
                onChange={updateCanvas}
                sizeMode={canvasSizeMode}
                locks={canvasLocks}
              />
            ) : undefined
          }
          canvasSize={
            activeCanvas
              ? { widthM: activeCanvas.widthM, heightM: activeCanvas.heightM }
              : undefined
          }
          canvasLocks={canvasLocks}
          onCanvasSizeChange={(patch) => {
            if (patch.widthM !== undefined) {
              updateCanvas('widthM', patch.widthM);
            }
            if (patch.heightM !== undefined) {
              updateCanvas('heightM', patch.heightM);
            }
          }}
          templateControls={workspaceTemplateControls}
          preview={
            <MaterialPreviewStage
              svg={localPreview.svg}
              isRendering={false}
              alt={t('materialStudio.previewAlt', {
                title: selected?.template.title ?? title,
              })}
            />
          }
          hasPreview={Boolean(localPreview.svg)}
          previewError={previewError}
          invalidFieldKeys={localPreview.invalidFieldKeys}
          onExportProject={undefined}
          onSubmitReview={() => void submitManualDraft()}
          onDownload={() => {
            if (mode === 'server') {
              void exportFromServer();
            } else {
              void exportManualDraft();
            }
          }}
          saveBusy={isBusy || isSyncingLocalDraft}
          disabled={isBusy}
        />
        {applyWizardDialog}
        {studioDialogs}
      </VisualEditorShell>
    );
  }

  return (
    <VisualEditorShell
      actions={<></>}
      backHref="/services"
      editorKind="transit-material"
      isBusy={isBusy || isWorkspaceLoading}
      isDirty={isWorkspaceDirty}
      onSave={saveWorkspace}
      sessionId={`transit-materials:${studioId}`}
      title={panelTitle}
      workspace
    >
      <TransitWayfindingWorkspace
        backgroundColorOptions={mergeMetroColorOptions(
          metroWayfindingBackgroundPalette,
          metroLineColorOptions,
        )}
        canvasSettings={
          activeCanvas ? (
            <CanvasEditor
              canvas={activeCanvas}
              disabled={isBusy || !selected}
              isMetroWayfinding
              isVerticalLineMap={isMetroVerticalLineMap}
              lockAlignToTile={isRealisticBusStop}
              metroWayfindingLayoutMode={metroWayfindingLayoutMode}
              onChange={updateCanvas}
              sizeMode={canvasSizeMode}
              locks={canvasLocks}
            />
          ) : undefined
        }
        dataSourceControls={workspaceDataSourceControls}
        disabled={isBusy}
        editor={renderMetroWayfindingEditor(true)}
        editorId={METRO_WAYFINDING_EDITOR_ID}
        initialLayout={parseMetroWayfindingLayout(input.layout ?? '')}
        onDownload={() => {
          if (mode === 'server') {
            void exportFromServer();
          } else {
            void exportManualDraft();
          }
        }}
        onExportProject={() => exportMetroWayfindingProject()}
        onSubmitReview={() => void submitManualDraft()}
        onToggleTransitSource={toggleTransitSource}
        onPxPerMeterChange={(value) => updateCanvas('pxPerMeter', value)}
        pxPerMeter={activeCanvas?.pxPerMeter ?? 128}
        maxPxPerMeter={maxPxPerMeter}
        saveBusy={isBusy || isSyncingLocalDraft}
        studioId={studioId}
        transitSource={transitNetworkSource}
        transitSourceOrigin={transitProjectOrigin}
        lineColorOptions={metroLineColorOptions}
        lineKeysByColor={metroLineKeysByColor}
        templateControls={workspaceTemplateControls}
        templateMeta={selected?.template.title ?? ''}
        templateTitle={panelTitle}
        textSuggestions={metroTextSuggestions}
      />
      {applyWizardDialog}
      {studioDialogs}
    </VisualEditorShell>
  );
}

function groupMaterialFormFields(
  templateId: string,
  template: MaterialTemplate,
  fields: ReadonlyArray<MaterialField>,
): TransitMaterialFormGroup[] {
  const fieldKeys = fields.map((field) => field.key);
  const has = (key: string) => fieldKeys.includes(key);
  const pick = (...keys: string[]) => keys.filter((key) => has(key));
  const assigned = new Set<string>();
  const add = (
    key: string,
    label: string,
    icon: string,
    keys: string[],
  ): TransitMaterialFormGroup | null => {
    const groupFieldKeys = pick(...keys);
    if (!groupFieldKeys.length) {
      return null;
    }
    groupFieldKeys.forEach((fieldKey) => assigned.add(fieldKey));
    return { key, label, icon, fieldKeys: groupFieldKeys };
  };
  const groups: Array<TransitMaterialFormGroup | null> = [];

  if (template.family === 'bus_stop') {
    if (has('stationName')) {
      groups.push(add('station', '当前站名', 'signpost', ['stationName', 'stationNamePinyin']));
      // 每条线路拆成一个节点：线路编号、停靠状态与站点属性都并入该线路节点。
      const routeSlots = [
        ...new Set(
          fieldKeys
            .map((key) => key.match(/^route(\d+)Number$/u)?.[1])
            .filter((slot): slot is string => Boolean(slot))
            .map(Number),
        ),
      ].sort((left, right) => left - right);
      for (const slot of routeSlots) {
        groups.push(
          add(`route-slot-${slot}`, `第 ${slot} 条线路`, 'route', [
            `route${slot}Number`,
            `route${slot}TemporaryStop`,
          ]),
        );
      }
      // 单线路模板（方块 / 拟真方块）：线路编号 + 停靠状态 + 始发终到合并为一个节点。
      groups.push(
        add('route-single', '线路', 'route', ['routeNumber', 'routeTemporaryStop', 'terminalRole']),
      );
    } else if (has('routeStations')) {
      groups.push(
        add('route-info', '线路信息', 'route', [
          'routeNumber',
          'routeSuffix',
          'accentColor',
          'routeFirstLast',
          'routeServiceTime',
          'operator',
          'travelDirection',
          'routeOrigin',
          'routeTerminal',
          'nextStation',
          'routeStationState',
          'footerText',
          'footerMode',
        ]),
      );
      groups.push(
        add('stations', '站点列表', 'list_alt', ['routeStations', 'currentStationIndex']),
      );
    }
  } else if (template.family === 'metro_line') {
    if (has('nextStationName') && has('stationName')) {
      groups.push(
        add('current-station', '当前站', 'signpost', [
          'stationName',
          'stationNamePinyin',
          'accentColor',
        ]),
      );
      groups.push(
        add('next-station', '下一站', 'place', [
          'nextStationName',
          'nextStationPinyin',
          'travelDirection',
        ]),
      );
    } else if (has('stationName')) {
      groups.push(
        add('station', '当前站', 'signpost', ['stationName', 'stationNamePinyin', 'accentColor']),
      );
    } else if (has('nextStationName')) {
      // 方向版式：线路编号与行车方向拆成两个节点，属性各自归位。
      groups.push(
        add('line-info', '线路编号', 'route', ['lineLabel', 'lineEnglishLabel', 'accentColor']),
      );
      groups.push(
        add('direction-info', '行车方向', 'explore', [
          'terminalName',
          'terminalNamePinyin',
          'travelDirection',
          'doorDirection',
        ]),
      );
      groups.push(add('next-station', '下一站', 'place', ['nextStationName', 'nextStationPinyin']));
    } else {
      groups.push(
        add('line-info', '线路编号', 'route', ['lineLabel', 'lineEnglishLabel', 'accentColor']),
      );
      groups.push(
        add('direction-info', '行车方向', 'explore', [
          'travelDirection',
          'travelDirectionSecondary',
          'doorDirection',
          'trackPosition',
        ]),
      );
      groups.push(
        add('stations', '站点列表', 'list_alt', ['routeStations', 'currentStationIndex']),
      );
    }
  } else if (template.family === 'road_sign') {
    // 路牌：路名与方向各一个节点，属性合并进各自面板。
    groups.push(add('road-name', '路名', 'signpost', ['roadName', 'roadNamePinyin']));
    groups.push(
      add('road-direction', '方向', 'explore', ['directionMode', 'arrowMode', 'signColor']),
    );
  } else if (template.family === 'address_sign') {
    if (templateId === NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID) {
      // 怀旧门牌只有一个整体版面，所有字段合并到一个节点。
      fieldKeys.forEach((fieldKey) => assigned.add(fieldKey));
      if (fieldKeys.length) {
        groups.push({ key: 'address', label: '门牌信息', icon: 'home', fieldKeys });
      }
    } else {
      // 默认门牌：左侧路名 / 邮政信息，右侧门牌号码。
      groups.push(
        add('address-name', '左侧路名栏', 'signpost', ['roadName', 'roadNamePinyin', 'postalCode']),
      );
      groups.push(add('address-number', '右侧号码栏', 'tag', ['buildingNumber', 'buildingSuffix']));
    }
  }

  // 换乘线路已拆到每个站点的属性面板；其余未归组字段统一进「其他」。
  const other = fieldKeys.filter((key) => !assigned.has(key) && key !== 'transferLines');
  if (other.length) {
    groups.push({ key: 'other', label: '其他', icon: 'tune', fieldKeys: other });
  }
  return groups.filter((group): group is TransitMaterialFormGroup => Boolean(group));
}

function buildMaterialFormRegions(
  templateId: string,
  template: MaterialTemplate,
  canvas: { widthM: number; heightM: number },
  stationNames: ReadonlyArray<string>,
  values: Record<string, string> = {},
): { regions: TransitMaterialFormRegion[]; viewBox: { width: number; height: number } } {
  const width = Math.max(1, Math.round(canvas.widthM * 128));
  const height = Math.max(1, Math.round(canvas.heightM * 128));
  const regions: TransitMaterialFormRegion[] = [];
  const pushRegion = (
    id: string,
    label: string,
    x: number,
    y: number,
    regionWidth: number,
    regionHeight: number,
    extra: Pick<
      TransitMaterialFormRegion,
      'groupKey' | 'stationIndex' | 'fieldKey' | 'fontSize' | 'selectField'
    >,
  ) => {
    regions.push({
      id,
      label,
      x,
      y,
      width: regionWidth,
      height: regionHeight,
      ...extra,
    });
  };
  const stationCount = stationNames.length;

  if (templateId === BUS_STOP_OVERVIEW_TEMPLATE_ID) {
    pushRegion('station', '当前站名', 12, 18, 104, 30, {
      groupKey: 'station',
      fieldKey: 'stationName',
      fontSize: 12,
    });
    [
      [1, 17, 45],
      [2, 17, 72],
      [3, 17, 99],
      [4, 75, 45],
      [5, 75, 72],
      [6, 75, 99],
    ].forEach(([slot, x, y]) => {
      pushRegion(`route-${slot}`, `第 ${slot} 条线路`, x!, y!, 36, 22, {
        groupKey: `route-slot-${slot}`,
        fieldKey: `route${slot}Number`,
        fontSize: 20,
      });
    });
  } else if (templateId === BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID) {
    pushRegion('station', '当前站名', 8, 42, 112, 38, {
      groupKey: 'station',
      fieldKey: 'stationName',
      fontSize: 14,
    });
    [
      [1, 11.86, 82.92],
      [2, 11.86, 112.88],
      [3, 11.86, 142.83],
      [4, 76.2, 82.92],
      [5, 76.2, 112.88],
      [6, 76.2, 142.83],
    ].forEach(([slot, x, y]) => {
      pushRegion(`route-${slot}`, `第 ${slot} 条线路`, x!, y!, 39.94, 24.4, {
        groupKey: `route-slot-${slot}`,
        fieldKey: `route${slot}Number`,
        fontSize: 20,
      });
    });
  } else if (templateId === BUS_STOP_TERMINAL_TEMPLATE_ID) {
    pushRegion('station', '当前站名', 12, 18, 104, 30, {
      groupKey: 'station',
      fieldKey: 'stationName',
      fontSize: 12,
    });
    pushRegion('route', '线路编号', 36.5, 58, 55, 36, {
      groupKey: 'route-single',
      fieldKey: 'routeNumber',
      fontSize: 46,
    });
    pushRegion('terminal-role', '始发终到', 36.5, 99, 55, 9, {
      groupKey: 'route-single',
      fieldKey: 'terminalRole',
      fontSize: 6,
    });
  } else if (templateId === BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID) {
    pushRegion('station', '当前站名', 0, 38, 128, 42, {
      groupKey: 'station',
      fieldKey: 'stationName',
      fontSize: 14,
    });
    pushRegion('route', '线路编号', 33.6, 97, 60.8, 40, {
      groupKey: 'route-single',
      fieldKey: 'routeNumber',
      fontSize: 46,
    });
    pushRegion('terminal-role', '始发终到', 0, 140, 128, 24, {
      groupKey: 'route-single',
      fieldKey: 'terminalRole',
      fontSize: 6,
    });
  } else if (templateId === BUS_STOP_DETAIL_TEMPLATE_ID) {
    pushRegion('route-info', '线路信息', 15, 6, 98, 32, {
      groupKey: 'route-info',
      fieldKey: 'routeNumber',
      fontSize: 11,
    });
    if (stationCount) {
      const leftCount = Math.ceil(stationCount / 2);
      const rows = Math.max(leftCount, stationCount - leftCount);
      const rowHeight = 79 / rows;
      stationNames.forEach((stationName, index) => {
        const isLeft = index < leftCount;
        const row = isLeft ? index : index - leftCount;
        pushRegion(
          `station-${index}`,
          `第 ${index + 1} 站 · ${stationName || '未命名'}`,
          16 + (isLeft ? 0 : 50),
          41 + row * rowHeight,
          46,
          rowHeight,
          {
            groupKey: 'stations',
            stationIndex: index,
            fieldKey: 'routeStations',
            fontSize: Math.max(4, rowHeight * 0.55),
          },
        );
      });
    }
  } else if (templateId === BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID) {
    // 模板 viewBox 固定 256×128，画布加宽后内容按比例拉伸，热区同步换算。
    const sx = width / 256;
    const sy = height / 128;
    pushRegion('route-info', '线路信息', 3 * sx, 3 * sy, 178 * sx, 24 * sy, {
      groupKey: 'route-info',
      fieldKey: 'routeNumber',
      fontSize: 12,
    });
    // 底部行车方向由行车方向自动推断，只作为选中线路信息节点的热区。
    pushRegion('footer', '底部行车方向', 0, 106 * sy, 256 * sx, 22 * sy, {
      groupKey: 'route-info',
      fontSize: 12,
    });
    // 右侧线路走向地图：只做选区提示，双击不进入文本编辑（地图数据不可手填）。
    pushRegion('route-map', '线路走向图', 184 * sx, 0, 72 * sx, 106 * sy, {
      groupKey: 'route-info',
      fontSize: 5,
    });
    if (stationCount) {
      // 站名会按可用宽度拆成一栏或两栏、长站名还会换列，热区必须跟同一套排版结果，
      // 不能再用等分宽度，否则点到的区域和看到的站名对不上。
      const stationGlyph = template.fields.find((field) => field.key === 'routeStations')?.glyph;
      const glyphRegions = stationGlyph
        ? resolveTransitHorizontalStationRegions(stationNames.join('\n'), stationGlyph)
        : [];
      glyphRegions.forEach((region) => {
        const stationName = stationNames[region.stationIndex] ?? '';
        pushRegion(
          `station-${region.stationIndex}`,
          `第 ${region.stationIndex + 1} 站 · ${stationName || '未命名'}`,
          (3 + region.x) * sx,
          (33 + region.y) * sy,
          region.width * sx,
          region.height * sy,
          {
            groupKey: 'stations',
            stationIndex: region.stationIndex,
            fieldKey: 'routeStations',
            fontSize: stationGlyph?.fontSize ?? 6,
          },
        );
      });
    }
  } else if (templateId === METRO_PLATFORM_SIGN_TEMPLATE_ID) {
    // 站台标志按较短边等比缩放内容，热区必须跟着画布尺寸一起缩放。
    const signScale = Math.min(width / 512, height / 512);
    pushRegion('current-station', '当前站', 0, 72 * signScale, width, 221 * signScale, {
      groupKey: 'current-station',
      fieldKey: 'stationName',
      fontSize: 40,
    });
    pushRegion('line-color', '线路色', 0, 293 * signScale, width, 28 * signScale, {
      groupKey: 'current-station',
      fieldKey: 'accentColor',
      fontSize: 12,
    });
    pushRegion('next-station', '下一站', 0, 321 * signScale, width, 191 * signScale, {
      groupKey: 'next-station',
      fieldKey: 'nextStationName',
      fontSize: 24,
    });
  } else if (
    template.family === 'metro_line' &&
    template.fields.some(
      (field) =>
        field.glyph?.renderer?.startsWith('metro_station_name') ||
        field.glyph?.renderer?.startsWith('metro_direction'),
    )
  ) {
    // 站名 / 方向版式：文字位置由渲染器决定，这里复用同一套版面公式生成热区。
    const signGlyph = template.fields.find(
      (field) =>
        field.glyph?.renderer?.startsWith('metro_station_name') ||
        field.glyph?.renderer?.startsWith('metro_direction'),
    )?.glyph;
    if (signGlyph) {
      resolveMetroSignTextRegions(signGlyph.renderer, values, canvas).forEach((region) => {
        pushRegion(region.id, region.label, region.x, region.y, region.width, region.height, {
          groupKey: region.groupKey,
          fieldKey: region.fieldKey,
          fontSize: 10,
        });
      });
    }
  } else if (
    template.family === 'metro_line' &&
    template.fields.some((field) => field.glyph?.renderer?.startsWith('metro_line_map'))
  ) {
    // 热区必须与渲染器共用同一套站位算法：padding / spacing / 反向显示 / 页头高度。
    const renderer =
      template.fields.find((field) => field.key === 'routeStations')?.glyph?.renderer ?? '';
    const isVertical = renderer.startsWith('metro_line_map_vertical');
    const isClassic = renderer.endsWith('_classic');
    const travelDirection = values.travelDirection === 'first' ? 'first' : 'last';
    const doorDirection = values.doorDirection === 'right' ? 'right' : 'left';
    // 旧版竖版线路图固定按两侧轨道渲染，热区同步按两侧计算。
    const isBoth = isClassic || values.trackPosition === 'both';
    if (isVertical) {
      const widthScale = width / 128;
      const headerHeight = (isClassic && isBoth ? 50 : 32) * widthScale;
      const margin = 12 * widthScale;
      const firstY = headerHeight + margin;
      const lastY = Math.max(height - margin, firstY);
      const spacing = stationCount > 1 ? (lastY - firstY) / (stationCount - 1) : 0;
      pushRegion('line-info', '线路信息', 0, 0, width, Math.max(headerHeight, 1), {
        groupKey: 'line-info',
        fieldKey: 'lineLabel',
        fontSize: 16,
      });
      stationNames.forEach((stationName, displayIndex) => {
        const originalIndex =
          travelDirection === 'first' ? displayIndex : stationCount - 1 - displayIndex;
        const y = firstY + displayIndex * spacing;
        pushRegion(
          `station-${originalIndex}`,
          `第 ${originalIndex + 1} 站 · ${stationName || '未命名'}`,
          0,
          Math.max(y - spacing / 2, headerHeight),
          width,
          Math.max(spacing, 10),
          {
            groupKey: 'stations',
            stationIndex: originalIndex,
            fieldKey: 'routeStations',
            fontSize: Math.max(5, spacing * 0.4),
          },
        );
      });
    } else if (stationCount) {
      const paddingX = Math.min(26, width * 0.08);
      const left = paddingX;
      const right = width - paddingX;
      const spacing = stationCount > 1 ? (right - left) / (stationCount - 1) : right - left;
      const terminusOnLast = travelDirection !== 'first';
      const reverseDisplay =
        (terminusOnLast && doorDirection === 'left') ||
        (!terminusOnLast && doorDirection === 'right');
      stationNames.forEach((stationName, displayIndex) => {
        const originalIndex = reverseDisplay ? stationCount - 1 - displayIndex : displayIndex;
        const x = left + displayIndex * spacing;
        const regionWidth = Math.max(spacing, 24);
        pushRegion(
          `station-${originalIndex}`,
          `第 ${originalIndex + 1} 站 · ${stationName || '未命名'}`,
          Math.max(x - regionWidth / 2, 0),
          0,
          regionWidth,
          height,
          {
            groupKey: 'stations',
            stationIndex: originalIndex,
            fieldKey: 'routeStations',
            fontSize: 7,
          },
        );
      });
    }
  } else if (templateId === ROAD_NAME_DIRECTION_TEMPLATE_ID) {
    // 路牌 / 门牌模板的 viewBox 固定为 256×128，画布拉伸后热区要按比例换算。
    const sx = width / 256;
    const sy = height / 128;
    // 路牌：先放非文本区域，文本热区最后放，保证文字区域命中优先级最高。
    pushRegion('road-sign-color', '底色与辅助文字颜色', 4 * sx, 68 * sy, 248 * sx, 40 * sy, {
      groupKey: 'road-direction',
      fontSize: 10,
    });
    pushRegion('road-direction-left', '左侧方位', 4 * sx, 72 * sy, 44 * sx, 50 * sy, {
      groupKey: 'road-direction',
      fontSize: 9,
    });
    pushRegion('road-direction-right', '右侧方位', 208 * sx, 72 * sy, 44 * sx, 50 * sy, {
      groupKey: 'road-direction',
      fontSize: 9,
    });
    pushRegion('road-name', '道路主名称', 52 * sx, 70 * sy, 152 * sx, 30 * sy, {
      groupKey: 'road-name',
      fieldKey: 'roadName',
      fontSize: 18,
    });
    pushRegion('road-name-pinyin', '道路副名称', 52 * sx, 104 * sy, 152 * sx, 22 * sy, {
      groupKey: 'road-name',
      fieldKey: 'roadNamePinyin',
      fontSize: 12,
    });
  } else if (templateId === BUILDING_ADDRESS_TEMPLATE_ID) {
    const sx = width / 256;
    const sy = height / 128;
    pushRegion('address-road-name', '地名或道路名称', 4 * sx, 16 * sy, 134 * sx, 34 * sy, {
      groupKey: 'address-name',
      fieldKey: 'roadName',
      fontSize: 20,
    });
    pushRegion('address-road-pinyin', '地名或道路副名称', 4 * sx, 52 * sy, 134 * sx, 28 * sy, {
      groupKey: 'address-name',
      fieldKey: 'roadNamePinyin',
      fontSize: 12,
    });
    pushRegion('address-postal', '邮政编码', 4 * sx, 94 * sy, 134 * sx, 24 * sy, {
      groupKey: 'address-name',
      fieldKey: 'postalCode',
      fontSize: 11,
    });
    pushRegion('address-building-number', '门牌号', 143 * sx, 5 * sy, 62 * sx, 118 * sy, {
      groupKey: 'address-number',
      fieldKey: 'buildingNumber',
      fontSize: 40,
    });
    pushRegion('address-building-suffix', '门牌附标', 201 * sx, 5 * sy, 51 * sx, 118 * sy, {
      groupKey: 'address-number',
      fieldKey: 'buildingSuffix',
      fontSize: 24,
    });
  } else if (templateId === NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID) {
    const sx = width / 256;
    const sy = height / 128;
    pushRegion('nostalgic-road-name', '道路名称', 8 * sx, 8 * sy, 66 * sx, 112 * sy, {
      groupKey: 'address',
      fieldKey: 'roadName',
      fontSize: 18,
    });
    pushRegion('nostalgic-building-number', '门牌号', 70 * sx, 8 * sy, 160 * sx, 112 * sy, {
      groupKey: 'address',
      fieldKey: 'buildingNumber',
      fontSize: 40,
    });
  }

  return { regions, viewBox: { width, height } };
}

function splitMaterialStationNames(value: string): string[] {
  return value
    .split(/\r?\n|\s*\/\s*/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseMaterialTransferLines(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const segment of value.split(/[;；\n]/u)) {
    const [name, lines] = segment.split(/[=＝]/u);
    if (!name?.trim()) {
      continue;
    }
    map.set(name.trim(), lines?.trim() ?? '');
  }
  return map;
}

function formatMaterialTransferLines(map: Map<string, string>): string {
  return [...map.entries()]
    .filter(([name, lines]) => Boolean(name.trim() && lines.trim()))
    .map(([name, lines]) => `${name}=${lines}`)
    .join(';');
}

function setMaterialTransferLine(value: string, stationName: string, lines: string): string {
  const map = parseMaterialTransferLines(value);
  if (lines.trim()) {
    map.set(stationName, lines.trim());
  } else {
    map.delete(stationName);
  }
  return formatMaterialTransferLines(map);
}

function renameMaterialTransferStation(
  value: string,
  previousName: string,
  nextName: string,
): string {
  if (!previousName || previousName === nextName) {
    return value;
  }
  const map = parseMaterialTransferLines(value);
  const lines = map.get(previousName);
  if (lines === undefined) {
    return value;
  }
  map.delete(previousName);
  map.set(nextName, lines);
  return formatMaterialTransferLines(map);
}

function resolveMetroLineNumber(name: string): string {
  const trimmed = name.trim();
  const match = trimmed.match(/^([0-9]+[A-Za-z]?|[A-Za-z]+[0-9]+)/u);
  return match?.[1] ?? trimmed;
}

/** 缩略图的取色结果：背景、前景（文字）与强调色都来自模板真实源码。 */
interface TemplateThumbnailPalette {
  accent: string;
  background: string;
  foreground: string;
}

function normalizeThumbnailColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/** 粗略亮度：只用于判断前景该用黑还是白，不追求色彩空间精度。 */
function thumbnailColorLuminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(
    (offset) => parseInt(color.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readAttribute(tag: string, name: string): string | undefined {
  const matched = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return matched?.[1];
}

/**
 * 从模板 SVG 源码里提取代表色：面积最大的矩形作为底色，文字填充色作为前景色，
 * 颜色字段或第二大面积色块作为强调色。模板没有源码时退回中性深色。
 */
function resolveTemplateThumbnailPalette(
  template: MaterialTemplate,
  source: string | undefined,
): TemplateThumbnailPalette {
  const fallback: TemplateThumbnailPalette = {
    accent: '#073764',
    background: '#262626',
    foreground: '#FFFFFF',
  };
  if (!source) {
    return fallback;
  }

  // 先把 {{fieldKey}} 这类简单变量替换成字段默认值，否则 signColor / accentColor
  // 这类模板颜色取不到字面量，会被误判成白底白字。
  const defaultByField = new Map(
    template.fields.map((field) => [field.key, field.defaultValue?.trim() ?? '']),
  );
  const resolvedSource = source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (matched, variable: string) => {
    if (variable.includes('.')) {
      return matched;
    }
    return defaultByField.get(variable) || matched;
  });

  // 底色：按矩形面积累加，避免被小色块或描边干扰。
  const rectWeights = new Map<string, number>();
  for (const match of resolvedSource.matchAll(/<rect\b[^>]*>/gi)) {
    const tag = match[0];
    const color = normalizeThumbnailColor(readAttribute(tag, 'fill'));
    if (!color) {
      continue;
    }
    const width = Number(readAttribute(tag, 'width') ?? 1);
    const height = Number(readAttribute(tag, 'height') ?? 1);
    const weight = Number.isFinite(width * height) ? Math.max(width * height, 1) : 1;
    rectWeights.set(color, (rectWeights.get(color) ?? 0) + weight);
  }
  const rankedRects = [...rectWeights.entries()].sort((left, right) => right[1] - left[1]);
  let background: string | undefined = rankedRects[0]?.[0];

  // 文字前景：出现次数最多的文字填充色。
  const textCounts = new Map<string, number>();
  for (const match of resolvedSource.matchAll(/<text\b[^>]*>/gi)) {
    const color = normalizeThumbnailColor(readAttribute(match[0], 'fill'));
    if (color) {
      textCounts.set(color, (textCounts.get(color) ?? 0) + 1);
    }
  }
  for (const match of resolvedSource.matchAll(/<tspan\b[^>]*>/gi)) {
    const color = normalizeThumbnailColor(readAttribute(match[0], 'fill'));
    if (color) {
      textCounts.set(color, (textCounts.get(color) ?? 0) + 1);
    }
  }
  let foreground: string | undefined;
  let fallbackTextColor: string | undefined;
  for (const [color] of [...textCounts.entries()].sort((left, right) => right[1] - left[1])) {
    fallbackTextColor ??= color;
    if (
      background &&
      Math.abs(thumbnailColorLuminance(color) - thumbnailColorLuminance(background)) > 0.28
    ) {
      foreground = color;
      break;
    }
  }

  // 导视牌等模板把配色写在字段默认值 JSON 里，源码没有字面量颜色。
  if (!background || !foreground) {
    const defaults = template.fields.map((field) => field.defaultValue ?? '').join('\n');
    background ??= normalizeThumbnailColor(
      /"backgroundColor"\s*:\s*"(#[0-9a-fA-F]{6})"/.exec(defaults)?.[1],
    );
    foreground ??= normalizeThumbnailColor(
      /"foregroundColor"\s*:\s*"(#[0-9a-fA-F]{6})"/.exec(defaults)?.[1],
    );
  }

  background ??= fallback.background;
  foreground ??=
    fallbackTextColor ??
    (thumbnailColorLuminance(background) > 0.55 ? '#111111' : fallback.foreground);

  // 强调色：优先取模板配色字段的默认值，其次取第二大面积且与底色不同的色块。
  const colorField = template.fields.find((field) =>
    ['accentColor', 'signColor', 'lineColor'].includes(field.key),
  );
  const accent =
    normalizeThumbnailColor(colorField?.defaultValue) ??
    rankedRects.find(([color]) => color !== background)?.[0] ??
    foreground;

  return { accent, background, foreground };
}

/**
 * 版式卡片里的低仿真预览：不请求服务端出图，只用真实站点 / 线路值拼一个比例正确的牌面示意。
 */
function MaterialLayoutThumbnail({
  source,
  template,
  values,
}: Readonly<{ source?: string; template: MaterialTemplate; values: Record<string, string> }>) {
  const width = Math.max(template.defaultCanvas.widthM || 1, 0.2);
  const height = Math.max(template.defaultCanvas.heightM || 1, 0.2);
  const styleLabel = template.title.match(/（([^）]+)）\s*$/u)?.[1] ?? '';
  const hasOverview = template.fields.some((field) => field.key === 'route1Number');
  const hasDetail = template.fields.some((field) => field.key === 'routeStations');
  const station = values.stationName || template.title;
  const routeNumbers = [1, 2, 3, 4, 5, 6]
    .map((slot) => values[`route${slot}Number`])
    .filter((value): value is string => Boolean(value));
  const primaryRoute = values.routeNumber || routeNumbers[0] || '';
  const palette = useMemo(
    () => resolveTemplateThumbnailPalette(template, source),
    [source, template],
  );
  return (
    <span
      className={`material-layout-thumb${styleLabel.includes('拟真') ? ' is-realistic' : ''}${
        hasOverview ? ' is-overview' : hasDetail ? ' is-detail' : ' is-generic'
      }`}
      style={
        {
          aspectRatio: `${width} / ${height}`,
          '--material-thumb-accent': palette.accent,
          '--material-thumb-bg': palette.background,
          '--material-thumb-fg': palette.foreground,
        } as CSSProperties
      }
      role="img"
      aria-label={template.title}
    >
      <span className="material-layout-thumb-sign">
        <strong>{station}</strong>
        {hasOverview ? (
          <span className="material-layout-thumb-routes">
            {routeNumbers.map((route, index) => (
              <i key={`route-${index}`}>{route}</i>
            ))}
          </span>
        ) : null}
        {hasDetail ? (
          <span className="material-layout-thumb-detail">
            {primaryRoute ? <i>{primaryRoute}</i> : null}
            <span>{values.nextStation || ''}</span>
            <span>
              {values.routeOrigin || ''}
              {values.routeOrigin || values.routeTerminal ? ' → ' : ''}
              {values.routeTerminal || ''}
            </span>
          </span>
        ) : null}
        {!hasOverview && !hasDetail ? (
          <span className="material-layout-thumb-generic">{styleLabel || template.title}</span>
        ) : null}
      </span>
    </span>
  );
}

function MaterialPreviewDescription({
  isRendering,
  previewSize,
}: Readonly<{
  isRendering: boolean;
  previewSize: { width: number; height: number } | null;
}>) {
  const { t } = useI18n();
  return (
    <span>
      {t('materialStudio.previewWatermark')}
      {previewSize?.width && previewSize.height
        ? ` · ${previewSize.width} × ${previewSize.height} px`
        : ''}
      {isRendering ? ` · ${t('materialStudio.updating')}` : ''}
    </span>
  );
}

function MaterialPreviewStage({
  previewUrl,
  svg,
  isRendering,
  alt,
}: Readonly<{ previewUrl?: string | null; svg?: string; isRendering?: boolean; alt: string }>) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewUrl) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
      context?.drawImage(image, 0, 0);
    };
    image.src = previewUrl;
    return () => {
      image.onload = null;
    };
  }, [previewUrl]);
  if (svg) {
    // 本地合成的 SVG 自带像素宽高；去掉外层尺寸后由容器按比例缩放，保证与导出同版式。
    const scalableSvg = svg.replace(
      /^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/u,
      '<svg$1 width="100%" height="100%"',
    );
    return (
      <div className="material-preview-stage material-preview-svg-stage">
        <div
          className="material-preview-canvas material-preview-svg"
          role="img"
          aria-label={alt}
          dangerouslySetInnerHTML={{ __html: scalableSvg }}
        />
      </div>
    );
  }
  return (
    <div className={`material-preview-stage${isRendering ? ' is-rendering' : ''}`}>
      {previewUrl ? (
        <div className="material-preview-canvas">
          <canvas ref={canvasRef} role="img" aria-label={alt} />
        </div>
      ) : (
        <span>{t('materialStudio.noPreviewYet')}</span>
      )}
      {isRendering ? (
        <div className="material-preview-loading" role="status" aria-live="polite">
          <span className="material-preview-spinner" aria-hidden="true" />
          <span>{t('materialStudio.updating')}</span>
        </div>
      ) : null}
    </div>
  );
}

function resolveMaterialDownloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition');
  const encodedFileName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    try {
      return decodeURIComponent(encodedFileName);
    } catch {
      return encodedFileName;
    }
  }
  const plainFileName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  return plainFileName || fallback;
}

function ResponsiveSidebarDisclosure({
  title,
  isCompact,
  children,
}: Readonly<{
  title: string;
  isCompact: boolean;
  children: ReactNode;
}>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const open = !isCompact || isExpanded;

  useEffect(() => {
    if (isCompact) setIsExpanded(false);
  }, [isCompact]);

  return (
    <details
      className="material-sidebar-disclosure"
      open={open}
      onToggle={(event) => {
        if (isCompact) setIsExpanded(event.currentTarget.open);
      }}
    >
      <summary>
        <strong>{title}</strong>
        <span className="material-symbols-outlined" aria-hidden="true">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </summary>
      <div className="material-sidebar-disclosure-body">{children}</div>
    </details>
  );
}

function CanvasEditor({
  canvas,
  disabled,
  sizeMode,
  isMetroWayfinding,
  isVerticalLineMap = false,
  lockAlignToTile = false,
  metroWayfindingLayoutMode,
  locks,
  onChange,
}: Readonly<{
  canvas: MaterialCanvas | null;
  disabled: boolean;
  sizeMode: 'full' | 'length' | 'none';
  isMetroWayfinding: boolean;
  isVerticalLineMap?: boolean;
  lockAlignToTile?: boolean;
  metroWayfindingLayoutMode?: 'single' | 'double' | 'vertical';
  /** 画布锁：被锁维度不显示输入，服务端也会拒绝修改。 */
  locks?: { width: boolean; height: boolean };
  onChange: <TKey extends keyof MaterialCanvas>(key: TKey, value: MaterialCanvas[TKey]) => void;
}>) {
  const metroLayoutMode = metroWayfindingLayoutMode ?? 'single';
  const isMetroVertical = isMetroWayfinding && metroLayoutMode === 'vertical';
  const isVerticalLength = isMetroVertical || isVerticalLineMap;
  // 竖版线路图以 0.5 米为步进，才能使用设计稿默认的 2.5 米高度。
  const normalizeVerticalLength = (value: number) =>
    isVerticalLineMap
      ? Math.min(64, Math.max(1, Math.round(value * 2) / 2))
      : Math.min(64, Math.max(1, Math.round(value)));
  const { t } = useI18n();

  // 拟真公交站牌必须保持 128×180 的比例，切到该模板时强制关闭对齐。
  useEffect(() => {
    if (canvas && lockAlignToTile && canvas.alignToTile) {
      onChange('alignToTile', false);
    }
  }, [canvas, lockAlignToTile, onChange]);

  useEffect(() => {
    if (!canvas || sizeMode !== 'length') {
      return;
    }
    const fixedHeight = isMetroWayfinding && metroLayoutMode === 'double' ? 2 : 1;
    const currentLength = isVerticalLength ? canvas.heightM : canvas.widthM;
    const normalizedLength = normalizeVerticalLength(currentLength);
    if (currentLength !== normalizedLength) {
      onChange(isVerticalLength ? 'heightM' : 'widthM', normalizedLength);
    }
    if (isVerticalLineMap) {
      if (canvas.widthM !== 1) {
        onChange('widthM', 1);
      }
    } else {
      const normalizedWidth = Math.min(64, Math.max(1, Math.round(canvas.widthM)));
      if (isVerticalLength && canvas.widthM !== normalizedWidth) {
        onChange('widthM', normalizedWidth);
      }
      if (!isVerticalLength && canvas.heightM !== fixedHeight) {
        onChange('heightM', fixedHeight);
      }
    }
  }, [
    canvas,
    isMetroWayfinding,
    isVerticalLength,
    isVerticalLineMap,
    metroLayoutMode,
    onChange,
    sizeMode,
  ]);

  if (!canvas) {
    return null;
  }

  const widthPx = Math.round(canvas.widthM * canvas.pxPerMeter);
  const heightPx = Math.round(canvas.heightM * canvas.pxPerMeter);
  const outputWidth = canvas.alignToTile
    ? Math.ceil(widthPx / canvas.tileSizePx) * canvas.tileSizePx
    : widthPx;
  const outputHeight = canvas.alignToTile
    ? Math.ceil(heightPx / canvas.tileSizePx) * canvas.tileSizePx
    : heightPx;
  const updateMetroLength = (value: number) => {
    onChange(isVerticalLength ? 'heightM' : 'widthM', normalizeVerticalLength(value));
  };
  const maxPxPerMeter = resolveMaterialMaxPxPerMeter(canvas);
  // 画布尺寸变大后，旧的密度可能让最长边超过 4096：自动压回上限。
  useEffect(() => {
    if (canvas.pxPerMeter > maxPxPerMeter) {
      onChange('pxPerMeter', maxPxPerMeter);
    }
  }, [canvas.pxPerMeter, maxPxPerMeter, onChange]);
  const showWidthInput =
    !locks?.width && (sizeMode === 'full' || (sizeMode === 'length' && !isVerticalLength));
  const showHeightInput =
    !locks?.height && (sizeMode === 'full' || (sizeMode === 'length' && isVerticalLength));
  const showMetroVerticalWidthInput = isMetroVertical && !locks?.width && sizeMode === 'length';

  return (
    <fieldset className="material-canvas-editor" disabled={disabled}>
      <legend>{t('materialStudio.dimensions')}</legend>
      {showWidthInput ? (
        <label>
          <span>
            {isVerticalLength ? t('materialStudio.signWidth') : t('materialStudio.widthMeters')}
          </span>
          <input
            type="number"
            min="0.01"
            max="64"
            step={sizeMode === 'length' ? '1' : '0.01'}
            value={canvas.widthM}
            onChange={(event) => {
              if (sizeMode === 'length') {
                updateMetroLength(Number(event.currentTarget.value));
                return;
              }
              onChange('widthM', Number(event.currentTarget.value));
            }}
          />
        </label>
      ) : null}
      {showHeightInput ? (
        <label>
          <span>
            {isVerticalLength ? t('materialStudio.signHeight') : t('materialStudio.heightMeters')}
          </span>
          <input
            type="number"
            min="0.01"
            max="64"
            step={isVerticalLineMap ? '0.5' : sizeMode === 'length' ? '1' : '0.01'}
            value={canvas.heightM}
            onChange={(event) => {
              if (sizeMode === 'length') {
                updateMetroLength(Number(event.currentTarget.value));
                return;
              }
              onChange('heightM', Number(event.currentTarget.value));
            }}
          />
        </label>
      ) : null}
      {showMetroVerticalWidthInput ? (
        <label>
          <span>{t('materialStudio.signWidth')}</span>
          <input
            type="number"
            min="1"
            max="64"
            step="1"
            value={canvas.widthM}
            onChange={(event) =>
              onChange(
                'widthM',
                Math.min(64, Math.max(1, Math.round(Number(event.currentTarget.value)))),
              )
            }
          />
        </label>
      ) : null}
      <label>
        <span>{t('materialStudio.alignmentUnit')}</span>
        <input
          type="number"
          min="16"
          max="4096"
          step="1"
          value={canvas.tileSizePx}
          onChange={(event) => onChange('tileSizePx', Number(event.currentTarget.value))}
        />
      </label>
      <CheckboxRow
        variant="material"
        checked={canvas.alignToTile}
        disabled={isMetroWayfinding || lockAlignToTile}
        onChange={(event) => onChange('alignToTile', event.currentTarget.checked)}
        label={t('materialStudio.alignToMapSize')}
      />
      <output>
        {outputWidth} × {outputHeight} px
        {canvas.pxPerMeter > maxPxPerMeter ? ` · 上限 ${maxPxPerMeter} px/米` : ''}
      </output>
    </fieldset>
  );
}

/**
 * 首末班车时间的「首班 / 末班」双输入。
 *
 * 只用于项目线网来源：项目存档不带运营时间，服务端解析出来是空串，
 * 直接给一个文本框用户不知道该填 `06:00-22:30` 还是别的格式，
 * 所以拆成两个时间输入，再按牌面格式（`formatServiceTimeRange`）合成。
 */
function MaterialServiceTimeFields({
  label,
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  const { first, last } = parseServiceTimeRange(value);
  const { t } = useI18n();
  return (
    <div className="material-service-time-fields">
      <span>{label}</span>
      <Field label={t('materialStudio.firstBus')}>
        <Input
          type="time"
          value={first}
          disabled={disabled}
          onChange={(event) =>
            onChange(formatServiceTimeRange(event.currentTarget.value, last || undefined))
          }
        />
      </Field>
      <Field label={t('materialStudio.lastBus')}>
        <Input
          type="time"
          value={last}
          disabled={disabled}
          onChange={(event) =>
            onChange(formatServiceTimeRange(first || undefined, event.currentTarget.value))
          }
        />
      </Field>
      <small>{t('materialStudio.projectNoTimeHint')}</small>
    </div>
  );
}

/** 颜色预设选项的值是 #RRGGBB；选中时用它填充按钮。 */
const materialColorOptionPattern = /^#[0-9a-f]{6}$/i;

function MaterialFieldEditor({
  field,
  value,
  disabled,
  suggestions,
  optionsOverride,
  labelOverride,
  onChange,
}: Readonly<{
  field: MaterialField;
  value: string;
  disabled: boolean;
  suggestions?: string[];
  optionsOverride?: MaterialField['options'];
  labelOverride?: string;
  onChange: (value: string) => void;
}>) {
  const suggestionsId = useId();
  const { t } = useI18n();
  const continuationSuggestion =
    field.kind === 'text' ? findTextContinuation(value, suggestions) : undefined;
  // 兼容早期草稿里的 left/right 取值：两套旧值都表示「开往末站」。
  const selectValue =
    field.key === 'travelDirection' && (value === 'left' || value === 'right') ? 'last' : value;
  const selectOptions = optionsOverride ?? field.options;
  // 固定 ≤4 个选项改用分段控件，避免下拉里再展开一次；超过 4 项仍用 select。
  const rendersSegmentedSelect =
    field.kind === 'select' &&
    !!selectOptions &&
    selectOptions.length > 0 &&
    selectOptions.length <= 4;
  // 分段控件是一组按钮，不能再套 <label>：label 会把点击/交互转发给第一个按钮，
  // 表现为“指针在任意位置都命中第一个选项”。
  const FieldElement = rendersSegmentedSelect ? 'div' : 'label';
  return (
    <FieldElement className={`material-field${rendersSegmentedSelect ? ' is-segmented' : ''}`}>
      <span>
        {labelOverride ?? field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.kind === 'select' ? (
        rendersSegmentedSelect ? (
          <SegmentedControl
            ariaLabel={labelOverride ?? field.label}
            className="material-mode-switch material-variant-switch material-field-segmented"
            disabled={disabled}
            value={selectValue}
            onChange={onChange}
            options={selectOptions.map((option) => ({
              ...option,
              accentColor: materialColorOptionPattern.test(option.value) ? option.value : undefined,
            }))}
          />
        ) : (
          <select
            value={selectValue}
            onChange={(event) => onChange(event.currentTarget.value)}
            disabled={disabled}
          >
            <option value="">{t('materialStudio.pleaseSelect')}</option>
            {selectOptions?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      ) : field.kind === 'color' ? (
        <span
          style={{
            display: 'grid',
            gridTemplateColumns: '48px minmax(0, 1fr)',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <input
            type="color"
            aria-label={t('materialStudio.colorPaletteAria', { label: field.label })}
            value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#26CABA'}
            required={field.required}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
            style={{ padding: 4 }}
          />
          <input
            type="text"
            aria-label={t('materialStudio.colorHexAria', { label: field.label })}
            value={value}
            maxLength={7}
            required={field.required}
            disabled={disabled}
            placeholder="#26CABA"
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          />
        </span>
      ) : field.kind === 'text' &&
        (field.key === 'routeStations' || field.key === 'transferLines') ? (
        <textarea
          value={value}
          maxLength={field.maxLength}
          required={field.required}
          disabled={disabled}
          rows={field.key === 'routeStations' ? 4 : 3}
          placeholder={
            field.key === 'transferLines' ? '例如：大通湖街=4,9；砂阳=4:#8957A1' : undefined
          }
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : field.kind === 'text' && suggestions?.length ? (
        <div className="material-field-text-autocomplete">
          <datalist id={suggestionsId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          {continuationSuggestion ? (
            <span className="material-field-text-autocomplete-ghost" aria-hidden="true">
              <span>{value}</span>
              <strong>{continuationSuggestion.slice(value.length)}</strong>
            </span>
          ) : null}
          <input
            type="text"
            value={value}
            maxLength={field.maxLength}
            required={field.required}
            disabled={disabled}
            list={suggestionsId}
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || !continuationSuggestion) return;
              event.preventDefault();
              onChange(continuationSuggestion);
            }}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : (
        <input
          type={field.kind === 'number' ? 'number' : 'text'}
          value={value}
          min={field.minimum}
          max={field.maximum}
          maxLength={field.maxLength}
          required={field.required}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </FieldElement>
  );
}

function listDiagramDirectionOptions(
  translate: ReturnType<typeof useI18n>['t'],
): TransitStationOption['directionOptions'] {
  return [
    { value: 'east', label: translate('materialStudio.orientationRight') },
    { value: 'west', label: translate('materialStudio.orientationLeft') },
    { value: 'north', label: translate('materialStudio.orientationUp') },
    { value: 'south', label: translate('materialStudio.orientationDown') },
  ];
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function materialDraftStatusLabel(status: MaterialDraft['status'], translate: Translate): string {
  return translate(
    {
      draft: 'materialStudio.draftStatus.draft',
      pending_review: 'materialStudio.draftStatus.pending_review',
      approved: 'materialStudio.draftStatus.approved',
      rejected: 'materialStudio.draftStatus.rejected',
    }[status] as Parameters<Translate>[0],
  );
}

function materialOfflineDraftStatusLabel(
  status: MaterialOfflineDraftRecord['syncStatus'],
  translate: Translate,
): string {
  const keys = {
    local: 'materialStudio.syncStatus.pending',
    syncing: 'materialStudio.syncStatus.syncing',
    synced: 'materialStudio.syncStatus.synced',
    conflict: 'materialStudio.syncStatus.conflict',
    failed: 'materialStudio.syncStatus.failed',
  } as const;
  const key = keys[status as keyof typeof keys];
  return key ? ` · ${translate(key)}` : '';
}

function formatStudioDraftInput(
  draft: MaterialDraft,
  template: MaterialTemplate | undefined,
  translate: Translate,
): string {
  if (!template) {
    return (
      Object.entries(draft.input)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}：${value}`)
        .join(' · ') || translate('materialStudio.emptyFields')
    );
  }
  return (
    template.fields
      .filter((field) => field.userEditable !== false)
      .map((field) => {
        const value = draft.input[field.key]?.trim();
        if (!value) {
          return undefined;
        }
        const option = field.options?.find((item) => item.value === value);
        return `${field.label}：${option?.label ?? value}`;
      })
      .filter(Boolean)
      .join(' · ') || translate('materialStudio.emptyFields')
  );
}

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
  );
}
