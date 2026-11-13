'use client';

import type {
  TicketableServiceKind,
  TransitDataRevision,
  TransitDepartureScheduleRule,
  TransitLineSnapshot,
  TransitTripLabelPool,
  TravelScheduleRevision,
  TravelTripInstance,
  TravelTripStopTime,
} from '@yct/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { requestConfirmation } from '../lib/client-dialog-events';
import { resolveDirectionalDepartureTimes } from '../lib/transit-departure-editor';
import { collectStopTravelTimes } from '../lib/transit-segment-minutes';
import {
  getTransitTripLabelServiceDateKey,
  resolveTransitTripLabels,
  type TransitTripLabelTripSource,
} from '../lib/transit-trip-labels';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import { useEditorInspectorFocus } from '../lib/editor/use-editor-inspector-focus';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { useSnapshotHistory } from '../lib/editor/use-snapshot-history';
import type { EditorTool } from '../lib/editor/types';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import { EditorLayerRowActions } from './editor/editor-layer-row-actions';
import { EditorLoadingState } from './editor/editor-loading-state';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorToolbar } from './editor/editor-toolbar';
import { buildEditorToolbarSections } from './editor/editor-toolbar-sections';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import { EditorZoomControls } from './editor/editor-zoom-controls';
import { useMobileActionRail } from './mobile-action-rail';
import { SegmentedControl } from './segmented-control';
import { VisualEditorShell } from './visual-editor-shell';
import {
  buildStationRows,
  clampStopEdgeMinutes,
  defaultDwellMinutes,
  formatWorkbenchMinutes,
  getDirectionStationSourceIds,
  getStopDwellMinutes,
  getTripMinuteRange,
  isStopSequenceMonotonic,
  resolveSegmentBaseMinutes,
  resolveTripDirection,
  resolveWorkbenchStops,
  setStopEdgeAt,
  shiftLinkedStops,
  toClockTime,
  toDayOffset,
  toggleStopAt,
  truncateTripStops,
  type WorkbenchDirection,
  type WorkbenchEdge,
  type WorkbenchLinkMode,
  type WorkbenchTool,
  type WorkbenchTripStop,
} from '../lib/transit-trip-workbench';
import {
  resolveTransitTripRunChartLayout,
  TransitTripRunChart,
  type ChartTrip,
} from './transit-trip-run-chart';

const tripColors = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be123c',
  '#4d7c0f',
  '#c2410c',
  '#0f766e',
  '#9333ea',
  '#a16207',
];
const unlabeledTripColor = '#94a3b8';

export interface WorkbenchEntry {
  clientId: string;
  revisionId: string;
  trip: TravelTripInstance;
  stops: WorkbenchTripStop[];
  label: string;
  /** 标签来源：自动抽取的标签再次预填时不能被当成手动标签排除。 */
  labelSource?: 'auto' | 'manual';
  isNew: boolean;
  /** 由线路发车规则展开的展示项；未编辑停站前不落库为班次实例。 */
  fromRule?: boolean;
  /** 规则展开项被改动停站/时刻后需要落库。 */
  materialize?: boolean;
  /** 已有班次是否被本次编辑修改过；未修改的保存时跳过。 */
  changed?: boolean;
  /** 归属的批量规则；手工改过发车时刻后会解除归属。 */
  ruleId?: string;
  /** 曾由规则生成，但已手工改时刻脱离规则。 */
  ruleDetached?: boolean;
}

/** 工作台内可管理的批量发车规则；规则文本随线路一起保存。 */
interface WorkbenchRule {
  id: string;
  sourceText: string;
  startTime: string;
  intervalMinutes?: number;
  additionalDepartures?: number;
  /** 规则展开后的发车时刻，用于和班次建立归属关系。 */
  departureTimes: string[];
}

interface WorkbenchSnapshot {
  entries: WorkbenchEntry[];
  rules: Record<WorkbenchDirection, WorkbenchRule[]>;
}

interface PoolConfig {
  poolIds: string[];
  mode: 'sequential' | 'random';
}

const emptyPoolConfig: PoolConfig = { poolIds: [], mode: 'random' };

