'use client';

import type {
  TicketableServiceKind,
  TransitDataRevision,
  TransitLineSnapshot,
  TransitTripLabelPool,
  TravelScheduleRevision,
  TravelTripInstance,
  TravelTripStopTime,
} from '@yct/contracts';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { resolveDirectionalDepartureTimes } from '../lib/transit-departure-editor';
import { collectStopTravelTimes } from '../lib/transit-segment-minutes';
import {
  getTransitTripLabelServiceDateKey,
  resolveTransitTripLabels,
} from '../lib/transit-trip-labels';
import { SecondaryPageHeader } from './app-shell';
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
  type WorkbenchDirection,
  type WorkbenchEdge,
  type WorkbenchLinkMode,
  type WorkbenchTool,
  type WorkbenchTripStop,
} from '../lib/transit-trip-workbench';
import {
  TransitTripRunChart,
  transitTripRunChartLayout,
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
  const [tool, setTool] = useState<WorkbenchTool>('pan');
  const [linkMode, setLinkMode] = useState<WorkbenchLinkMode>('none');
  const [viewport, setViewport] = useState({ start: 300, duration: 720 });
  const [poolConfigs, setPoolConfigs] = useState<Record<WorkbenchDirection, PoolConfig>>({
    down: emptyPoolConfig,
    up: emptyPoolConfig,
  });
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [ruleText, setRuleText] = useState('');
  const [status, setStatus] = useState('正在读取班次与线路数据');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [chartHeight, setChartHeight] = useState(640);
  const [scheduleRevisionId, setScheduleRevisionId] = useState('');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [stationScale, setStationScale] = useState(1);
  const [stationOffset, setStationOffset] = useState(0);
  const [labelsNeedRefresh, setLabelsNeedRefresh] = useState(false);
  const hasPrefilledLabelsRef = useRef(false);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const tripRowRefs = useRef(new Map<string, HTMLDivElement>());
  const entriesRef = useRef<WorkbenchEntry[]>([]);
  const duplicateTripsRef = useRef<WorkbenchEntry[]>([]);
  const undoStackRef = useRef<WorkbenchEntry[][]>([]);
  const redoStackRef = useRef<WorkbenchEntry[][]>([]);
  const keyboardHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

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
        const special =
          nextLine.specialTripsByDirection?.[tripDirection]?.[trip.departureTime];
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
    const draftEntries: WorkbenchEntry[] = [];
    if (sourceRevision && nextLine.departureTimesByDirection) {
      const downStationNames = nextLine.stationSourceIds.map(nameOfStation);
      const downSegments = resolveSegmentBaseMinutes({
        line: nextLine,
        stationSourceIds: nextLine.stationSourceIds,
        trips: existingEntries,
      });
      for (const value of ['down', 'up'] as const) {
        const times = nextLine.departureTimesByDirection?.[value] ?? [];
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
    const loadedEntries = [...existingEntries, ...draftEntries];
    // 标签随线路一起保存，重新打开时与保存前一致；改时刻后仍需重新分配。
    // 不在读取时重算自动标签，避免把用户手动删掉的标签又自动填回来。

    setRevision(nextRevision);
    setLine(nextLine);
    setPools(labelPools);
    setScheduleRevisionId(sourceRevision?.revisionId ?? '');
    setEntries(loadedEntries);
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
    undoStackRef.current = [];
    redoStackRef.current = [];
    setDataVersion((current) => current + 1);
  }, [normalizedRevisionId, normalizedLineSourceId]);

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

  const directionEntries = useMemo(() => {
    if (!line) {
      return [];
    }
    return entries
      .filter(
        (entry) =>
          resolveTripDirection(
            { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
            line,
            stationNameOf,
          ) === direction,
      )
      .sort((left, right) => firstDeparture(left.stops) - firstDeparture(right.stops));
  }, [direction, entries, line, stationNameOf]);

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
  const chartTop = transitTripRunChartLayout.top;
  const chartBottom = transitTripRunChartLayout.bottom;
  const stationPlotHeight = Math.max(80, chartHeight - chartTop - chartBottom);
  const baseRows = useMemo(
    () =>
      buildStationRows({
        stationSourceIds: chartStationIds,
        stationNameOf,
        segmentMinutes,
        top: chartTop,
        bottom: chartHeight - chartBottom,
      }),
    [chartBottom, chartHeight, chartStationIds, chartTop, segmentMinutes, stationNameOf],
  );
  const rows = useMemo(
    () =>
      baseRows.map((row) => ({
        ...row,
        y: chartTop + (row.y - chartTop) * stationScale - stationOffset,
        bandTop: chartTop + (row.bandTop - chartTop) * stationScale - stationOffset,
        bandBottom: chartTop + (row.bandBottom - chartTop) * stationScale - stationOffset,
      })),
    [baseRows, chartTop, stationOffset, stationScale],
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

  useEffect(() => {
    const ranges = entries
      .map((entry) => getTripMinuteRange(entry.stops))
      .filter((range): range is [number, number] => range !== null);
    if (ranges.length === 0) {
      return;
    }
    const earliest = Math.min(...ranges.map((range) => range[0]));
    const latest = Math.max(...ranges.map((range) => range[1]));
    setViewport({
      start: Math.max(0, Math.floor((earliest - 15) / 15) * 15),
      duration: Math.max(120, Math.ceil((latest - earliest + 30) / 30) * 30),
    });
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

  const pushHistory = () => {
    undoStackRef.current.push(cloneEntries(entriesRef.current));
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      return;
    }
    redoStackRef.current.push(cloneEntries(entriesRef.current));
    setEntries(previous);
    setDirty(true);
    setError('');
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) {
      return;
    }
    undoStackRef.current.push(cloneEntries(entriesRef.current));
    setEntries(next);
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

  const appendDepartures = () => {
    const parsed = parseDepartureRuleInput(ruleText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (!line) {
      return;
    }
    if (!scheduleRevisionId) {
      setError('当前没有可写入的班次数据版本，请先在班次后台导入一次班次。');
      return;
    }
    const existingTimes = new Set(
      directionEntries
        .map((entry) => toClockTime(firstDepartureOrUndefined(entry.stops)))
        .filter((value): value is string => Boolean(value)),
    );
    const nextEntries: WorkbenchEntry[] = [];
    const poolById = new Map(pools.map((pool) => [pool.id, pool]));
    for (const departureTime of parsed.departureTimes) {
      if (existingTimes.has(departureTime)) {
        continue;
      }
      const departureMinutes = clockToMinutes(departureTime);
      if (departureMinutes === undefined) {
        continue;
      }
      const stops = buildNewTripStops(
        directionStationNames,
        directionSegmentMinutes,
        departureMinutes,
      );
      const label = line.tripLabelsByDirection?.[direction]?.[departureTime] ?? '';
      nextEntries.push({
        clientId: `new_${Date.now().toString(36)}_${departureTime.replace(':', '')}`,
        revisionId: scheduleRevisionId,
        trip: {
          tripInstanceId: '',
          serviceKind: inferServiceKind(line.mode, entries[0]?.trip.serviceKind),
          serviceLabel: '',
          departureTime,
          lineName: line.name,
          stationNames: directionStationNames,
          availability: 'ticketing_unavailable',
        },
        stops,
        label,
        labelSource: resolveEntryLabelSource(label, poolConfigs[direction].poolIds, poolById),
        isNew: true,
      });
    }
    if (nextEntries.length === 0) {
      setError('这些发车时刻已经存在，没有新增班次。');
      return;
    }
    markLabelsStale();
    pushHistory();
    setEntries((current) => [...current, ...nextEntries]);
    setRuleText('');
    setDirty(true);
    setStatus(`已追加 ${nextEntries.length} 个班次草稿`);
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
    const delta = nextMinutes - currentMinutes;
    markLabelsStale();
    updateEntry(entry.clientId, (current) => ({
      ...current,
      stops: current.stops.map((stop) => ({
        ...stop,
        arrivalMinutes: stop.arrivalMinutes === undefined ? undefined : stop.arrivalMinutes + delta,
        departureMinutes:
          stop.departureMinutes === undefined ? undefined : stop.departureMinutes + delta,
      })),
    }));
  };

  const zoomChart = (factor: number) => {
    setViewport((current) => {
      const duration = Math.min(1440, Math.max(30, current.duration * factor));
      const center = current.start + current.duration / 2;
      return { duration, start: Math.min(Math.max(center - duration / 2, -120), 24 * 60) };
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
    setViewport({
      start: Math.max(0, Math.floor((earliest - 15) / 15) * 15),
      duration: Math.max(120, Math.ceil((latest - earliest + 30) / 30) * 30),
    });
  };

  const handleSelectTripFromChart = (tripId: string) => {
    if (!line) {
      return;
    }
    const entry = entries.find((item) => item.clientId === tripId);
    if (!entry) {
      return;
    }
    setSelectedId(tripId);
    // 图上点到反向班次时，列表跟着切到对应方向。
    const entryDirection = resolveTripDirection(
      { stationNames: entry.stops.map((stop) => stop.stationName), stopTimes: [] },
      line,
      stationNameOf,
    );
    setDirection((current) => (current === entryDirection ? current : entryDirection));
  };

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

  const save = async () => {
    if (!line || !revision) {
      return;
    }
    if (labelsNeedRefresh) {
      setError('班次时刻已改动，请先重新按标签池分配班次标签，再保存。');
      return;
    }
    for (const entry of entries) {
      if (entry.stops.length < 2) {
        setError(
          `班次 ${formatWorkbenchMinutes(firstDepartureOrUndefined(entry.stops))} 至少需要两个站。`,
        );
        return;
      }
      if (firstDepartureOrUndefined(entry.stops) === undefined) {
        setError('存在没有发车时刻的班次，请先在运行图或列表里补齐。');
        return;
      }
    }
    setSaving(true);
    setError('');
    setStatus('正在保存班次与线路配置');
    try {
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
          body: JSON.stringify(buildLinePayload(line, entries, poolConfigs, stationNameOf)),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? '保存线路发车规则失败。');
      }

      await loadData();
      setStatus('已保存班次工作台的全部改动');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  // 快捷键与线路工作台保持一致：保存、撤销/重做、工具切换。
  keyboardHandlerRef.current = (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && (event.key.toLowerCase() === 's' || event.key === 'Enter')) {
      event.preventDefault();
      if (!saving) {
        void save();
      }
      return;
    }
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'v' || key === '1') {
      setTool('pan');
      return;
    }
    if (key === 'm' || key === '2') {
      setTool('move');
      return;
    }
    if (key === 'd' || key === '3') {
      setTool('draw');
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyboardHandlerRef.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      <main className="transit-visual-editor is-loading">
        <span className="material-symbols-outlined" aria-hidden="true">
          timeline
        </span>
        <p>{status}</p>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <a href={backToAdminHref}>返回线路与班次后台</a>
      </main>
    );
  }

  return (
    <main className="transit-visual-editor transit-trip-editor">
      <SecondaryPageHeader
        backHref={backToAdminPath}
        secondaryActions={
          <>
            <button
              className="secondary-action-button"
              type="button"
              disabled={saving}
              onClick={() => void loadData()}
            >
              放弃改动
            </button>
            <button
              className="secondary-action-button is-primary"
              type="button"
              title="保存（Ctrl + S）"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                save
              </span>
              <span>{saving ? '正在保存' : '保存'}</span>
            </button>
          </>
        }
        title={`${line.name} · 班次工作台`}
      />

      <div className="transit-trip-chart-host" ref={chartHostRef}>
        <TransitTripRunChart
          height={chartHeight}
          leftGutter={panelCollapsed ? 150 : undefined}
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
          onViewportChange={setViewport}
        />
      </div>

      <aside
        className={`transit-visual-route-panel transit-trip-panel${panelCollapsed ? ' is-collapsed' : ''}`}
        aria-label="班次列表"
      >
        <div className="transit-visual-route-panel-heading">
          <div>
            <strong>{line.name}</strong>
            <span>{`${directionEntries.length} 个班次 · ${dirty ? '有未保存改动' : '已同步'}`}</span>
          </div>
          <div className="transit-visual-route-panel-actions">
            <fieldset className="segmented-control transit-trip-direction" aria-label="方向">
              <div>
                {(['down', 'up'] as const).map((value) => (
                  <button
                    className={direction === value ? 'is-active' : ''}
                    type="button"
                    aria-pressed={direction === value}
                    key={value}
                    onClick={() => {
                      setDirection(value);
                      setSelectedId(null);
                    }}
                  >
                    {value === 'down' ? '正向' : '反向'}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="transit-visual-route-panel-toggle"
              type="button"
              aria-expanded={!panelCollapsed}
              aria-label={panelCollapsed ? '展开班次列表' : '收起班次列表'}
              title={panelCollapsed ? '展开班次列表' : '收起班次列表'}
              onClick={() => setPanelCollapsed((current) => !current)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {panelCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
          </div>
        </div>
        {panelCollapsed ? null : (
          <div className="transit-trip-panel-body">
            <div className="transit-trip-pool-row">
              <button
                className="transit-trip-pool-button"
                type="button"
                onClick={() => setPoolDialogOpen(true)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  inventory_2
                </span>
                <span>
                  {selectedPoolCount > 0 ? `已选 ${selectedPoolCount} 个标签池` : '选择班次标签池'}
                </span>
              </button>
              <button
                className={`transit-trip-pool-action${labelsNeedRefresh ? ' is-warning' : ''}`}
                type="button"
                title={
                  labelsNeedRefresh
                    ? '班次已改动，点击重新按标签池分配班次标签'
                    : '按标签池预填班次标签'
                }
                disabled={pools.length === 0 || entries.length === 0}
                onClick={prefillLabels}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  auto_awesome
                </span>
              </button>
            </div>
            <div className="transit-trip-list">
              {directionEntries.length === 0 ? (
                <p className="muted">
                  {entries.length > 0
                    ? '这个方向还没有班次；运行图仍会显示另一方向的班次。'
                    : '这个方向还没有班次。用左下角的新规则输入框追加。'}
                </p>
              ) : (
                directionEntries.map((entry) => {
                  const departure = firstDepartureOrUndefined(entry.stops);
                  return (
                    <div
                      className={
                        entry.clientId === selectedId
                          ? 'transit-trip-row is-selected'
                          : 'transit-trip-row'
                      }
                      key={entry.clientId}
                      ref={(node) => {
                        if (node) {
                          tripRowRefs.current.set(entry.clientId, node);
                        } else {
                          tripRowRefs.current.delete(entry.clientId);
                        }
                      }}
                      style={
                        {
                          '--trip-color': resolveTripLabelColor(entry.label),
                        } as CSSProperties
                      }
                    >
                      <div className="transit-trip-row-main">
                        <input
                          type="time"
                          aria-label="首站发车时间"
                          value={toClockTime(departure) ?? ''}
                          onChange={(event) => updateDeparture(entry, event.currentTarget.value)}
                        />
                        <input
                          type="text"
                          aria-label="班次标签"
                          placeholder="标签"
                          maxLength={40}
                          value={entry.label}
                          onChange={(event) => {
                            // 事件对象在 React 状态更新回调执行前就会被置空，必须先取值再更新。
                            const value = event.currentTarget.value;
                            updateEntry(
                              entry.clientId,
                              (current) => ({
                                ...current,
                                label: value,
                                labelSource: value.trim() ? 'manual' : undefined,
                              }),
                              true,
                              false,
                            );
                          }}
                        />
                        <button
                          className={entry.clientId === selectedId ? 'is-active' : ''}
                          type="button"
                          aria-pressed={entry.clientId === selectedId}
                          title={entry.clientId === selectedId ? '取消编辑' : '设为编辑中的班次'}
                          onClick={() =>
                            setSelectedId((current) =>
                              current === entry.clientId ? null : entry.clientId,
                            )
                          }
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            edit
                          </span>
                        </button>
                      </div>
                      <div className="transit-trip-row-meta">
                        <input
                          type="text"
                          aria-label="班次性质"
                          placeholder="性质（如快速/直达）"
                          maxLength={20}
                          value={entry.trip.serviceNature ?? ''}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            // 性质由线路特殊班次标注承载，不必物化班次实例。
                            updateEntry(
                              entry.clientId,
                              (current) => ({
                                ...current,
                                trip: { ...current.trip, serviceNature: value },
                              }),
                              true,
                              false,
                            );
                          }}
                        />
                        <input
                          type="text"
                          aria-label="班次备注"
                          placeholder="备注（如并入说明）"
                          maxLength={200}
                          value={entry.trip.routeNote ?? ''}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateEntry(
                              entry.clientId,
                              (current) => ({
                                ...current,
                                trip: { ...current.trip, routeNote: value },
                              }),
                              true,
                              false,
                            );
                          }}
                        />
                        <span className="muted">
                          {entry.fromRule
                            ? '规则'
                            : entry.isNew
                              ? '新增'
                              : (entry.trip.tripCode ?? '未编号')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <p
              className={error ? 'transit-trip-panel-status is-error' : 'transit-trip-panel-status'}
            >
              {error || status}
            </p>
          </div>
        )}
      </aside>

      <div className="transit-trip-bottom" aria-label="班次工具">
        <div className="transit-trip-rule">
          <input
            type="text"
            value={ruleText}
            placeholder="例如：06:30 或 06:30 + 00:05 * 5"
            onChange={(event) => setRuleText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                appendDepartures();
              }
            }}
          />
          <button type="button" onClick={appendDepartures}>
            确认追加
          </button>
        </div>
        <nav className="transit-visual-toolbar transit-trip-toolbar" aria-label="运行图工具">
          {(
            [
              ['pan', 'pan_tool', '手型工具（V）：拖动平移，滚轮缩放时间轴'],
              ['draw', 'add_location_alt', '画图工具（D）：左键加点 / 右键或长按移除'],
              ['move', 'open_with', '拖移端点（M）：首末点纵向拖动改交路'],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              className={tool === value ? 'is-active' : ''}
              type="button"
              aria-pressed={tool === value}
              title={label}
              key={value}
              onClick={() => {
                setTool(value);
                if (value !== 'pan' && !selectedId) {
                  setStatus('请先在左侧列表里选中一个班次，再在运行图上编辑锚点。');
                }
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {icon}
              </span>
            </button>
          ))}
          <span className="transit-visual-toolbar-divider" aria-hidden="true" />
          {(
            [
              ['none', 'radio_button_unchecked', '不连锁'],
              ['before', 'first_page', '之前'],
              ['after', 'last_page', '之后'],
              ['all', 'select_all', '全部'],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              className={linkMode === value ? 'is-active' : ''}
              type="button"
              aria-label={label}
              aria-pressed={linkMode === value}
              title={`连锁：${label}`}
              key={value}
              onClick={() => setLinkMode(value)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {icon}
              </span>
            </button>
          ))}
          <span className="transit-visual-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            disabled={!selectedId}
            title="恢复自动时刻：按线路基准区间用时与默认停站重算"
            onClick={handleRestoreAutoTiming}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              settings_backup_restore
            </span>
          </button>
        </nav>
      </div>

      <div
        className="transit-visual-viewport-controls transit-trip-viewport-controls"
        aria-label="运行图缩放"
      >
        <button type="button" title="放大" onClick={() => zoomChart(0.8)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
        </button>
        <button type="button" title="缩小" onClick={() => zoomChart(1.25)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            remove
          </span>
        </button>
        <button type="button" title="放大站间距（Shift + 滚轮）" onClick={() => zoomStations(1.2)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            unfold_more
          </span>
        </button>
        <button type="button" title="缩小站间距（Shift + 滚轮）" onClick={() => zoomStations(0.8)}>
          <span className="material-symbols-outlined" aria-hidden="true">
            unfold_less
          </span>
        </button>
        <button type="button" title="适配全部班次" onClick={fitChart}>
          <span className="material-symbols-outlined" aria-hidden="true">
            fit_screen
          </span>
        </button>
      </div>

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
    </main>
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
        ? Math.max(0, stop.departureMinutes - stop.arrivalMinutes)
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

function buildLinePayload(
  line: TransitLineSnapshot,
  entries: WorkbenchEntry[],
  poolConfigs: Record<WorkbenchDirection, PoolConfig>,
  stationNameOf: (stationSourceId: string) => string,
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

  // 某个方向在工作台里没有班次时保留原有发车配置，避免把尚未生成班次的规则清空。
  const originalTimes = resolveDirectionalDepartureTimes(line);
  const resolvedTimes: Record<WorkbenchDirection, string[] | undefined> = {
    down: entryCountByDirection.down > 0 ? departureTimesByDirection.down : originalTimes.down,
    up: entryCountByDirection.up > 0 ? departureTimesByDirection.up : originalTimes.up,
  };
  const resolvedRules = {
    down: entryCountByDirection.down > 0 ? undefined : line.departureRulesByDirection?.down,
    up: entryCountByDirection.up > 0 ? undefined : line.departureRulesByDirection?.up,
  };
  // 工作台没有覆盖到的方向沿用原特殊班次标注，避免保存后丢失。
  const resolvedSpecialTrips: Record<
    WorkbenchDirection,
    Record<string, { serviceNature?: string; routeNote?: string; stationNames?: string[] }> | undefined
  > = {
    down:
      entryCountByDirection.down > 0
        ? Object.keys(specialTripsByDirection.down).length
          ? specialTripsByDirection.down
          : undefined
        : line.specialTripsByDirection?.down,
    up:
      entryCountByDirection.up > 0
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
  return stops.slice(0, lastWantedIndex + 1).map((stop) =>
    wanted.has(stop.stationName) ? { ...stop } : { ...stop, isStop: false },
  );
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

export function parseDepartureRuleInput(value: string): {
  departureTimes: string[];
  error?: string;
} {
  const lines = value
    .split(/\r?\n|、|,|，/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { departureTimes: [], error: '请先填写发车时刻或规则。' };
  }
  const departureTimes: string[] = [];
  for (const line of lines) {
    const single = clockToMinutes(line);
    if (single !== undefined) {
      const formatted = toClockTime(single);
      if (formatted) {
        departureTimes.push(formatted);
      }
      continue;
    }
    const repeated = line.match(/^(\d{1,2}):(\d{2})\s*\+\s*(\d{1,2}):(\d{2})\s*\*\s*(\d{1,3})$/u);
    if (!repeated) {
      return {
        departureTimes: [],
        error: `无法识别“${line}”，请使用 HH:mm 或 HH:mm + HH:mm * N。`,
      };
    }
    const start = clockToMinutes(`${repeated[1]}:${repeated[2]}`);
    const interval = Number(repeated[3]) * 60 + Number(repeated[4]);
    const count = Number(repeated[5]);
    if (start === undefined || interval <= 0 || count <= 0) {
      return { departureTimes: [], error: '发车规则的间隔或班次数无效。' };
    }
    for (let index = 0; index <= count; index += 1) {
      const formatted = toClockTime(start + interval * index);
      if (formatted) {
        departureTimes.push(formatted);
      }
    }
  }
  return { departureTimes: Array.from(new Set(departureTimes)).sort() };
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
