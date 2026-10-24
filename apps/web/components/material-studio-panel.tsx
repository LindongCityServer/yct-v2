'use client';

import type { MaterialTransitNetworkSnapshot, TileProviderDescriptor } from '@yct/contracts';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { appPath } from '../lib/app-paths';
import {
  createMaterialOfflineDraftId,
  readLatestMaterialOfflineDraft,
  upsertMaterialOfflineDraft,
  type MaterialOfflineDraftRecord,
} from '../lib/client-material-offline-drafts';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import { findTextContinuation } from '../lib/text-continuation';
import {
  publishMaterialStudioActionBlocked,
  publishMaterialStudioState,
  subscribeMaterialStudioActions,
} from '../lib/client-material-studio-events';
import { dispatchMetroWayfindingCompositionAction } from '../lib/client-metro-wayfinding-events';
import {
  publishTransitNetworkLineNameEditorRequested,
  subscribeTransitNetworkProjectSnapshotChanged,
  subscribeTransitNetworkSourceChanged,
  type TransitNetworkProjectOrigin,
} from '../lib/client-transit-network-events';
import {
  buildMetroWayfindingProjectFileName,
  createMetroWayfindingProjectFile,
  METRO_WAYFINDING_TEMPLATE_ID,
  parseMetroWayfindingLayout,
  serializeMetroWayfindingLayout,
  serializeMetroWayfindingProjectFile,
} from '../lib/metro-wayfinding';
import { METRO_PLATFORM_SIGN_TEMPLATE_ID } from '../lib/material-template-ids';
import {
  buildMetroWayfindingTemplateExamples,
  type MetroWayfindingExample,
  type MetroWayfindingExampleStation,
} from '../lib/metro-wayfinding-examples';
import { formatServiceTimeRange, parseServiceTimeRange } from '../lib/material-service-time';
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
import { MetroWayfindingEditor } from './metro-wayfinding-editor';
import { MetroWayfindingInspector } from './metro-wayfinding-inspector';
import { TransitNetworkSourceControl } from './transit-network-source-control';

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

const MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY = '(max-width: 959px)';

/**
 * 导视牌编辑器的固定标识。
 * 编辑器与宿主容器（宽屏下预览面板下方的 Inspector）需要用同一个 editorId 通过事件总线通信，
 * 因此不能依赖编辑器内部的 useId()，改为在此显式约定。
 */