export function AdminTransitTripWorkbench({
  lineSourceId,
  revisionId,
}: Readonly<{ lineSourceId: string; revisionId: string }>) {
  const normalizedRevisionId = decodeSegment(revisionId);
  const normalizedLineSourceId = decodeSegment(lineSourceId);
  // 关闭工作台后回到后台，并自动重新打开该线路的编辑弹窗。
  const backToAdminPath = `/admin/transit?section=lines&openLineId=${encodeURIComponent(
    normalizedLineSourceId,
  )}`;
  const backToAdminHref = appPath(backToAdminPath);

  const [revision, setRevision] = useState<TransitDataRevision | null>(null);
  const [line, setLine] = useState<TransitLineSnapshot | null>(null);
  const [pools, setPools] = useState<TransitTripLabelPool[]>([]);
  const [entries, setEntries] = useState<WorkbenchEntry[]>([]);
  const [direction, setDirection] = useState<WorkbenchDirection>('down');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 选中的停站在所属班次 stops 中的下标；为空表示只选中了班次。 */
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(() => new Set());
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [tool, setTool] = useState<WorkbenchTool>('pan');
  const [linkMode, setLinkMode] = useState<WorkbenchLinkMode>('none');
  const [viewport, setViewport] = useState({ start: 300, duration: 720 });
  const [poolConfigs, setPoolConfigs] = useState<Record<WorkbenchDirection, PoolConfig>>({
    down: emptyPoolConfig,
    up: emptyPoolConfig,
  });
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [ruleText, setRuleText] = useState('');
  const [rules, setRules] = useState<Record<WorkbenchDirection, WorkbenchRule[]>>({
    down: [],
    up: [],
  });
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [ruleDeleteTarget, setRuleDeleteTarget] = useState<WorkbenchRule | null>(null);
  const [status, setStatus] = useState('正在读取班次与线路数据');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [chartHeight, setChartHeight] = useState(640);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [scheduleRevisionId, setScheduleRevisionId] = useState('');
  const {
    panelsVisible,
    inspectorPinned,
    panelStateClass,
    setPanelsVisible,
    togglePanels,
    openInspector,
    closeInspector,
  } = useEditorPanels();
  const [stationScale, setStationScale] = useState(1);
  const [stationOffset, setStationOffset] = useState(0);
  // 移动端顶部浮动工具栏与底部抽屉占用的高度，用来收紧运行图的可见绘图区。
  const [mobileTopInset, setMobileTopInset] = useState(128);
  const [mobileDrawerInset, setMobileDrawerInset] = useState(0);
  const [labelsNeedRefresh, setLabelsNeedRefresh] = useState(false);
  const hasPrefilledLabelsRef = useRef(false);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const tripRowRefs = useRef(new Map<string, HTMLDivElement>());
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layerPanelRef = useRef<HTMLElement | null>(null);
  const entriesRef = useRef<WorkbenchEntry[]>([]);
  const rulesRef = useRef<Record<WorkbenchDirection, WorkbenchRule[]>>({ down: [], up: [] });
  const duplicateTripsRef = useRef<WorkbenchEntry[]>([]);
  // 加载时的班次快照：保存时用它反推“哪些真实班次被删掉”，撤销后自动回到未删除状态。
  const loadedRealTripKeysRef = useRef<Set<string>>(new Set());
  const loadedDirectionCountsRef = useRef<Record<WorkbenchDirection, number>>({ down: 0, up: 0 });
  // 快照历史：撤销/重做以整份班次草稿为单位，统一走共享栈。
  const snapshotHistory = useSnapshotHistory<WorkbenchSnapshot>();
  // 侧边操作栏开启时浮动工具栏会隐藏，移动端顶部只需避开标题栏。
  const mobileActionRail = useMobileActionRail();

  const stationById = useMemo(
    () => new Map((revision?.stations ?? []).map((station) => [station.sourceId, station])),
    [revision],
  );
  const stationNameOf = useCallback(
    (stationSourceId: string) => stationById.get(stationSourceId)?.name ?? stationSourceId,
    [stationById],
  );

  const loadData = useCallback(async () => {
    setStatus('正在读取班次与线路数据');
    setError('');
    const [revisionResponse, scheduleResponse, poolResponse] = await Promise.all([
      fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' }),
      fetch(appPath('/api/admin/travel/schedule-revisions'), { cache: 'no-store' }),
      fetch(appPath('/api/admin/transit/trip-label-pools'), { cache: 'no-store' }),
    ]);
    const revisionData = (await revisionResponse.json().catch(() => ({}))) as {
      items?: TransitDataRevision[];
      message?: string;
    };
    const scheduleData = (await scheduleResponse.json().catch(() => ({}))) as {
      items?: TravelScheduleRevision[];
      message?: string;
    };
    const poolData = (await poolResponse.json().catch(() => ({}))) as {
      items?: TransitTripLabelPool[];
    };
    if (!revisionResponse.ok) {
      setError(revisionData.message ?? '交通数据版本读取失败。');
      return;
    }
    const nextRevision = revisionData.items?.find(
      (item) => item.revisionId === normalizedRevisionId,
    );
    const nextLine = nextRevision?.lines.find((item) => item.sourceId === normalizedLineSourceId);
    if (!nextRevision || !nextLine) {
      setError('找不到需要编辑的线路或交通数据版本。');
      return;
    }

    // 班次版本与交通数据版本是两套 ID，不能按 revisionId 过滤。
    // 选最新、未被取代且包含本线路班次的班次版本，避免多版本重复上图。
    const revisionCandidates = (scheduleData.items ?? []).filter((item) => !item.supersededAt);
    const sourceRevision =
      revisionCandidates.find((item) =>
        item.trips.some(
          (trip) => trip.lineName.trim() === nextLine.name.trim() && !trip.archivedAt,
        ),
      ) ?? revisionCandidates[0];
    const stationNameLookup = new Map(
      nextRevision.stations.map((station) => [station.sourceId, station.name]),
    );
    const nameOfStation = (stationSourceId: string) =>
      stationNameLookup.get(stationSourceId) ?? stationSourceId;

    const labelPools = poolData.items ?? [];
    const poolById = new Map(labelPools.map((pool) => [pool.id, pool]));

    const mappedEntries: WorkbenchEntry[] = (sourceRevision?.trips ?? [])
      .filter((trip) => trip.lineName.trim() === nextLine.name.trim() && !trip.archivedAt)
      .map((trip) => {
        const tripDirection = resolveTripDirection(trip, nextLine, nameOfStation);
        const label = nextLine.tripLabelsByDirection?.[tripDirection]?.[trip.departureTime] ?? '';
        const special = nextLine.specialTripsByDirection?.[tripDirection]?.[trip.departureTime];
        return {
          clientId: trip.tripInstanceId,
          revisionId: sourceRevision?.revisionId ?? '',
          trip: {
            ...trip,
            serviceNature: trip.serviceNature ?? special?.serviceNature,
            routeNote: trip.routeNote ?? special?.routeNote,
          },
          stops: resolveWorkbenchStops(trip),
          label,
          labelSource: resolveEntryLabelSource(
            label,
            nextLine.tripLabelConfigByDirection?.[tripDirection]?.poolIds,
            poolById,
          ),
          isNew: false,
        };
      });

    // 早前方向判定错误导致重复保存过同方向、同发车时刻的班次，这里去重显示，保存时清理。
    const existingEntries: WorkbenchEntry[] = [];
    const duplicateEntries: WorkbenchEntry[] = [];
    const seenEntryKeys = new Set<string>();
    for (const entry of mappedEntries) {
      const entryDirection = resolveTripDirection(entry.trip, nextLine, nameOfStation);
      const key = `${entryDirection}|${entry.trip.departureTime}|${entry.trip.stationNames.join('>')}`;
      if (seenEntryKeys.has(key)) {
        duplicateEntries.push(entry);
      } else {
        seenEntryKeys.add(key);
        existingEntries.push(entry);
      }
    }
    duplicateTripsRef.current = duplicateEntries;

    // 市内公交线路通常只有发车时刻规则、没有班次实例，
    // 这里把规则展开成待保存草稿，否则工作台会显示为空。
    const loadedRules = buildLoadedRules(nextLine);
    const draftEntries: WorkbenchEntry[] = [];
    if (
      sourceRevision &&
      (nextLine.departureTimesByDirection || nextLine.departureRulesByDirection)
    ) {
      const downStationNames = nextLine.stationSourceIds.map(nameOfStation);
      const downSegments = resolveSegmentBaseMinutes({
        line: nextLine,
        stationSourceIds: nextLine.stationSourceIds,
        trips: existingEntries,
      });
      for (const value of ['down', 'up'] as const) {
        // 时刻表是“已生效时刻”的唯一来源；只有旧数据完全没有分方向时刻字段时，
        // 才按持久化规则展开，避免把用户删空的时刻又补回来。
        const times = nextLine.departureTimesByDirection
          ? (nextLine.departureTimesByDirection[value] ?? [])
          : loadedRules[value].flatMap((rule) => rule.departureTimes);
        if (times.length === 0) {
          continue;
        }
        const stationNames = value === 'down' ? downStationNames : [...downStationNames].reverse();
        const segments = value === 'down' ? downSegments : [...downSegments].reverse();
        const existingTimes = new Set(
          existingEntries
            .filter((entry) => resolveTripDirection(entry.trip, nextLine, nameOfStation) === value)
            .map((entry) => toClockTime(firstDepartureOrUndefined(entry.stops)))
            .filter((time): time is string => Boolean(time)),
        );
        for (const time of times) {
          if (existingTimes.has(time)) {
            continue;
          }
          const departureMinutes = clockToMinutes(time);
          if (departureMinutes === undefined) {
            continue;
          }
          existingTimes.add(time);
          const draftLabel = nextLine.tripLabelsByDirection?.[value]?.[time] ?? '';
          const special = nextLine.specialTripsByDirection?.[value]?.[time];
          const baseStops = buildNewTripStops(stationNames, segments, departureMinutes);
          draftEntries.push({
            clientId: `draft_${value}_${time}`,
            revisionId: sourceRevision.revisionId,
            trip: {
              tripInstanceId: '',
              serviceKind: inferServiceKind(nextLine.mode),
              serviceLabel: '',
              departureTime: time,
              lineName: nextLine.name,
              stationNames,
              availability: 'ticketing_unavailable',
              serviceNature: special?.serviceNature,
              routeNote: special?.routeNote,
            },
            stops: special?.stationNames?.length
              ? restrictStopsToSpecial(baseStops, special.stationNames)
              : baseStops,
            label: draftLabel,
            labelSource: resolveEntryLabelSource(
              draftLabel,
              nextLine.tripLabelConfigByDirection?.[value]?.poolIds,
              poolById,
            ),
            isNew: true,
            fromRule: true,
          });
        }
      }
    }

    const loadedPoolConfigs: Record<WorkbenchDirection, PoolConfig> = {
      down: toPoolConfig(nextLine.tripLabelConfigByDirection?.down),
      up: toPoolConfig(nextLine.tripLabelConfigByDirection?.up),
    };
    // 把班次和持久化规则按“方向 + 发车时刻”重新挂上归属关系；
    // 同一时刻只归属第一条规则，避免重叠规则互相抢班次。
    const ruleIdByTime = new Map<string, string>();
    for (const value of ['down', 'up'] as const) {
      for (const rule of loadedRules[value]) {
        for (const time of rule.departureTimes) {
          const key = `${value}|${time}`;
          if (!ruleIdByTime.has(key)) {
            ruleIdByTime.set(key, rule.id);
          }
        }
      }
    }
    const loadedEntries = [...existingEntries, ...draftEntries].map((entry) => {
      const entryDirection = resolveTripDirection(entry.trip, nextLine, nameOfStation);
      const departure = toClockTime(firstDepartureOrUndefined(entry.stops));
      const ruleId = departure ? ruleIdByTime.get(`${entryDirection}|${departure}`) : undefined;
      return ruleId ? { ...entry, ruleId } : entry;
    });
    // 标签随线路一起保存，重新打开时与保存前一致；改时刻后仍需重新分配。
    // 不在读取时重算自动标签，避免把用户手动删掉的标签又自动填回来。

    setRevision(nextRevision);
    setLine(nextLine);
    setPools(labelPools);
    setScheduleRevisionId(sourceRevision?.revisionId ?? '');
    setEntries(loadedEntries);
    setRules(loadedRules);
    loadedRealTripKeysRef.current = new Set(
      existingEntries
        .filter((entry) => !entry.isNew && entry.trip.tripInstanceId)
        .map((entry) => `${entry.revisionId}\u0000${entry.trip.tripInstanceId}`),
    );
    loadedDirectionCountsRef.current = {
      down: loadedEntries.filter(
        (entry) => resolveTripDirection(entry.trip, nextLine, nameOfStation) === 'down',
      ).length,
      up: loadedEntries.filter(
        (entry) => resolveTripDirection(entry.trip, nextLine, nameOfStation) === 'up',
      ).length,
    };
    setPoolConfigs(loadedPoolConfigs);
    const draftCount = draftEntries.length;
    const duplicateCount = duplicateEntries.length;
    const totalCount = existingEntries.length + draftCount;
    hasPrefilledLabelsRef.current = totalCount > 0 && loadedEntries.some((entry) => entry.label);
    setLabelsNeedRefresh(false);
    // 规则展开项只是展示，不再是待保存草稿；只有重复班次需要显式清理。
    setDirty(duplicateCount > 0);
    setStatus(
      totalCount > 0
        ? `已读取 ${existingEntries.length} 个班次${
            draftCount > 0 ? `，并按发车规则展示 ${draftCount} 个班次` : ''
          }${duplicateCount > 0 ? `；检测到 ${duplicateCount} 条重复班次，保存时自动清理` : ''}`
        : '当前线路还没有班次',
    );
    snapshotHistory.reset();
    setDataVersion((current) => current + 1);
  }, [normalizedRevisionId, normalizedLineSourceId, snapshotHistory.reset]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const directionStationIds = useMemo(
    () => (line ? getDirectionStationSourceIds(line, direction) : []),
    [direction, line],
  );
  const directionStationNames = useMemo(
    () => directionStationIds.map(stationNameOf),
    [directionStationIds, stationNameOf],
  );

  const entriesByDirection = useMemo(() => {
    const grouped: Record<WorkbenchDirection, WorkbenchEntry[]> = { down: [], up: [] };
    if (!line) {
      return grouped;
    }
    for (const entry of entries) {
      const entryDirection = resolveTripDirection(
        { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
        line,
        stationNameOf,
      );
      grouped[entryDirection].push(entry);
    }
    for (const value of ['down', 'up'] as const) {
      grouped[value].sort(
        (left, right) => firstDeparture(left.stops) - firstDeparture(right.stops),
      );
    }
    return grouped;
  }, [entries, line, stationNameOf]);

  const directionEntries = entriesByDirection[direction];

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.clientId === selectedId) ?? null,
    [entries, selectedId],
  );
  const selectedStop =
    selectedEntry && selectedStopIndex !== null
      ? (selectedEntry.stops[selectedStopIndex] ?? null)
      : null;
  const selectedStopPrevious =
    selectedEntry && selectedStopIndex !== null && selectedStopIndex > 0
      ? (selectedEntry.stops[selectedStopIndex - 1] ?? null)
      : null;
  const selectedStopPreviousDeparture =
    selectedStopPrevious?.departureMinutes ?? selectedStopPrevious?.arrivalMinutes;
  const selectedStopDwell = selectedStop ? getStopDwellMinutes(selectedStop) : 0;
  const selectedStopSegment =
    selectedStop?.arrivalMinutes !== undefined && selectedStopPreviousDeparture !== undefined
      ? selectedStop.arrivalMinutes - selectedStopPreviousDeparture
      : undefined;

  const countDirectionDepartures = (value: WorkbenchDirection) => {
    if (!line) {
      return 0;
    }
    const times = new Set<string>();
    for (const entry of entries) {
      const entryDirection = resolveTripDirection(
        { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
        line,
        stationNameOf,
      );
      if (entryDirection !== value) {
        continue;
      }
      const time = toClockTime(firstDepartureOrUndefined(entry.stops));
      if (time) {
        times.add(time);
      }
    }
    return times.size;
  };

  // 运行图固定按线路正序排列站点，双向班次叠在同一张图上才能看出会车。
  const chartStationIds = useMemo(() => line?.stationSourceIds ?? [], [line]);
  const segmentMinutes = useMemo(
    () =>
      line
        ? resolveSegmentBaseMinutes({ line, stationSourceIds: chartStationIds, trips: entries })
        : [],
    [chartStationIds, entries, line],
  );
  const directionSegmentMinutes = useMemo(
    () => (direction === 'down' ? segmentMinutes : [...segmentMinutes].reverse()),
    [direction, segmentMinutes],
  );
  // 运行图可平移的时间范围：以全部班次的最早/最晚时刻作为内容边界。
  const chartMinuteBounds = useMemo(() => {
    let earliest = Number.POSITIVE_INFINITY;
    let latest = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
      const range = getTripMinuteRange(entry.stops);
      if (!range) {
        continue;
      }
      earliest = Math.min(earliest, range[0]);
      latest = Math.max(latest, range[1]);
    }
    return Number.isFinite(earliest) && Number.isFinite(latest) ? { earliest, latest } : null;
  }, [entries]);
  // 标题栏高度与 CSS 变量保持一致；运行图画布铺满窗口，坐标轴叠在可见边缘。
  // 移动端顶部让出画布上的浮动工具栏，底部让出图层/属性抽屉。
  const isMobileChart = viewportWidth <= 760;
  const chartTopInset = isMobileChart ? mobileTopInset : 64;
  const chartLayout = resolveTransitTripRunChartLayout({ topInset: chartTopInset });
  // 底部在抽屉展开时贴住抽屉上沿，否则保留缩放条的避让高度。
  const chartBottom = isMobileChart
    ? Math.max(mobileDrawerInset, chartLayout.bottom)
    : chartLayout.bottom;
  // 可见绘图区左右边界，同时供运行图与平移边界使用。
  const chartLeftGutter =
    panelsVisible && viewportWidth > 760 ? (viewportWidth >= 1280 ? 352 : 372) : 16;
  const chartRightInset = panelsVisible && viewportWidth >= 1280 ? 356 : 16;
  // 拖动与缩放的有效范围按可见区计算，避免把站点拖到标题栏或面板后面。
  const stationPlotHeight = Math.max(80, chartHeight - chartLayout.top - chartBottom);
  // 站点轴以可见区顶部为基准，首站可以直接贴到标题栏下方的可见边缘。
  const chartPlotTop = chartLayout.top;
  const chartPlotBottom = chartPlotTop + stationPlotHeight;
  // 时间轴平移边界：首时刻最多贴到左面板右侧，末时刻最多贴到可见区右边缘。
  const clampChartViewport = useCallback(
    (next: { start: number; duration: number }) => {
      const duration = Math.min(1440, Math.max(30, next.duration));
      if (!chartMinuteBounds) {
        return { duration, start: Math.min(Math.max(next.start, -120), 24 * 60) };
      }
      const plotWidth = Math.max(1, viewportWidth);
      const axisLeft = chartLeftGutter;
      const axisRight = Math.max(axisLeft + 1, plotWidth - chartRightInset);
      const minStart = chartMinuteBounds.earliest - (axisLeft / plotWidth) * duration;
      const maxStart = chartMinuteBounds.latest - (axisRight / plotWidth) * duration;
      // 内容窄于可见区时居中显示，避免 minStart/maxStart 反向导致抖动。
      const start =
        minStart > maxStart
          ? (minStart + maxStart) / 2
          : Math.min(Math.max(next.start, minStart), maxStart);
      return { duration, start };
    },
    [chartLeftGutter, chartMinuteBounds, chartRightInset, viewportWidth],
  );
  // 适配时把整段时间映射到可见区宽度，避免末班藏在右侧面板下方。
  const resolveChartFitDuration = useCallback(
    (earliest: number, latest: number) => {
      const plotWidth = Math.max(1, viewportWidth);
      const visibleWidth = Math.max(160, plotWidth - chartLeftGutter - chartRightInset);
      const visibleRatio = Math.min(1, visibleWidth / plotWidth);
      const span = Math.max(30, latest - earliest + 30);
      return Math.min(1440, Math.max(120, Math.ceil(span / visibleRatio / 30) * 30));
    },
    [chartLeftGutter, chartRightInset, viewportWidth],
  );
  const baseRows = useMemo(
    () =>
      buildStationRows({
        stationSourceIds: chartStationIds,
        stationNameOf,
        segmentMinutes,
        top: chartPlotTop,
        bottom: chartPlotBottom,
      }),
    [chartPlotBottom, chartPlotTop, chartStationIds, segmentMinutes, stationNameOf],
  );
  const rows = useMemo(
    () =>
      baseRows.map((row, index) => {
        // 首末色带延伸到窗口边缘，色带与网格继续铺满标题栏下方和缩放条区域。
        const bandTop =
          index === 0
            ? 0
            : chartPlotTop + (row.bandTop - chartPlotTop) * stationScale - stationOffset;
        const bandBottom =
          index === baseRows.length - 1
            ? chartHeight
            : chartPlotTop + (row.bandBottom - chartPlotTop) * stationScale - stationOffset;
        return {
          ...row,
          y: chartPlotTop + (row.y - chartPlotTop) * stationScale - stationOffset,
          bandTop,
          bandBottom,
        };
      }),
    [baseRows, chartHeight, chartPlotTop, stationOffset, stationScale],
  );

  useEffect(() => {
    const element = chartHostRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const applyHeight = (value: number) => {
      if (value > 0) {
        setChartHeight(Math.round(value));
      }
    };
    applyHeight(element.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        applyHeight(entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [line]);

  // 运行图左侧留白跟随面板列宽，避免时间轴被浮层遮住或留白过大。
  useEffect(() => {
    const applyWidth = () => setViewportWidth(window.innerWidth);
    applyWidth();
    window.addEventListener('resize', applyWidth);
    return () => window.removeEventListener('resize', applyWidth);
  }, []);

  // 移动端底部抽屉会遮住画布，实时量出它占用的高度，让坐标轴的可见范围跟着收紧。
  useEffect(() => {
    if (viewportWidth > 760) {
      setMobileTopInset(128);
      setMobileDrawerInset(0);
      return undefined;
    }
    const host = chartHostRef.current;
    const workspace = host?.parentElement ?? null;
    // 顶部优先量浮动工具栏的实际底边；侧栏开启时工具栏隐藏，退回标题栏底边。
    const toolbar = workspace?.querySelector<HTMLElement>(':scope > .editor-toolbar') ?? null;
    const topbar =
      workspace
        ?.closest('.visual-editor-page')
        ?.querySelector<HTMLElement>(':scope > .secondary-topbar') ?? null;
    let frame = 0;
    const measure = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const hostRect = chartHostRef.current?.getBoundingClientRect();
        const hostTop = hostRect?.top ?? 0;
        const hostBottom = hostRect?.bottom ?? window.innerHeight;
        const toolbarRect = toolbar?.getBoundingClientRect();
        const toolbarVisible = Boolean(
          toolbar && toolbar.offsetParent !== null && toolbarRect && toolbarRect.height > 0,
        );
        const topEdge =
          toolbarVisible && toolbarRect
            ? toolbarRect.bottom + 8
            : (topbar?.getBoundingClientRect().bottom ?? hostTop) + 12;
        setMobileTopInset(Math.max(0, Math.round(topEdge - hostTop)));

        let drawerInset = 0;
        for (const element of [layerPanelRef.current, inspectorRef.current]) {
          // offsetParent 为 null 表示抽屉当前被 CSS 隐藏。
          if (!element || element.offsetParent === null) {
            continue;
          }
          const rect = element.getBoundingClientRect();
          if (rect.height > 0) {
            // 再留 8px 呼吸位，坐标轴刚好停在抽屉上沿之上。
            drawerInset = Math.max(drawerInset, hostBottom - rect.top + 8);
          }
        }
        setMobileDrawerInset(Math.max(0, Math.round(drawerInset)));
      });
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    if (observer) {
      for (const element of [layerPanelRef.current, inspectorRef.current, toolbar, topbar]) {
        if (element) {
          observer.observe(element);
        }
      }
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [mobileActionRail?.enabled, inspectorPinned, panelsVisible, selectedId, viewportWidth]);

  useEffect(() => {
    const ranges = entries
      .map((entry) => getTripMinuteRange(entry.stops))
      .filter((range): range is [number, number] => range !== null);
    if (ranges.length === 0) {
      return;
    }
    const earliest = Math.min(...ranges.map((range) => range[0]));
    const latest = Math.max(...ranges.map((range) => range[1]));
    setViewport(
      clampChartViewport({
        start: earliest,
        duration: resolveChartFitDuration(earliest, latest),
      }),
    );
    // 站点多时自动放大站距，保证一打开就能精确操作。
    const stationCount = chartStationIds.length;
    setStationScale(
      Math.min(4, Math.max(1, (stationCount * 22) / Math.max(80, stationPlotHeight))),
    );
    setStationOffset(0);
    // 只在数据重新加载时重置视口，避免拖动时反复跳回。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  useEffect(() => {
    setStationOffset((current) =>
      Math.min(current, Math.max(0, stationPlotHeight * (stationScale - 1))),
    );
  }, [stationPlotHeight, stationScale]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    // 等方向切换后的列表渲染完成，再把选中行滚到可视区。
    const element = tripRowRefs.current.get(selectedId);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [direction, selectedId]);

  const cloneEntries = (list: readonly WorkbenchEntry[]): WorkbenchEntry[] =>
    list.map((entry) => ({
      ...entry,
      trip: { ...entry.trip },
      stops: entry.stops.map((stop) => ({ ...stop })),
    }));

  const cloneRules = (
    value: Record<WorkbenchDirection, WorkbenchRule[]>,
  ): Record<WorkbenchDirection, WorkbenchRule[]> => ({
    down: value.down.map((rule) => ({ ...rule, departureTimes: [...rule.departureTimes] })),
    up: value.up.map((rule) => ({ ...rule, departureTimes: [...rule.departureTimes] })),
  });

  const captureSnapshot = (): WorkbenchSnapshot => ({
    entries: cloneEntries(entriesRef.current),
    rules: cloneRules(rulesRef.current),
  });

  const pushHistory = () => {
    snapshotHistory.push(captureSnapshot());
  };

  const undo = () => {
    const previous = snapshotHistory.undo(captureSnapshot());
    if (!previous) {
      return;
    }
    setEntries(previous.entries);
    setRules(previous.rules);
    setDirty(true);
    setError('');
  };

  const redo = () => {
    const next = snapshotHistory.redo(captureSnapshot());
    if (!next) {
      return;
    }
    setEntries(next.entries);
    setRules(next.rules);
    setDirty(true);
    setError('');
  };

  const markLabelsStale = () => {
    if (hasPrefilledLabelsRef.current) {
      setLabelsNeedRefresh(true);
    }
  };

  const updateEntry = (
    clientId: string,
    updater: (entry: WorkbenchEntry) => WorkbenchEntry,
    recordHistory = true,
    materialize = true,
  ) => {
    if (recordHistory) {
      pushHistory();
    }
    setEntries((current) =>
      current.map((entry) => {
        if (entry.clientId !== clientId) {
          return entry;
        }
        const next = updater(entry);
        // 只改性质/备注/标签时仍由线路特殊班次标注承载，不必把规则展开项落库成班次实例。
        const marked = { ...next, changed: true };
        return entry.fromRule && materialize ? { ...marked, materialize: true } : marked;
      }),
    );
    setDirty(true);
    setError('');
  };

  const handleMoveStop = (
    clientId: string,
    stopIndex: number,
    edge: WorkbenchEdge,
    minutes: number,
    mode: WorkbenchLinkMode,
  ) => {
    markLabelsStale();
    updateEntry(
      clientId,
      (entry) => {
        const target = entry.stops[stopIndex];
        if (!target) {
          return entry;
        }
        const clamped = clampStopEdgeMinutes(entry.stops, stopIndex, edge, minutes);
        const previous = edge === 'arrival' ? target.arrivalMinutes : target.departureMinutes;
        const delta = clamped - (previous ?? clamped);
        // 拖到达点改上一区间用时，发车点跟着平移，停站时长保持不变；
        // 拖发车点则只改停站时长。
        const dwell = getStopDwellMinutes(target);
        const anchored = entry.stops.map((stop, index) => {
          if (index !== stopIndex) {
            return { ...stop };
          }
          if (edge === 'arrival') {
            return {
              ...stop,
              arrivalMinutes: clamped,
              departureMinutes: stop.departureMinutes === undefined ? undefined : clamped + dwell,
            };
          }
          return { ...stop, departureMinutes: clamped };
        });
        const nextStops = shiftLinkedStops(anchored, stopIndex, mode, delta);
        // 连锁平移把相邻点推成倒序时放弃这一帧，拖动会在合法边界处停住。
        return isStopSequenceMonotonic(nextStops) ? { ...entry, stops: nextStops } : entry;
      },
      false,
    );
  };

  const handleAddPoint = (
    clientId: string,
    stopIndex: number,
    edge: WorkbenchEdge,
    minutes: number,
  ) => {
    markLabelsStale();
    updateEntry(
      clientId,
      (entry) => ({
        ...entry,
        stops: setStopEdgeAt(entry.stops, stopIndex, edge, minutes),
      }),
      false,
    );
  };

  const handleRemovePoint = (clientId: string, stopIndex: number) => {
    markLabelsStale();
    updateEntry(
      clientId,
      (entry) => ({
        ...entry,
        stops: toggleStopAt(entry.stops, stopIndex),
      }),
      false,
    );
  };

  /** 图层树与属性检查器移除停站时补一条撤销记录；运行图已由 onInteractionStart 记录。 */
  const removeStop = (clientId: string, stopIndex: number) => {
    pushHistory();
    handleRemovePoint(clientId, stopIndex);
  };

  /** 把指定停站设为小交路起点或终点：保留一侧站序，另一侧截断。 */
  const cropTripRange = (clientId: string, stopIndex: number, edge: 'start' | 'end') => {
    const entry = entriesRef.current.find((item) => item.clientId === clientId);
    if (!entry) {
      return;
    }
    if (entry.stops.length <= 2) {
      setStatus('班次至少需要保留两个站。');
      return;
    }
    if (edge === 'start' && stopIndex === 0) {
      setStatus('该站已经是当前交路起点。');
      return;
    }
    if (edge === 'end' && stopIndex >= entry.stops.length - 1) {
      setStatus('该站已经是当前交路终点。');
      return;
    }
    pushHistory();
    markLabelsStale();
    updateEntry(
      clientId,
      (current) => {
        const nextStops = truncateTripStops(current.stops, stopIndex, edge);
        if (edge === 'start') {
          const first = nextStops[0];
          // 截断后的首站必须是发车站，缺少发车时刻时用到达时刻补齐。
          if (first && first.departureMinutes === undefined) {
            nextStops[0] = { ...first, departureMinutes: first.arrivalMinutes };
          }
        } else {
          const lastIndex = nextStops.length - 1;
          const last = nextStops[lastIndex];
          // 新终点不应保留发车时刻，避免运行图多画一个发车端点。
          if (last) {
            nextStops[lastIndex] = { ...last, departureMinutes: undefined };
          }
        }
        return { ...current, stops: nextStops };
      },
      false,
    );
    setSelectedId(clientId);
    setSelectedStopIndex(edge === 'start' ? 0 : stopIndex);
    setStatus(edge === 'start' ? '已将选中站设为交路起点' : '已将选中站设为交路终点');
  };

  /** 删除整条班次：真实班次在保存时调用 DELETE，规则展开项随线路发车规则一起移除。 */
  const handleDeleteEntry = (clientId: string) => {
    const entry = entriesRef.current.find((item) => item.clientId === clientId);
    if (!entry) {
      return;
    }
    pushHistory();
    setEntries((current) => current.filter((item) => item.clientId !== clientId));
    // 规则生成的最后一条班次被单独删除时，规则本身也失去意义，一并移除。
    if (entry.ruleId) {
      const stillOwned = entriesRef.current.some(
        (item) => item.clientId !== clientId && item.ruleId === entry.ruleId,
      );
      if (!stillOwned) {
        setRules((current) => ({
          ...current,
          [direction]: current[direction].filter((rule) => rule.id !== entry.ruleId),
        }));
        if (editingRuleId === entry.ruleId) {
          setEditingRuleId(null);
          setRuleText('');
        }
      }
    }
    setSelectedId((current) => (current === clientId ? null : current));
    setSelectedStopIndex((current) => (selectedId === clientId ? null : current));
    // 删除不会改变剩余班次的时刻，不需要强制重新分配标签；
    // 若删到一条不剩，也就没有标签可重排，避免保存被卡住。
    setDirty(true);
    setError('');
    setStatus(
      `已删除 ${formatWorkbenchMinutes(firstDepartureOrUndefined(entry.stops))} 的班次，保存后生效`,
    );
  };

  const handleResizeRange = (clientId: string, startName: string, endName: string) => {
    markLabelsStale();
    updateEntry(
      clientId,
      (entry) => {
        const startIndex = directionStationNames.indexOf(startName);
        const endIndex = directionStationNames.indexOf(endName);
        if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) {
          return entry;
        }
        const existingByName = new Map(entry.stops.map((stop) => [stop.stationName, stop]));
        const stops = directionStationNames
          .slice(startIndex, endIndex + 1)
          .map((stationName) => existingByName.get(stationName) ?? { stationName, isStop: true });
        return { ...entry, stops };
      },
      false,
    );
  };

  /** 按方向构造一个新班次；可带上要复制的性质与短交路经停站。 */
  const buildEntryAtTime = (
    value: WorkbenchDirection,
    departureTime: string,
    options: {
      ruleId?: string;
      copySavedLabel?: boolean;
      serviceNature?: string;
      shortTurnStationNames?: readonly string[];
    } = {},
  ): WorkbenchEntry | undefined => {
    if (!line) {
      return undefined;
    }
    const departureMinutes = clockToMinutes(departureTime);
    if (departureMinutes === undefined) {
      return undefined;
    }
    const forwardStationNames = line.stationSourceIds.map(stationNameOf);
    const stationNames =
      value === 'down' ? forwardStationNames : [...forwardStationNames].reverse();
    const segments = value === 'down' ? segmentMinutes : [...segmentMinutes].reverse();
    const label =
      options.copySavedLabel === false
        ? ''
        : (line.tripLabelsByDirection?.[value]?.[departureTime] ?? '');
    const poolById = new Map(pools.map((pool) => [pool.id, pool]));
    const baseStops = buildNewTripStops(stationNames, segments, departureMinutes);
    return {
      clientId: `new_${value}_${departureTime.replace(':', '')}_${Date.now().toString(
        36,
      )}_${Math.random().toString(36).slice(2, 6)}`,
      revisionId: scheduleRevisionId,
      trip: {
        tripInstanceId: '',
        serviceKind: inferServiceKind(line.mode, entriesRef.current[0]?.trip.serviceKind),
        serviceLabel: '',
        serviceNature: options.serviceNature,
        departureTime,
        lineName: line.name,
        stationNames,
        availability: 'ticketing_unavailable',
      },
      stops: options.shortTurnStationNames?.length
        ? restrictStopsToSpecial(baseStops, options.shortTurnStationNames)
        : baseStops,
      label,
      labelSource: resolveEntryLabelSource(label, poolConfigs[value].poolIds, poolById),
      isNew: true,
      ruleId: options.ruleId,
    };
  };

  const appendDepartures = () => {
    if (!line) {
      return;
    }
    if (!scheduleRevisionId) {
      setError('当前没有可写入的班次数据版本，请先在班次后台导入一次班次。');
      return;
    }
    if (editingRuleId) {
      saveRuleEdit(editingRuleId);
      return;
    }
    const parsed = parseDepartureRuleLines(ruleText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const existingTimes = new Set(
      directionEntries
        .map((entry) => toClockTime(firstDepartureOrUndefined(entry.stops)))
        .filter((value): value is string => Boolean(value)),
    );
    const existingEntryByTime = new Map<string, WorkbenchEntry>();
    for (const entry of directionEntries) {
      const time = toClockTime(firstDepartureOrUndefined(entry.stops));
      if (time && !existingEntryByTime.has(time)) {
        existingEntryByTime.set(time, entry);
      }
    }
    const existingRuleTimes = new Set(rules[direction].flatMap((rule) => rule.departureTimes));
    const claimedRuleByClientId = new Map<string, string>();
    const nextEntries: WorkbenchEntry[] = [];
    const nextRules: WorkbenchRule[] = [];
    for (const item of parsed.items) {
      const isBatchRule =
        item.intervalMinutes !== undefined && item.additionalDepartures !== undefined;
      if (isBatchRule) {
        const overlap = item.departureTimes.filter((time) => existingRuleTimes.has(time));
        if (overlap.length > 0) {
          setError(`规则与已有规则时刻重叠：${overlap.slice(0, 4).join('、')}`);
          return;
        }
      }
      const ruleId = isBatchRule
        ? `rule_${direction}_${Date.now().toString(36)}_${nextRules.length}`
        : undefined;
      let addedCount = 0;
      const claimedClientIds: string[] = [];
      for (const departureTime of item.departureTimes) {
        if (existingTimes.has(departureTime)) {
          // 规则时刻与已有单独班次重合时，让该班次一并归入规则管理。
          if (isBatchRule) {
            const existingEntry = existingEntryByTime.get(departureTime);
            if (existingEntry && !existingEntry.ruleId) {
              claimedClientIds.push(existingEntry.clientId);
            }
          }
          continue;
        }
        existingTimes.add(departureTime);
        const entry = buildEntryAtTime(direction, departureTime, { ruleId });
        if (entry) {
          nextEntries.push(entry);
          addedCount += 1;
        }
      }
      if (isBatchRule && addedCount > 0) {
        nextRules.push({
          id: ruleId as string,
          sourceText: item.sourceText,
          startTime: item.startTime,
          intervalMinutes: item.intervalMinutes,
          additionalDepartures: item.additionalDepartures,
          departureTimes: item.departureTimes,
        });
        for (const clientId of claimedClientIds) {
          claimedRuleByClientId.set(clientId, ruleId as string);
        }
      }
    }
    if (nextEntries.length === 0) {
      setError('这些发车时刻已经存在，没有新增班次。');
      return;
    }
    markLabelsStale();
    pushHistory();
    setEntries((current) => {
      const next = [...current, ...nextEntries];
      if (claimedRuleByClientId.size === 0) {
        return next;
      }
      return next.map((entry) => {
        const claimedRuleId = claimedRuleByClientId.get(entry.clientId);
        return claimedRuleId ? { ...entry, ruleId: claimedRuleId } : entry;
      });
    });
    if (nextRules.length > 0) {
      setRules((current) => ({ ...current, [direction]: [...current[direction], ...nextRules] }));
    }
    setRuleText('');
    setDirty(true);
    setStatus(`已追加 ${nextEntries.length} 个班次草稿`);
  };

  /** 编辑已有批量规则：保留仍命中的班次，移除被删时刻，补齐新增时刻。 */
  const saveRuleEdit = (ruleId: string) => {
    const rule = rules[direction].find((item) => item.id === ruleId);
    if (!rule) {
      setEditingRuleId(null);
      return;
    }
    const parsed = parseDepartureRuleLines(ruleText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const item = parsed.items[0];
    if (
      parsed.items.length !== 1 ||
      item?.intervalMinutes === undefined ||
      item?.additionalDepartures === undefined
    ) {
      setError('编辑批量规则时请只填写一条 HH:mm + HH:mm * N 规则。');
      return;
    }
    const timeOf = (entry: WorkbenchEntry) =>
      toClockTime(firstDepartureOrUndefined(entry.stops)) ?? '';
    const ownedByTime = new Map<string, WorkbenchEntry>();
    for (const entry of entries) {
      if (entry.ruleId !== rule.id) {
        continue;
      }
      const time = timeOf(entry);
      if (time && !ownedByTime.has(time)) {
        ownedByTime.set(time, entry);
      }
    }
    const otherTimes = new Set(
      entries
        .filter((entry) => entry.ruleId !== rule.id)
        .map(timeOf)
        .filter(Boolean),
    );
    const conflicts = item.departureTimes.filter((time) => otherTimes.has(time));
    if (conflicts.length > 0) {
      setError(`新规则的时刻与现有班次重叠：${conflicts.slice(0, 4).join('、')}`);
      return;
    }

    const nextEntries = entries.filter((entry) => entry.ruleId !== rule.id);
    for (const departureTime of item.departureTimes) {
      const existing = ownedByTime.get(departureTime);
      if (existing) {
        nextEntries.push(existing);
        continue;
      }
      const created = buildEntryAtTime(direction, departureTime, { ruleId: rule.id });
      if (created) {
        nextEntries.push(created);
      }
    }

    pushHistory();
    markLabelsStale();
    setEntries(nextEntries);
    setRules((current) => ({
      ...current,
      [direction]: current[direction].map((currentRule) =>
        currentRule.id === rule.id
          ? {
              ...currentRule,
              sourceText: item.sourceText,
              startTime: item.startTime,
              intervalMinutes: item.intervalMinutes,
              additionalDepartures: item.additionalDepartures,
              departureTimes: item.departureTimes,
            }
          : currentRule,
      ),
    }));
    setEditingRuleId(null);
    setRuleText('');
    setDirty(true);
    setError('');
    setStatus(`规则已更新为 ${item.departureTimes.length} 个时刻`);
  };

  /** 删除规则；未被手工脱钩的班次一并移除，保存时同步删除真实班次。 */
  const deleteRule = (rule: WorkbenchRule) => {
    const removedCount = entriesRef.current.filter((entry) => entry.ruleId === rule.id).length;
    pushHistory();
    setEntries((current) => current.filter((entry) => entry.ruleId !== rule.id));
    setRules((current) => ({
      ...current,
      [direction]: current[direction].filter((item) => item.id !== rule.id),
    }));
    if (editingRuleId === rule.id) {
      setEditingRuleId(null);
      setRuleText('');
    }
    setRuleDeleteTarget(null);
    setDirty(true);
    setError('');
    setStatus(`已删除规则，并移除其生成的 ${removedCount} 个班次，保存后生效`);
  };

  const cancelRuleEdit = () => {
    setEditingRuleId(null);
    setRuleText('');
    setError('');
  };

  /** 把正向发车时刻同步到反向；覆盖会清空反向班次与规则，补齐只追加缺失时刻。 */
  const syncForwardTimes = (mode: 'replace' | 'fill') => {
    if (!line) {
      return;
    }
    if (!scheduleRevisionId) {
      setError('当前没有可写入的班次数据版本，请先在班次后台导入一次班次。');
      setSyncDialogOpen(false);
      return;
    }
    const timeOf = (entry: WorkbenchEntry) => toClockTime(firstDepartureOrUndefined(entry.stops));
    const directionOf = (entry: WorkbenchEntry) =>
      resolveTripDirection(
        { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
        line,
        stationNameOf,
      );
    const downEntryByTime = new Map<string, WorkbenchEntry>();
    for (const entry of entries) {
      if (directionOf(entry) !== 'down') {
        continue;
      }
      const time = timeOf(entry);
      if (time && !downEntryByTime.has(time)) {
        downEntryByTime.set(time, entry);
      }
    }
    const downTimes = Array.from(downEntryByTime.keys()).sort();
    if (downTimes.length === 0) {
      setError('正向还没有发车时刻，无法同步到反向。');
      setSyncDialogOpen(false);
      return;
    }
    const existingUpTimes = new Set(
      entries
        .filter((entry) => directionOf(entry) === 'up')
        .map(timeOf)
        .filter((time): time is string => Boolean(time)),
    );
    const nextEntries =
      mode === 'replace' ? entries.filter((entry) => directionOf(entry) !== 'up') : [...entries];
    let addedCount = 0;
    for (const departureTime of downTimes) {
      if (mode === 'fill' && existingUpTimes.has(departureTime)) {
        continue;
      }
      const source = downEntryByTime.get(departureTime);
      const servedStationNames = source
        ? source.stops.filter((stop) => stop.isStop).map((stop) => stop.stationName)
        : [];
      const isShortTurn =
        servedStationNames.length >= 2 && servedStationNames.length < line.stationSourceIds.length;
      const entry = buildEntryAtTime('up', departureTime, {
        copySavedLabel: false,
        serviceNature: source?.trip.serviceNature,
        shortTurnStationNames: isShortTurn ? servedStationNames : undefined,
      });
      if (entry) {
        nextEntries.push(entry);
        addedCount += 1;
      }
    }
    pushHistory();
    markLabelsStale();
    setEntries(nextEntries);
    if (mode === 'replace') {
      setRules((current) => ({ ...current, up: [] }));
    }
    setSyncDialogOpen(false);
    setDirty(true);
    setError('');
    setStatus(
      mode === 'replace'
        ? `已用正向 ${downTimes.length} 个时刻覆盖反向`
        : `已补齐反向缺少的 ${addedCount} 个发车时刻`,
    );
  };

  const updateDeparture = (entry: WorkbenchEntry, value: string) => {
    const nextMinutes = clockToMinutes(value);
    if (nextMinutes === undefined) {
      return;
    }
    const currentMinutes = firstDepartureOrUndefined(entry.stops);
    if (currentMinutes === undefined) {
      return;
    }
    // 手工改过发车时刻后，这个班次不再跟随原批量规则。
    if (entry.ruleId) {
      const stillOwned = entriesRef.current.some(
        (item) => item.clientId !== entry.clientId && item.ruleId === entry.ruleId,
      );
      if (!stillOwned) {
        setRules((current) => ({
          ...current,
          [direction]: current[direction].filter((rule) => rule.id !== entry.ruleId),
        }));
        if (editingRuleId === entry.ruleId) {
          setEditingRuleId(null);
          setRuleText('');
        }
      }
    }
    const delta = nextMinutes - currentMinutes;
    markLabelsStale();
    updateEntry(
      entry.clientId,
      (current) => ({
        ...current,
        ruleId: current.ruleId ? undefined : current.ruleId,
        ruleDetached: current.ruleId ? true : current.ruleDetached,
        stops: current.stops.map((stop) => ({
          ...stop,
          arrivalMinutes:
            stop.arrivalMinutes === undefined ? undefined : stop.arrivalMinutes + delta,
          departureMinutes:
            stop.departureMinutes === undefined ? undefined : stop.departureMinutes + delta,
        })),
      }),
      false,
    );
  };

  const zoomChart = (factor: number) => {
    setViewport((current) => {
      const duration = Math.min(1440, Math.max(30, current.duration * factor));
      const center = current.start + current.duration / 2;
      return clampChartViewport({ duration, start: center - duration / 2 });
    });
  };

  const applyStationViewport = (nextScale: number, nextOffset: number) => {
    const scale = Math.min(4, Math.max(0.6, nextScale));
    const maxOffset = Math.max(0, stationPlotHeight * (scale - 1));
    setStationScale(scale);
    setStationOffset(Math.min(Math.max(nextOffset, 0), maxOffset));
  };

  const zoomStations = (factor: number) => {
    const nextScale = Math.min(4, Math.max(0.6, stationScale * factor));
    const anchor = stationPlotHeight / 2;
    const nextOffset = (stationOffset + anchor) * (nextScale / stationScale) - anchor;
    applyStationViewport(nextScale, nextOffset);
  };

  const fitChart = () => {
    setStationScale(1);
    setStationOffset(0);
    const ranges = entries
      .map((entry) => getTripMinuteRange(entry.stops))
      .filter((range): range is [number, number] => range !== null);
    if (ranges.length === 0) {
      setViewport({ start: 300, duration: 720 });
      return;
    }
    const earliest = Math.min(...ranges.map((range) => range[0]));
    const latest = Math.max(...ranges.map((range) => range[1]));
    setViewport(
      clampChartViewport({
        start: earliest,
        duration: resolveChartFitDuration(earliest, latest),
      }),
    );
  };

  const handleSelectTripFromChart = (tripId: string, stopIndex?: number) => {
    if (!line) {
      return;
    }
    const entry = entries.find((item) => item.clientId === tripId);
    if (!entry) {
      return;
    }
    setSelectedId(tripId);
    // 点到具体端点时同步选中停站，右侧检查器直接显示到/发时刻。
    setSelectedStopIndex(stopIndex !== undefined && entry.stops[stopIndex] ? stopIndex : null);
    setExpandedTrips((current) => {
      if (current.has(tripId)) {
        return current;
      }
      const next = new Set(current);
      next.add(tripId);
      return next;
    });
    // 图上点到反向班次时，列表跟着切到对应方向。
    const entryDirection = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    setDirection((current) => (current === entryDirection ? current : entryDirection));
  };

  const expandTrip = (clientId: string) => {
    setExpandedTrips((current) => {
      if (current.has(clientId)) {
        return current;
      }
      const next = new Set(current);
      next.add(clientId);
      return next;
    });
  };

  const toggleTripExpanded = (clientId: string) => {
    setExpandedTrips((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const selectTripFromLayer = (entry: WorkbenchEntry, value: WorkbenchDirection) => {
    setSelectedId(entry.clientId);
    setSelectedStopIndex(null);
    setDirection(value);
    expandTrip(entry.clientId);
  };

  const selectStopFromLayer = (entry: WorkbenchEntry, value: WorkbenchDirection, index: number) => {
    setSelectedId(entry.clientId);
    setSelectedStopIndex(index);
    setDirection(value);
    expandTrip(entry.clientId);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedStopIndex(null);
    closeInspector();
  };

  // 双击图层行时把焦点送进检查器的第一个字段（移动端会顺势展开属性抽屉）。
  const focusInspector = useEditorInspectorFocus(inspectorRef);

  const directionStationNamesOf = (value: WorkbenchDirection): string[] => {
    if (!line) {
      return [];
    }
    const names = line.stationSourceIds.map(stationNameOf);
    return value === 'down' ? names : [...names].reverse();
  };

  /** 反向站序的第 i 段对应正序区间数组的倒数第 i 段。 */
  const directionSegmentMinutesOf = (value: WorkbenchDirection, index: number): number => {
    const resolved = value === 'down' ? index : segmentMinutes.length - 1 - index;
    return segmentMinutes[resolved] ?? 4;
  };

  /** 整条班次的所有时刻一起平移。 */
  const shiftStopsBy = (stops: readonly WorkbenchTripStop[], delta: number) =>
    stops.map((stop) => ({
      ...stop,
      arrivalMinutes: stop.arrivalMinutes === undefined ? undefined : stop.arrivalMinutes + delta,
      departureMinutes:
        stop.departureMinutes === undefined ? undefined : stop.departureMinutes + delta,
    }));

  /** 创建副本：按同方向最后两班的间隔续推，冲突时向后找空档。 */
  const duplicateTrip = (entry: WorkbenchEntry) => {
    if (!line) {
      return;
    }
    const value = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    const times = entriesByDirection[value]
      .map((item) => firstDepartureOrUndefined(item.stops))
      .filter((time): time is number => time !== undefined)
      .sort((left, right) => left - right);
    const base = times.at(-1) ?? firstDepartureOrUndefined(entry.stops);
    if (base === undefined) {
      setError('该班次缺少发车时刻，无法创建副本。');
      return;
    }
    const interval = times.length >= 2 ? Math.max(1, times.at(-1)! - times.at(-2)!) : 5;
    const occupied = new Set(times);
    let nextDeparture = Math.round(base + interval);
    let attempts = 0;
    while (occupied.has(nextDeparture) && attempts < 30) {
      nextDeparture += 1;
      attempts += 1;
    }
    if (occupied.has(nextDeparture)) {
      setError('接下来 30 分钟内没有可用的发车空档，无法创建副本。');
      return;
    }
    const currentDeparture = firstDepartureOrUndefined(entry.stops);
    if (currentDeparture === undefined) {
      setError('该班次缺少发车时刻，无法创建副本。');
      return;
    }
    pushHistory();
    markLabelsStale();
    const clone: WorkbenchEntry = {
      ...entry,
      clientId: `copy_${value}_${nextDeparture}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      trip: {
        ...entry.trip,
        tripInstanceId: '',
        departureTime: toClockTime(nextDeparture) ?? entry.trip.departureTime,
      },
      stops: shiftStopsBy(entry.stops, nextDeparture - currentDeparture),
      label: '',
      labelSource: undefined,
      isNew: true,
      changed: true,
      fromRule: false,
      materialize: false,
      ruleId: undefined,
      ruleDetached: false,
    };
    setEntries((current) => [...current, clone]);
    setSelectedId(clone.clientId);
    setSelectedStopIndex(null);
    setDirection(value);
    expandTrip(clone.clientId);
    setDirty(true);
    setError('');
    setStatus(`已创建 ${toClockTime(nextDeparture) ?? ''} 的班次副本，标签需重新分配`);
  };

  /** 上移/下移：与同方向相邻班次交换发车时刻，交换后两者都脱离原批量规则。 */
  const swapTripDeparture = (entry: WorkbenchEntry, offset: -1 | 1) => {
    if (!line) {
      return;
    }
    const value = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    const list = entriesByDirection[value];
    const index = list.findIndex((item) => item.clientId === entry.clientId);
    const target = index >= 0 ? list[index + offset] : undefined;
    if (!target) {
      setStatus(offset < 0 ? '已经是该方向第一个班次。' : '已经是该方向最后一个班次。');
      return;
    }
    const currentDeparture = firstDepartureOrUndefined(entry.stops);
    const targetDeparture = firstDepartureOrUndefined(target.stops);
    if (currentDeparture === undefined || targetDeparture === undefined) {
      setError('存在缺少发车时刻的班次，无法交换顺序。');
      return;
    }
    const delta = targetDeparture - currentDeparture;
    pushHistory();
    markLabelsStale();
    setEntries((current) =>
      current.map((item) => {
        if (item.clientId === entry.clientId) {
          return {
            ...item,
            changed: true,
            materialize: item.fromRule ? true : item.materialize,
            ruleId: undefined,
            ruleDetached: item.ruleId ? true : item.ruleDetached,
            stops: shiftStopsBy(item.stops, delta),
          };
        }
        if (item.clientId === target.clientId) {
          return {
            ...item,
            changed: true,
            materialize: item.fromRule ? true : item.materialize,
            ruleId: undefined,
            ruleDetached: item.ruleId ? true : item.ruleDetached,
            stops: shiftStopsBy(item.stops, -delta),
          };
        }
        return item;
      }),
    );
    // 交换后原规则不再拥有这两条班次；仍被其它班次引用的规则保留。
    setRules((current) => ({
      ...current,
      [value]: current[value].filter((rule) =>
        entriesRef.current.some(
          (item) =>
            item.clientId !== entry.clientId &&
            item.clientId !== target.clientId &&
            item.ruleId === rule.id,
        ),
      ),
    }));
    setSelectedId(entry.clientId);
    setSelectedStopIndex(null);
    setDirty(true);
    setError('');
    setStatus(`已与 ${toClockTime(targetDeparture) ?? ''} 的班次交换发车时刻`);
  };

  /** 延长交路：只给新增站补时刻，已有站保持不动。 */
  const extendTripRange = (edge: 'start' | 'end') => {
    if (!selectedEntry || !line) {
      setStatus('请先选中一个班次，再延长交路。');
      return;
    }
    const value = resolveTripDirection(
      { stationNames: selectedEntry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    const names = directionStationNamesOf(value);
    const first = selectedEntry.stops[0];
    const last = selectedEntry.stops.at(-1);
    if (!first || !last) {
      return;
    }
    const firstIndex = names.indexOf(first.stationName);
    const lastIndex = names.indexOf(last.stationName);
    if (edge === 'start') {
      if (firstIndex <= 0) {
        setStatus('已经到线路起点，无法继续向前延长。');
        return;
      }
      const origin = first.departureMinutes ?? first.arrivalMinutes;
      if (origin === undefined) {
        setError('该班次首站缺少发车时刻，无法推算新增站。');
        return;
      }
      const stationName = names[firstIndex - 1]!;
      const segment = directionSegmentMinutesOf(value, firstIndex - 1);
      const arrivalMinutes = Math.max(0, origin - segment);
      const departureMinutes =
        arrivalMinutes + defaultDwellMinutes <= origin
          ? arrivalMinutes + defaultDwellMinutes
          : origin;
      pushHistory();
      markLabelsStale();
      updateEntry(
        selectedEntry.clientId,
        (entry) => ({
          ...entry,
          stops: [{ stationName, isStop: true, arrivalMinutes, departureMinutes }, ...entry.stops],
        }),
        false,
      );
      setStatus(`已将交路向前延长一站：${stationName}`);
      return;
    }
    if (lastIndex < 0 || lastIndex >= names.length - 1) {
      setStatus('已经到线路终点，无法继续向后延长。');
      return;
    }
    const origin = last.arrivalMinutes ?? last.departureMinutes;
    if (origin === undefined) {
      setError('该班次末站缺少到达时刻，无法推算新增站。');
      return;
    }
    const stationName = names[lastIndex + 1]!;
    const arrivalMinutes = origin + directionSegmentMinutesOf(value, lastIndex);
    pushHistory();
    markLabelsStale();
    updateEntry(
      selectedEntry.clientId,
      (entry) => ({
        ...entry,
        stops: [...entry.stops, { stationName, isStop: true, arrivalMinutes }],
      }),
      false,
    );
    setStatus(`已将交路向后延长一站：${stationName}`);
  };

  const selectedTripDirection = selectedEntry
    ? resolveTripDirection(
        {
          stationNames: selectedEntry.stops.map((stop) => stop.stationName),
          stopTimes: [],
        },
        line ?? { stationSourceIds: [] },
        stationNameOf,
      )
    : null;
  const selectedTripStationNames = selectedTripDirection
    ? directionStationNamesOf(selectedTripDirection)
    : [];
  const selectedTripFirstStation = selectedEntry?.stops[0]?.stationName;
  const selectedTripLastStation = selectedEntry?.stops.at(-1)?.stationName;
  const canExtendStart =
    Boolean(selectedEntry) &&
    selectedTripFirstStation !== undefined &&
    selectedTripStationNames.indexOf(selectedTripFirstStation) > 0;
  const canExtendEnd =
    Boolean(selectedEntry) &&
    selectedTripLastStation !== undefined &&
    selectedTripStationNames.indexOf(selectedTripLastStation) >= 0 &&
    selectedTripStationNames.indexOf(selectedTripLastStation) < selectedTripStationNames.length - 1;

  const handleRestoreAutoTiming = () => {
    if (!selectedId) {
      setStatus('请先点选一个班次，再恢复自动时刻。');
      return;
    }
    const stationIndex = new Map(chartStationIds.map((id, index) => [stationNameOf(id), index]));
    const segmentBetween = (from: string, to: string) => {
      const fromIndex = stationIndex.get(from);
      const toIndex = stationIndex.get(to);
      if (fromIndex === undefined || toIndex === undefined) {
        return 4;
      }
      return segmentMinutes[Math.min(fromIndex, toIndex)] ?? 4;
    };
    markLabelsStale();
    updateEntry(selectedId, (entry) => {
      const first = entry.stops[0];
      const startMinutes = first?.departureMinutes ?? first?.arrivalMinutes;
      if (startMinutes === undefined) {
        return entry;
      }
      let cursor = startMinutes;
      const stops = entry.stops.map((stop, index) => {
        if (index === 0) {
          return { ...stop, arrivalMinutes: cursor, departureMinutes: cursor };
        }
        cursor += segmentBetween(entry.stops[index - 1]!.stationName, stop.stationName);
        const arrival = cursor;
        const isLast = index === entry.stops.length - 1;
        // 只恢复区间用时，保留每站已有的停站时长。
        const departure = isLast ? undefined : arrival + getStopDwellMinutes(stop);
        if (departure !== undefined) {
          cursor = departure;
        }
        return { ...stop, arrivalMinutes: arrival, departureMinutes: departure };
      });
      return { ...entry, stops };
    });
    setStatus('已把该班次的区间用时与停站用时恢复为自动推算');
  };

  const prefillLabels = () => {
    if (!line || pools.length === 0) {
      setError('还没有可用的标签池，无法预填班次标签。');
      return;
    }
    const assignment = resolveTripLabelAssignments({
      line,
      otherLines: revision?.lines ?? [],
      entries,
      pools,
      poolConfigs,
      stationNameOf,
    });
    if (!assignment.labels) {
      setError(assignment.error ?? '标签池里没有可用标签，无法预填。');
      return;
    }
    const unconfiguredDirections = assignment.missingPoolDirections;

    hasPrefilledLabelsRef.current = true;
    setLabelsNeedRefresh(false);
    pushHistory();
    setEntries((current) =>
      applyTripLabelAssignments(current, assignment.labels, line, stationNameOf),
    );
    setDirty(true);
    setStatus(
      unconfiguredDirections.length > 0
        ? `已按标签池预填班次标签；${unconfiguredDirections
            .map((value) => (value === 'down' ? '正向' : '反向'))
            .join('、')}未选择标签池，未分配标签`
        : '已按标签池预填班次标签，可继续手动调整；若再改时刻需重新分配',
    );
  };

  /** 保存成功返回 true；校验或请求失败返回 false，外壳据此决定是否返回上一页。 */
  const save = async (): Promise<boolean> => {
    if (!line || !revision) {
      return false;
    }
    if (labelsNeedRefresh && entries.length > 0) {
      setError('班次时刻已改动，请先重新按标签池分配班次标签，再保存。');
      return false;
    }
    for (const entry of entries) {
      if (entry.stops.length < 2) {
        setError(
          `班次 ${formatWorkbenchMinutes(firstDepartureOrUndefined(entry.stops))} 至少需要两个站。`,
        );
        return false;
      }
      if (firstDepartureOrUndefined(entry.stops) === undefined) {
        setError('存在没有发车时刻的班次，请先在运行图或列表里补齐。');
        return false;
      }
    }
    setSaving(true);
    setError('');
    setStatus('正在保存班次与线路配置');
    try {
      // 先在列表里被移除的真实班次落库删除；规则展开项没有实例，随线路配置清空即可。
      const currentRealTripKeys = new Set(
        entries
          .filter((entry) => !entry.isNew && entry.trip.tripInstanceId)
          .map((entry) => `${entry.revisionId}\u0000${entry.trip.tripInstanceId}`),
      );
      const removedTripKeys = [...loadedRealTripKeysRef.current].filter(
        (key) => !currentRealTripKeys.has(key),
      );
      for (const key of removedTripKeys) {
        const [targetRevisionId, tripInstanceId] = key.split('\u0000');
        if (!targetRevisionId || !tripInstanceId) {
          continue;
        }
        const deleteResponse = await fetch(
          appPath(
            `/api/admin/travel/schedule-revisions/${encodeURIComponent(
              targetRevisionId,
            )}/trips/${encodeURIComponent(tripInstanceId)}`,
          ),
          { method: 'DELETE' },
        );
        if (!deleteResponse.ok) {
          const data = (await deleteResponse.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message ?? '删除班次失败。');
        }
      }
      const overriddenDirections = resolveOverriddenDirections(
        line,
        entries,
        loadedDirectionCountsRef.current,
        stationNameOf,
      );

      // 按目标版本分组，新增与修正合并为一次批量写入；未修改的已有班次不再重复提交。
      const mutationsByRevision = new Map<
        string,
        {
          updates: Array<{ tripInstanceId: string; patch: Record<string, unknown> }>;
          creates: Array<Record<string, unknown>>;
        }
      >();
      for (const entry of entries) {
        if (entry.fromRule && !entry.materialize) {
          continue;
        }
        if (!entry.isNew && !entry.changed) {
          continue;
        }
        const payload = buildTripPayload(entry, line);
        const group = mutationsByRevision.get(entry.revisionId) ?? { updates: [], creates: [] };
        const common = {
          ...payload,
          lineName: line.name,
          stationNames: entry.stops.map((stop) => stop.stationName),
        };
        if (entry.isNew) {
          group.creates.push({
            ...common,
            serviceKind: entry.trip.serviceKind,
            availability: entry.trip.availability,
          });
        } else {
          group.updates.push({ tripInstanceId: entry.trip.tripInstanceId, patch: common });
        }
        mutationsByRevision.set(entry.revisionId, group);
      }

      for (const [targetRevisionId, group] of mutationsByRevision) {
        const response = await fetch(
          appPath(
            `/api/admin/travel/schedule-revisions/${encodeURIComponent(targetRevisionId)}/trips`,
          ),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(group),
          },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message ?? '保存班次失败。');
        }
      }

      // 清理早前方向判定错误时重复创建的班次；失败不阻塞保存，下次加载还会再提示。
      await Promise.all(
        duplicateTripsRef.current
          .filter((duplicate) => duplicate.trip.tripInstanceId)
          .map((duplicate) =>
            fetch(
              appPath(
                `/api/admin/travel/schedule-revisions/${encodeURIComponent(
                  duplicate.revisionId,
                )}/trips/${encodeURIComponent(duplicate.trip.tripInstanceId)}`,
              ),
              { method: 'DELETE' },
            ).catch(() => undefined),
          ),
      );
      duplicateTripsRef.current = [];

      const response = await fetch(
        appPath(
          `/api/admin/transit/datasets/${encodeURIComponent(
            normalizedRevisionId,
          )}/lines/${encodeURIComponent(normalizedLineSourceId)}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildLinePayload(
              line,
              entries,
              poolConfigs,
              stationNameOf,
              overriddenDirections,
              rules,
            ),
          ),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? '保存线路发车规则失败。');
      }

      await loadData();
      setSelectedId(null);
      setSelectedStopIndex(null);
      // 通知后台列表与其它工作台刷新，避免跨页面仍读取旧班次。
      publishAdminDataChanged({
        resource: 'transit',
        reason: 'record_updated',
        occurredAt: new Date().toISOString(),
      });
      setStatus('已保存班次工作台的全部改动');
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败。');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 快捷键统一走注册表；保存与保存并返回由 VisualEditorShell 处理。
  useEditorShortcuts(
    [
      defineShortcut('toolSelect', () => setTool('pan')),
      defineShortcut('toolPan', () => setTool('pan')),
      defineShortcut('tripToolMove', () => setTool('move')),
      defineShortcut('tripToolDraw', () => setTool('draw')),
      defineShortcut('toolDraw', () => setTool('draw')),
      defineShortcut('tripToolPanDigit', () => setTool('pan')),
      defineShortcut('tripToolMoveDigit', () => setTool('move')),
      defineShortcut('tripToolDrawDigit', () => setTool('draw')),
      defineShortcut('undo', () => undo()),
      defineShortcut('redo', () => redo()),
      defineShortcut('redoY', () => redo()),
      defineShortcut('duplicateSelection', () => {
        if (selectedEntry) {
          duplicateTrip(selectedEntry);
        }
      }),
      defineShortcut('moveUp', () => {
        if (selectedEntry) {
          swapTripDeparture(selectedEntry, -1);
        }
      }),
      defineShortcut('moveDown', () => {
        if (selectedEntry) {
          swapTripDeparture(selectedEntry, 1);
        }
      }),
      defineShortcut('deleteSelection', () => {
        if (!selectedId) {
          return;
        }
        // 选中停站时 Delete 表示移除该停站（改为通过不停），否则移除整条班次。
        if (selectedStopIndex !== null) {
          const stop = selectedEntry?.stops[selectedStopIndex];
          if (stop?.isStop) {
            removeStop(selectedId, selectedStopIndex);
          } else {
            setStatus('该站已经是通过状态，无需移除。');
          }
          return;
        }
        handleDeleteEntry(selectedId);
      }),
    ],
    { enabled: !saving },
  );

  const editorTools = useMemo<EditorTool[]>(
    () => [
      { id: 'pan', icon: 'pan_tool', label: '选择 / 手型工具（平移画布）', shortcut: 'V' },
      {
        id: 'draw',
        icon: 'add_location_alt',
        label: '画图工具（添加 / 移除锚点）',
        shortcut: 'D',
      },
      { id: 'move', icon: 'open_with', label: '拖移端点（修改区间 / 停站用时）', shortcut: 'M' },
    ],
    [],
  );

  /** 放弃本地草稿并重新读取服务端数据。 */
  const discardChanges = async () => {
    if (dirty && !(await requestConfirmation('确定放弃当前未保存的改动吗？'))) {
      return;
    }
    clearSelection();
    await loadData();
  };

  // 工具栏分组的单一来源：宽屏平铺到各自胶囊，窄屏收进各自的溢出菜单。
  const linkActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'link-none',
      icon: 'radio_button_unchecked',
      label: '连锁：不连锁',
      active: linkMode === 'none',
      onClick: () => setLinkMode('none'),
    },
    {
      id: 'link-before',
      icon: 'first_page',
      label: '连锁：之前',
      active: linkMode === 'before',
      onClick: () => setLinkMode('before'),
    },
    {
      id: 'link-after',
      icon: 'last_page',
      label: '连锁：之后',
      active: linkMode === 'after',
      onClick: () => setLinkMode('after'),
    },
    {
      id: 'link-all',
      icon: 'select_all',
      label: '连锁：全部',
      active: linkMode === 'all',
      onClick: () => setLinkMode('all'),
    },
  ];

  const runActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'restore',
      icon: 'settings_backup_restore',
      label: '恢复自动时刻',
      disabled: !selectedId,
      onClick: handleRestoreAutoTiming,
    },
    {
      id: 'sync',
      icon: 'sync_alt',
      label: '同步正向时刻到反向',
      disabled: direction !== 'up',
      onClick: () => setSyncDialogOpen(true),
    },
  ];

  const historyActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'undo',
      icon: 'undo',
      label: '撤销（Ctrl+Z）',
      onClick: undo,
    },
    {
      id: 'redo',
      icon: 'redo',
      label: '重做（Ctrl+Shift+Z）',
      onClick: redo,
    },
    {
      id: 'discard',
      icon: 'restart_alt',
      label: '放弃改动',
      disabled: !dirty || saving,
      onClick: () => void discardChanges(),
    },
  ];

  const viewActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'station-zoom-in',
      icon: 'unfold_more',
      label: '放大站间距（Shift + 滚轮）',
      onClick: () => zoomStations(1.2),
    },
    {
      id: 'station-zoom-out',
      icon: 'unfold_less',
      label: '缩小站间距（Shift + 滚轮）',
      onClick: () => zoomStations(0.8),
    },
  ];

  // 宽屏时工具胶囊移入标题栏；窄屏仍浮在画布上，所有非工具组统一收进一个图标菜单。
  const renderEditorToolbar = (variant: 'full' | 'compact', inHeader: boolean) => (
    <EditorToolbar
      activeToolId={tool}
      ariaLabel="班次运行图工具"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={(toolId) => setTool(toolId as WorkbenchTool)}
      sections={buildEditorToolbarSections({
        variant,
        tools: editorTools,
        toolsAriaLabel: '运行图工具',
        compactAriaLabel: '运行图操作',
        groups: [
          { id: 'link', ariaLabel: '连锁模式', items: linkActionItems },
          { id: 'run', ariaLabel: '恢复与同步', items: runActionItems },
          { id: 'history', ariaLabel: '历史', items: historyActionItems },
          { id: 'view', ariaLabel: '视图', items: viewActionItems },
        ],
      })}
    />
  );

  // 双向班次同时上图，颜色按班次标签取；没有标签的班次统一灰色。
  const chartTrips: ChartTrip[] = entries
    .slice()
    .sort((left, right) => firstDeparture(left.stops) - firstDeparture(right.stops))
    .map((entry) => ({
      id: entry.clientId,
      label: `${formatWorkbenchMinutes(firstDepartureOrUndefined(entry.stops))} · ${entry.label || '未分配标签'}`,
      tag: entry.label.trim() || '未分配标签',
      color: resolveTripLabelColor(entry.label),
      stops: entry.stops,
      selected: entry.clientId === selectedId,
    }));
  const selectedPoolCount = poolConfigs[direction].poolIds.length;

  if (!line || !revision) {
    return (
      <EditorLoadingState
        backHref={backToAdminHref}
        backLabel="返回线路与班次后台"
        error={error}
        icon="timeline"
        status={status}
      />
    );
  }

  return (
    <VisualEditorShell
      backHref={backToAdminPath}
      editorKind="transit-trip"
      headerTools={
        <EditorHeaderToolbar
          compact={renderEditorToolbar('compact', true)}
          full={renderEditorToolbar('full', true)}
        />
      }
      isBusy={saving}
      isDirty={dirty}
      onSave={save}
      sessionId={`transit-trip:${normalizedRevisionId}:${normalizedLineSourceId}`}
      title={`${line.name} · 班次工作台`}
      workspace
    >
      <div
        className={`transit-visual-workspace transit-trip-workspace${panelStateClass}${
          selectedEntry ? ' has-layer-selection' : ''
        }`}
      >
        <div className="transit-trip-chart-host" ref={chartHostRef}>
          <TransitTripRunChart
            height={chartHeight}
            bottomInset={chartBottom}
            leftGutter={chartLeftGutter}
            rightInset={chartRightInset}
            topInset={chartTopInset}
            linkMode={linkMode}
            rows={rows}
            selectedTripId={selectedId}
            stationOffset={stationOffset}
            stationScale={stationScale}
            tool={tool}
            trips={chartTrips}
            viewport={viewport}
            onAddPoint={handleAddPoint}
            onInteractionStart={pushHistory}
            onMoveStop={handleMoveStop}
            onRemovePoint={handleRemovePoint}
            onResizeRange={handleResizeRange}
            onSelectTrip={handleSelectTripFromChart}
            onStationViewportChange={({ scale, offset }) => applyStationViewport(scale, offset)}
            onViewportChange={(next) => setViewport(clampChartViewport(next))}
          />
        </div>

        {panelsVisible ? (
          <aside className="poi-visual-layer-panel" aria-label="班次图层" ref={layerPanelRef}>
            <EditorPanelHeading
              meta={`${directionEntries.length} 班 · ${line.stationSourceIds.length} 站 · ${
                dirty ? '有未保存改动' : '已同步'
              }`}
              title="图层"
              toolbar={
                // 与线路走向共用同一个紧凑分段控件，方向切换不再单独占一行。
                <div className="transit-visual-layer-heading-actions">
                  <span>方向</span>
                  <div className="segmented-control">
                    <SegmentedControl
                      ariaLabel="方向"
                      className="transit-visual-segmented"
                      onChange={(value) => {
                        setDirection(value);
                        clearSelection();
                      }}
                      options={[
                        { value: 'down' as const, label: '正向', title: '正向（下行）' },
                        { value: 'up' as const, label: '反向', title: '反向（上行）' },
                      ]}
                      value={direction}
                    />
                  </div>
                </div>
              }
              withInspectorEntry
            >
              <EditorInspectorEntry onOpen={openInspector} />
            </EditorPanelHeading>
            <div className="poi-visual-layer-body">
              {error || status ? (
                <p
                  className={
                    error ? 'transit-visual-panel-status is-error' : 'transit-visual-panel-status'
                  }
                  role="status"
                >
                  {error || status}
                </p>
              ) : null}
              <ul className="poi-visual-layer-tree">
                {directionEntries.length === 0 ? (
                  <li>
                    <p className="poi-visual-panel-empty">这个方向还没有班次。</p>
                  </li>
                ) : null}
                {directionEntries.map((entry, tripIndex) => {
                  const tripExpanded = expandedTrips.has(entry.clientId);
                  const tripActive = entry.clientId === selectedId && selectedStopIndex === null;
                  return (
                    <li key={entry.clientId}>
                      <div
                        className={`poi-visual-layer-row transit-trip-layer-trip-row${
                          tripActive ? ' is-active' : ''
                        }`}
                        ref={(node) => {
                          if (node) {
                            tripRowRefs.current.set(entry.clientId, node);
                          } else {
                            tripRowRefs.current.delete(entry.clientId);
                          }
                        }}
                      >
                        <button
                          aria-expanded={tripExpanded}
                          aria-label={tripExpanded ? '收起停站' : '展开停站'}
                          className="transit-trip-layer-expand"
                          type="button"
                          onClick={() => toggleTripExpanded(entry.clientId)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {tripExpanded ? 'expand_more' : 'chevron_right'}
                          </span>
                        </button>
                        <button
                          aria-pressed={tripActive}
                          className="poi-visual-layer-group transit-trip-layer-trip"
                          type="button"
                          onClick={() => selectTripFromLayer(entry, direction)}
                          onDoubleClick={() => {
                            selectTripFromLayer(entry, direction);
                            focusInspector();
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="transit-trip-layer-color"
                            style={{ background: resolveTripLabelColor(entry.label) }}
                          />
                          <span className="poi-visual-layer-label">
                            {`${formatWorkbenchMinutes(
                              firstDepartureOrUndefined(entry.stops),
                            )} · ${entry.label || '未分配标签'}`}
                          </span>
                          <span className="poi-visual-layer-count">
                            {entry.fromRule
                              ? '规则'
                              : entry.isNew
                                ? '新增'
                                : (entry.trip.tripCode ?? `${entry.stops.length} 站`)}
                          </span>
                        </button>
                        <EditorLayerRowActions
                          actions={[
                            {
                              id: 'duplicate',
                              icon: 'content_copy',
                              label: '创建副本',
                              title: '创建副本（Ctrl+D）',
                              onClick: () => duplicateTrip(entry),
                            },
                            {
                              id: 'move-up',
                              icon: 'arrow_upward',
                              label: '上移',
                              title: '上移（Ctrl+[，与上一班交换发车时刻）',
                              disabled: tripIndex === 0,
                              onClick: () => swapTripDeparture(entry, -1),
                            },
                            {
                              id: 'move-down',
                              icon: 'arrow_downward',
                              label: '下移',
                              title: '下移（Ctrl+]，与下一班交换发车时刻）',
                              disabled: tripIndex >= directionEntries.length - 1,
                              onClick: () => swapTripDeparture(entry, 1),
                            },
                            {
                              id: 'remove',
                              icon: 'delete',
                              label: '移除班次',
                              title: '移除班次（Delete，保存后生效）',
                              danger: true,
                              onClick: () => handleDeleteEntry(entry.clientId),
                            },
                          ]}
                        />
                      </div>
                      {tripExpanded ? (
                        <ul className="poi-visual-layer-points">
                          {entry.stops.map((stop, stopIndex) => {
                            const stopActive =
                              entry.clientId === selectedId && selectedStopIndex === stopIndex;
                            return (
                              <li key={`${entry.clientId}-${stopIndex}`}>
                                <div
                                  className={`poi-visual-layer-row${
                                    stopActive ? ' is-active' : ''
                                  }`}
                                >
                                  <button
                                    aria-pressed={stopActive}
                                    className="poi-visual-layer-point"
                                    type="button"
                                    onClick={() => selectStopFromLayer(entry, direction, stopIndex)}
                                    onDoubleClick={() => {
                                      selectStopFromLayer(entry, direction, stopIndex);
                                      focusInspector();
                                    }}
                                  >
                                    <span className="poi-visual-layer-label">
                                      {stop.stationName}
                                    </span>
                                    <span className="poi-visual-layer-coordinate">
                                      {stop.isStop
                                        ? `${toClockTime(stop.arrivalMinutes) ?? '—'} / ${
                                            toClockTime(stop.departureMinutes) ?? '—'
                                          }`
                                        : '通过'}
                                    </span>
                                  </button>
                                  <EditorLayerRowActions
                                    actions={[
                                      {
                                        id: 'crop-start',
                                        icon: 'vertical_align_top',
                                        label: '设为交路起点',
                                        title:
                                          stopIndex === 0
                                            ? '已经是当前交路起点'
                                            : '把该站设为小交路起点',
                                        disabled: stopIndex === 0 || entry.stops.length <= 2,
                                        onClick: () =>
                                          cropTripRange(entry.clientId, stopIndex, 'start'),
                                      },
                                      {
                                        id: 'crop-end',
                                        icon: 'vertical_align_bottom',
                                        label: '设为交路终点',
                                        title:
                                          stopIndex >= entry.stops.length - 1
                                            ? '已经是当前交路终点'
                                            : '把该站设为小交路终点',
                                        disabled:
                                          stopIndex >= entry.stops.length - 1 ||
                                          entry.stops.length <= 2,
                                        onClick: () =>
                                          cropTripRange(entry.clientId, stopIndex, 'end'),
                                      },
                                      {
                                        id: 'remove-stop',
                                        icon: 'delete',
                                        label: '移除停站',
                                        title: '移除停站（改为通过不停）',
                                        disabled: !stop.isStop,
                                        onClick: () => removeStop(entry.clientId, stopIndex),
                                      },
                                    ]}
                                  />
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
            </div>
            <div className="poi-visual-layer-footer">
              <button type="button" onClick={() => setRuleDialogOpen(true)}>
                班次规则
              </button>
              <button
                disabled={!canExtendStart}
                title={canExtendStart ? '向前延长一站' : '已到线路起点或未选中班次'}
                type="button"
                onClick={() => extendTripRange('start')}
              >
                向前延长一站
              </button>
              <button
                disabled={!canExtendEnd}
                title={canExtendEnd ? '向后延长一站' : '已到线路终点或未选中班次'}
                type="button"
                onClick={() => extendTripRange('end')}
              >
                向后延长一站
              </button>
            </div>
          </aside>
        ) : null}

        {panelsVisible ? (
          <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
            <EditorPanelHeading
              meta={
                selectedStop && selectedEntry
                  ? `${selectedStop.stationName} · ${
                      toClockTime(selectedStop.arrivalMinutes) ?? '—'
                    } / ${toClockTime(selectedStop.departureMinutes) ?? '—'}`
                  : selectedEntry
                    ? `${formatWorkbenchMinutes(
                        firstDepartureOrUndefined(selectedEntry.stops),
                      )} · ${selectedEntry.label || '未分配标签'}`
                    : `${line.name} · ${direction === 'down' ? '正向' : '反向'}`
              }
              title={selectedStop ? '停站属性' : selectedEntry ? '班次属性' : '全局属性'}
            >
              {/* 全局属性状态下也要能关闭检查器，否则中等宽度下打开后无法退出。 */}
              <button
                aria-label={selectedEntry ? '返回图层' : '关闭属性面板'}
                className="poi-visual-inspector-back"
                title={selectedEntry ? '返回图层' : '关闭属性面板'}
                type="button"
                onClick={clearSelection}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
            </EditorPanelHeading>
            <div className="poi-visual-coordinate-panel-body">
              {selectedStop && selectedEntry ? (
                <>
                  <div className="poi-visual-inspector-heading">
                    <strong>{selectedStop.stationName}</strong>
                    <span>{selectedStop.isStop ? '停靠站' : '通过站'}</span>
                  </div>
                  <label className="material-field">
                    <span>到站时刻</span>
                    <input
                      disabled={!selectedStop.isStop}
                      type="time"
                      value={toClockTime(selectedStop.arrivalMinutes) ?? ''}
                      onFocus={pushHistory}
                      onChange={(event) => {
                        const next = clockToMinutes(event.currentTarget.value);
                        if (next === undefined || selectedStopIndex === null) {
                          return;
                        }
                        handleMoveStop(
                          selectedEntry.clientId,
                          selectedStopIndex,
                          'arrival',
                          next,
                          'none',
                        );
                      }}
                    />
                  </label>
                  <label className="material-field">
                    <span>发车时刻</span>
                    <input
                      disabled={!selectedStop.isStop}
                      type="time"
                      value={toClockTime(selectedStop.departureMinutes) ?? ''}
                      onFocus={pushHistory}
                      onChange={(event) => {
                        const next = clockToMinutes(event.currentTarget.value);
                        if (next === undefined || selectedStopIndex === null) {
                          return;
                        }
                        handleMoveStop(
                          selectedEntry.clientId,
                          selectedStopIndex,
                          'departure',
                          next,
                          'none',
                        );
                      }}
                    />
                  </label>
                  <div className="poi-visual-point-fields">
                    <label className="material-field">
                      <span>停站用时</span>
                      <input
                        disabled={!selectedStop.isStop}
                        inputMode="numeric"
                        min={0}
                        type="number"
                        value={selectedStop.isStop ? Math.round(selectedStopDwell) : ''}
                        onFocus={pushHistory}
                        onChange={(event) => {
                          const minutes = Number(event.currentTarget.value);
                          if (
                            !Number.isFinite(minutes) ||
                            minutes < 0 ||
                            selectedStopIndex === null ||
                            selectedStop.arrivalMinutes === undefined
                          ) {
                            return;
                          }
                          handleMoveStop(
                            selectedEntry.clientId,
                            selectedStopIndex,
                            'departure',
                            selectedStop.arrivalMinutes + minutes,
                            'none',
                          );
                        }}
                      />
                    </label>
                    <label className="material-field">
                      <span>区间用时</span>
                      <input
                        disabled={!selectedStop.isStop}
                        inputMode="numeric"
                        min={0}
                        type="number"
                        value={
                          selectedStopSegment === undefined ? '' : Math.round(selectedStopSegment)
                        }
                        onFocus={pushHistory}
                        onChange={(event) => {
                          const minutes = Number(event.currentTarget.value);
                          if (
                            !Number.isFinite(minutes) ||
                            minutes < 0 ||
                            selectedStopIndex === null ||
                            selectedStopPreviousDeparture === undefined
                          ) {
                            return;
                          }
                          handleMoveStop(
                            selectedEntry.clientId,
                            selectedStopIndex,
                            'arrival',
                            selectedStopPreviousDeparture + minutes,
                            'none',
                          );
                        }}
                      />
                    </label>
                  </div>
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>所属班次</dt>
                      <dd>
                        {`${formatWorkbenchMinutes(
                          firstDepartureOrUndefined(selectedEntry.stops),
                        )} · ${selectedEntry.label || '未分配标签'}`}
                      </dd>
                    </div>
                    <div>
                      <dt>上下行方向</dt>
                      <dd>{selectedTripDirection === 'up' ? '反向' : '正向'}</dd>
                    </div>
                    <div>
                      <dt>停靠状态</dt>
                      <dd>{selectedStop.isStop ? '停靠' : '通过不停'}</dd>
                    </div>
                  </dl>
                  <div className="poi-visual-inspector-actions">
                    <button
                      disabled={
                        selectedStopIndex === null ||
                        selectedStopIndex === 0 ||
                        selectedEntry.stops.length <= 2
                      }
                      type="button"
                      onClick={() =>
                        selectedStopIndex !== null
                          ? cropTripRange(selectedEntry.clientId, selectedStopIndex, 'start')
                          : undefined
                      }
                    >
                      设为交路起点
                    </button>
                    <button
                      disabled={
                        selectedStopIndex === null ||
                        selectedStopIndex >= selectedEntry.stops.length - 1 ||
                        selectedEntry.stops.length <= 2
                      }
                      type="button"
                      onClick={() =>
                        selectedStopIndex !== null
                          ? cropTripRange(selectedEntry.clientId, selectedStopIndex, 'end')
                          : undefined
                      }
                    >
                      设为交路终点
                    </button>
                    <button
                      disabled={!selectedStop.isStop}
                      type="button"
                      onClick={() =>
                        selectedStopIndex !== null
                          ? removeStop(selectedEntry.clientId, selectedStopIndex)
                          : undefined
                      }
                    >
                      移除停站（改为通过）
                    </button>
                  </div>
                </>
              ) : selectedEntry ? (
                <>
                  <div className="poi-visual-inspector-heading">
                    <strong>
                      {formatWorkbenchMinutes(firstDepartureOrUndefined(selectedEntry.stops)) ||
                        '缺少发车时刻'}
                    </strong>
                    <span>{selectedEntry.label || '未分配标签'}</span>
                  </div>
                  <label className="material-field">
                    <span>班次标签</span>
                    <input
                      maxLength={40}
                      placeholder="标签"
                      type="text"
                      value={selectedEntry.label}
                      onFocus={pushHistory}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateEntry(
                          selectedEntry.clientId,
                          (current) => ({
                            ...current,
                            label: value,
                            labelSource: value.trim() ? 'manual' : undefined,
                          }),
                          false,
                          false,
                        );
                      }}
                    />
                  </label>
                  <label className="material-field">
                    <span>首站发车时间</span>
                    <input
                      type="time"
                      value={toClockTime(firstDepartureOrUndefined(selectedEntry.stops)) ?? ''}
                      onFocus={pushHistory}
                      onChange={(event) =>
                        updateDeparture(selectedEntry, event.currentTarget.value)
                      }
                    />
                  </label>
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>末站到达时间</dt>
                      <dd>
                        {formatWorkbenchMinutes(selectedEntry.stops.at(-1)?.arrivalMinutes) || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>停站数 / 通过数</dt>
                      <dd>{`${selectedEntry.stops.filter((stop) => stop.isStop).length} / ${
                        selectedEntry.stops.filter((stop) => !stop.isStop).length
                      }`}</dd>
                    </div>
                    <div>
                      <dt>归属规则</dt>
                      <dd>
                        {selectedEntry.ruleId
                          ? (rules[selectedTripDirection === 'up' ? 'up' : 'down'].find(
                              (rule) => rule.id === selectedEntry.ruleId,
                            )?.sourceText ?? '规则已移除')
                          : selectedEntry.ruleDetached
                            ? '已脱离规则'
                            : '未归属规则'}
                      </dd>
                    </div>
                    <div>
                      <dt>落库状态</dt>
                      <dd>
                        {selectedEntry.isNew
                          ? '新增草稿'
                          : selectedEntry.fromRule && !selectedEntry.materialize
                            ? '规则展开项'
                            : selectedEntry.changed
                              ? '已落库 · 本次已修改'
                              : '已落库'}
                      </dd>
                    </div>
                    <div>
                      <dt>上下行方向</dt>
                      <dd>{selectedTripDirection === 'up' ? '反向' : '正向'}</dd>
                    </div>
                  </dl>
                  <label className="material-field">
                    <span>班次性质</span>
                    <input
                      maxLength={20}
                      placeholder="如快速 / 直达"
                      type="text"
                      value={selectedEntry.trip.serviceNature ?? ''}
                      onFocus={pushHistory}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateEntry(
                          selectedEntry.clientId,
                          (current) => ({
                            ...current,
                            trip: { ...current.trip, serviceNature: value },
                          }),
                          false,
                          false,
                        );
                      }}
                    />
                  </label>
                  <label className="material-field">
                    <span>班次备注</span>
                    <input
                      maxLength={200}
                      placeholder="如并入说明"
                      type="text"
                      value={selectedEntry.trip.routeNote ?? ''}
                      onFocus={pushHistory}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateEntry(
                          selectedEntry.clientId,
                          (current) => ({
                            ...current,
                            trip: { ...current.trip, routeNote: value },
                          }),
                          false,
                          false,
                        );
                      }}
                    />
                  </label>
                  <div className="poi-visual-inspector-actions">
                    <button type="button" onClick={handleRestoreAutoTiming}>
                      恢复自动时刻
                    </button>
                    <button type="button" onClick={() => duplicateTrip(selectedEntry)}>
                      创建副本
                    </button>
                    <button type="button" onClick={() => handleDeleteEntry(selectedEntry.clientId)}>
                      移除班次
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="transit-visual-field">
                    <span>当前方向</span>
                    <p className="transit-visual-summary-text">
                      {direction === 'down' ? '正向' : '反向'}
                    </p>
                  </div>
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>线路名</dt>
                      <dd>{line.name}</dd>
                    </div>
                    <div>
                      <dt>班次数</dt>
                      <dd>{`正向 ${entriesByDirection.down.length} · 反向 ${
                        entriesByDirection.up.length
                      }`}</dd>
                    </div>
                    <div>
                      <dt>线路站数</dt>
                      <dd>{`${line.stationSourceIds.length} 站`}</dd>
                    </div>
                    <div>
                      <dt>每班停靠数</dt>
                      <dd>{describeStopCountRange(directionEntries)}</dd>
                    </div>
                    <div>
                      <dt>运行区间</dt>
                      <dd>{describeDirectionRange(directionEntries)}</dd>
                    </div>
                    <div>
                      <dt>脏状态</dt>
                      <dd>{dirty ? '有未保存改动' : '已同步'}</dd>
                    </div>
                    <div>
                      <dt>批量规则</dt>
                      <dd>
                        {rules[direction].length > 0
                          ? `${rules[direction].length} 条 · ${rules[direction][0]?.sourceText ?? ''}`
                          : '暂无规则'}
                      </dd>
                    </div>
                  </dl>
                  <div className="transit-visual-inspector-section">
                    <div className="transit-visual-inspector-section-heading">
                      <h3 className="transit-visual-inspector-section-title">班次标签</h3>
                      <button
                        className="transit-visual-inspector-edit"
                        type="button"
                        onClick={() => setPoolDialogOpen(true)}
                      >
                        选择标签池
                      </button>
                    </div>
                    <p className="transit-visual-summary-text">
                      {selectedPoolCount > 0
                        ? `已选 ${selectedPoolCount} 个标签池 · ${
                            poolConfigs[direction].mode === 'sequential' ? '顺序抽取' : '随机抽取'
                          }`
                        : '当前方向还没有选择标签池。'}
                    </p>
                    <div className="poi-visual-inspector-actions">
                      <button
                        className={labelsNeedRefresh ? 'is-warning' : ''}
                        disabled={pools.length === 0 || entries.length === 0}
                        title={
                          labelsNeedRefresh
                            ? '班次已改动，点击重新按标签池分配班次标签'
                            : '按标签池预填班次标签'
                        }
                        type="button"
                        onClick={prefillLabels}
                      >
                        {labelsNeedRefresh ? '重新分配标签' : '按标签池预填'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        ) : null}

        {renderEditorToolbar('compact', false)}

        <EditorZoomControls
          fitLabel="适配全部班次"
          onFit={fitChart}
          onZoomIn={() => zoomChart(0.8)}
          onZoomOut={() => zoomChart(1.25)}
          scale={Math.min(4, Math.max(0.25, 720 / Math.max(30, viewport.duration)))}
        />

        <EditorRailBridge
          activeToolId={tool}
          bottom={[
            {
              id: 'transit-trip-editor-rail-discard',
              label: '放弃改动',
              icon: 'restart_alt',
              group: 'bottom',
              onClick: () => void discardChanges(),
            },
          ]}
          ownerId="transit-trip-editor"
          panels={{ visible: panelsVisible, onToggle: togglePanels }}
          sections={[
            { id: 'link', items: linkActionItems },
            { id: 'run', priority: 60, items: runActionItems },
            { id: 'history', priority: 70, items: historyActionItems },
            { id: 'view', priority: 80, items: viewActionItems },
          ]}
          tools={editorTools}
          onToolChange={(toolId) => setTool(toolId as WorkbenchTool)}
        />

        {ruleDialogOpen ? (
          <TripRuleDialog
            direction={direction}
            editingRuleId={editingRuleId}
            error={error}
            ownedCountOf={(ruleId) =>
              entriesByDirection[direction].filter((entry) => entry.ruleId === ruleId).length
            }
            ruleText={ruleText}
            rules={rules[direction]}
            onCancelEdit={cancelRuleEdit}
            onChangeText={setRuleText}
            onClose={() => setRuleDialogOpen(false)}
            onDeleteRule={(rule) => setRuleDeleteTarget(rule)}
            onEditRule={(rule) => {
              setEditingRuleId(rule.id);
              setRuleText(rule.sourceText);
              setError('');
            }}
            onSubmit={appendDepartures}
          />
        ) : null}

        {poolDialogOpen ? (
          <PoolPickerDialog
            config={poolConfigs[direction]}
            pools={pools}
            onCancel={() => setPoolDialogOpen(false)}
            onConfirm={(config) => {
              setPoolConfigs((current) => ({ ...current, [direction]: config }));
              setPoolDialogOpen(false);
              setDirty(true);
            }}
          />
        ) : null}

        {syncDialogOpen ? (
          <DirectionSyncDialog
            downCount={countDirectionDepartures('down')}
            upCount={countDirectionDepartures('up')}
            onCancel={() => setSyncDialogOpen(false)}
            onConfirm={syncForwardTimes}
          />
        ) : null}

        {ruleDeleteTarget ? (
          <RuleDeleteDialog
            rule={ruleDeleteTarget}
            ownedCount={entries.filter((entry) => entry.ruleId === ruleDeleteTarget.id).length}
            onCancel={() => setRuleDeleteTarget(null)}
            onConfirm={() => deleteRule(ruleDeleteTarget)}
          />
        ) : null}
      </div>
    </VisualEditorShell>
  );
}

/** 新建班次与批量规则共用同一个弹窗：输入区负责追加，列表区负责编辑与删除。 */
function TripRuleDialog({
  direction,
  editingRuleId,
  error,
  ownedCountOf,
  ruleText,
  rules,
  onCancelEdit,
  onChangeText,
  onClose,
  onDeleteRule,
  onEditRule,
  onSubmit,
}: Readonly<{
  direction: WorkbenchDirection;
  editingRuleId: string | null;
  error: string;
  ownedCountOf: (ruleId: string) => number;
  ruleText: string;
  rules: WorkbenchRule[];
  onCancelEdit: () => void;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onDeleteRule: (rule: WorkbenchRule) => void;
  onEditRule: (rule: WorkbenchRule) => void;
  onSubmit: () => void;
}>) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        aria-label="班次规则"
        aria-modal="true"
        className="modal-panel admin-transit-dialog transit-trip-pool-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{`班次规则 · ${direction === 'down' ? '正向' : '反向'}`}</h2>
          <span className="muted">{`${rules.length} 条规则`}</span>
        </div>
        <p className="muted">
          支持单点 <code>06:30</code> 或批量 <code>06:30 + 00:05 * 5</code>，可多行或逗号分隔。
          编辑已有规则会按新规则重算时刻。
        </p>
        {editingRuleId ? <span className="transit-trip-rule-badge">编辑规则</span> : null}
        <textarea
          className="transit-trip-rule-input"
          placeholder="例如：06:30 或 06:30 + 00:05 * 5"
          rows={3}
          value={ruleText}
          onChange={(event) => onChangeText(event.currentTarget.value)}
        />
        <div className="admin-content-actions">
          {editingRuleId ? (
            <button type="button" onClick={onCancelEdit}>
              取消编辑
            </button>
          ) : null}
          <button type="button" onClick={onSubmit}>
            {editingRuleId ? '保存规则' : '确认追加'}
          </button>
        </div>
        {error ? <p className="admin-poi-dialog-error">{error}</p> : null}
        {rules.length > 0 ? (
          <div className="transit-trip-rules" aria-label="已添加的批量规则">
            {rules.map((rule) => (
              <div
                className={
                  editingRuleId === rule.id
                    ? 'transit-trip-rule-row is-editing'
                    : 'transit-trip-rule-row'
                }
                key={rule.id}
              >
                <code>{rule.sourceText}</code>
                <span className="muted">{`${ownedCountOf(rule.id)} 个班次`}</span>
                <button
                  aria-label="编辑规则"
                  title="编辑规则（会按新规则重算时刻）"
                  type="button"
                  onClick={() => onEditRule(rule)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    edit
                  </span>
                </button>
                <button
                  aria-label="删除规则"
                  className="is-danger"
                  title="删除规则及其生成的班次"
                  type="button"
                  onClick={() => onDeleteRule(rule)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="poi-visual-panel-empty">还没有批量规则。</p>
        )}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function DirectionSyncDialog({
  downCount,
  upCount,
  onCancel,
  onConfirm,
}: Readonly<{
  downCount: number;
  upCount: number;
  onCancel: () => void;
  onConfirm: (mode: 'replace' | 'fill') => void;
}>) {
  const [mode, setMode] = useState<'replace' | 'fill'>('replace');

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal-panel admin-transit-dialog transit-trip-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="同步正向发车时刻到反向"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>同步正向时刻到反向</h2>
          <span className="muted">{`正向 ${downCount} 个 · 反向 ${upCount} 个`}</span>
        </div>
        <p className="muted">
          会复制首站发车时刻、班次性质和短交路经停站；不复制班次标签和备注。反向规则会按所选方式处理。
        </p>
        <fieldset className="segmented-control">
          <legend>同步方式</legend>
          <div>
            {(
              [
                ['replace', '覆盖反向'],
                ['fill', '仅补齐缺失'],
              ] as const
            ).map(([value, label]) => (
              <button
                className={mode === value ? 'is-active' : ''}
                type="button"
                aria-pressed={mode === value}
                key={value}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="muted">
          {mode === 'replace'
            ? `将清空反向现有的 ${upCount} 个班次和全部反向规则，再写入正向的 ${downCount} 个时刻。`
            : `保留反向现有 ${upCount} 个班次，只追加正向有而反向没有的时刻。`}
        </p>
        <div className="admin-content-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" disabled={downCount === 0} onClick={() => onConfirm(mode)}>
            确认同步
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleDeleteDialog({
  rule,
  ownedCount,
  onCancel,
  onConfirm,
}: Readonly<{
  rule: WorkbenchRule;
  ownedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal-panel admin-transit-dialog transit-trip-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="删除批量规则"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>删除批量规则</h2>
          <span className="muted">{rule.sourceText}</span>
        </div>
        <p>
          {ownedCount > 0
            ? `将同时删除该规则生成的 ${ownedCount} 个班次；已手工改过发车时刻而脱离规则的班次会保留。`
            : '该规则当前没有生效班次，只会删除规则记录。'}
        </p>
        <div className="admin-content-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" onClick={onConfirm}>
            删除规则
          </button>
        </div>
      </div>
    </div>
  );
}

function PoolPickerDialog({
  config,
  pools,
  onCancel,
  onConfirm,
}: Readonly<{
  config: PoolConfig;
  pools: TransitTripLabelPool[];
  onCancel: () => void;
  onConfirm: (config: PoolConfig) => void;
}>) {
  const [draft, setDraft] = useState<PoolConfig>(config);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal-panel admin-transit-dialog transit-trip-pool-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择班次标签池"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>选择班次标签池</h2>
          <span className="muted">{`已选 ${draft.poolIds.length} 个`}</span>
        </div>
        <p className="muted">
          多个池会合并后统一抽取。手动填写的班次标签优先级更高，不参与自动抽取。
        </p>
        <div className="transit-trip-pool-options">
          {pools.length === 0 ? (
            <p className="muted">还没有标签池，请先到标签池后台创建。</p>
          ) : (
            pools.map((pool) => (
              <label key={pool.id}>
                <input
                  type="checkbox"
                  checked={draft.poolIds.includes(pool.id)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setDraft((current) => ({
                      ...current,
                      poolIds: checked
                        ? [...current.poolIds, pool.id]
                        : current.poolIds.filter((id) => id !== pool.id),
                    }));
                  }}
                />
                <span>{pool.name}</span>
                <small className="muted">{`${pool.labels.length} 个标签`}</small>
              </label>
            ))
          )}
        </div>
        <fieldset className="segmented-control">
          <legend>抽取方式</legend>
          <div>
            {(
              [
                ['sequential', '顺序'],
                ['random', '随机'],
              ] as const
            ).map(([value, label]) => (
              <button
                className={draft.mode === value ? 'is-active' : ''}
                type="button"
                aria-pressed={draft.mode === value}
                key={value}
                onClick={() => setDraft((current) => ({ ...current, mode: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="admin-content-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({ mode: draft.mode, poolIds: Array.from(new Set(draft.poolIds)) })
            }
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 判断已保存标签的来源：属于该方向已选标签池的标签视为自动抽取结果，可以再次参与预填；
 * 池外自定义标签视为手动标签，预填时优先占用。
 */
function resolveEntryLabelSource(
  label: string,
  poolIds: readonly string[] | undefined,
  poolById: ReadonlyMap<string, TransitTripLabelPool>,
): 'auto' | 'manual' | undefined {
  if (!label) {
    return undefined;
  }
  const inPool = (poolIds ?? []).some((poolId) => poolById.get(poolId)?.labels.includes(label));
  return inPool ? 'auto' : 'manual';
}

interface TripLabelAssignmentInput {
  line: TransitLineSnapshot;
  /** 同批次其它线路，用于让共用标签池的线路按同一套车辆运行时分配。 */
  otherLines: readonly TransitLineSnapshot[];
  entries: readonly WorkbenchEntry[];
  pools: readonly TransitTripLabelPool[];
  poolConfigs: Record<WorkbenchDirection, PoolConfig>;
  stationNameOf: (stationSourceId: string) => string;
}

interface TripLabelAssignmentResult {
  labels?: Record<WorkbenchDirection, Record<string, string>>;
  /** 有班次但没有选择标签池的方向，用于提示而不是静默跳过。 */
  missingPoolDirections: WorkbenchDirection[];
  error?: string;
}

/**
 * 按标签池与当天日期计算各方向班次标签。
 * 同批次所有线路一起参与计算：手动标签占用车辆运行时，
 * 自动标签会避开同一时间窗，保证共用标签池时不会出现同车冲突。
 */
function resolveTripLabelAssignments(input: TripLabelAssignmentInput): TripLabelAssignmentResult {
  const { line, otherLines, entries, pools, poolConfigs, stationNameOf } = input;
  const directionOf = (entry: WorkbenchEntry) =>
    resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
  const timesOf = (targetDirection: WorkbenchDirection) =>
    entries
      .filter((entry) => directionOf(entry) === targetDirection)
      .map((entry) => toClockTime(firstDepartureOrUndefined(entry.stops)))
      .filter((time): time is string => Boolean(time))
      .sort();
  // 每班实际首末站与实测时长：小交路折返后应停在折返站，而不是大交路终点。
  const tripsOf = (targetDirection: WorkbenchDirection): TransitTripLabelTripSource[] => {
    const trips: TransitTripLabelTripSource[] = [];
    for (const entry of entries) {
      if (directionOf(entry) !== targetDirection) {
        continue;
      }
      const departureTime = toClockTime(firstDepartureOrUndefined(entry.stops));
      const originStationName = entry.stops[0]?.stationName;
      const lastStop = entry.stops[entry.stops.length - 1];
      const destinationStationName = lastStop?.stationName;
      if (!departureTime || !originStationName || !destinationStationName) {
        continue;
      }
      const start = firstDepartureOrUndefined(entry.stops);
      const end = lastStop?.arrivalMinutes ?? lastStop?.departureMinutes;
      trips.push({
        departureTime,
        originStationName,
        destinationStationName,
        durationMinutes:
          start !== undefined && end !== undefined && end > start ? end - start : undefined,
      });
    }
    return trips;
  };
  const missingPoolDirections = (['down', 'up'] as const).filter(
    (value) => timesOf(value).length > 0 && poolConfigs[value].poolIds.length === 0,
  );
  if (entries.length === 0) {
    return { missingPoolDirections, error: '当前还没有班次，无法分配标签。' };
  }
  if (pools.length === 0) {
    return { missingPoolDirections, error: '还没有可用的标签池，无法预填班次标签。' };
  }

  const manualLabels: Record<WorkbenchDirection, Record<string, string>> = { down: {}, up: {} };
  for (const entry of entries) {
    if (entry.labelSource !== 'manual') {
      continue;
    }
    const time = toClockTime(firstDepartureOrUndefined(entry.stops));
    if (time && entry.label.trim()) {
      manualLabels[directionOf(entry)][time] = entry.label.trim();
    }
  }

  // 用当前线路已有班次实测首末时刻估算单班时长，避免区间数据缺失时统一按 60 分钟计算。
  const measuredDurations = entries
    .map((entry) => {
      const first = entry.stops[0];
      const last = entry.stops[entry.stops.length - 1];
      const start = first?.departureMinutes ?? first?.arrivalMinutes;
      const end = last?.arrivalMinutes ?? last?.departureMinutes;
      return start !== undefined && end !== undefined && end > start ? end - start : undefined;
    })
    .filter((duration): duration is number => duration !== undefined)
    .sort((left, right) => left - right);
  const tripDurationMinutes = measuredDurations.length
    ? measuredDurations[Math.floor(measuredDurations.length / 2)]
    : undefined;

  const result = resolveTransitTripLabels({
    dateKey: getTransitTripLabelServiceDateKey(),
    lines: [
      {
        id: line.sourceId,
        stationNames: line.stationSourceIds.map(stationNameOf),
        stationSourceIds: [...line.stationSourceIds],
        stopTravelTimes: collectStopTravelTimes(line.stops),
        tripDurationMinutes,
        tripsByDirection: { down: tripsOf('down'), up: tripsOf('up') },
        specialTripsByDirection: line.specialTripsByDirection,
        departureTimesByDirection: { down: timesOf('down'), up: timesOf('up') },
        tripLabelConfigByDirection: {
          down: toPoolConfigPayload(poolConfigs.down),
          up: toPoolConfigPayload(poolConfigs.up),
        },
        tripLabelsByDirection: manualLabels,
        segmentPaths: line.segmentPaths,
      },
      // 其它线路按“重新自动分配”参与同一轮计算：
      // 只看它们的班次与标签池配置，不把已保存标签当成手动占用，
      // 这样当前线路能拿到与全车队不冲突的标签。
      ...otherLines
        .filter((other) => other.sourceId !== line.sourceId)
        .map((other) => ({
          id: other.sourceId,
          stationNames: other.stationSourceIds.map(stationNameOf),
          stationSourceIds: [...other.stationSourceIds],
          stopTravelTimes: collectStopTravelTimes(other.stops),
          specialTripsByDirection: other.specialTripsByDirection,
          departureTimesByDirection: other.departureTimesByDirection,
          tripLabelConfigByDirection: other.tripLabelConfigByDirection,
          segmentPaths: other.segmentPaths,
        })),
    ],
    pools,
  });
  const labels = result.get(line.sourceId);
  if (!labels) {
    const directionNames = missingPoolDirections
      .map((value) => (value === 'down' ? '正向' : '反向'))
      .join('、');
    return {
      missingPoolDirections,
      error:
        missingPoolDirections.length > 0
          ? `${directionNames}还没有选择标签池，无法自动分配标签。`
          : '标签池里没有可用标签，无法预填。',
    };
  }

  return {
    labels: { down: labels.down ?? {}, up: labels.up ?? {} },
    missingPoolDirections,
  };
}

/** 把手动标签原样保留，其余班次按本次抽取结果重写；未分配到的自动标签会被清空。 */
function applyTripLabelAssignments(
  entries: readonly WorkbenchEntry[],
  labels: Record<WorkbenchDirection, Record<string, string>> | undefined,
  line: TransitLineSnapshot,
  stationNameOf: (stationSourceId: string) => string,
): WorkbenchEntry[] {
  if (!labels) {
    return [...entries];
  }
  return entries.map((entry) => {
    if (entry.labelSource === 'manual') {
      return entry;
    }
    const direction = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    const time = toClockTime(firstDepartureOrUndefined(entry.stops));
    const label = time ? labels[direction]?.[time] : undefined;
    if (label) {
      return { ...entry, label, labelSource: 'auto' as const };
    }
    return entry.label ? { ...entry, label: '', labelSource: undefined } : entry;
  });
}

/** 全局属性里的每班停靠数范围。 */
function describeStopCountRange(entries: readonly WorkbenchEntry[]): string {
  if (entries.length === 0) {
    return '—';
  }
  const counts = entries.map((entry) => entry.stops.filter((stop) => stop.isStop).length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? `${min} 站` : `${min}–${max} 站`;
}

/** 全局属性里的运行区间：当前方向最早发车到晚点到达。 */
function describeDirectionRange(entries: readonly WorkbenchEntry[]): string {
  const starts = entries
    .map((entry) => firstDepartureOrUndefined(entry.stops))
    .filter((minutes): minutes is number => minutes !== undefined);
  const ends = entries
    .map((entry) => {
      const last = entry.stops.at(-1);
      return last?.arrivalMinutes ?? last?.departureMinutes;
    })
    .filter((minutes): minutes is number => minutes !== undefined);
  if (starts.length === 0 || ends.length === 0) {
    return '—';
  }
  return `${formatWorkbenchMinutes(Math.min(...starts))} – ${formatWorkbenchMinutes(
    Math.max(...ends),
  )}`;
}

function buildTripPayload(entry: WorkbenchEntry, line: TransitLineSnapshot) {
  const stopTimes: TravelTripStopTime[] = entry.stops.map((stop) => ({
    stationName: stop.stationName,
    isStop: stop.isStop,
    arrivalTime: toClockTime(stop.arrivalMinutes),
    departureTime: toClockTime(stop.departureMinutes),
    arrivalDayOffset: toDayOffset(stop.arrivalMinutes),
    departureDayOffset: toDayOffset(stop.departureMinutes),
    dwellMinutes:
      stop.isStop && stop.arrivalMinutes !== undefined && stop.departureMinutes !== undefined
        ? // 区间用时可能是小数（如 2.4 分钟），浮点累加后停站时长会带出 1.0000000000000568
          // 这类误差；服务端要求整数分钟，这里按分钟取整后再写入。
          Math.max(0, Math.round(stop.departureMinutes - stop.arrivalMinutes))
        : undefined,
  }));
  const first = entry.stops[0];
  const last = entry.stops.at(-1);
  return {
    departureTime:
      toClockTime(first?.departureMinutes ?? first?.arrivalMinutes) ?? entry.trip.departureTime,
    arrivalTime: toClockTime(last?.arrivalMinutes ?? last?.departureMinutes),
    arrivalDayOffset: toDayOffset(last?.arrivalMinutes ?? last?.departureMinutes),
    stopTimes,
    serviceNature: entry.trip.serviceNature ?? '',
    routeNote: entry.trip.routeNote ?? '',
    timingSource: 'manual' as const,
    lineName: line.name,
  };
}

/** 加载时该方向有班次、编辑后一个不剩：保存时需要把该方向的发车配置一并清空。 */
function resolveOverriddenDirections(
  line: TransitLineSnapshot,
  entries: readonly WorkbenchEntry[],
  loadedCounts: Record<WorkbenchDirection, number>,
  stationNameOf: (stationSourceId: string) => string,
): Set<WorkbenchDirection> {
  const overridden = new Set<WorkbenchDirection>();
  for (const value of ['down', 'up'] as const) {
    if (loadedCounts[value] === 0) {
      continue;
    }
    const currentCount = entries.filter(
      (entry) => resolveTripDirection(entry.trip, line, stationNameOf) === value,
    ).length;
    if (currentCount === 0) {
      overridden.add(value);
    }
  }
  return overridden;
}

function buildLinePayload(
  line: TransitLineSnapshot,
  entries: WorkbenchEntry[],
  poolConfigs: Record<WorkbenchDirection, PoolConfig>,
  stationNameOf: (stationSourceId: string) => string,
  overriddenDirections: ReadonlySet<WorkbenchDirection> = new Set(),
  rules: Record<WorkbenchDirection, WorkbenchRule[]> = { down: [], up: [] },
) {
  const departureTimesByDirection: Record<WorkbenchDirection, string[]> = { down: [], up: [] };
  const entryCountByDirection: Record<WorkbenchDirection, number> = { down: 0, up: 0 };
  const specialTripsByDirection: Record<
    WorkbenchDirection,
    Record<string, { serviceNature?: string; routeNote?: string; stationNames?: string[] }>
  > = { down: {}, up: {} };
  const fullStationNamesByDirection: Record<WorkbenchDirection, string[]> = {
    down: line.stationSourceIds.map(stationNameOf),
    up: [...line.stationSourceIds].reverse().map(stationNameOf),
  };
  const tripLabelsByDirection: Record<WorkbenchDirection, Record<string, string>> = {
    down: {},
    up: {},
  };

  for (const entry of entries) {
    const entryDirection = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    const departure = toClockTime(firstDepartureOrUndefined(entry.stops));
    if (!departure) {
      continue;
    }
    entryCountByDirection[entryDirection] += 1;
    departureTimesByDirection[entryDirection].push(departure);
    // 自动抽取的标签也随线路保存，重开后才与保存前一致；
    // 但只有手动标签参与“占用后当天不再抽取”，来源由 resolveEntryLabelSource 在读取时还原。
    if (entry.label.trim()) {
      tripLabelsByDirection[entryDirection][departure] = entry.label.trim();
    }
    // 特殊种别/短交路/备注写入线路规则，供没有班次实例时地图时刻表直接展示。
    const serviceNature = entry.trip.serviceNature?.trim();
    const routeNote = entry.trip.routeNote?.trim();
    const servedStationNames = entry.stops
      .filter((stop) => stop.isStop)
      .map((stop) => stop.stationName);
    const isShortTurn =
      servedStationNames.length >= 2 &&
      servedStationNames.length < fullStationNamesByDirection[entryDirection].length;
    if (serviceNature || routeNote || isShortTurn) {
      specialTripsByDirection[entryDirection][departure] = {
        ...(serviceNature ? { serviceNature } : {}),
        ...(routeNote ? { routeNote } : {}),
        ...(isShortTurn ? { stationNames: servedStationNames } : {}),
      };
    }
  }
  for (const value of ['down', 'up'] as const) {
    departureTimesByDirection[value] = Array.from(new Set(departureTimesByDirection[value])).sort();
  }

  // 某个方向在工作台里没有班次时保留原有发车配置，避免把尚未生成班次的规则清空；
  // 但如果该方向本次被删空，必须写入空配置才能真正删掉，否则保存后规则会重新展开。
  const coversDirection = (value: WorkbenchDirection) =>
    entryCountByDirection[value] > 0 || overriddenDirections.has(value);
  const originalTimes = resolveDirectionalDepartureTimes(line);
  const resolvedTimes: Record<WorkbenchDirection, string[] | undefined> = {
    down: coversDirection('down') ? departureTimesByDirection.down : originalTimes.down,
    up: coversDirection('up') ? departureTimesByDirection.up : originalTimes.up,
  };
  const toRulePayload = (rule: WorkbenchRule) => ({
    sourceText: rule.sourceText,
    startTime: rule.startTime,
    ...(rule.intervalMinutes !== undefined ? { intervalMinutes: rule.intervalMinutes } : {}),
    ...(rule.additionalDepartures !== undefined
      ? { additionalDepartures: rule.additionalDepartures }
      : {}),
  });
  // 工作台覆盖到的方向以当前规则列表为准；未覆盖的方向继续沿用线路原规则。
  // 方向被删空时不保留规则，否则重新打开会按规则把班次补回来。
  const resolvedRules = {
    down: coversDirection('down')
      ? entryCountByDirection.down > 0 && rules.down.length > 0
        ? rules.down.map(toRulePayload)
        : undefined
      : line.departureRulesByDirection?.down,
    up: coversDirection('up')
      ? entryCountByDirection.up > 0 && rules.up.length > 0
        ? rules.up.map(toRulePayload)
        : undefined
      : line.departureRulesByDirection?.up,
  };
  // 工作台没有覆盖到的方向沿用原特殊班次标注，避免保存后丢失。
  const resolvedSpecialTrips: Record<
    WorkbenchDirection,
    | Record<string, { serviceNature?: string; routeNote?: string; stationNames?: string[] }>
    | undefined
  > = {
    down: coversDirection('down')
      ? Object.keys(specialTripsByDirection.down).length
        ? specialTripsByDirection.down
        : undefined
      : line.specialTripsByDirection?.down,
    up: coversDirection('up')
      ? Object.keys(specialTripsByDirection.up).length
        ? specialTripsByDirection.up
        : undefined
      : line.specialTripsByDirection?.up,
  };

  return {
    mode: line.mode,
    name: line.name,
    operationStatus: line.operationStatus ?? 'operating',
    // 旧数据里可能存有非十六进制颜色，交给后端校验会整条线路保存失败。
    color: /^#[0-9a-f]{6}$/iu.test(line.color ?? '') ? line.color : undefined,
    maxCarCount: line.maxCarCount,
    routeMode: line.routeMode,
    routeNodes: line.routeNodes,
    stationSourceIds: line.stationSourceIds,
    oneWayStops: line.stops.flatMap((stop) =>
      stop.oneWay ? [{ stationSourceId: stop.stationSourceId, oneWay: stop.oneWay }] : [],
    ),
    stopDirections: line.stops.map((stop) => ({
      stationSourceId: stop.stationSourceId,
      down: stop.stopDirections?.down ?? true,
      up: stop.stopDirections?.up ?? true,
    })),
    stopLocationRefs: line.stops.flatMap((stop) =>
      stop.stopLocationRefs?.length
        ? [{ stationSourceId: stop.stationSourceId, refs: stop.stopLocationRefs }]
        : [],
    ),
    segmentPaths: line.segmentPaths,
    operator: line.operator,
    fare: line.fare,
    firstBus: line.firstLastBus?.first,
    lastBus: line.firstLastBus?.last,
    departureTimes: resolvedTimes.down,
    departureTimesByDirection: resolvedTimes,
    departureRulesByDirection: resolvedRules,
    tripLabelConfigByDirection: {
      down: toPoolConfigPayload(poolConfigs.down),
      up: toPoolConfigPayload(poolConfigs.up),
    },
    tripLabelsByDirection: {
      down: Object.keys(tripLabelsByDirection.down).length ? tripLabelsByDirection.down : undefined,
      up: Object.keys(tripLabelsByDirection.up).length ? tripLabelsByDirection.up : undefined,
    },
    specialTripsByDirection: resolvedSpecialTrips,
    operatingDateRule: line.operatingDateRule,
    bookingUrl: line.bookingUrl,
  };
}

function toPoolConfig(selection?: {
  poolIds: string[];
  mode: 'sequential' | 'random';
}): PoolConfig {
  return selection ? { poolIds: [...selection.poolIds], mode: selection.mode } : emptyPoolConfig;
}

function toPoolConfigPayload(config: PoolConfig) {
  return config.poolIds.length > 0 ? { poolIds: config.poolIds, mode: config.mode } : undefined;
}

function firstDeparture(stops: readonly WorkbenchTripStop[]): number {
  return firstDepartureOrUndefined(stops) ?? Number.MAX_SAFE_INTEGER;
}

function firstDepartureOrUndefined(stops: readonly WorkbenchTripStop[]): number | undefined {
  return stops[0]?.departureMinutes ?? stops[0]?.arrivalMinutes;
}

function buildNewTripStops(
  stationNames: string[],
  segmentMinutes: number[],
  departureMinutes: number,
): WorkbenchTripStop[] {
  let cursor = departureMinutes;
  return stationNames.map((stationName, index) => {
    if (index > 0) {
      cursor += segmentMinutes[index - 1] ?? 4;
    }
    const isLast = index === stationNames.length - 1;
    const arrival = cursor;
    // 首站按规则时刻直接发车，不应再额外增加停站，否则发车时间会整体后移一分钟。
    const departure = isLast ? undefined : index === 0 ? cursor : arrival + defaultDwellMinutes;
    if (departure !== undefined) {
      cursor = departure;
    }
    return {
      stationName,
      isStop: true,
      arrivalMinutes: arrival,
      departureMinutes: departure,
    };
  });
}

/**
 * 按短交路经停站裁剪规则展开项：保留首站到最后一个经停站，
 * 中间被跳过的站标记为“通过不停”。
 */
function restrictStopsToSpecial(
  stops: WorkbenchTripStop[],
  stationNames: readonly string[],
): WorkbenchTripStop[] {
  const wanted = new Set(stationNames);
  let lastWantedIndex = -1;
  stops.forEach((stop, index) => {
    if (wanted.has(stop.stationName)) {
      lastWantedIndex = index;
    }
  });
  if (lastWantedIndex < 0) {
    return stops;
  }
  return stops
    .slice(0, lastWantedIndex + 1)
    .map((stop) => (wanted.has(stop.stationName) ? { ...stop } : { ...stop, isStop: false }));
}

function inferServiceKind(
  mode: TransitLineSnapshot['mode'],
  fallback?: TicketableServiceKind,
): TicketableServiceKind {
  if (fallback) {
    return fallback;
  }
  if (mode === 'ferry') {
    return 'ferry';
  }
  if (mode === 'bus') {
    return 'coach';
  }
  return 'railway';
}

function clockToMinutes(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
}

interface ParsedDepartureRuleLine {
  sourceText: string;
  startTime: string;
  intervalMinutes?: number;
  additionalDepartures?: number;
  departureTimes: string[];
}

function expandRuleDepartureTimes(
  startTime: string,
  intervalMinutes: number | undefined,
  additionalDepartures: number | undefined,
): string[] {
  const start = clockToMinutes(startTime);
  if (start === undefined) {
    return [];
  }
  if (
    intervalMinutes === undefined ||
    intervalMinutes <= 0 ||
    additionalDepartures === undefined ||
    additionalDepartures <= 0
  ) {
    const single = toClockTime(start);
    return single ? [single] : [];
  }
  const times: string[] = [];
  for (let index = 0; index <= additionalDepartures; index += 1) {
    const formatted = toClockTime(start + intervalMinutes * index);
    if (formatted) {
      times.push(formatted);
    }
  }
  return Array.from(new Set(times)).sort();
}

/** 逐行解析发车时刻/批量规则，保留每一行对应的规则参数供后续管理。 */
export function parseDepartureRuleLines(value: string): {
  items: ParsedDepartureRuleLine[];
  error?: string;
} {
  const lines = value
    .split(/\r?\n|、|,|，/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { items: [], error: '请先填写发车时刻或规则。' };
  }
  const items: ParsedDepartureRuleLine[] = [];
  for (const line of lines) {
    const single = clockToMinutes(line);
    if (single !== undefined) {
      const formatted = toClockTime(single);
      if (formatted) {
        items.push({ sourceText: line, startTime: formatted, departureTimes: [formatted] });
      }
      continue;
    }
    const repeated = line.match(/^(\d{1,2}):(\d{2})\s*\+\s*(\d{1,2}):(\d{2})\s*\*\s*(\d{1,3})$/u);
    if (!repeated) {
      return { items: [], error: `无法识别“${line}”，请使用 HH:mm 或 HH:mm + HH:mm * N。` };
    }
    const start = clockToMinutes(`${repeated[1]}:${repeated[2]}`);
    const intervalMinutes = Number(repeated[3]) * 60 + Number(repeated[4]);
    const additionalDepartures = Number(repeated[5]);
    const startTime = start === undefined ? undefined : toClockTime(start);
    if (startTime === undefined || intervalMinutes <= 0 || additionalDepartures <= 0) {
      return { items: [], error: '发车规则的间隔或班次数无效。' };
    }
    items.push({
      sourceText: line,
      startTime,
      intervalMinutes,
      additionalDepartures,
      departureTimes: expandRuleDepartureTimes(startTime, intervalMinutes, additionalDepartures),
    });
  }
  return { items };
}

/** 从线路持久化的规则还原工作台可管理规则；单点规则不进入批量规则列表。 */
function buildLoadedRules(line: TransitLineSnapshot): Record<WorkbenchDirection, WorkbenchRule[]> {
  const build = (value: WorkbenchDirection, items?: TransitDepartureScheduleRule[]) =>
    (items ?? []).flatMap((item, index) => {
      const parsed = parseDepartureRuleLines(item.sourceText);
      const source = parsed.error ? undefined : parsed.items[0];
      const startTime = source?.startTime ?? item.startTime;
      const intervalMinutes = source?.intervalMinutes ?? item.intervalMinutes;
      const additionalDepartures = source?.additionalDepartures ?? item.additionalDepartures;
      if (intervalMinutes === undefined || additionalDepartures === undefined) {
        return [];
      }
      const departureTimes = expandRuleDepartureTimes(
        startTime,
        intervalMinutes,
        additionalDepartures,
      );
      if (departureTimes.length < 2) {
        return [];
      }
      return [
        {
          id: `rule_${value}_${index}_${startTime.replace(':', '')}_${additionalDepartures}`,
          sourceText: item.sourceText,
          startTime,
          intervalMinutes,
          additionalDepartures,
          departureTimes,
        },
      ];
    });
  return {
    down: build('down', line.departureRulesByDirection?.down),
    up: build('up', line.departureRulesByDirection?.up),
  };
}

/** 同一班次标签固定同色；无标签班次用灰色，避免和车辆配色混淆。 */
function resolveTripLabelColor(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return unlabeledTripColor;
  }
  let hash = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash = (Math.imul(hash, 31) + trimmed.charCodeAt(index)) | 0;
  }
  return tripColors[Math.abs(hash) % tripColors.length] ?? tripColors[0]!;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