const METRO_WAYFINDING_EDITOR_ID = 'transit-materials-metro-wayfinding';

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  compactCanvasControls = false,
  allowTransitNetworkImport = false,
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
  /** 仅保留「长度 + 对齐单位」，隐藏宽高输入（公交导视工作台使用）。 */
  compactCanvasControls?: boolean;
  allowTransitNetworkImport?: boolean;
}>) {
  const [items, setItems] = useState<PublishedMaterialTemplate[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLineOption[]>([]);
  const [transitStations, setTransitStations] = useState<TransitStationOption[]>([]);
  const [locations, setLocations] = useState<MaterialLocationOption[]>([]);
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
  const [transitTerminalRole, setTransitTerminalRole] = useState<'origin' | 'terminal'>('origin');
  const [selectedTransitLineIds, setSelectedTransitLineIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [roadCoordinate, setRoadCoordinate] = useState<[number, number] | null>(null);
  const [freshTileTemplate, setFreshTileTemplate] = useState<string | null>(null);
  const [tileTemplate, setTileTemplate] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [isPreviewDialogViewport, setIsPreviewDialogViewport] = useState(false);
  const [isSingleColumnViewport, setIsSingleColumnViewport] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [workspaceBlockMessage, setWorkspaceBlockMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
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
  const transitNetworkSourceIntentRevisionRef = useRef(0);
  const [isSyncingLocalDraft, setIsSyncingLocalDraft] = useState(false);
  const [metroExampleStationName, setMetroExampleStationName] = useState('');
  const [metroExampleLineId, setMetroExampleLineId] = useState('');
  const [metroLineMapProjectLineKey, setMetroLineMapProjectLineKey] = useState('');
  const [metroLineMapProjectNodeId, setMetroLineMapProjectNodeId] = useState('');

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
  const activeCanvas = canvas ?? selected?.template.defaultCanvas ?? null;
  const isMetroWayfinding = selected?.id === METRO_WAYFINDING_TEMPLATE_ID;
  const isMetroLineMap = selected?.template.family === 'metro_line';
  // 站台站名标志是固定 512×512 的方形版面，不提供宽高或长度调节。
  const isMetroPlatformSign = selected?.id === METRO_PLATFORM_SIGN_TEMPLATE_ID;
  const canvasSizeMode: 'full' | 'length' | 'none' = isMetroPlatformSign
    ? 'none'
    : isMetroWayfinding || isMetroLineMap
      ? 'length'
      : compactCanvasControls
        ? 'none'
        : 'full';
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
  const serverTransitLineOptions = useMemo(
    () => (isMetroLineMap ? transitLines.filter((line) => line.mode === 'metro') : transitLines),
    [isMetroLineMap, transitLines],
  );
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
  const availableEntryVariants = selectedEntryVariants?.filter(
    (item) =>
      stationSupportsTerminalVariant ||
      !item.template.fields.some((field) => field.key === 'terminalRole'),
  );
  const travelDirectionStationNames = useMemo(() => {
    if (mode === 'server' && isMetroLineMap) {
      if (transitNetworkSource === 'rmp') {
        return metroLineMapProjectStations.map((station) => station.name);
      }
      return selectedLine?.stations.map((station) => station.stationName) ?? [];
    }
    return (input.routeStations ?? '')
      .split(/\r?\n|\s*\/\s*/u)
      .map((station) => station.trim())
      .filter(Boolean);
  }, [
    input.routeStations,
    isMetroLineMap,
    metroLineMapProjectStations,
    mode,
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
  const selectableImportedTransitLines = useMemo<ImportedTransitLineOption[]>(() => {
    if (!importedTransitNetwork || !selectedImportedTransitStation) return [];
    return (selectedImportedTransitStation.projectLines ?? []).flatMap((line) =>
      listMaterialTransitNetworkNodeLineDirections(
        importedTransitNetwork,
        selectedImportedTransitStation.markerId,
        line.lineKey,
      ).map((direction) => ({
        id: `${line.lineKey}\u0000${direction}`,
        lineKey: line.lineKey,
        direction,
        name: line.label,
        secondaryName: line.secondaryLabel,
        color: line.color,
      })),
    );
  }, [importedTransitNetwork, selectedImportedTransitStation]);
  const selectableServerTransitLines = useMemo(
    () =>
      (selectedTransitStation?.lines ?? []).filter(
        (line) =>
          line.direction === transitDirection &&
          (!requiresTransitTerminalRole ||
            (transitTerminalRole === 'origin' ? line.isOriginAtStation : line.isTerminalAtStation)),
      ),
    [requiresTransitTerminalRole, selectedTransitStation, transitDirection, transitTerminalRole],
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
  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLocaleLowerCase();
    return locations
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
  }, [locationQuery, locations]);
  const maximumTransitLineCount = useMemo(() => {
    const slots = selected?.template.fields
      .map((field) => field.key.match(/^route(\d+)Number$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    return slots?.length ? Math.max(...slots) : 1;
  }, [selected?.id, selected?.template.fields]);
  const usesSingleTransitLineSelection = maximumTransitLineCount === 1;

  const loadWorkspace = async () => {
    try {
      const templateResponse = await fetch(appPath('/api/materials/templates'), {
        cache: 'no-store',
      });
      const templateData = (await templateResponse.json()) as {
        items?: PublishedMaterialTemplate[];
        message?: string;
      };
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
      // 有合并入口时，默认选第一个入口里的第一套版式，而不是按 ID 排序的第一条。
      const preferredTemplateId =
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
            const data = (await response.json()) as { items?: MaterialDraft[] };
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
              const data = (await response.json()) as { items?: TransitLineOption[] };
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
              const data = (await response.json()) as { items?: TransitStationOption[] };
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
              const data = (await response.json()) as { items?: MaterialLocationOption[] };
              if (response.ok) {
                const nextLocations = data.items ?? [];
                setLocations(nextLocations);
                setSelectedLocationId((current) => current || nextLocations[0]?.id || '');
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
              const data = (await response.json()) as { items?: TileProviderDescriptor[] };
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
    }
  };

  useEffect(() => {
    void loadWorkspace();
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
    setInput(
      savedDraft?.input ??
        Object.fromEntries(
          selected.template.fields.map((field) => [field.key, field.defaultValue ?? '']),
        ),
    );
    setCanvas((current) => {
      if (savedDraft?.canvas) {
        return savedDraft.canvas;
      }
      const base = {
        ...selected.template.defaultCanvas,
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
    mode,
    selected,
    studioId,
    transitNetworkSource,
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

  useEffect(() => {
    if (activeServerSource === 'road_coordinate' && !roadCoordinate) {
      const initialCoordinate = locations.find((location) => location.coordinate)?.coordinate;
      if (initialCoordinate) {
        setRoadCoordinate(initialCoordinate);
      }
    }
  }, [activeServerSource, locations, roadCoordinate]);

  useEffect(() => {
    if (transitNetworkSource !== 'rmp') return;
    setSelectedImportedStationNodeId((current) =>
      importedTransitStations.some((station) => station.markerId === current)
        ? current
        : (importedTransitStations[0]?.markerId ?? ''),
    );
  }, [importedTransitStations, transitNetworkSource]);

  useEffect(() => {
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
    const singleColumnQuery = window.matchMedia('(max-width: 720px)');
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
        (templateId) =>
          templateId && availableEntryVariants.find((item) => item.id === templateId),
      )
      .find((item): item is PublishedMaterialTemplate => Boolean(item));
    if (next) {
      selectTemplate(next.id);
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

  const loadMetroWayfindingExample = (example: MetroWayfindingExample) => {
    if (!isMetroWayfinding) return;
    setMode('manual');
    setInput((current) => ({
      ...current,
      layout: serializeMetroWayfindingLayout(example.project.layout),
    }));
    setCanvas({ ...example.project.canvas });
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

  const syncLocalDraft = async () => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || t('materialStudio.noSyncTemplate'));
      return;
    }
    if (!requireOnline()) {
      return;
    }
    if (mode !== 'manual') {
      blockAction(t('materialStudio.serverSubmitOnlineOnly'));
      return;
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
        return;
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
        return;
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
    } finally {
      setIsSyncingLocalDraft(false);
    }
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
  }, [isOnline, livePreviewRequestKey]);

  const downloadWatermarkedPreview = async () => {
    const response = await fetchWatermarkedPreview();
    if (!response) {
      return;
    }
    await downloadBlob(
      response,
      `${selected?.template.title ?? title}${t('materialStudio.watermarkedPreviewSuffix')}.png`,
    );
  };

  const requestPreview = async () => {
    const startedAt = Date.now();
    let succeeded = false;
    if (isPreviewDialogViewport) {
      // 窄屏预览在弹窗里：先打开弹窗承载加载动画，拿到结果后再替换为图片。
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
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'custom', draftId: draft.id }),
      });
      if (response.status === 401 || response.status === 403) {
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

  const exportManualDraft = async () => {
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

  useEffect(() => {
    publishMaterialStudioState({
      studioId,
      mode,
      transitNetworkSource,
      hasPreview: Boolean(previewUrl),
      isBusy,
      canExportProject: isMetroWayfinding && mode === 'manual',
    });
  }, [isBusy, isMetroWayfinding, mode, previewUrl, studioId, transitNetworkSource]);

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
      if (action === 'preview') {
        void requestPreview();
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

  return (
    <section
      className={isBusy ? 'material-studio is-busy' : 'material-studio'}
      aria-label={panelTitle}
      aria-busy={isBusy}
    >
      <div className="section-heading material-studio-heading">
        <div>
          <span className="eyebrow">{t('materialStudio.workspaceEyebrow')}</span>
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
          <button
            type="button"
            className="icon-button"
            onClick={() => void syncLocalDraft()}
            disabled={
              !localDraft || !isOnline || isBusy || isSyncingLocalDraft || mode !== 'manual'
            }
            title={t('materialStudio.syncLocalDraft')}
            aria-label={t('materialStudio.syncLocalDraft')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              cloud_upload
            </span>
          </button>
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
                  selectTemplate(nextTemplateId);
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
                metroWayfindingLayoutMode={metroWayfindingLayoutMode}
              />
            </ResponsiveSidebarDisclosure>
          ) : null}
        </aside>

        <div className="material-studio-editor">
          {availableLayoutGroups && availableLayoutGroups.length > 1 ? (
            <div className="material-field">
              <span>{layoutSwitchLabel}</span>
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
            </div>
          ) : null}
          {layoutStyleVariants && layoutStyleVariants.length > 1 ? (
            <div className="material-field">
              <span>{selectedEntryVariantLabel}</span>
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
                    onClick={() => selectTemplate(item.id)}
                    disabled={isBusy}
                  >
                    {item.template.title.match(/（([^）]+)）\s*$/u)?.[1] ?? item.template.title}
                  </button>
                ))}
              </div>
            </div>
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
              {overridableFields.map((field) =>
                field.key === SERVICE_TIME_FIELD_KEY && offerProjectServiceTimeInput ? (
                  // 项目线网不带运营时间，这里换成「首班 / 末班」两个输入补数据，
                  // 免得用户只能对着一个空文本框猜格式。
                  <MaterialServiceTimeFields
                    key={field.key}
                    label={field.label}
                    value={input[field.key] ?? ''}
                    disabled={isBusy}
                    onChange={(value) => {
                      setInput((current) => ({ ...current, [field.key]: value }));
                      clearPreview();
                    }}
                  />
                ) : (
                  <MaterialFieldEditor
                    key={field.key}
                    field={field}
                    value={input[field.key] ?? field.defaultValue ?? ''}
                    disabled={isBusy}
                    suggestions={field.key === 'roadName' ? serverLocationSuggestions : undefined}
                    optionsOverride={
                      field.key === 'travelDirection' ? travelDirectionOptions : undefined
                    }
                    onChange={(value) => {
                      setInput((current) => ({ ...current, [field.key]: value }));
                      clearPreview();
                    }}
                  />
                ),
              )}
            </div>
          ) : null}
          {!selected ? (
            <p className="material-studio-empty">{t('materialStudio.noTemplates')}</p>
          ) : mode === 'server' && activeServerSource === 'transit_station' ? (
            <>
              <label className="material-field">
                <span>
                  {transitNetworkSource === 'rmp'
                    ? t('materialStudio.projectStation')
                    : t('materialStudio.selectServerStation')}
                </span>
                <select
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
                        {station.stationName} ·{' '}
                        {transitNetworkSource === 'rmp'
                          ? t('materialStudio.projectLineCount', {
                              count: station.projectLines?.length ?? 0,
                            })
                          : t('materialStudio.busLineCount', { count: station.lines.length })}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {transitNetworkSource === 'rmp' && activeTransitStation?.projectLines?.length ? (
                <div
                  className="transit-network-station-lines"
                  aria-label={t('materialStudio.stationProjectLines')}
                >
                  <span>{t('materialStudio.projectLines')}</span>
                  <div>
                    {activeTransitStation.projectLines.map((line) => (
                      <span key={line.id} title={`${line.lineKey} · ${line.color}`}>
                        <i style={{ backgroundColor: line.color }} aria-hidden="true" />
                        {line.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="material-field">
                <span>
                  {transitNetworkSource === 'rmp'
                    ? t('materialStudio.mapDrivingDirection')
                    : t('materialStudio.roadDrivingDirection')}
                </span>
                <select
                  value={transitDirection}
                  onChange={(event) => {
                    setTransitDirection(
                      event.currentTarget.value as 'east' | 'west' | 'north' | 'south',
                    );
                    setSelectedTransitLineIds([]);
                    clearPreview();
                  }}
                  disabled={
                    isBusy || !activeTransitStation || !activeTransitStation.directionOptions.length
                  }
                >
                  {activeTransitStation?.directionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {requiresTransitTerminalRole ? (
                <label className="material-field">
                  <span>{t('materialStudio.stationProperties')}</span>
                  <select
                    value={transitTerminalRole}
                    onChange={(event) => {
                      setTransitTerminalRole(event.currentTarget.value as 'origin' | 'terminal');
                      setSelectedTransitLineIds([]);
                      clearPreview();
                    }}
                    disabled={isBusy || !activeTransitStation}
                  >
                    <option value="origin">{t('materialStudio.originStation')}</option>
                    <option value="terminal">{t('materialStudio.terminalStation')}</option>
                  </select>
                </label>
              ) : null}
              <fieldset
                className="material-canvas-editor"
                disabled={isBusy || !activeTransitStation}
              >
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
                      return (
                        <label
                          className={
                            usesSingleTransitLineSelection
                              ? 'material-radio-row'
                              : 'material-checkbox-row'
                          }
                          key={line.id}
                        >
                          <input
                            type={usesSingleTransitLineSelection ? 'radio' : 'checkbox'}
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
                          />
                          <i
                            className="transit-network-line-swatch"
                            style={{ backgroundColor: line.color }}
                            aria-hidden="true"
                          />
                          <span>
                            {line.name}
                            {line.secondaryName ? ` / ${line.secondaryName}` : ''}
                          </span>
                        </label>
                      );
                    })
                ) : transitNetworkSource === 'server' && selectableServerTransitLines.length ? (
                  selectableServerTransitLines.map((line) => {
                    const checked = selectedTransitLineIds.includes(line.id);
                    return (
                      <label
                        className={
                          usesSingleTransitLineSelection
                            ? 'material-radio-row'
                            : 'material-checkbox-row'
                        }
                        key={line.id}
                      >
                        <input
                          type={usesSingleTransitLineSelection ? 'radio' : 'checkbox'}
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
                        />
                        <span>
                          {line.name} · {t('materialStudio.directionTo')}{' '}
                          {line.destinationName || t('materialStudio.destinationPending')} ·{' '}
                          {line.firstLastBus}
                          {line.operator ? ` · ${line.operator}` : ''}
                          {line.isOriginAtStation
                            ? ` · ${t('materialStudio.originAtStation')}`
                            : ''}
                          {line.isTerminalAtStation
                            ? ` · ${t('materialStudio.terminalAtStation')}`
                            : ''}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div className="transit-network-match-empty">
                    <p className="muted">
                      {transitNetworkSource === 'rmp'
                        ? t('materialStudio.noProjectConnection')
                        : t('materialStudio.noDirectionLine')}
                    </p>
                    {transitNetworkSource === 'rmp' &&
                    activeTransitStation?.projectLines?.length ? (
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
          ) : mode === 'server' && activeServerSource === 'transit_line' ? (
            transitNetworkSource === 'rmp' ? (
              <div className="material-field-grid">
                <label className="material-field">
                  <span>{t('materialStudio.projectLines')}</span>
                  <select
                    value={metroLineMapProjectLineKey}
                    onChange={(event) => setMetroLineMapProjectLineKey(event.currentTarget.value)}
                    disabled={isBusy || !metroLineMapProjectLines.length}
                  >
                    {metroLineMapProjectLines.map((line) => (
                      <option key={line.lineKey} value={line.lineKey}>
                        {line.label}
                        {line.secondaryLabel ? ` / ${line.secondaryLabel}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="material-field">
                  <span>{t('materialStudio.projectCurrentStation')}</span>
                  <select
                    value={metroLineMapProjectNodeId}
                    onChange={(event) => setMetroLineMapProjectNodeId(event.currentTarget.value)}
                    disabled={isBusy || !metroLineMapProjectStations.length}
                  >
                    {metroLineMapProjectStations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <>
                <label className="material-field">
                  <span>{t('materialStudio.serverLines')}</span>
                  <select
                    value={selectedLineId}
                    onChange={(event) => {
                      const lineId = event.currentTarget.value;
                      const line = transitLines.find((item) => item.id === lineId);
                      setSelectedLineId(lineId);
                      setSelectedStationSourceId(line?.stations[0]?.stationSourceId ?? '');
                      clearPreview();
                    }}
                    disabled={isBusy || !serverTransitLineOptions.length}
                  >
                    {serverTransitLineOptions.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.name} ·{' '}
                        {t('materialStudio.stationsCount', { count: line.stationCount })}
                        {line.operationStatus === 'planned'
                          ? ` · ${t('materialStudio.notOpened')}`
                          : ''}
                        {line.operator ? ` · ${line.operator}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="material-field">
                  <span>{t('materialStudio.serverStations')}</span>
                  <select
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
                  </select>
                </label>
              </>
            )
          ) : mode === 'server' && activeServerSource === 'map_location' ? (
            <>
              <label className="material-field">
                <span>{t('materialStudio.searchServerPlace')}</span>
                <input
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.currentTarget.value)}
                  disabled={isBusy}
                />
              </label>
              <label className="material-field">
                <span>{t('materialStudio.serverPlaces')}</span>
                <select
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
                </select>
              </label>
            </>
          ) : mode === 'server' && activeServerSource === 'road_coordinate' ? (
            <>
              <div className="material-field-grid">
                <label className="material-field">
                  <span>{t('materialStudio.coordinateX')}</span>
                  <input
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
                </label>
                <label className="material-field">
                  <span>{t('materialStudio.coordinateZ')}</span>
                  <input
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
                </label>
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
            </>
          ) : (
            <>
              {isMetroWayfinding ? (
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
                  rendersInspector={!isMetroInspectorDetached}
                />
              ) : (
                <div className="material-field-grid">
                  {selected.template.fields
                    .filter((field) => field.userEditable !== false)
                    .map((field) => (
                      <MaterialFieldEditor
                        key={field.key}
                        field={field}
                        value={input[field.key] ?? ''}
                        disabled={isBusy}
                        suggestions={
                          field.key === 'roadName' ? serverLocationSuggestions : undefined
                        }
                        optionsOverride={
                          field.key === 'travelDirection' ? travelDirectionOptions : undefined
                        }
                        onChange={(value) => {
                          setInput((current) => ({ ...current, [field.key]: value }));
                          clearPreview();
                        }}
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

      {isPreviewDialogViewport && isPreviewDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsPreviewDialogOpen(false);
            }
          }}
        >
          <section
            className="modal-panel material-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-preview-dialog-heading"
            style={{ width: 'min(760px, 100%)' }}
          >
            <div className="material-preview-heading">
              <div style={{ display: 'grid', gap: 2 }}>
                <h2 id="material-preview-dialog-heading">{t('materialStudio.preview')}</h2>
                <MaterialPreviewDescription
                  previewSize={previewSize}
                  isRendering={isPreviewRendering}
                />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('materialStudio.closePreview')}
                title={t('materialStudio.closePreview')}
                autoFocus
                onClick={() => setIsPreviewDialogOpen(false)}
                style={{ flex: '0 0 40px', width: 40 }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <MaterialPreviewStage
              previewUrl={previewUrl}
              isRendering={isPreviewRendering}
              alt={t('materialStudio.previewAlt', {
                title: selected?.template.title ?? title,
              })}
            />
          </section>
        </div>
      ) : null}

      {isHistoryDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsHistoryDialogOpen(false);
          }}
        >
          <section
            className="modal-panel material-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-history-heading"
          >
            <div className="material-history-heading">
              <div>
                <h2 id="material-history-heading">{t('materialStudio.historyTitle')}</h2>
                <p className="muted">{t('materialStudio.historyHint')}</p>
              </div>
              <div className="material-history-heading-actions">
                <span>{t('services.itemCount', { count: historyDrafts.length })}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('materialStudio.closeHistory')}
                  title={t('materialStudio.closeHistory')}
                  autoFocus
                  onClick={() => setIsHistoryDialogOpen(false)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
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
          </section>
        </div>
      ) : null}
    </section>
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
  isRendering,
  alt,
}: Readonly<{ previewUrl: string | null; isRendering?: boolean; alt: string }>) {
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
  metroWayfindingLayoutMode,
  onChange,
}: Readonly<{
  canvas: MaterialCanvas | null;
  disabled: boolean;
  sizeMode: 'full' | 'length' | 'none';
  isMetroWayfinding: boolean;
  metroWayfindingLayoutMode?: 'single' | 'double' | 'vertical';
  onChange: <TKey extends keyof MaterialCanvas>(key: TKey, value: MaterialCanvas[TKey]) => void;
}>) {
  const metroLayoutMode = metroWayfindingLayoutMode ?? 'single';
  const isMetroVertical = isMetroWayfinding && metroLayoutMode === 'vertical';
  const { t } = useI18n();

  useEffect(() => {
    if (!canvas || sizeMode !== 'length') {
      return;
    }
    const fixedHeight = isMetroWayfinding && metroLayoutMode === 'double' ? 2 : 1;
    const currentLength = isMetroVertical ? canvas.heightM : canvas.widthM;
    const normalizedLength = Math.min(64, Math.max(1, Math.round(currentLength)));
    if (currentLength !== normalizedLength) {
      onChange(isMetroVertical ? 'heightM' : 'widthM', normalizedLength);
    }
    const normalizedWidth = Math.min(64, Math.max(1, Math.round(canvas.widthM)));
    if (isMetroVertical && canvas.widthM !== normalizedWidth) {
      onChange('widthM', normalizedWidth);
    }
    if (!isMetroVertical && canvas.heightM !== fixedHeight) {
      onChange('heightM', fixedHeight);
    }
  }, [canvas, isMetroVertical, isMetroWayfinding, metroLayoutMode, onChange, sizeMode]);

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
  const metroLength = isMetroVertical ? canvas.heightM : canvas.widthM;
  const updateMetroLength = (value: number) => {
    const length = Math.min(64, Math.max(1, Math.round(value)));
    onChange(isMetroVertical ? 'heightM' : 'widthM', length);
  };

  return (
    <fieldset className="material-canvas-editor" disabled={disabled}>
      <legend>{t('materialStudio.dimensions')}</legend>
      {sizeMode === 'length' ? (
        <>
          <label>
            <span>
              {isMetroVertical ? t('materialStudio.signHeight') : t('materialStudio.signLength')}
            </span>
            <input
              type="number"
              min="1"
              max="64"
              step="1"
              value={metroLength}
              onChange={(event) => updateMetroLength(Number(event.currentTarget.value))}
            />
          </label>
          {isMetroVertical ? (
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
        </>
      ) : sizeMode === 'full' ? (
        <>
          <label>
            <span>{t('materialStudio.widthMeters')}</span>
            <input
              type="number"
              min="0.01"
              max="64"
              step="0.01"
              value={canvas.widthM}
              onChange={(event) => onChange('widthM', Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>{t('materialStudio.heightMeters')}</span>
            <input
              type="number"
              min="0.01"
              max="64"
              step="0.01"
              value={canvas.heightM}
              onChange={(event) => onChange('heightM', Number(event.currentTarget.value))}
            />
          </label>
        </>
      ) : null}
      <label>
        <span>{t('materialStudio.alignmentUnit')}</span>
        <input
          type="number"
          min="16"
          max="4096"
          step="1"
          value={canvas.tileSizePx}
          disabled={isMetroWayfinding}
          onChange={(event) => onChange('tileSizePx', Number(event.currentTarget.value))}
        />
      </label>
      <label className="material-checkbox-row">
        <input
          type="checkbox"
          checked={canvas.alignToTile}
          disabled={isMetroWayfinding}
          onChange={(event) => onChange('alignToTile', event.currentTarget.checked)}
        />
        <span>{t('materialStudio.alignToMapSize')}</span>
      </label>
      <output>
        {outputWidth} × {outputHeight} px
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
      <label className="material-field">
        <span>{t('materialStudio.firstBus')}</span>
        <input
          type="time"
          value={first}
          disabled={disabled}
          onChange={(event) =>
            onChange(formatServiceTimeRange(event.currentTarget.value, last || undefined))
          }
        />
      </label>
      <label className="material-field">
        <span>{t('materialStudio.lastBus')}</span>
        <input
          type="time"
          value={last}
          disabled={disabled}
          onChange={(event) =>
            onChange(formatServiceTimeRange(first || undefined, event.currentTarget.value))
          }
        />
      </label>
      <small>{t('materialStudio.projectNoTimeHint')}</small>
    </div>
  );
}

function MaterialFieldEditor({
  field,
  value,
  disabled,
  suggestions,
  optionsOverride,
  onChange,
}: Readonly<{
  field: MaterialField;
  value: string;
  disabled: boolean;
  suggestions?: string[];
  optionsOverride?: MaterialField['options'];
  onChange: (value: string) => void;
}>) {
  const suggestionsId = useId();
  const { t } = useI18n();
  const continuationSuggestion =
    field.kind === 'text' ? findTextContinuation(value, suggestions) : undefined;
  // 兼容早期草稿里的 left/right 取值：两套旧值都表示「开往末站」。
  const selectValue =
    field.key === 'travelDirection' && (value === 'left' || value === 'right') ? 'last' : value;
  return (
    <label className="material-field">
      <span>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.kind === 'select' ? (
        <select
          value={selectValue}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
        >
          <option value="">{t('materialStudio.pleaseSelect')}</option>
          {(optionsOverride ?? field.options)?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
    </label>
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
