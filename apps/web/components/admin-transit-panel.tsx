'use client';

import type {
  MapGeometry,
  MapMarkerSnapshot,
  TileProviderDescriptor,
  TransitDataRevision,
  TransitDataRevisionStatus,
  TransitDepartureScheduleRule,
  TransitItemApprovalStatus,
  TransitLineRouteNodeSnapshot,
  TransitModeProfile,
  TravelScheduleQueryResult,
  TravelScheduleRevision,
  TravelScheduleRevisionStatus,
  TravelScheduleServiceProfile,
  TravelTripInstance,
} from '@yct/contracts';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { EmbeddedMapLocationPicker } from './embedded-map-location-picker';

type TransitStatusFilter = TransitItemApprovalStatus | 'all' | 'todo' | 'legacy';
type ScheduleStatusFilter = TransitItemApprovalStatus | 'all' | 'todo' | 'legacy';
type TransitModeFilter = TransitDataRevision['lines'][number]['mode'] | 'all';
type ScheduleServiceFilter = TravelScheduleServiceProfile['kind'] | 'all';
type TransitAdminSection = 'lines' | 'trips' | 'profiles';
type TransitLineEditorTab = 'basic' | 'route' | 'schedule';
type TransitRevisionStation = TransitDataRevision['stations'][number];
type TransitRevisionLine = TransitDataRevision['lines'][number];
type MapMarker = MapMarkerSnapshot['markers'][number];

interface TransitLineEditorSubmitPayload {
  mode: TransitRevisionLine['mode'];
  name: string;
  color?: string;
  routeMode?: TransitRevisionLine['routeMode'];
  routeNodes?: TransitLineRouteNodeSnapshot[];
  stationSourceIds: string[];
  oneWayStops?: Array<{
    stationSourceId: string;
    oneWay?: 'up' | 'down' | null;
  }>;
  segmentPaths?: TransitRevisionLine['segmentPaths'];
  operator?: string;
  fare?: string;
  firstBus?: string;
  lastBus?: string;
  departureTimes?: string[];
  departureRules?: TransitDepartureScheduleRule[];
  operatingDateRule?: string;
  bookingUrl?: string;
}

interface TransitLineEditorSubmitResult {
  error: string | null;
  lineSourceId?: string;
}

interface TransitStationPoiBindingOption {
  coordinate: [number, number];
  marker: MapMarker;
}

interface TransitStationPoiBindingRef {
  categoryId?: string;
  label: string;
  markerId: string;
}

interface TransitStationAuditContextMarker {
  coordinate: [number, number];
  distanceBlocks: number;
  marker: MapMarker;
  relation: 'bound-poi' | 'poi' | 'road' | 'station' | 'nearby';
}

interface TransitLineRouteNodeDraft {
  id: string;
  kind: 'station' | 'waypoint';
  stationSourceId: string;
  xText: string;
  zText: string;
  direction: 'both' | 'up' | 'down';
  boundPoiMarkerId?: string;
  boundPoiLabel?: string;
}

const transitStatusFilterOptions: Array<{ value: TransitStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'legacy', label: '旧有数据' },
  { value: 'todo', label: '待处理' },
  { value: 'imported', label: '已导入' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];
const scheduleStatusFilterOptions: Array<{ value: ScheduleStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'legacy', label: '旧有数据' },
  { value: 'todo', label: '待处理' },
  { value: 'imported', label: '已导入' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

const transitRejectReasonPresets = [
  '线路或站点数量与来源预期不一致，请重新检查导入源。',
  '存在断点、孤立站点或缺少世界坐标，暂不适合发布。',
  '线路方向、单向停靠或站点顺序需要人工复核。',
  '校验提醒较多，请补充数据说明后再提交审核。',
];

const scheduleRejectReasonPresets = [
  '班次数量或来源文件与预期不一致，请重新检查数据源。',
  '存在未接入服务、空班次或缺少站点信息，暂不适合发布。',
  '停运公告或服务日期规则需要补充后再提交审核。',
  '票务可售性、库存或票种配置需要先完成核对。',
];

const supportedTransitModeProfiles: TransitModeProfile[] = [
  { mode: 'metro', label: '地铁', color: '#2584E8', icon: 'subway', sortOrder: 0, enabled: true },
  { mode: 'tram', label: '有轨', color: '#C64255', icon: 'tram', sortOrder: 1, enabled: true },
  {
    mode: 'bus',
    label: '公交',
    color: '#F59B22',
    icon: 'directions_bus',
    sortOrder: 2,
    enabled: true,
  },
  {
    mode: 'coach',
    label: '客运',
    color: '#8BBF35',
    icon: 'airport_shuttle',
    sortOrder: 3,
    enabled: true,
  },
  {
    mode: 'ferry',
    label: '轮渡',
    color: '#168AA5',
    icon: 'directions_boat',
    sortOrder: 4,
    enabled: true,
  },
  {
    mode: 'railway',
    label: '地方铁路',
    color: '#8B5E34',
    icon: 'train',
    sortOrder: 5,
    enabled: true,
  },
  { mode: 'custom', label: '线路', color: '#168F78', icon: 'route', sortOrder: 6, enabled: true },
];

const supportedTravelServiceProfiles: TravelScheduleServiceProfile[] = [
  {
    kind: 'coach',
    label: '客运',
    color: '#8BBF35',
    icon: 'airport_shuttle',
    sortOrder: 0,
    enabled: true,
  },
  {
    kind: 'ferry',
    label: '轮渡',
    color: '#168AA5',
    icon: 'directions_boat',
    sortOrder: 1,
    enabled: true,
  },
  {
    kind: 'flight',
    label: '航班',
    color: '#6657D9',
    icon: 'flight_takeoff',
    sortOrder: 2,
    enabled: true,
  },
  {
    kind: 'railway',
    label: '地方铁路',
    color: '#8B5E34',
    icon: 'train',
    sortOrder: 3,
    enabled: true,
  },
  { kind: 'custom', label: '自定义', color: '#168F78', icon: 'route', sortOrder: 4, enabled: true },
];

export function AdminTransitPanel() {
  const [revisions, setRevisions] = useState<TransitDataRevision[]>([]);
  const [modeProfiles, setModeProfiles] = useState<TransitModeProfile[]>([]);
  const [serviceProfiles, setServiceProfiles] = useState<TravelScheduleServiceProfile[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<TravelScheduleQueryResult | null>(null);
  const [scheduleRevisions, setScheduleRevisions] = useState<TravelScheduleRevision[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [statusText, setStatusText] = useState('正在读取线路');
  const [profileStatusText, setProfileStatusText] = useState('正在读取交通方式配置');
  const [serviceProfileStatusText, setServiceProfileStatusText] =
    useState('正在读取可排班服务配置');
  const [scheduleStatusText, setScheduleStatusText] = useState('正在读取统一班次摘要');
  const [scheduleRevisionStatusText, setScheduleRevisionStatusText] = useState('正在读取班次');
  const [tilePreviewTemplate, setTilePreviewTemplate] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [serviceProfileBusy, setServiceProfileBusy] = useState(false);
  const [scheduleRevisionBusy, setScheduleRevisionBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<TransitAdminSection>('lines');
  const [statusFilter, setStatusFilter] = useState<TransitStatusFilter>('all');
  const [modeFilter, setModeFilter] = useState<TransitModeFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedTransitLineKeys, setSelectedTransitLineKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<ScheduleStatusFilter>('all');
  const [scheduleServiceFilter, setScheduleServiceFilter] = useState<ScheduleServiceFilter>('all');
  const [scheduleQuery, setScheduleQuery] = useState('');
  const [selectedScheduleTripKeys, setSelectedScheduleTripKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [stationEditTarget, setStationEditTarget] = useState<{
    revision: TransitDataRevision;
    station: TransitRevisionStation;
  } | null>(null);
  const [lineEditTarget, setLineEditTarget] = useState<{
    revision: TransitDataRevision;
    line: TransitRevisionLine;
  } | null>(null);
  const [lineCreateTarget, setLineCreateTarget] = useState<TransitDataRevision | null>(null);
  const [scheduleTripEditTarget, setScheduleTripEditTarget] = useState<{
    revision: TravelScheduleRevision;
    trip: TravelTripInstance;
  } | null>(null);
  const [scheduleTripCreateTarget, setScheduleTripCreateTarget] =
    useState<TravelScheduleRevision | null>(null);

  const sortedRevisions = useMemo(
    () => [...revisions].sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    [revisions],
  );

  const sortedScheduleRevisions = useMemo(
    () =>
      [...scheduleRevisions].sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    [scheduleRevisions],
  );

  const allTransitLineRows = useMemo(
    () => sortedRevisions.flatMap((revision) => revision.lines.map((line) => ({ line, revision }))),
    [sortedRevisions],
  );
  const allScheduleTripRows = useMemo(
    () =>
      sortedScheduleRevisions.flatMap((revision) =>
        revision.trips.map((trip) => ({ revision, trip })),
      ),
    [sortedScheduleRevisions],
  );
  const statusCounts = useMemo(() => {
    const counts = new Map<TransitItemApprovalStatus, number>();
    for (const { line, revision } of allTransitLineRows) {
      const status = getTransitLineItemApprovalStatus(line, revision);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [allTransitLineRows]);
  const scheduleStatusCounts = useMemo(() => {
    const counts = new Map<TransitItemApprovalStatus, number>();
    for (const { revision, trip } of allScheduleTripRows) {
      const status = getScheduleTripItemApprovalStatus(trip, revision);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [allScheduleTripRows]);
  const transitModeFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部交通方式' },
      ...Array.from(new Set(allTransitLineRows.map(({ line }) => line.mode)))
        .sort((left, right) => formatTransitMode(left).localeCompare(formatTransitMode(right)))
        .map((mode) => ({ value: mode, label: formatTransitMode(mode) })),
    ],
    [allTransitLineRows],
  );
  const scheduleServiceFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部服务类型' },
      ...Array.from(new Set(allScheduleTripRows.map(({ trip }) => trip.serviceKind)))
        .sort((left, right) =>
          formatScheduleServiceKind(left).localeCompare(formatScheduleServiceKind(right)),
        )
        .map((kind) => ({ value: kind, label: formatScheduleServiceKind(kind) })),
    ],
    [allScheduleTripRows],
  );

  const transitLineRows = useMemo(
    () =>
      allTransitLineRows.filter(({ line, revision }) => {
        const itemStatus = getTransitLineItemApprovalStatus(line, revision);
        if (!matchesTransitItemStatusFilter(itemStatus, revision, statusFilter)) {
          return false;
        }

        if (modeFilter !== 'all' && line.mode !== modeFilter) {
          return false;
        }

        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalizeSearchText(
          [
            revision.revisionId,
            revision.datasetId,
            revision.sourceProviderId,
            revision.sourcePath,
            revision.sourceFiles.join(' '),
            transitItemApprovalStatusLabel(itemStatus),
            line.name,
            formatTransitMode(line.mode),
            line.operator,
            line.fare,
            line.stationSourceIds
              .map(
                (stationSourceId) =>
                  revision.stations.find((station) => station.sourceId === stationSourceId)?.name,
              )
              .filter(Boolean)
              .join(' '),
            revision.validation.errors.join(' '),
            revision.validation.warnings.join(' '),
            getValidationIssues(revision)
              .map((issue) => `${issue.message}${issue.examples.join(' ')}`)
              .join(' '),
          ].join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [allTransitLineRows, modeFilter, query, statusFilter],
  );
  const scheduleTripRows = useMemo(
    () =>
      allScheduleTripRows.filter(({ revision, trip }) => {
        const itemStatus = getScheduleTripItemApprovalStatus(trip, revision);
        if (!matchesScheduleItemStatusFilter(itemStatus, revision, trip, scheduleStatusFilter)) {
          return false;
        }

        if (scheduleServiceFilter !== 'all' && trip.serviceKind !== scheduleServiceFilter) {
          return false;
        }

        const normalizedQuery = normalizeSearchText(scheduleQuery);
        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalizeSearchText(
          [
            revision.revisionId,
            revision.scheduleServiceId,
            revision.sourceFiles.join(' '),
            transitItemApprovalStatusLabel(itemStatus),
            trip.lineName,
            trip.tripCode,
            trip.stationNames.join(' '),
            trip.operator,
            revision.validation.errors.join(' '),
            revision.validation.warnings.join(' '),
            getScheduleValidationIssues(revision)
              .map((issue) => `${issue.message}${issue.examples.join(' ')}`)
              .join(' '),
          ].join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [allScheduleTripRows, scheduleQuery, scheduleServiceFilter, scheduleStatusFilter],
  );
  const hasActiveTransitFilters =
    statusFilter !== 'all' || modeFilter !== 'all' || query.trim().length > 0;
  const hasActiveScheduleFilters =
    scheduleStatusFilter !== 'all' ||
    scheduleServiceFilter !== 'all' ||
    scheduleQuery.trim().length > 0;
  const currentSectionStatusText = useMemo(() => {
    if (activeSection === 'lines') {
      return statusText;
    }
    if (activeSection === 'trips') {
      return scheduleRevisionStatusText;
    }
    return `${profileStatusText} · ${serviceProfileStatusText}`;
  }, [
    activeSection,
    profileStatusText,
    scheduleRevisionStatusText,
    serviceProfileStatusText,
    statusText,
  ]);
  const preferredTransitDraftRevision = useMemo(
    () => sortedRevisions.find(canEditTransitRevisionLines) ?? null,
    [sortedRevisions],
  );
  const preferredScheduleDraftRevision = useMemo(
    () => sortedScheduleRevisions.find(canEditTravelScheduleRevisionTrips) ?? null,
    [sortedScheduleRevisions],
  );
  const selectedTransitLineRows = useMemo(
    () =>
      transitLineRows.filter(({ line, revision }) =>
        selectedTransitLineKeys.has(getTransitLineSelectionKey(revision.revisionId, line.sourceId)),
      ),
    [selectedTransitLineKeys, transitLineRows],
  );
  const selectedTransitLineBatches = useMemo(
    () => getUniqueBatchesFromLineRows(selectedTransitLineRows),
    [selectedTransitLineRows],
  );
  const isAllVisibleTransitLinesSelected =
    transitLineRows.length > 0 &&
    transitLineRows.every(({ line, revision }) =>
      selectedTransitLineKeys.has(getTransitLineSelectionKey(revision.revisionId, line.sourceId)),
    );
  const selectedScheduleTripRows = useMemo(
    () =>
      scheduleTripRows.filter(({ revision, trip }) =>
        selectedScheduleTripKeys.has(
          getScheduleTripSelectionKey(revision.revisionId, trip.tripInstanceId),
        ),
      ),
    [scheduleTripRows, selectedScheduleTripKeys],
  );
  const selectedScheduleTripBatches = useMemo(
    () => getUniqueBatchesFromTripRows(selectedScheduleTripRows),
    [selectedScheduleTripRows],
  );
  const isAllVisibleScheduleTripsSelected =
    scheduleTripRows.length > 0 &&
    scheduleTripRows.every(({ revision, trip }) =>
      selectedScheduleTripKeys.has(
        getScheduleTripSelectionKey(revision.revisionId, trip.tripInstanceId),
      ),
    );

  useEffect(() => {
    setSelectedTransitLineKeys((current) => {
      if (current.size === 0) {
        return current;
      }

      const existingKeys = new Set(
        revisions.flatMap((revision) =>
          revision.lines.map((line) =>
            getTransitLineSelectionKey(revision.revisionId, line.sourceId),
          ),
        ),
      );
      const next = new Set(Array.from(current).filter((key) => existingKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [revisions]);

  useEffect(() => {
    setSelectedScheduleTripKeys((current) => {
      if (current.size === 0) {
        return current;
      }

      const existingKeys = new Set(
        scheduleRevisions.flatMap((revision) =>
          revision.trips.map((trip) =>
            getScheduleTripSelectionKey(revision.revisionId, trip.tripInstanceId),
          ),
        ),
      );
      const next = new Set(Array.from(current).filter((key) => existingKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [scheduleRevisions]);

  const toggleTransitLineSelection = (revisionId: string, lineSourceId: string) => {
    const key = getTransitLineSelectionKey(revisionId, lineSourceId);
    setSelectedTransitLineKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleVisibleTransitLineSelection = () => {
    setSelectedTransitLineKeys((current) => {
      const next = new Set(current);
      for (const { line, revision } of transitLineRows) {
        const key = getTransitLineSelectionKey(revision.revisionId, line.sourceId);
        if (isAllVisibleTransitLinesSelected) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  };

  const toggleScheduleTripSelection = (revisionId: string, tripInstanceId: string) => {
    const key = getScheduleTripSelectionKey(revisionId, tripInstanceId);
    setSelectedScheduleTripKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleVisibleScheduleTripSelection = () => {
    setSelectedScheduleTripKeys((current) => {
      const next = new Set(current);
      for (const { revision, trip } of scheduleTripRows) {
        const key = getScheduleTripSelectionKey(revision.revisionId, trip.tripInstanceId);
        if (isAllVisibleScheduleTripsSelected) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  };

  const loadRevisions = async () => {
    const response = await fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: TransitDataRevision[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '交通数据后台暂不可用');
      return;
    }

    setRevisions(data.items ?? []);
    const lineCount = (data.items ?? []).reduce(
      (count, revision) => count + revision.lines.length,
      0,
    );
    setStatusText(lineCount > 0 ? `已读取 ${lineCount} 条线路` : '暂无线路');
  };

  useEffect(() => {
    void Promise.all([
      loadRevisions(),
      loadModeProfiles(),
      loadServiceProfiles(),
      loadScheduleSummary(),
      loadScheduleRevisions(),
      loadTilePreviewConfig(),
      loadMapMarkers(),
    ]);
  }, []);

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
  };

  const loadMapMarkers = async () => {
    const response = await fetch(appPath('/api/map/markers'), { cache: 'no-store' });
    const data = (await response.json()) as {
      snapshot?: MapMarkerSnapshot;
    };
    if (!response.ok) {
      return;
    }

    setMapMarkers(data.snapshot?.markers ?? []);
  };

  const loadModeProfiles = async () => {
    const response = await fetch(appPath('/api/admin/transit/mode-profiles'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as { items?: TransitModeProfile[]; message?: string };
    if (!response.ok) {
      setProfileStatusText(data.message ?? '交通方式配置暂不可用');
      return;
    }

    setModeProfiles(data.items ?? []);
    setProfileStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个交通方式` : '暂无交通方式配置',
    );
  };

  const loadServiceProfiles = async () => {
    const response = await fetch(appPath('/api/admin/travel/service-profiles'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      items?: TravelScheduleServiceProfile[];
      message?: string;
    };
    if (!response.ok) {
      setServiceProfileStatusText(data.message ?? '可排班服务配置暂不可用');
      return;
    }

    setServiceProfiles(data.items ?? []);
    setServiceProfileStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个可排班服务` : '暂无可排班服务配置',
    );
  };

  const loadScheduleSummary = async () => {
    const response = await fetch(appPath('/api/travel/schedules?timeScope=all'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      item?: TravelScheduleQueryResult;
      meta?: { message?: string };
      message?: string;
    };
    if (!response.ok) {
      setScheduleStatusText(data.meta?.message ?? data.message ?? '统一班次数据暂不可用');
      return;
    }

    setScheduleSummary(data.item ?? null);
    setScheduleStatusText(
      data.item
        ? `当前读取 ${data.item.trips.length} 个班次，${data.item.stationOptions.length} 个站点选项${
            data.meta?.message ? ` · ${data.meta.message}` : ''
          }`
        : '暂无统一班次数据',
    );
  };

  const loadScheduleRevisions = async () => {
    const response = await fetch(appPath('/api/admin/travel/schedule-revisions'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      items?: TravelScheduleRevision[];
      message?: string;
    };
    if (!response.ok) {
      setScheduleRevisionStatusText(data.message ?? '班次后台暂不可用');
      return;
    }

    setScheduleRevisions(data.items ?? []);
    const tripCount = (data.items ?? []).reduce(
      (count, revision) => count + revision.trips.length,
      0,
    );
    setScheduleRevisionStatusText(tripCount > 0 ? `已读取 ${tripCount} 个班次` : '暂无班次');
  };

  const importLatest = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/transit/datasets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProviderId: 'legacy-yct',
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '导入交通数据失败');
        return;
      }

      setStatusText('已从旧站导入最新交通数据');
      await loadRevisions();
    } finally {
      setIsBusy(false);
    }
  };

  const importCurrentScheduleRevision = async () => {
    setScheduleRevisionBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/travel/schedule-revisions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProviderId: 'runtime-travel-schedules',
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setScheduleRevisionStatusText(data.message ?? '导入班次快照失败');
        return;
      }

      setScheduleRevisionStatusText('已导入当前统一班次快照');
      await Promise.all([loadScheduleRevisions(), loadScheduleSummary()]);
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const runSelectedTransitLineAction = async (
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
  ) => {
    if (selectedTransitLineRows.length === 0) {
      setStatusText('请先选择线路。');
      return;
    }

    let successCount = 0;
    for (const { line, revision } of selectedTransitLineRows) {
      const ok = await runTransitLineItemAction(
        revision.revisionId,
        line.sourceId,
        action,
        action === 'reject' ? '后台批量退回' : undefined,
      );
      if (ok) {
        successCount += 1;
      }
    }

    setSelectedTransitLineKeys(new Set());
    setStatusText(`已处理 ${successCount}/${selectedTransitLineRows.length} 条线路`);
  };

  const runTransitLineItemAction = async (
    revisionId: string,
    lineSourceId: string,
    action: 'submit' | 'approve' | 'publish' | 'archive' | 'reject',
    reason?: string,
  ): Promise<boolean> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/transit/datasets/${encodeURIComponent(
            revisionId,
          )}/lines/${encodeURIComponent(lineSourceId)}`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason }),
        },
      );
      const data = (await response.json()) as TransitDataRevision & { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '线路审批操作失败');
        return false;
      }

      setRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const updateTransitStationCoordinate = async (
    revisionId: string,
    stationSourceId: string,
    payload: {
      x: number;
      z: number;
      boundPoiRefs?: TransitStationPoiBindingRef[];
      boundPoiLabel?: string;
      boundPoiMarkerId?: string;
    },
  ): Promise<string | null> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/stations/${encodeURIComponent(
            stationSourceId,
          )}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as TransitDataRevision & { message?: string };
      if (!response.ok) {
        return data.message ?? '站点坐标修正失败';
      }

      setRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setLineEditTarget((current) =>
        current?.revision.revisionId === data.revisionId ? { ...current, revision: data } : current,
      );
      setLineCreateTarget((current) => (current?.revisionId === data.revisionId ? data : current));
      setStatusText(`已修正站点坐标：${stationSourceId}`);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const saveTransitLine = async (
    revisionId: string,
    payload: TransitLineEditorSubmitPayload,
    lineSourceId?: string,
  ): Promise<TransitLineEditorSubmitResult> => {
    setIsBusy(true);
    try {
      const previousLineSourceIds = new Set(
        revisions
          .find((revision) => revision.revisionId === revisionId)
          ?.lines.map((line) => line.sourceId) ?? [],
      );
      const response = await fetch(
        lineSourceId
          ? appPath(
              `/api/admin/transit/datasets/${encodeURIComponent(
                revisionId,
              )}/lines/${encodeURIComponent(lineSourceId)}`,
            )
          : appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/lines`),
        {
          method: lineSourceId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as TransitDataRevision & { message?: string };
      if (!response.ok) {
        return {
          error: data.message ?? (lineSourceId ? '线路保存失败' : '线路新增失败'),
        };
      }

      setRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setStatusText(lineSourceId ? `已更新线路：${payload.name}` : `已新增线路：${payload.name}`);
      const savedLineSourceId =
        lineSourceId ??
        data.lines.find((candidate) => !previousLineSourceIds.has(candidate.sourceId))?.sourceId;
      return { error: null, lineSourceId: savedLineSourceId };
    } finally {
      setIsBusy(false);
    }
  };

  const deleteTransitLineByAdmin = async (
    revisionId: string,
    line: TransitRevisionLine,
  ): Promise<void> => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/transit/datasets/${encodeURIComponent(
            revisionId,
          )}/lines/${encodeURIComponent(line.sourceId)}`,
        ),
        {
          method: 'DELETE',
        },
      );
      const data = (await response.json()) as TransitDataRevision & { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '删除线路失败');
        return;
      }

      setRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setStatusText(`已删除线路：${line.name}`);
    } finally {
      setIsBusy(false);
    }
  };

  const runSelectedScheduleTripAction = async (
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
  ) => {
    if (selectedScheduleTripRows.length === 0) {
      setScheduleRevisionStatusText('请先选择班次。');
      return;
    }

    let successCount = 0;
    for (const { revision, trip } of selectedScheduleTripRows) {
      const ok = await runScheduleTripItemAction(
        revision.revisionId,
        trip.tripInstanceId,
        action,
        action === 'reject' ? '后台批量退回' : undefined,
      );
      if (ok) {
        successCount += 1;
      }
    }

    setSelectedScheduleTripKeys(new Set());
    setScheduleRevisionStatusText(
      `已处理 ${successCount}/${selectedScheduleTripRows.length} 个班次`,
    );
  };

  const runScheduleTripItemAction = async (
    revisionId: string,
    tripInstanceId: string,
    action: 'submit' | 'approve' | 'publish' | 'archive' | 'reject',
    reason?: string,
  ): Promise<boolean> => {
    setScheduleRevisionBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/travel/schedule-revisions/${encodeURIComponent(
            revisionId,
          )}/trips/${encodeURIComponent(tripInstanceId)}`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason }),
        },
      );
      const data = (await response.json()) as TravelScheduleRevision & { message?: string };
      if (!response.ok) {
        setScheduleRevisionStatusText(data.message ?? '班次审批操作失败');
        return false;
      }

      setScheduleRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      return true;
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const updateScheduleTrip = async (
    revisionId: string,
    tripInstanceId: string,
    patch: Partial<
      Pick<
        TravelTripInstance,
        | 'tripCode'
        | 'serviceKind'
        | 'departureTime'
        | 'arrivalTime'
        | 'arrivalDayOffset'
        | 'lineName'
        | 'routeNote'
        | 'stationNames'
        | 'originStationName'
        | 'destinationStationName'
        | 'fareText'
        | 'operator'
        | 'bookingUrl'
        | 'runtimeText'
        | 'gateText'
        | 'vehicleTypeText'
        | 'vehicleModelText'
        | 'operatingDays'
        | 'availability'
        | 'sourcePath'
      >
    >,
  ): Promise<string | null> => {
    setScheduleRevisionBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/travel/schedule-revisions/${encodeURIComponent(
            revisionId,
          )}/trips/${encodeURIComponent(tripInstanceId)}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      const data = (await response.json()) as TravelScheduleRevision & { message?: string };
      if (!response.ok) {
        return data.message ?? '班次修正失败';
      }

      setScheduleRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setScheduleRevisionStatusText(`已修正班次：${tripInstanceId}`);
      await loadScheduleSummary();
      return null;
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const createScheduleTrip = async (
    revisionId: string,
    payload: Pick<
      TravelTripInstance,
      'serviceKind' | 'departureTime' | 'lineName' | 'stationNames'
    > &
      Partial<
        Pick<
          TravelTripInstance,
          | 'tripCode'
          | 'arrivalTime'
          | 'arrivalDayOffset'
          | 'routeNote'
          | 'originStationName'
          | 'destinationStationName'
          | 'fareText'
          | 'operator'
          | 'bookingUrl'
          | 'runtimeText'
          | 'gateText'
          | 'vehicleTypeText'
          | 'vehicleModelText'
          | 'operatingDays'
          | 'availability'
          | 'sourcePath'
        >
      > &
      Pick<TravelTripInstance, 'availability'>,
  ): Promise<string | null> => {
    setScheduleRevisionBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/trips`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as TravelScheduleRevision & { message?: string };
      if (!response.ok) {
        return data.message ?? '班次新增失败';
      }

      setScheduleRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setScheduleRevisionStatusText(`已新增班次：${payload.lineName}`);
      await loadScheduleSummary();
      return null;
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const deleteScheduleTrip = async (
    revisionId: string,
    trip: TravelTripInstance,
  ): Promise<void> => {
    setScheduleRevisionBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/travel/schedule-revisions/${encodeURIComponent(
            revisionId,
          )}/trips/${encodeURIComponent(trip.tripInstanceId)}`,
        ),
        {
          method: 'DELETE',
        },
      );
      const data = (await response.json()) as TravelScheduleRevision & { message?: string };
      if (!response.ok) {
        setScheduleRevisionStatusText(data.message ?? '删除班次失败');
        return;
      }

      setScheduleRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setScheduleRevisionStatusText(`已删除班次：${formatTripDiffLabel(trip)}`);
      await loadScheduleSummary();
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setModeFilter('all');
    setQuery('');
  };

  const resetScheduleFilters = () => {
    setScheduleStatusFilter('all');
    setScheduleServiceFilter('all');
    setScheduleQuery('');
  };

  const updateModeProfileDraft = (
    mode: TransitModeProfile['mode'],
    patch: Partial<TransitModeProfile>,
  ) => {
    setModeProfiles((current) =>
      current.map((profile) => (profile.mode === mode ? { ...profile, ...patch } : profile)),
    );
  };

  const updateServiceProfileDraft = (
    kind: TravelScheduleServiceProfile['kind'],
    patch: Partial<TravelScheduleServiceProfile>,
  ) => {
    setServiceProfiles((current) =>
      current.map((profile) => (profile.kind === kind ? { ...profile, ...patch } : profile)),
    );
  };

  const addModeProfileDraft = () => {
    const nextProfile = supportedTransitModeProfiles.find(
      (candidate) => !modeProfiles.some((profile) => profile.mode === candidate.mode),
    );
    if (!nextProfile) {
      setProfileStatusText('所有受支持的交通方式都已添加。');
      return;
    }

    setModeProfiles((current) => [...current, { ...nextProfile }]);
    setProfileStatusText(`已添加 ${nextProfile.label}，保存后生效`);
  };

  const removeModeProfileDraft = (profile: TransitModeProfile) => {
    if (modeProfiles.length <= 1) {
      setProfileStatusText('至少保留一个交通方式。');
      return;
    }
    if (!window.confirm(`确认删除交通方式“${profile.label}”？保存后生效。`)) {
      return;
    }

    setModeProfiles((current) => current.filter((item) => item.mode !== profile.mode));
    setProfileStatusText(`已移除 ${profile.label}，保存后生效`);
  };

  const addServiceProfileDraft = () => {
    const nextProfile = supportedTravelServiceProfiles.find(
      (candidate) => !serviceProfiles.some((profile) => profile.kind === candidate.kind),
    );
    if (!nextProfile) {
      setServiceProfileStatusText('所有受支持的可排班服务都已添加。');
      return;
    }

    setServiceProfiles((current) => [...current, { ...nextProfile }]);
    setServiceProfileStatusText(`已添加 ${nextProfile.label}，保存后生效`);
  };

  const removeServiceProfileDraft = (profile: TravelScheduleServiceProfile) => {
    if (serviceProfiles.length <= 1) {
      setServiceProfileStatusText('至少保留一个可排班服务。');
      return;
    }
    if (!window.confirm(`确认删除可排班服务“${profile.label}”？保存后生效。`)) {
      return;
    }

    setServiceProfiles((current) => current.filter((item) => item.kind !== profile.kind));
    setServiceProfileStatusText(`已移除 ${profile.label}，保存后生效`);
  };

  const saveModeProfiles = async () => {
    setProfileBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/transit/mode-profiles'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modes: modeProfiles.map(({ mode, label, color, icon, sortOrder, enabled }) => ({
            mode,
            label,
            color,
            icon,
            sortOrder,
            enabled,
          })),
        }),
      });
      const data = (await response.json()) as { items?: TransitModeProfile[]; message?: string };
      if (!response.ok) {
        setProfileStatusText(data.message ?? '保存交通方式配置失败');
        return;
      }

      setModeProfiles(data.items ?? []);
      setProfileStatusText('交通方式配置已保存');
    } finally {
      setProfileBusy(false);
    }
  };

  const saveServiceProfiles = async () => {
    setServiceProfileBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/travel/service-profiles'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: serviceProfiles.map(({ kind, label, color, icon, sortOrder, enabled }) => ({
            kind,
            label,
            color,
            icon,
            sortOrder,
            enabled,
          })),
        }),
      });
      const data = (await response.json()) as {
        items?: TravelScheduleServiceProfile[];
        message?: string;
      };
      if (!response.ok) {
        setServiceProfileStatusText(data.message ?? '保存可排班服务配置失败');
        return;
      }

      setServiceProfiles(data.items ?? []);
      setServiceProfileStatusText('可排班服务配置已保存');
    } finally {
      setServiceProfileBusy(false);
    }
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-transit-title">
      <div className="section-heading">
        <h1 id="admin-transit-title">线路与班次后台</h1>
        <span className="muted">{currentSectionStatusText}</span>
      </div>
      <fieldset className="segmented-control admin-page-segmented-control">
        <legend>线路与班次后台系列</legend>
        <div>
          <button
            className={activeSection === 'lines' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'lines'}
            onClick={() => setActiveSection('lines')}
          >
            线路列表
          </button>
          <button
            className={activeSection === 'trips' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'trips'}
            onClick={() => setActiveSection('trips')}
          >
            班次列表
          </button>
          <button
            className={activeSection === 'profiles' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'profiles'}
            onClick={() => setActiveSection('profiles')}
          >
            服务配置
          </button>
        </div>
      </fieldset>

      {activeSection === 'lines' ? (
        <>
          <div className="admin-report-summary transit-admin-summary" aria-label="线路审批状态摘要">
            <TransitAdminMetric
              label="已导入"
              value={statusCounts.get('imported') ?? 0}
              tone={(statusCounts.get('imported') ?? 0) > 0 ? 'accent' : undefined}
            />
            <TransitAdminMetric
              label="待审核"
              value={statusCounts.get('pending_review') ?? 0}
              tone={(statusCounts.get('pending_review') ?? 0) > 0 ? 'warning' : undefined}
            />
            <TransitAdminMetric
              label="待发布"
              value={statusCounts.get('approved') ?? 0}
              tone={(statusCounts.get('approved') ?? 0) > 0 ? 'accent' : undefined}
            />
            <TransitAdminMetric label="已发布" value={statusCounts.get('published') ?? 0} />
            <TransitAdminMetric label="已归档" value={statusCounts.get('archived') ?? 0} />
            <TransitAdminMetric label="当前结果" value={transitLineRows.length} />
          </div>

          <div className="admin-toolbar transit-admin-toolbar" aria-label="线路操作与筛选">
            <button
              className="secondary-action-button is-primary"
              type="button"
              disabled={isBusy}
              onClick={importLatest}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                download
              </span>
              <span>从旧站导入最新线路</span>
            </button>
            <label>
              <span>状态</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.currentTarget.value as TransitStatusFilter)
                }
              >
                {transitStatusFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>交通方式</span>
              <select
                value={modeFilter}
                onChange={(event) => setModeFilter(event.currentTarget.value as TransitModeFilter)}
              >
                {transitModeFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="transit-admin-search">
              <span>搜索</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="线路、站点、运营方、来源批次"
              />
            </label>
            <button type="button" disabled={!hasActiveTransitFilters} onClick={resetFilters}>
              重置筛选
            </button>
          </div>

          <TransitLineEntityList
            isBusy={isBusy}
            isAllVisibleSelected={isAllVisibleTransitLinesSelected}
            rows={transitLineRows}
            selectedCount={selectedTransitLineRows.length}
            selectedBatchCount={selectedTransitLineBatches.length}
            selectedKeys={selectedTransitLineKeys}
            onCreateLine={() => {
              if (preferredTransitDraftRevision) {
                setLineCreateTarget(preferredTransitDraftRevision);
              } else {
                setStatusText('当前没有可写入的线路数据容器，请先导入一次线路或解除归档。');
              }
            }}
            onBatchAction={(action) => void runSelectedTransitLineAction(action)}
            onClearSelection={() => setSelectedTransitLineKeys(new Set())}
            onDeleteLine={(revision, line) => {
              if (window.confirm(`确认删除线路 ${line.name}？已发布线路会转为归档。`)) {
                void deleteTransitLineByAdmin(revision.revisionId, line);
              }
            }}
            onEditLine={(revision, line) => setLineEditTarget({ revision, line })}
            onItemAction={(revision, line, action) =>
              void runTransitLineItemAction(
                revision.revisionId,
                line.sourceId,
                action,
                action === 'reject' ? '后台退回' : undefined,
              )
            }
            onToggleSelected={toggleTransitLineSelection}
            onToggleVisibleSelected={toggleVisibleTransitLineSelection}
          />
        </>
      ) : null}

      {activeSection === 'trips' ? (
        <>
          <TravelScheduleAdminSummary result={scheduleSummary} statusText={scheduleStatusText} />
          <div className="admin-report-summary transit-admin-summary" aria-label="班次审批状态摘要">
            <TransitAdminMetric
              label="已导入"
              value={scheduleStatusCounts.get('imported') ?? 0}
              tone={(scheduleStatusCounts.get('imported') ?? 0) > 0 ? 'accent' : undefined}
            />
            <TransitAdminMetric
              label="待审核"
              value={scheduleStatusCounts.get('pending_review') ?? 0}
              tone={(scheduleStatusCounts.get('pending_review') ?? 0) > 0 ? 'warning' : undefined}
            />
            <TransitAdminMetric
              label="待发布"
              value={scheduleStatusCounts.get('approved') ?? 0}
              tone={(scheduleStatusCounts.get('approved') ?? 0) > 0 ? 'accent' : undefined}
            />
            <TransitAdminMetric label="已发布" value={scheduleStatusCounts.get('published') ?? 0} />
            <TransitAdminMetric label="已归档" value={scheduleStatusCounts.get('archived') ?? 0} />
            <TransitAdminMetric label="当前结果" value={scheduleTripRows.length} />
          </div>
          <div className="admin-toolbar transit-admin-toolbar" aria-label="班次操作与筛选">
            <button
              className="secondary-action-button is-primary"
              type="button"
              disabled={scheduleRevisionBusy}
              onClick={importCurrentScheduleRevision}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                inventory
              </span>
              <span>导入当前班次快照</span>
            </button>
            <label>
              <span>状态</span>
              <select
                value={scheduleStatusFilter}
                onChange={(event) =>
                  setScheduleStatusFilter(event.currentTarget.value as ScheduleStatusFilter)
                }
              >
                {scheduleStatusFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>服务类型</span>
              <select
                value={scheduleServiceFilter}
                onChange={(event) =>
                  setScheduleServiceFilter(event.currentTarget.value as ScheduleServiceFilter)
                }
              >
                {scheduleServiceFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="transit-admin-search">
              <span>搜索</span>
              <input
                value={scheduleQuery}
                onChange={(event) => setScheduleQuery(event.currentTarget.value)}
                placeholder="线路、班次号、站点、运营方、来源批次"
              />
            </label>
            <button
              type="button"
              disabled={!hasActiveScheduleFilters}
              onClick={resetScheduleFilters}
            >
              重置筛选
            </button>
          </div>
          <ScheduleTripEntityList
            isBusy={scheduleRevisionBusy}
            isAllVisibleSelected={isAllVisibleScheduleTripsSelected}
            rows={scheduleTripRows}
            selectedCount={selectedScheduleTripRows.length}
            selectedBatchCount={selectedScheduleTripBatches.length}
            selectedKeys={selectedScheduleTripKeys}
            onCreateTrip={() => {
              if (preferredScheduleDraftRevision) {
                setScheduleTripCreateTarget(preferredScheduleDraftRevision);
              } else {
                setScheduleRevisionStatusText(
                  '当前没有可写入的班次数据容器，请先导入一次班次或解除归档。',
                );
              }
            }}
            onBatchAction={(action) => void runSelectedScheduleTripAction(action)}
            onClearSelection={() => setSelectedScheduleTripKeys(new Set())}
            onDeleteTrip={(revision, trip) => {
              if (
                window.confirm(`确认删除班次 ${formatTripDiffLabel(trip)}？已发布班次会转为归档。`)
              ) {
                void deleteScheduleTrip(revision.revisionId, trip);
              }
            }}
            onEditTrip={(revision, trip) => setScheduleTripEditTarget({ revision, trip })}
            onItemAction={(revision, trip, action) =>
              void runScheduleTripItemAction(
                revision.revisionId,
                trip.tripInstanceId,
                action,
                action === 'reject' ? '后台退回' : undefined,
              )
            }
            onToggleSelected={toggleScheduleTripSelection}
            onToggleVisibleSelected={toggleVisibleScheduleTripSelection}
          />
        </>
      ) : null}

      {activeSection === 'profiles' ? (
        <section
          className="transit-mode-profile-editor"
          aria-labelledby="transit-mode-profile-title"
        >
          <div className="section-heading">
            <h2 id="transit-mode-profile-title">交通方式配置</h2>
            <div className="transit-entity-heading-actions">
              <span className="muted">{profileStatusText}</span>
              <button type="button" disabled={profileBusy} onClick={addModeProfileDraft}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  add
                </span>
                <span>添加交通方式</span>
              </button>
            </div>
          </div>
          <div className="transit-mode-profile-grid" aria-label="交通方式颜色、图标和排序">
            {modeProfiles.map((profile) => (
              <article className="transit-mode-profile-item" key={profile.mode}>
                <div className="transit-mode-profile-preview">
                  <span
                    className="material-symbols-outlined"
                    style={{ color: profile.color }}
                    aria-hidden="true"
                  >
                    {profile.icon}
                  </span>
                  <strong>{profile.label}</strong>
                </div>
                <label>
                  名称
                  <input
                    type="text"
                    value={profile.label}
                    maxLength={40}
                    onChange={(event) =>
                      updateModeProfileDraft(profile.mode, { label: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  颜色
                  <input
                    type="color"
                    value={profile.color}
                    onChange={(event) =>
                      updateModeProfileDraft(profile.mode, { color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  图标
                  <input
                    type="text"
                    value={profile.icon}
                    maxLength={80}
                    onChange={(event) =>
                      updateModeProfileDraft(profile.mode, { icon: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  排序
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={profile.sortOrder}
                    onChange={(event) =>
                      updateModeProfileDraft(profile.mode, {
                        sortOrder: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
                <label className="transit-mode-profile-toggle">
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(event) =>
                      updateModeProfileDraft(profile.mode, { enabled: event.currentTarget.checked })
                    }
                  />
                  <span>启用</span>
                </label>
                <button
                  className="transit-profile-delete-button"
                  type="button"
                  disabled={profileBusy || modeProfiles.length <= 1}
                  onClick={() => removeModeProfileDraft(profile)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                  <span>删除</span>
                </button>
              </article>
            ))}
          </div>
          <div className="admin-toolbar">
            <button
              className="secondary-action-button is-primary"
              type="button"
              disabled={profileBusy || modeProfiles.length === 0}
              onClick={saveModeProfiles}
            >
              保存交通方式配置
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === 'profiles' ? (
        <section
          className="transit-mode-profile-editor"
          aria-labelledby="travel-service-profile-title"
        >
          <div className="section-heading">
            <h2 id="travel-service-profile-title">可排班服务配置</h2>
            <div className="transit-entity-heading-actions">
              <span className="muted">{serviceProfileStatusText}</span>
              <button type="button" disabled={serviceProfileBusy} onClick={addServiceProfileDraft}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  add
                </span>
                <span>添加可排班服务</span>
              </button>
            </div>
          </div>
          <div className="transit-mode-profile-grid" aria-label="可排班服务颜色、图标和排序">
            {serviceProfiles.map((profile) => (
              <article className="transit-mode-profile-item" key={profile.kind}>
                <div className="transit-mode-profile-preview">
                  <span
                    className="material-symbols-outlined"
                    style={{ color: profile.color }}
                    aria-hidden="true"
                  >
                    {profile.icon}
                  </span>
                  <strong>{profile.label}</strong>
                </div>
                <label>
                  名称
                  <input
                    type="text"
                    value={profile.label}
                    maxLength={40}
                    onChange={(event) =>
                      updateServiceProfileDraft(profile.kind, { label: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  颜色
                  <input
                    type="color"
                    value={profile.color}
                    onChange={(event) =>
                      updateServiceProfileDraft(profile.kind, { color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  图标
                  <input
                    type="text"
                    value={profile.icon}
                    maxLength={80}
                    onChange={(event) =>
                      updateServiceProfileDraft(profile.kind, { icon: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  排序
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={profile.sortOrder}
                    onChange={(event) =>
                      updateServiceProfileDraft(profile.kind, {
                        sortOrder: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
                <label className="transit-mode-profile-toggle">
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(event) =>
                      updateServiceProfileDraft(profile.kind, {
                        enabled: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>启用</span>
                </label>
                <button
                  className="transit-profile-delete-button"
                  type="button"
                  disabled={serviceProfileBusy || serviceProfiles.length <= 1}
                  onClick={() => removeServiceProfileDraft(profile)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                  <span>删除</span>
                </button>
              </article>
            ))}
          </div>
          <div className="admin-toolbar">
            <button
              className="secondary-action-button is-primary"
              type="button"
              disabled={serviceProfileBusy || serviceProfiles.length === 0}
              onClick={saveServiceProfiles}
            >
              保存可排班服务配置
            </button>
          </div>
        </section>
      ) : null}
      {stationEditTarget ? (
        <TransitStationCoordinateDialog
          isBusy={isBusy}
          mapMarkers={mapMarkers}
          revision={stationEditTarget.revision}
          station={stationEditTarget.station}
          tilePreviewTemplate={tilePreviewTemplate}
          onClose={() => setStationEditTarget(null)}
          onSubmit={async (payload) => {
            const error = await updateTransitStationCoordinate(
              stationEditTarget.revision.revisionId,
              stationEditTarget.station.sourceId,
              payload,
            );
            if (!error) {
              setStationEditTarget(null);
            }
            return error;
          }}
        />
      ) : null}
      {lineEditTarget ? (
        <TransitLineEditorDialog
          isBusy={isBusy}
          modeProfiles={modeProfiles}
          revision={lineEditTarget.revision}
          line={lineEditTarget.line}
          tilePreviewTemplate={tilePreviewTemplate}
          onClose={() => setLineEditTarget(null)}
          onEditStation={(station) =>
            setStationEditTarget({ revision: lineEditTarget.revision, station })
          }
          onSubmit={(payload) =>
            saveTransitLine(
              lineEditTarget.revision.revisionId,
              payload,
              lineEditTarget.line.sourceId,
            )
          }
        />
      ) : null}
      {lineCreateTarget ? (
        <TransitLineEditorDialog
          isBusy={isBusy}
          modeProfiles={modeProfiles}
          revision={lineCreateTarget}
          tilePreviewTemplate={tilePreviewTemplate}
          onClose={() => setLineCreateTarget(null)}
          onEditStation={(station) => setStationEditTarget({ revision: lineCreateTarget, station })}
          onSubmit={(payload) => saveTransitLine(lineCreateTarget.revisionId, payload)}
        />
      ) : null}
      {scheduleTripEditTarget ? (
        <ScheduleTripEditDialog
          isBusy={scheduleRevisionBusy}
          revision={scheduleTripEditTarget.revision}
          serviceProfiles={serviceProfiles}
          trip={scheduleTripEditTarget.trip}
          onClose={() => setScheduleTripEditTarget(null)}
          onSubmit={async (patch) => {
            const error = await updateScheduleTrip(
              scheduleTripEditTarget.revision.revisionId,
              scheduleTripEditTarget.trip.tripInstanceId,
              patch,
            );
            if (!error) {
              setScheduleTripEditTarget(null);
            }
            return error;
          }}
        />
      ) : null}
      {scheduleTripCreateTarget ? (
        <ScheduleTripEditDialog
          isBusy={scheduleRevisionBusy}
          revision={scheduleTripCreateTarget}
          serviceProfiles={serviceProfiles}
          onClose={() => setScheduleTripCreateTarget(null)}
          onSubmit={async (patch) => {
            const error = await createScheduleTrip(
              scheduleTripCreateTarget.revisionId,
              patch as Pick<
                TravelTripInstance,
                'serviceKind' | 'departureTime' | 'lineName' | 'stationNames' | 'availability'
              > &
                Partial<
                  Pick<
                    TravelTripInstance,
                    | 'tripCode'
                    | 'arrivalTime'
                    | 'arrivalDayOffset'
                    | 'routeNote'
                    | 'originStationName'
                    | 'destinationStationName'
                    | 'fareText'
                    | 'operator'
                    | 'bookingUrl'
                    | 'runtimeText'
                    | 'gateText'
                    | 'vehicleTypeText'
                    | 'vehicleModelText'
                    | 'operatingDays'
                    | 'sourcePath'
                  >
                >,
            );
            if (!error) {
              setScheduleTripCreateTarget(null);
            }
            return error;
          }}
        />
      ) : null}
    </section>
  );
}

function TransitAdminMetric({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone?: 'accent' | 'warning'; value: number }>) {
  return (
    <span className={tone ? `admin-poi-metric is-${tone}` : 'admin-poi-metric'}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function TravelScheduleAdminSummary({
  result,
  statusText,
}: Readonly<{
  result: TravelScheduleQueryResult | null;
  statusText: string;
}>) {
  if (!result) {
    return <p className="muted">{statusText}</p>;
  }

  return (
    <div className="travel-schedule-admin-summary" aria-label="统一班次数据摘要">
      <div className="travel-schedule-admin-metrics">
        <TransitAdminMetric label="班次" value={result.trips.length} />
        <TransitAdminMetric label="站点选项" value={result.stationOptions.length} />
        <TransitAdminMetric label="公告" value={result.serviceNotices?.length ?? 0} />
        <TransitAdminMetric label="来源" value={result.sourceFiles.length} />
      </div>
      <div className="travel-schedule-admin-services" aria-label="服务接入状态">
        {result.services.map((service) => (
          <span data-status={service.status} key={service.serviceId}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {service.icon}
            </span>
            <strong>{service.label}</strong>
            <small>
              {formatScheduleServiceStatus(service.status)} · {service.tripCount} 班 /{' '}
              {service.stationCount} 站
            </small>
          </span>
        ))}
      </div>
      {result.sourceFiles.length > 0 ? (
        <p className="muted">班次来源：{result.sourceFiles.join('、')}</p>
      ) : null}
      <p className="muted">{statusText}</p>
    </div>
  );
}

function TransitLineEntityList({
  isAllVisibleSelected,
  isBusy,
  onBatchAction,
  onClearSelection,
  onCreateLine,
  onDeleteLine,
  onEditLine,
  onItemAction,
  onToggleSelected,
  onToggleVisibleSelected,
  rows,
  selectedCount,
  selectedKeys,
  selectedBatchCount,
}: Readonly<{
  isAllVisibleSelected: boolean;
  isBusy: boolean;
  onBatchAction: (action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive') => void;
  onClearSelection: () => void;
  onCreateLine: () => void;
  onDeleteLine: (revision: TransitDataRevision, line: TransitRevisionLine) => void;
  onEditLine: (revision: TransitDataRevision, line: TransitRevisionLine) => void;
  onItemAction: (
    revision: TransitDataRevision,
    line: TransitRevisionLine,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
  ) => void;
  onToggleSelected: (revisionId: string, lineSourceId: string) => void;
  onToggleVisibleSelected: () => void;
  rows: Array<{ line: TransitRevisionLine; revision: TransitDataRevision }>;
  selectedCount: number;
  selectedKeys: Set<string>;
  selectedBatchCount: number;
}>) {
  return (
    <section className="transit-entity-list" aria-label="线路完整列表">
      <div className="section-heading">
        <h2>线路列表</h2>
        <div className="transit-entity-heading-actions">
          <span className="muted">{`${rows.length} 条线路`}</span>
          <button type="button" disabled={isBusy} onClick={onCreateLine}>
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            <span>新增线路</span>
          </button>
        </div>
      </div>
      <div className="admin-content-bulk-bar transit-entity-bulk-bar" aria-label="线路批量操作">
        <label className="checkbox-row admin-content-bulk-select">
          <input
            type="checkbox"
            checked={isAllVisibleSelected}
            disabled={rows.length === 0}
            onChange={onToggleVisibleSelected}
          />
          <span>{`选择当前线路 ${selectedCount}/${rows.length}`}</span>
        </label>
        <span className="muted">
          {`已选 ${selectedCount} 条线路，涉及 ${selectedBatchCount} 个导入批次`}
        </span>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('submit')}
        >
          提交所选线路
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('approve')}
        >
          通过所选线路
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('reject')}
        >
          驳回所选线路
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('publish')}
        >
          发布所选线路
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('archive')}
        >
          归档所选线路
        </button>
        <button type="button" disabled={isBusy || selectedCount === 0} onClick={onClearSelection}>
          清空选择
        </button>
      </div>
      <div className="admin-content-list transit-entity-table">
        {rows.map(({ line, revision }) => {
          const canEdit = canEditTransitRevisionLines(revision);
          const isLegacy = isLegacyTransitRevision(revision);
          const itemStatus = getTransitLineItemApprovalStatus(line, revision);
          const selectionKey = getTransitLineSelectionKey(revision.revisionId, line.sourceId);
          return (
            <article
              className="admin-content-item transit-entity-row"
              key={`${revision.revisionId}-${line.sourceId}`}
            >
              <label className="admin-content-select" aria-label={`选择线路 ${line.name}`}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(selectionKey)}
                  onChange={() => onToggleSelected(revision.revisionId, line.sourceId)}
                />
              </label>
              <div>
                <div className="admin-poi-title-row">
                  <strong>{line.name}</strong>
                  <span className={`admin-poi-status-chip is-${itemStatus}`}>
                    {transitItemApprovalStatusLabel(itemStatus)}
                  </span>
                  {isLegacy ? (
                    <span className="admin-poi-status-chip is-legacy">旧有数据</span>
                  ) : null}
                </div>
                <p className="muted">
                  {formatTransitMode(line.mode)} · {line.stationSourceIds.length} 站 · 单向{' '}
                  {countOneWayStops(line)} ·{' '}
                  {(line.routeMode ?? defaultRouteModeForTransitMode(line.mode)) === 'road'
                    ? '沿路运行'
                    : '折线运行'}
                </p>
                <p className="muted">来源批次：{revision.revisionId}</p>
              </div>
              <div className="admin-content-actions">
                {itemStatus === 'imported' || itemStatus === 'rejected' ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onItemAction(revision, line, 'submit')}
                  >
                    提交
                  </button>
                ) : null}
                {itemStatus === 'pending_review' ? (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onItemAction(revision, line, 'approve')}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onItemAction(revision, line, 'reject')}
                    >
                      驳回
                    </button>
                  </>
                ) : null}
                {itemStatus === 'approved' ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onItemAction(revision, line, 'publish')}
                  >
                    发布
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy || !canEdit}
                  onClick={() => onEditLine(revision, line)}
                >
                  编辑线路
                </button>
                <button
                  type="button"
                  disabled={isBusy || !canEdit}
                  onClick={() => onDeleteLine(revision, line)}
                >
                  删除线路
                </button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 ? <p className="muted">当前筛选条件下没有线路。</p> : null}
      </div>
    </section>
  );
}

function ScheduleTripEntityList({
  isAllVisibleSelected,
  isBusy,
  onBatchAction,
  onClearSelection,
  onCreateTrip,
  onDeleteTrip,
  onEditTrip,
  onItemAction,
  onToggleSelected,
  onToggleVisibleSelected,
  rows,
  selectedCount,
  selectedKeys,
  selectedBatchCount,
}: Readonly<{
  isAllVisibleSelected: boolean;
  isBusy: boolean;
  onBatchAction: (action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive') => void;
  onClearSelection: () => void;
  onCreateTrip: () => void;
  onDeleteTrip: (revision: TravelScheduleRevision, trip: TravelTripInstance) => void;
  onEditTrip: (revision: TravelScheduleRevision, trip: TravelTripInstance) => void;
  onItemAction: (
    revision: TravelScheduleRevision,
    trip: TravelTripInstance,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive',
  ) => void;
  onToggleSelected: (revisionId: string, tripInstanceId: string) => void;
  onToggleVisibleSelected: () => void;
  rows: Array<{ revision: TravelScheduleRevision; trip: TravelTripInstance }>;
  selectedCount: number;
  selectedKeys: Set<string>;
  selectedBatchCount: number;
}>) {
  return (
    <section className="transit-entity-list" aria-label="班次完整列表">
      <div className="section-heading">
        <h2>班次列表</h2>
        <div className="transit-entity-heading-actions">
          <span className="muted">{`${rows.length} 个班次`}</span>
          <button type="button" disabled={isBusy} onClick={onCreateTrip}>
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            <span>新增班次</span>
          </button>
        </div>
      </div>
      <div className="admin-content-bulk-bar transit-entity-bulk-bar" aria-label="班次批量操作">
        <label className="checkbox-row admin-content-bulk-select">
          <input
            type="checkbox"
            checked={isAllVisibleSelected}
            disabled={rows.length === 0}
            onChange={onToggleVisibleSelected}
          />
          <span>{`选择当前班次 ${selectedCount}/${rows.length}`}</span>
        </label>
        <span className="muted">
          {`已选 ${selectedCount} 个班次，涉及 ${selectedBatchCount} 个导入批次`}
        </span>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('submit')}
        >
          提交所选班次
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('approve')}
        >
          通过所选班次
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('reject')}
        >
          驳回所选班次
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('publish')}
        >
          发布所选班次
        </button>
        <button
          type="button"
          disabled={isBusy || selectedCount === 0}
          onClick={() => onBatchAction('archive')}
        >
          归档所选班次
        </button>
        <button type="button" disabled={isBusy || selectedCount === 0} onClick={onClearSelection}>
          清空选择
        </button>
      </div>
      <div className="admin-content-list transit-entity-table">
        {rows.map(({ revision, trip }) => {
          const canEdit = canEditTravelScheduleRevisionTrips(revision);
          const isLegacy = isLegacyTravelTrip(trip) || isLegacyScheduleRevision(revision);
          const itemStatus = getScheduleTripItemApprovalStatus(trip, revision);
          const selectionKey = getScheduleTripSelectionKey(
            revision.revisionId,
            trip.tripInstanceId,
          );
          return (
            <article
              className="admin-content-item transit-entity-row"
              key={`${revision.revisionId}-${trip.tripInstanceId}`}
            >
              <label
                className="admin-content-select"
                aria-label={`选择班次 ${formatTripDiffLabel(trip)}`}
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(selectionKey)}
                  onChange={() => onToggleSelected(revision.revisionId, trip.tripInstanceId)}
                />
              </label>
              <div>
                <div className="admin-poi-title-row">
                  <strong>{formatTripDiffLabel(trip)}</strong>
                  <span className={`admin-poi-status-chip is-${itemStatus}`}>
                    {transitItemApprovalStatusLabel(itemStatus)}
                  </span>
                  {isLegacy ? (
                    <span className="admin-poi-status-chip is-legacy">旧有数据</span>
                  ) : null}
                </div>
                <p className="muted">
                  {trip.serviceLabel} · {trip.lineName} · {trip.stationNames.join(' → ')}
                </p>
                <p className="muted">来源批次：{revision.revisionId}</p>
              </div>
              <div className="admin-content-actions">
                {itemStatus === 'imported' || itemStatus === 'rejected' ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onItemAction(revision, trip, 'submit')}
                  >
                    提交
                  </button>
                ) : null}
                {itemStatus === 'pending_review' ? (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onItemAction(revision, trip, 'approve')}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onItemAction(revision, trip, 'reject')}
                    >
                      驳回
                    </button>
                  </>
                ) : null}
                {itemStatus === 'approved' ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onItemAction(revision, trip, 'publish')}
                  >
                    发布
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy || !canEdit}
                  onClick={() => onEditTrip(revision, trip)}
                >
                  编辑班次
                </button>
                <button
                  type="button"
                  disabled={isBusy || !canEdit}
                  onClick={() => onDeleteTrip(revision, trip)}
                >
                  删除班次
                </button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 ? <p className="muted">当前筛选条件下没有班次。</p> : null}
      </div>
    </section>
  );
}

function ScheduleTripEditDialog({
  isBusy,
  revision,
  serviceProfiles,
  trip,
  onClose,
  onSubmit,
}: Readonly<{
  isBusy: boolean;
  revision: TravelScheduleRevision;
  serviceProfiles: TravelScheduleServiceProfile[];
  trip?: TravelTripInstance;
  onClose: () => void;
  onSubmit: (
    patch: Pick<
      TravelTripInstance,
      'serviceKind' | 'departureTime' | 'lineName' | 'stationNames' | 'availability'
    > &
      Partial<
        Pick<
          TravelTripInstance,
          | 'tripCode'
          | 'arrivalTime'
          | 'arrivalDayOffset'
          | 'routeNote'
          | 'originStationName'
          | 'destinationStationName'
          | 'fareText'
          | 'operator'
          | 'bookingUrl'
          | 'runtimeText'
          | 'gateText'
          | 'vehicleTypeText'
          | 'vehicleModelText'
          | 'operatingDays'
          | 'sourcePath'
        >
      >,
  ) => Promise<string | null>;
}>) {
  const availableKinds = serviceProfiles
    .filter((profile) => profile.enabled || profile.kind === trip?.serviceKind)
    .map((profile) => profile.kind);
  if (trip?.serviceKind && !availableKinds.includes(trip.serviceKind)) {
    availableKinds.push(trip.serviceKind);
  }
  const fallbackServiceKind =
    trip?.serviceKind ??
    revision.services[0]?.kind ??
    availableKinds[0] ??
    serviceProfiles[0]?.kind ??
    'coach';
  const [serviceKind, setServiceKind] =
    useState<TravelTripInstance['serviceKind']>(fallbackServiceKind);
  const [tripCode, setTripCode] = useState(trip?.tripCode ?? '');
  const [departureTime, setDepartureTime] = useState(trip?.departureTime ?? '');
  const [arrivalTime, setArrivalTime] = useState(trip?.arrivalTime ?? '');
  const [arrivalDayOffset, setArrivalDayOffset] = useState(
    trip?.arrivalDayOffset === undefined ? '' : String(trip.arrivalDayOffset),
  );
  const [lineName, setLineName] = useState(trip?.lineName ?? '');
  const [routeNote, setRouteNote] = useState(trip?.routeNote ?? '');
  const [stationNamesText, setStationNamesText] = useState((trip?.stationNames ?? []).join('\n'));
  const [originStationName, setOriginStationName] = useState(trip?.originStationName ?? '');
  const [destinationStationName, setDestinationStationName] = useState(
    trip?.destinationStationName ?? '',
  );
  const [fareText, setFareText] = useState(trip?.fareText ?? '');
  const [operator, setOperator] = useState(trip?.operator ?? '');
  const [bookingUrl, setBookingUrl] = useState(trip?.bookingUrl ?? '');
  const [runtimeText, setRuntimeText] = useState(trip?.runtimeText ?? '');
  const [gateText, setGateText] = useState(trip?.gateText ?? '');
  const [vehicleTypeText, setVehicleTypeText] = useState(trip?.vehicleTypeText ?? '');
  const [vehicleModelText, setVehicleModelText] = useState(trip?.vehicleModelText ?? '');
  const [operatingDaysText, setOperatingDaysText] = useState(
    (trip?.operatingDays ?? []).join('\n'),
  );
  const [availability, setAvailability] = useState<TravelTripInstance['availability']>(
    trip?.availability ?? 'ticketing_unavailable',
  );
  const [sourcePath, setSourcePath] = useState(trip?.sourcePath ?? '');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const stationNames = parseLineList(stationNamesText);
    if (!departureTime.trim()) {
      setError('出发时间不能为空。');
      return;
    }
    if (!lineName.trim()) {
      setError('线路名称不能为空。');
      return;
    }
    if (stationNames.length < 1) {
      setError('至少需要 1 个站点。');
      return;
    }

    const parsedArrivalDayOffset = arrivalDayOffset.trim()
      ? Number(arrivalDayOffset.trim())
      : undefined;
    if (
      parsedArrivalDayOffset !== undefined &&
      (!Number.isInteger(parsedArrivalDayOffset) || parsedArrivalDayOffset < 0)
    ) {
      setError('到达日偏移必须是非负整数。');
      return;
    }

    const submitError = await onSubmit({
      serviceKind,
      tripCode: tripCode.trim(),
      departureTime: departureTime.trim(),
      arrivalTime: arrivalTime.trim(),
      arrivalDayOffset: parsedArrivalDayOffset,
      lineName: lineName.trim(),
      routeNote: routeNote.trim(),
      stationNames,
      originStationName: originStationName.trim(),
      destinationStationName: destinationStationName.trim(),
      fareText: fareText.trim(),
      operator: operator.trim(),
      bookingUrl: bookingUrl.trim(),
      runtimeText: runtimeText.trim(),
      gateText: gateText.trim(),
      vehicleTypeText: vehicleTypeText.trim(),
      vehicleModelText: vehicleModelText.trim(),
      operatingDays: parseLineList(operatingDaysText),
      availability,
      sourcePath: sourcePath.trim(),
    });
    if (submitError) {
      setError(submitError);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-transit-dialog schedule-trip-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-trip-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="schedule-trip-edit-title">{trip ? '编辑班次' : '新增班次'}</h2>
          <span className="muted">
            {revision.revisionId}
            {trip ? ` · ${trip.tripInstanceId}` : ''}
          </span>
        </div>
        <div className="schedule-trip-edit-grid">
          <label>
            <span>服务类型</span>
            <select
              value={serviceKind}
              onChange={(event) =>
                setServiceKind(event.currentTarget.value as TravelTripInstance['serviceKind'])
              }
            >
              {(availableKinds.length > 0
                ? availableKinds
                : (['coach', 'ferry', 'flight', 'railway', 'custom'] as const)
              ).map((kind) => (
                <option value={kind} key={kind}>
                  {formatScheduleServiceKind(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>班次号</span>
            <input value={tripCode} onChange={(event) => setTripCode(event.currentTarget.value)} />
          </label>
          <label>
            <span>出发时间</span>
            <input
              value={departureTime}
              onChange={(event) => setDepartureTime(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>到达时间</span>
            <input
              value={arrivalTime}
              onChange={(event) => setArrivalTime(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>到达日偏移</span>
            <input
              type="number"
              min={0}
              value={arrivalDayOffset}
              onChange={(event) => setArrivalDayOffset(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>线路名称</span>
            <input value={lineName} onChange={(event) => setLineName(event.currentTarget.value)} />
          </label>
          <label>
            <span>起点</span>
            <input
              value={originStationName}
              onChange={(event) => setOriginStationName(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>终点</span>
            <input
              value={destinationStationName}
              onChange={(event) => setDestinationStationName(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>票价</span>
            <input value={fareText} onChange={(event) => setFareText(event.currentTarget.value)} />
          </label>
          <label>
            <span>运营方</span>
            <input value={operator} onChange={(event) => setOperator(event.currentTarget.value)} />
          </label>
          <label>
            <span>订票链接</span>
            <input
              value={bookingUrl}
              onChange={(event) => setBookingUrl(event.currentTarget.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            <span>运行说明</span>
            <input
              value={runtimeText}
              onChange={(event) => setRuntimeText(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>检票口</span>
            <input value={gateText} onChange={(event) => setGateText(event.currentTarget.value)} />
          </label>
          <label>
            <span>车型</span>
            <input
              value={vehicleTypeText}
              onChange={(event) => setVehicleTypeText(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>车辆型号</span>
            <input
              value={vehicleModelText}
              onChange={(event) => setVehicleModelText(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>线路备注</span>
            <input
              value={routeNote}
              onChange={(event) => setRouteNote(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>可用性</span>
            <select
              value={availability}
              onChange={(event) =>
                setAvailability(event.currentTarget.value as TravelTripInstance['availability'])
              }
            >
              <option value="query_only">仅查询</option>
              <option value="booking_reference">跳转订票</option>
              <option value="ticketing_unavailable">暂不可售</option>
              <option value="not_connected">未接入</option>
            </select>
          </label>
          <label>
            <span>来源路径</span>
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.currentTarget.value)}
            />
          </label>
        </div>
        <label>
          <span>站点列表</span>
          <textarea
            value={stationNamesText}
            onChange={(event) => setStationNamesText(event.currentTarget.value)}
            placeholder="每行一个站点"
          />
        </label>
        <label>
          <span>运营日期规则</span>
          <textarea
            value={operatingDaysText}
            onChange={(event) => setOperatingDaysText(event.currentTarget.value)}
            placeholder="每行一条规则，例如 每日 / 工作日 / 2026-07-12"
          />
        </label>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            {trip ? '保存班次' : '创建班次'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TransitStationCoordinateDialog({
  isBusy,
  mapMarkers,
  onClose,
  onSubmit,
  revision,
  station,
  tilePreviewTemplate,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    x: number;
    z: number;
    boundPoiRefs?: TransitStationPoiBindingRef[];
    boundPoiLabel?: string;
    boundPoiMarkerId?: string;
  }) => Promise<string | null>;
  mapMarkers: MapMarker[];
  revision: TransitDataRevision;
  station: TransitRevisionStation;
  tilePreviewTemplate: string | null;
}>) {
  const [xValue, setXValue] = useState(station.x === undefined ? '' : String(station.x));
  const [zValue, setZValue] = useState(station.z === undefined ? '' : String(station.z));
  const initialBoundPoiRefs = getTransitStationBoundPoiRefs(station);
  const [boundPoiRefs, setBoundPoiRefs] =
    useState<TransitStationPoiBindingRef[]>(initialBoundPoiRefs);
  const [poiSearchText, setPoiSearchText] = useState(station.boundPoiLabel ?? station.name);
  const [boundPoiMarkerId, setBoundPoiMarkerId] = useState(initialBoundPoiRefs[0]?.markerId ?? '');
  const [error, setError] = useState('');
  const bindablePoiOptions = useMemo(
    () => buildTransitBindablePoiOptions(mapMarkers),
    [mapMarkers],
  );
  const filteredPoiOptions = useMemo(() => {
    const normalizedSearch = normalizeSearchText(poiSearchText);
    const preferred = normalizedSearch
      ? bindablePoiOptions.filter((option) =>
          normalizeSearchText(
            [option.marker.label, option.marker.id, option.marker.categoryId]
              .filter(Boolean)
              .join(' '),
          ).includes(normalizedSearch),
        )
      : bindablePoiOptions;

    const selectedOption = preferred.find((option) => option.marker.id === boundPoiMarkerId);
    const merged = selectedOption
      ? [
          selectedOption,
          ...preferred.filter((option) => option.marker.id !== selectedOption.marker.id),
        ]
      : preferred;
    return merged.slice(0, 48);
  }, [bindablePoiOptions, boundPoiMarkerId, poiSearchText]);
  const selectedBoundPoi = useMemo(
    () => bindablePoiOptions.find((option) => option.marker.id === boundPoiMarkerId) ?? null,
    [bindablePoiOptions, boundPoiMarkerId],
  );
  const boundPoiOptionsById = useMemo(
    () => new Map(bindablePoiOptions.map((option) => [option.marker.id, option] as const)),
    [bindablePoiOptions],
  );
  const selectedBoundPoiOptions = useMemo(
    () => boundPoiRefs.map((ref) => boundPoiOptionsById.get(ref.markerId)).filter(isDefined),
    [boundPoiOptionsById, boundPoiRefs],
  );
  const originalCoordinate =
    station.x !== undefined && station.z !== undefined
      ? ([station.x, station.z] as [number, number])
      : null;
  const currentCoordinate = useMemo(
    () => parseTransitCoordinatePair(xValue, zValue),
    [xValue, zValue],
  );
  const pickerReferenceCoordinate =
    currentCoordinate ?? originalCoordinate ?? selectedBoundPoi?.coordinate ?? null;
  const contextMarkers = useMemo(
    () =>
      buildTransitStationAuditContextMarkers(
        pickerReferenceCoordinate,
        mapMarkers,
        selectedBoundPoi?.marker.id ?? boundPoiRefs[0]?.markerId,
      ),
    [boundPoiRefs, mapMarkers, pickerReferenceCoordinate, selectedBoundPoi?.marker.id],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const x = Number(xValue);
    const z = Number(zValue);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      setError('请填写有效的 X/Z 坐标。');
      return;
    }

    const submitError = await onSubmit({
      x,
      z,
      boundPoiRefs,
      boundPoiMarkerId: boundPoiRefs[0]?.markerId,
      boundPoiLabel: boundPoiRefs[0]?.label,
    });
    if (submitError) {
      setError(submitError);
    }
  };

  const applyPoiCoordinate = (option: TransitStationPoiBindingOption | null) => {
    if (!option) {
      return;
    }

    setXValue(String(roundCoordinateValue(option.coordinate[0])));
    setZValue(String(roundCoordinateValue(option.coordinate[1])));
    setError('');
  };

  const updateBinding = (markerId: string) => {
    setBoundPoiMarkerId(markerId);
    const option = bindablePoiOptions.find((item) => item.marker.id === markerId) ?? null;
    if (!option) {
      return;
    }

    setPoiSearchText(option.marker.label);
    setBoundPoiRefs((current) => mergeTransitStationPoiBindingRefs(current, option.marker));
    applyPoiCoordinate(option);
  };

  const removeBinding = (markerId: string) => {
    setBoundPoiRefs((current) => current.filter((ref) => ref.markerId !== markerId));
    if (boundPoiMarkerId === markerId) {
      setBoundPoiMarkerId('');
    }
    setError('');
  };

  return (
    <div
      className="modal-backdrop transit-station-coordinate-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-transit-station-coordinate-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-transit-station-coordinate-title">修正站点坐标</h2>
          <span className="muted">
            {revision.revisionId} · {station.name}
          </span>
        </div>
        <p className="muted">
          坐标使用 Minecraft 世界坐标 X/Z。保存后会重新校验相关线路，并记录事件审计。
        </p>
        <div className="transit-station-binding-card">
          <div className="section-heading">
            <h3>绑定现有 POI</h3>
            <span className="muted">
              {boundPoiRefs.length > 0 ? `已绑定 ${boundPoiRefs.length} 个 POI` : '未绑定'}
            </span>
          </div>
          <div className="transit-station-binding-toolbar">
            <label className="transit-admin-search">
              <span>搜索 POI</span>
              <input
                value={poiSearchText}
                onChange={(event) => {
                  setPoiSearchText(event.currentTarget.value);
                  setError('');
                }}
                placeholder="名称、分类、标记 ID"
              />
            </label>
            <label>
              <span>候选 POI</span>
              <select
                value={boundPoiMarkerId}
                onChange={(event) => {
                  updateBinding(event.currentTarget.value);
                }}
              >
                <option value="">不绑定 POI</option>
                {filteredPoiOptions.map((option) => (
                  <option value={option.marker.id} key={option.marker.id}>
                    {`${option.marker.label} · ${option.marker.categoryId ?? '未分类'} · ${roundCoordinateValue(
                      option.coordinate[0],
                    )}, ${roundCoordinateValue(option.coordinate[1])}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedBoundPoi}
              onClick={() => applyPoiCoordinate(selectedBoundPoi)}
            >
              使用 POI 坐标
            </button>
            <button
              type="button"
              disabled={boundPoiRefs.length === 0}
              onClick={() => {
                setBoundPoiMarkerId('');
                setBoundPoiRefs([]);
                setError('');
              }}
            >
              清空绑定
            </button>
          </div>
          {boundPoiRefs.length > 0 ? (
            <div className="transit-station-bound-poi-list" aria-label="已绑定 POI">
              {boundPoiRefs.map((ref) => {
                const option = boundPoiOptionsById.get(ref.markerId);
                return (
                  <span className="transit-station-bound-poi-chip" key={ref.markerId}>
                    <strong>{ref.label}</strong>
                    <small>
                      {ref.categoryId ?? option?.marker.categoryId ?? '未分类'}
                      {option ? ` · ${formatTransitCoordinatePair(option.coordinate)}` : ''}
                    </small>
                    <button
                      type="button"
                      disabled={!option}
                      aria-label={`使用 ${ref.label} 坐标`}
                      onClick={() => applyPoiCoordinate(option ?? null)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        my_location
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`移除 ${ref.label} 绑定`}
                      onClick={() => removeBinding(ref.markerId)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="muted">
              绑定后可直接复用现有 POI 坐标，也方便后续回查站点与地图对象的对应关系。
            </p>
          )}
        </div>
        <div className="transit-station-coordinate-form">
          <label>
            <span>X 坐标</span>
            <input
              inputMode="decimal"
              value={xValue}
              onChange={(event) => {
                setXValue(event.currentTarget.value);
                setError('');
              }}
            />
          </label>
          <label>
            <span>Z 坐标</span>
            <input
              inputMode="decimal"
              value={zValue}
              onChange={(event) => {
                setZValue(event.currentTarget.value);
                setError('');
              }}
            />
          </label>
        </div>
        <TransitStationCoordinatePicker
          boundPoi={selectedBoundPoi ?? selectedBoundPoiOptions[0] ?? null}
          contextMarkers={contextMarkers}
          currentCoordinate={currentCoordinate}
          onPick={(coordinate) => {
            setXValue(String(roundCoordinateValue(coordinate[0])));
            setZValue(String(roundCoordinateValue(coordinate[1])));
            setError('');
          }}
          originalCoordinate={originalCoordinate}
          tilePreviewTemplate={tilePreviewTemplate}
        />
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            保存坐标
          </button>
        </div>
      </form>
    </div>
  );
}

function TransitStationCoordinatePicker({
  boundPoi,
  contextMarkers,
  currentCoordinate,
  onPick,
  originalCoordinate,
  tilePreviewTemplate,
}: Readonly<{
  boundPoi: TransitStationPoiBindingOption | null;
  contextMarkers: TransitStationAuditContextMarker[];
  currentCoordinate: [number, number] | null;
  onPick: (coordinate: [number, number]) => void;
  originalCoordinate: [number, number] | null;
  tilePreviewTemplate: string | null;
}>) {
  return (
    <EmbeddedMapLocationPicker
      ariaLabel="在地图预览中点选站点坐标"
      emptyContent="当前没有可用于地图点选的基准坐标，请先绑定一个 POI 或手动输入坐标。"
      footer={
        currentCoordinate
          ? `点击地图回填坐标 · 当前 ${formatTransitCoordinatePair(currentCoordinate)}`
          : '点击地图回填坐标'
      }
      markers={contextMarkers.map((marker) => ({
        coordinate: marker.coordinate,
        id: marker.marker.id,
        label: marker.marker.label,
        tone:
          marker.relation === 'bound-poi'
            ? 'bound'
            : marker.relation === 'road'
              ? 'road'
              : marker.relation === 'station'
                ? 'station'
                : marker.relation === 'nearby'
                  ? 'nearby'
                  : 'default',
      }))}
      onChange={onPick}
      originalValue={originalCoordinate}
      referenceValue={boundPoi?.coordinate ?? null}
      tileTemplate={tilePreviewTemplate}
      value={currentCoordinate}
    />
  );
}

function TransitLineEditorDialog({
  isBusy,
  line,
  modeProfiles,
  onClose,
  onEditStation,
  onSubmit,
  revision,
  tilePreviewTemplate,
}: Readonly<{
  isBusy: boolean;
  line?: TransitRevisionLine;
  modeProfiles: TransitModeProfile[];
  onClose: () => void;
  onEditStation: (station: TransitRevisionStation) => void;
  onSubmit: (payload: TransitLineEditorSubmitPayload) => Promise<TransitLineEditorSubmitResult>;
  revision: TransitDataRevision;
  tilePreviewTemplate: string | null;
}>) {
  const router = useRouter();
  const initialMode = line?.mode ?? modeProfiles.find((profile) => profile.enabled)?.mode ?? 'bus';
  const [mode, setMode] = useState<TransitRevisionLine['mode']>(initialMode);
  const [name, setName] = useState(line?.name ?? '');
  const [color, setColor] = useState(line?.color ?? '');
  const [operator, setOperator] = useState(line?.operator ?? '');
  const [fare, setFare] = useState(line?.fare ?? '');
  const [firstBus, setFirstBus] = useState(line?.firstLastBus?.first ?? '');
  const [lastBus, setLastBus] = useState(line?.firstLastBus?.last ?? '');
  const [bookingUrl, setBookingUrl] = useState(line?.bookingUrl ?? '');
  const [routeMode, setRouteMode] = useState<NonNullable<TransitRevisionLine['routeMode']>>(
    line?.routeMode ?? defaultRouteModeForTransitMode(initialMode),
  );
  const [routeModeManuallySet, setRouteModeManuallySet] = useState(Boolean(line?.routeMode));
  const [routeNodeDrafts, setRouteNodeDrafts] = useState<TransitLineRouteNodeDraft[]>(() =>
    buildTransitLineRouteNodeDrafts(line),
  );
  const [operatingDateRule, setOperatingDateRule] = useState(line?.operatingDateRule ?? '');
  const [departureTimesText, setDepartureTimesText] = useState(
    formatTransitDepartureRulesForEditor(line),
  );
  const [activeTab, setActiveTab] = useState<TransitLineEditorTab>('basic');
  const [error, setError] = useState('');
  const stationById = useMemo(
    () => new Map(revision.stations.map((station) => [station.sourceId, station])),
    [revision.stations],
  );
  const parsedRoute = useMemo(
    () => parseTransitLineRouteNodeDrafts(routeNodeDrafts, routeMode),
    [routeMode, routeNodeDrafts],
  );
  const parsedStationSourceIds = parsedRoute.stationSourceIds;
  const missingStationSourceIds = parsedStationSourceIds.filter(
    (stationSourceId) => !stationById.has(stationSourceId),
  );
  const parsedDepartureSchedule = useMemo(
    () => parseTransitDepartureScheduleText(departureTimesText),
    [departureTimesText],
  );

  const saveLine = async (intent: 'close' | 'map-editor') => {
    if (!name.trim()) {
      setError('线路名称不能为空。');
      return;
    }
    if (parsedStationSourceIds.length < 2) {
      setError('线路至少需要 2 个站点。');
      return;
    }
    if (missingStationSourceIds.length > 0) {
      setError(`存在未收录站点：${missingStationSourceIds.slice(0, 4).join('、')}`);
      return;
    }
    if (parsedRoute.error) {
      setError(parsedRoute.error);
      return;
    }
    if (parsedDepartureSchedule.error) {
      setError(parsedDepartureSchedule.error);
      return;
    }

    const result = await onSubmit({
      mode,
      name: name.trim(),
      color: color.trim() || undefined,
      routeMode,
      routeNodes: parsedRoute.routeNodes,
      stationSourceIds: parsedStationSourceIds,
      oneWayStops: parsedRoute.oneWayStops,
      segmentPaths: parsedRoute.segmentPaths,
      operator: operator.trim() || undefined,
      fare: fare.trim() || undefined,
      firstBus: firstBus.trim() || undefined,
      lastBus: lastBus.trim() || undefined,
      departureTimes: parsedDepartureSchedule.departureTimes,
      departureRules: parsedDepartureSchedule.rules,
      operatingDateRule: operatingDateRule.trim() || undefined,
      bookingUrl: bookingUrl.trim() || undefined,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    if (intent === 'map-editor') {
      if (!result.lineSourceId) {
        setError('线路已保存，但无法确定新线路标识，请关闭窗口后从线路列表进入地图编辑。');
        return;
      }
      router.push(
        appPath(
          `/admin/transit/lines/${encodeURIComponent(revision.revisionId)}/${encodeURIComponent(result.lineSourceId)}/edit`,
        ),
      );
      return;
    }
    onClose();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveLine('close');
  };

  const configuredModeOptions = modeProfiles.filter(
    (profile) => profile.enabled || profile.mode === mode,
  );
  const currentModeFallback = supportedTransitModeProfiles.find((profile) => profile.mode === mode);
  const modeOptions =
    configuredModeOptions.length > 0
      ? configuredModeOptions.some((profile) => profile.mode === mode) || !currentModeFallback
        ? configuredModeOptions
        : [...configuredModeOptions, currentModeFallback]
      : supportedTransitModeProfiles;

  const updateRouteNode = (index: number, patch: Partial<TransitLineRouteNodeDraft>) => {
    setRouteNodeDrafts((current) =>
      current.map((node, currentIndex) =>
        currentIndex === index ? { ...node, ...patch, id: node.id } : node,
      ),
    );
    setError('');
  };

  const moveRouteNode = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= routeNodeDrafts.length) {
      return;
    }

    const next = [...routeNodeDrafts];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setRouteNodeDrafts(next);
    setError('');
  };

  const removeRouteNode = (index: number) => {
    setRouteNodeDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setError('');
  };

  const appendStationSourceId = () => {
    setRouteNodeDrafts((current) => [
      ...current,
      createTransitLineRouteNodeDraft('station', current.length),
    ]);
    setError('');
  };

  const appendWaypoint = () => {
    setRouteNodeDrafts((current) => [
      ...current,
      createTransitLineRouteNodeDraft('waypoint', current.length),
    ]);
    setError('');
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-transit-line-order-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-transit-line-order-title">{line ? '编辑线路' : '新增线路'}</h2>
          <span className="muted">
            {revision.revisionId}
            {line ? ` · ${line.name}` : ''}
          </span>
        </div>
        <fieldset className="segmented-control transit-line-editor-tabs">
          <legend>线路编辑区域</legend>
          <div>
            {(
              [
                ['basic', '基本信息'],
                ['route', '路线'],
                ['schedule', '班次'],
              ] as const
            ).map(([value, label]) => (
              <button
                className={activeTab === value ? 'is-active' : ''}
                type="button"
                aria-pressed={activeTab === value}
                key={value}
                onClick={() => setActiveTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {activeTab === 'basic' ? (
          <div className="transit-line-editor-page">
            <div className="schedule-trip-edit-grid">
              <label>
                <span>线路名称</span>
                <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
              </label>
              <label>
                <span>交通方式</span>
                <select
                  value={mode}
                  onChange={(event) => {
                    const nextMode = event.currentTarget.value as TransitRevisionLine['mode'];
                    setMode(nextMode);
                    if (!routeModeManuallySet) {
                      setRouteMode(defaultRouteModeForTransitMode(nextMode));
                    }
                  }}
                >
                  {modeOptions.map((profile) => (
                    <option value={profile.mode} key={profile.mode}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>标识色</span>
                <span className="transit-line-color-field">
                  <input
                    value={color}
                    onChange={(event) => setColor(event.currentTarget.value)}
                    placeholder="#2677e8"
                  />
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: color.trim() || line?.color || '#2f9e85' }}
                  />
                </span>
              </label>
              <label>
                <span>运营方</span>
                <input
                  value={operator}
                  onChange={(event) => setOperator(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>票价</span>
                <input value={fare} onChange={(event) => setFare(event.currentTarget.value)} />
              </label>
              <label>
                <span>订票链接</span>
                <input
                  value={bookingUrl}
                  onChange={(event) => setBookingUrl(event.currentTarget.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
          </div>
        ) : null}

        {activeTab === 'route' ? (
          <div className="transit-line-editor-page">
            <div className="transit-line-order-preview is-featured" aria-label="站点序列预览">
              <TransitLineOrderMapPreview
                color={color.trim() || line?.color}
                segmentPaths={parsedRoute.segmentPaths}
                stationById={stationById}
                stationSourceIds={parsedStationSourceIds}
                tilePreviewTemplate={tilePreviewTemplate}
              />
            </div>
            <div className="transit-line-route-toolbar" aria-label="线路路线操作">
              <span>线路运行方式</span>
              {line ? (
                <Link
                  className="transit-line-visual-editor-link"
                  href={appPath(
                    `/admin/transit/lines/${encodeURIComponent(revision.revisionId)}/${encodeURIComponent(line.sourceId)}/edit`,
                  )}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    map
                  </span>
                  <span>地图编辑</span>
                </Link>
              ) : (
                <button
                  className="transit-line-visual-editor-link"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void saveLine('map-editor')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_location_alt
                  </span>
                  <span>创建并地图编辑</span>
                </button>
              )}
              <div className="segmented-control transit-line-path-mode-control">
                <div>
                  <button
                    className={routeMode === 'straight' ? 'is-active' : ''}
                    type="button"
                    onClick={() => {
                      setRouteMode('straight');
                      setRouteModeManuallySet(true);
                    }}
                  >
                    折线
                  </button>
                  <button
                    className={routeMode === 'road' ? 'is-active' : ''}
                    type="button"
                    onClick={() => {
                      setRouteMode('road');
                      setRouteModeManuallySet(true);
                    }}
                  >
                    沿路
                  </button>
                </div>
              </div>
              <button type="button" onClick={appendStationSourceId}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_location_alt
                </span>
                <span>添加站点</span>
              </button>
              <button type="button" onClick={appendWaypoint}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_road
                </span>
                <span>添加途径点</span>
              </button>
            </div>
            <div className="transit-line-editor-route-grid">
              <div className="transit-line-editor-stations" aria-label="线路站点">
                <datalist id="transit-line-station-options">
                  {revision.stations.map((station) => (
                    <option value={station.sourceId} key={station.sourceId}>
                      {station.name}
                    </option>
                  ))}
                </datalist>
                {routeNodeDrafts.map((node, index) => {
                  const station =
                    node.kind === 'station'
                      ? stationById.get(node.stationSourceId.trim())
                      : undefined;
                  return (
                    <div
                      className={
                        node.kind === 'station'
                          ? 'transit-line-editor-station-row'
                          : 'transit-line-editor-station-row is-waypoint'
                      }
                      key={node.id}
                    >
                      {node.kind === 'station' ? (
                        <>
                          <label>
                            <span>{station?.name ?? '站点'}</span>
                            <input
                              list="transit-line-station-options"
                              value={node.stationSourceId}
                              onChange={(event) =>
                                updateRouteNode(index, {
                                  stationSourceId: event.currentTarget.value,
                                })
                              }
                              placeholder="选择或输入站点 sourceId"
                            />
                          </label>
                          <button
                            className="transit-line-station-coordinate-button"
                            type="button"
                            disabled={!station}
                            onClick={() => {
                              if (station) {
                                onEditStation(station);
                              }
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              location_on
                            </span>
                            <span>
                              {station
                                ? formatTransitStationBindingSummary(station)
                                : '选择位置 / POI'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <div className="transit-line-waypoint-coordinate-fields">
                          <label>
                            <span>X 坐标</span>
                            <input
                              inputMode="decimal"
                              value={node.xText}
                              onChange={(event) =>
                                updateRouteNode(index, { xText: event.currentTarget.value })
                              }
                              placeholder="X 坐标"
                            />
                          </label>
                          <label>
                            <span>Z 坐标</span>
                            <input
                              inputMode="decimal"
                              value={node.zText}
                              onChange={(event) =>
                                updateRouteNode(index, { zText: event.currentTarget.value })
                              }
                              placeholder="Z 坐标"
                            />
                          </label>
                        </div>
                      )}
                      <label>
                        <span>方向</span>
                        <select
                          value={node.direction}
                          onChange={(event) =>
                            updateRouteNode(index, {
                              direction: event.currentTarget
                                .value as TransitLineRouteNodeDraft['direction'],
                            })
                          }
                        >
                          <option value="both">双向</option>
                          <option value="up">仅上行</option>
                          <option value="down">仅下行</option>
                        </select>
                      </label>
                      <div className="transit-line-editor-row-actions">
                        <button
                          type="button"
                          aria-label={node.kind === 'station' ? '上移站点' : '上移途径点'}
                          disabled={index === 0}
                          onClick={() => moveRouteNode(index, -1)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            arrow_upward
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={node.kind === 'station' ? '下移站点' : '下移途径点'}
                          disabled={index >= routeNodeDrafts.length - 1}
                          onClick={() => moveRouteNode(index, 1)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            arrow_downward
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={node.kind === 'station' ? '删除站点' : '删除途径点'}
                          onClick={() => removeRouteNode(index)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            close
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'schedule' ? (
          <div className="transit-line-editor-page">
            <div className="schedule-trip-edit-grid">
              <label>
                <span>首班车</span>
                <input
                  value={firstBus}
                  onChange={(event) => setFirstBus(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>末班车</span>
                <input
                  value={lastBus}
                  onChange={(event) => setLastBus(event.currentTarget.value)}
                />
              </label>
            </div>
            <label>
              <span>运营日期规则</span>
              <input
                value={operatingDateRule}
                onChange={(event) => {
                  setOperatingDateRule(event.currentTarget.value);
                  setError('');
                }}
                placeholder="例如：每日 / 工作日 / 2026-07-01 至 2026-08-31"
              />
            </label>
            <label>
              <span>发车时刻</span>
              <textarea
                value={departureTimesText}
                onChange={(event) => {
                  setDepartureTimesText(event.currentTarget.value);
                  setError('');
                }}
                placeholder={'每行一个时刻或规则，例如：\n06:30\n06:30 + 00:05 * 5'}
              />
            </label>
            {!parsedDepartureSchedule.error && parsedDepartureSchedule.rules.length > 0 ? (
              <p className="muted">
                {`已识别 ${parsedDepartureSchedule.rules.length} 行，展开为 ${parsedDepartureSchedule.departureTimes.length} 个发车时刻`}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            {line ? '保存线路' : '创建线路'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TransitLineOrderMapPreview({
  color,
  segmentPaths,
  stationById,
  stationSourceIds,
  tilePreviewTemplate,
}: Readonly<{
  color?: string;
  segmentPaths?: TransitRevisionLine['segmentPaths'];
  stationById: Map<string, TransitRevisionStation>;
  stationSourceIds: string[];
  tilePreviewTemplate: string | null;
}>) {
  const model = buildTransitLineOrderPreviewModel({
    color,
    segmentPaths,
    stationById,
    stationSourceIds,
  });
  if (!model) {
    return (
      <div className="transit-line-order-map is-empty">
        <p className="muted">当前站序缺少可绘制坐标，保存站点坐标后可在这里预览线路走向。</p>
      </div>
    );
  }

  const tiles = buildTransitPreviewTiles(model.bounds, tilePreviewTemplate);

  return (
    <div className="transit-line-order-map" aria-label="线路站序小地图预览">
      <div className="transit-line-order-map-stage">
        {tiles.length > 0 ? (
          <span className="transit-revision-geometry-tiles" aria-hidden="true">
            {tiles.map((tile) => (
              <img
                draggable={false}
                key={tile.id}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
                src={tile.url}
                style={buildTransitTileStyle(tile)}
              />
            ))}
          </span>
        ) : null}
        <svg viewBox="0 0 260 160" role="img" aria-label="线路站序预览">
          <rect className="transit-revision-geometry-grid" x="0" y="0" width="260" height="160" />
          {model.segments.map((segment) => (
            <polyline
              className={`transit-line-order-map-segment is-${segment.mode}`}
              key={segment.id}
              points={segment.points}
              style={{ stroke: segment.color }}
            />
          ))}
          {model.stations.map((station) => (
            <g
              className={
                station.missing
                  ? 'transit-line-order-map-station is-missing'
                  : 'transit-line-order-map-station'
              }
              key={station.id}
              transform={`translate(${station.x} ${station.y})`}
            >
              <circle r={station.missing ? 4 : 3.5} />
              <title>{station.label}</title>
            </g>
          ))}
        </svg>
      </div>
      <p className="muted">
        {`${model.stationCount} 站 · ${model.customSegmentCount} 段自定义路径${
          model.missingCoordinateCount > 0 ? ` · ${model.missingCoordinateCount} 站缺坐标` : ''
        }`}
      </p>
    </div>
  );
}
function getTransitLineSelectionKey(revisionId: string, lineSourceId: string): string {
  return `${revisionId}::${lineSourceId}`;
}

function getScheduleTripSelectionKey(revisionId: string, tripInstanceId: string): string {
  return `${revisionId}::${tripInstanceId}`;
}

function getUniqueBatchesFromLineRows(
  rows: Array<{ line: TransitRevisionLine; revision: TransitDataRevision }>,
): TransitDataRevision[] {
  const revisions = new Map<string, TransitDataRevision>();
  for (const row of rows) {
    revisions.set(row.revision.revisionId, row.revision);
  }
  return Array.from(revisions.values());
}

function getUniqueBatchesFromTripRows(
  rows: Array<{ revision: TravelScheduleRevision; trip: TravelTripInstance }>,
): TravelScheduleRevision[] {
  const revisions = new Map<string, TravelScheduleRevision>();
  for (const row of rows) {
    revisions.set(row.revision.revisionId, row.revision);
  }
  return Array.from(revisions.values());
}
function transitItemApprovalStatusLabel(status: TransitItemApprovalStatus): string {
  const labels: Record<TransitItemApprovalStatus, string> = {
    imported: '已导入',
    pending_review: '待审核',
    approved: '待发布',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };

  return labels[status];
}

function getTransitLineItemApprovalStatus(
  line: TransitRevisionLine,
  revision: TransitDataRevision,
): TransitItemApprovalStatus {
  return line.approvalStatus ?? revisionStatusToItemApprovalStatus(revision.status);
}

function getScheduleTripItemApprovalStatus(
  trip: TravelTripInstance,
  revision: TravelScheduleRevision,
): TransitItemApprovalStatus {
  return trip.approvalStatus ?? revisionStatusToItemApprovalStatus(revision.status);
}

function revisionStatusToItemApprovalStatus(
  status: TransitDataRevisionStatus | TravelScheduleRevisionStatus,
): TransitItemApprovalStatus {
  if (status === 'validation_failed') {
    return 'imported';
  }
  if (status === 'superseded') {
    return 'published';
  }
  return status;
}

function formatTripDiffLabel(trip: TravelScheduleRevision['trips'][number]): string {
  return `${trip.serviceLabel} ${trip.tripCode ?? trip.tripInstanceId} ${trip.lineName}`;
}

function travelTripMatchesQuery(trip: TravelTripInstance, normalizedQuery: string): boolean {
  return [
    trip.tripInstanceId,
    trip.tripCode,
    trip.serviceId,
    trip.serviceKind,
    trip.serviceLabel,
    trip.departureTime,
    trip.arrivalTime,
    trip.lineName,
    trip.routeNote,
    trip.originStationName,
    trip.destinationStationName,
    trip.fareText,
    trip.operator,
    trip.bookingUrl,
    trip.runtimeText,
    trip.gateText,
    trip.vehicleTypeText,
    trip.vehicleModelText,
    trip.sourcePath,
    ...(trip.stationNames ?? []),
    ...(trip.operatingDays ?? []),
  ]
    .filter(Boolean)
    .some((value) => normalizeSearchText(String(value)).includes(normalizedQuery));
}

function matchesTransitItemStatusFilter(
  status: TransitItemApprovalStatus,
  revision: TransitDataRevision,
  filter: TransitStatusFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return status === 'imported' || status === 'pending_review' || status === 'approved';
  }

  if (filter === 'legacy') {
    return isLegacyTransitRevision(revision);
  }

  return status === filter;
}

function matchesScheduleItemStatusFilter(
  status: TransitItemApprovalStatus,
  revision: TravelScheduleRevision,
  trip: TravelTripInstance,
  filter: ScheduleStatusFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return status === 'imported' || status === 'pending_review' || status === 'approved';
  }

  if (filter === 'legacy') {
    return isLegacyScheduleRevision(revision) || isLegacyTravelTrip(trip);
  }

  return status === filter;
}

function isLegacyTransitRevision(revision: TransitDataRevision): boolean {
  return (
    revision.sourceProviderId.toLowerCase().includes('legacy') ||
    revision.sourceFiles.some((sourceFile) => normalizeSearchText(sourceFile).includes('legacy'))
  );
}

function isLegacyScheduleRevision(revision: TravelScheduleRevision): boolean {
  return (
    revision.sourceProviderId.toLowerCase().includes('legacy') ||
    revision.sourceFiles.some((sourceFile) => isLegacyScheduleSourceText(sourceFile)) ||
    revision.trips.some((trip) => isLegacyTravelTrip(trip))
  );
}

function isLegacyTravelTrip(trip: TravelTripInstance): boolean {
  return (
    trip.serviceId?.toLowerCase().includes('legacy') === true ||
    isLegacyScheduleSourceText(trip.sourcePath ?? '')
  );
}

function isLegacyScheduleSourceText(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return normalized.includes('legacy') || normalized.includes('ltcx') || normalized.includes('旧');
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s　|]+/g, '');
}

function formatScheduleServiceStatus(
  status: TravelScheduleQueryResult['services'][number]['status'],
): string {
  const labels: Record<TravelScheduleQueryResult['services'][number]['status'], string> = {
    active: '已接入',
    not_connected: '未接入',
    planned: '规划中',
  };

  return labels[status];
}
function formatTransitMode(mode: TransitDataRevision['lines'][number]['mode']): string {
  const labels: Partial<Record<TransitDataRevision['lines'][number]['mode'], string>> = {
    bus: '公交',
    coach: '客运',
    ferry: '轮渡',
    custom: '自定义',
    metro: '地铁',
    railway: '铁路',
    tram: '有轨电车',
  };

  return labels[mode] ?? mode;
}

function formatScheduleServiceKind(kind: TravelScheduleServiceProfile['kind']): string {
  const labels: Record<TravelScheduleServiceProfile['kind'], string> = {
    coach: '客运',
    ferry: '轮渡',
    flight: '航班',
    railway: '铁路',
    custom: '自定义',
  };

  return labels[kind] ?? kind;
}

function formatTripAvailability(availability: TravelTripInstance['availability']): string {
  const labels: Record<TravelTripInstance['availability'], string> = {
    query_only: '仅查询',
    booking_reference: '跳转订票',
    ticketing_unavailable: '暂不可售',
    not_connected: '未接入',
  };

  return labels[availability] ?? availability;
}

function countOneWayStops(line: TransitDataRevision['lines'][number]): number {
  return line.stops.filter((stop) => stop.oneWay).length;
}

function buildTransitLineOrderPreviewModel(input: {
  color?: string;
  segmentPaths?: TransitRevisionLine['segmentPaths'];
  stationById: Map<string, TransitRevisionStation>;
  stationSourceIds: string[];
}): {
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number };
  customSegmentCount: number;
  missingCoordinateCount: number;
  segments: Array<{ color?: string; id: string; mode: 'straight' | 'road'; points: string }>;
  stationCount: number;
  stations: Array<{ id: string; label: string; missing: boolean; x: string; y: string }>;
} | null {
  const stationCoordinates = input.stationSourceIds
    .map((stationSourceId) => input.stationById.get(stationSourceId))
    .filter((station): station is TransitRevisionStation => Boolean(station))
    .filter((station) => station.x !== undefined && station.z !== undefined)
    .map((station) => [station.x as number, station.z as number] as [number, number]);
  const customCoordinates = (input.segmentPaths ?? []).flatMap((path) =>
    path.waypoints.map((point) => [point.x, point.z] as [number, number]),
  );
  const coordinates = [...stationCoordinates, ...customCoordinates];
  if (coordinates.length === 0) {
    return null;
  }

  const bounds = expandTransitPreviewBounds(getTransitPreviewBounds(coordinates), 80);
  const project = (coordinate: [number, number]) =>
    projectTransitPreviewCoordinate(coordinate, bounds);
  const pathBySegmentKey = new Map(
    (input.segmentPaths ?? []).map((path) => [
      getTransitSegmentPathKey(path.fromStationSourceId, path.toStationSourceId),
      path,
    ]),
  );
  const segments = input.stationSourceIds.slice(0, -1).flatMap((fromStationSourceId, index) => {
    const toStationSourceId = input.stationSourceIds[index + 1] ?? '';
    const fromStation = input.stationById.get(fromStationSourceId);
    const toStation = input.stationById.get(toStationSourceId);
    if (
      fromStation?.x === undefined ||
      fromStation.z === undefined ||
      toStation?.x === undefined ||
      toStation.z === undefined
    ) {
      return [];
    }

    const path = pathBySegmentKey.get(
      getTransitSegmentPathKey(fromStationSourceId, toStationSourceId),
    );
    const coordinatesForSegment: Array<[number, number]> = [
      [fromStation.x, fromStation.z],
      ...(path?.waypoints.map((point) => [point.x, point.z] as [number, number]) ?? []),
      [toStation.x, toStation.z],
    ];
    const points = coordinatesForSegment
      .map(project)
      .map(([x, y]) => `${roundCoordinateValue(x)},${roundCoordinateValue(y)}`)
      .join(' ');

    return [
      {
        color: input.color,
        id: `${fromStationSourceId}-${toStationSourceId}-${index}`,
        mode: path?.mode ?? 'straight',
        points,
      },
    ];
  });
  const stations = input.stationSourceIds.flatMap((stationSourceId, index) => {
    const station = input.stationById.get(stationSourceId);
    if (station?.x === undefined || station.z === undefined) {
      return [];
    }

    const [x, y] = project([station.x, station.z]);
    return [
      {
        id: `${stationSourceId}-${index}`,
        label: `${index + 1}. ${station.name}`,
        missing: false,
        x: roundCoordinateValue(x),
        y: roundCoordinateValue(y),
      },
    ];
  });

  return {
    bounds,
    customSegmentCount: input.segmentPaths?.length ?? 0,
    missingCoordinateCount: input.stationSourceIds.length - stations.length,
    segments,
    stationCount: input.stationSourceIds.length,
    stations,
  };
}

function getTransitLinePreviewCoordinates(
  line: TransitRevisionLine,
  stationById: Map<string, TransitRevisionStation>,
): Array<[number, number]> {
  const pathBySegmentKey = new Map(
    (line.segmentPaths ?? []).map((path) => [
      getTransitSegmentPathKey(path.fromStationSourceId, path.toStationSourceId),
      path,
    ]),
  );
  const coordinates: Array<[number, number]> = [];

  for (const [index, fromStationSourceId] of line.stationSourceIds.slice(0, -1).entries()) {
    const toStationSourceId = line.stationSourceIds[index + 1] ?? '';
    const fromStation = stationById.get(fromStationSourceId);
    const toStation = stationById.get(toStationSourceId);
    if (
      fromStation?.x === undefined ||
      fromStation.z === undefined ||
      toStation?.x === undefined ||
      toStation.z === undefined
    ) {
      continue;
    }

    if (coordinates.length === 0) {
      coordinates.push([fromStation.x, fromStation.z]);
    }

    const path = pathBySegmentKey.get(
      getTransitSegmentPathKey(fromStationSourceId, toStationSourceId),
    );
    coordinates.push(
      ...(path?.waypoints.map((point) => [point.x, point.z] as [number, number]) ?? []),
      [toStation.x, toStation.z],
    );
  }

  return coordinates;
}

function getTransitPreviewBounds(coordinates: Array<[number, number]>): {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
} {
  return coordinates.reduce(
    (bounds, [x, z]) => ({
      maxX: Math.max(bounds.maxX, x),
      maxZ: Math.max(bounds.maxZ, z),
      minX: Math.min(bounds.minX, x),
      minZ: Math.min(bounds.minZ, z),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
    },
  );
}

function expandTransitPreviewBounds(
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
  padding: number,
) {
  if (bounds.minX === bounds.maxX && bounds.minZ === bounds.maxZ) {
    return {
      maxX: bounds.maxX + padding,
      maxZ: bounds.maxZ + padding,
      minX: bounds.minX - padding,
      minZ: bounds.minZ - padding,
    };
  }

  return {
    maxX: bounds.maxX + padding,
    maxZ: bounds.maxZ + padding,
    minX: bounds.minX - padding,
    minZ: bounds.minZ - padding,
  };
}

function projectTransitPreviewCoordinate(
  coordinate: [number, number],
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
): [number, number] {
  const width = 260;
  const height = 160;
  const padding = 18;
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

function unprojectTransitPreviewCoordinate(
  point: [number, number],
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
  width = 260,
  height = 160,
): [number, number] {
  const padding = 18;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const contentWidth = spanX * scale;
  const contentHeight = spanZ * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;

  return [bounds.minX + (point[0] - offsetX) / scale, bounds.minZ + (point[1] - offsetY) / scale];
}

interface TransitStationCoordinatePickerModel {
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number };
  boundPoiPoint: [number, number] | null;
  contextMarkers: Array<TransitStationAuditContextMarker & { point: [number, number] }>;
  currentPoint: [number, number];
  originalPoint: [number, number] | null;
}

function buildTransitStationCoordinatePickerModel(input: {
  boundPoiCoordinate: [number, number] | null;
  contextMarkers: TransitStationAuditContextMarker[];
  currentCoordinate: [number, number] | null;
  originalCoordinate: [number, number] | null;
}): TransitStationCoordinatePickerModel | null {
  const fallbackCoordinate =
    input.currentCoordinate ?? input.originalCoordinate ?? input.boundPoiCoordinate ?? null;
  if (!fallbackCoordinate) {
    return null;
  }

  const allCoordinates = [
    fallbackCoordinate,
    ...(input.originalCoordinate ? [input.originalCoordinate] : []),
    ...(input.boundPoiCoordinate ? [input.boundPoiCoordinate] : []),
    ...input.contextMarkers.map((item) => item.coordinate),
  ];
  const bounds = expandTransitPreviewBounds(getTransitCoordinateBounds(allCoordinates), 120);
  const project = (coordinate: [number, number]) =>
    projectTransitPreviewCoordinate(coordinate, bounds);

  return {
    bounds,
    boundPoiPoint: input.boundPoiCoordinate ? project(input.boundPoiCoordinate) : null,
    contextMarkers: input.contextMarkers.map((item) => ({
      ...item,
      point: project(item.coordinate),
    })),
    currentPoint: project(input.currentCoordinate ?? fallbackCoordinate),
    originalPoint: input.originalCoordinate ? project(input.originalCoordinate) : null,
  };
}

interface TransitVisibleTile {
  displaySize: number;
  id: string;
  left: number;
  top: number;
  url: string;
}

function buildTransitPreviewTiles(
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
  tileTemplate: string | null,
): TransitVisibleTile[] {
  if (!tileTemplate) {
    return [];
  }

  const view = buildTransitPreviewView(bounds);
  const tileZoom = clampTransitPreviewTileZoom(Math.round(view.zoom));
  const tileScale = 2 ** tileZoom;
  const tileSize = 256;
  const tileDisplaySize = tileSize * (view.scale / tileScale);
  const worldMinX = view.centerX - 260 / (2 * view.scale);
  const worldMaxX = view.centerX + 260 / (2 * view.scale);
  const worldMinZ = view.centerZ - 160 / (2 * view.scale);
  const worldMaxZ = view.centerZ + 160 / (2 * view.scale);
  const minTileX = Math.floor((worldMinX * tileScale) / tileSize) - 1;
  const maxTileX = Math.floor((worldMaxX * tileScale) / tileSize) + 1;
  const minTileZ = Math.floor((worldMinZ * tileScale) / tileSize) - 1;
  const maxTileZ = Math.floor((worldMaxZ * tileScale) / tileSize) + 1;
  const tiles: TransitVisibleTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      tiles.push({
        displaySize: tileDisplaySize,
        id: `${tileZoom}:${tileX}:${tileZ}`,
        left: 130 + (tileX * tileSize * view.scale) / tileScale - view.centerX * view.scale,
        top: 80 + (tileZ * tileSize * view.scale) / tileScale - view.centerZ * view.scale,
        url: buildTransitPreviewTileUrl(tileTemplate, tileZoom, tileX, tileZ),
      });
    }
  }

  return tiles;
}

function buildTransitPreviewView(bounds: {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}): { centerX: number; centerZ: number; scale: number; zoom: number } {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((260 - 18 * 2) / spanX, (160 - 18 * 2) / spanZ);

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    scale,
    zoom: Math.log2(scale),
  };
}

function buildTransitPreviewTileUrl(
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

function clampTransitPreviewTileZoom(zoom: number): number {
  return Math.min(3, Math.max(-7, zoom));
}

function buildTransitBindablePoiOptions(markers: MapMarker[]): TransitStationPoiBindingOption[] {
  return markers
    .map((marker) => {
      const coordinate = getTransitMarkerRepresentativeCoordinate(marker.geometry);
      if (!coordinate || !isBindableTransitPoiMarker(marker)) {
        return null;
      }

      return {
        coordinate,
        marker,
      } satisfies TransitStationPoiBindingOption;
    })
    .filter((item): item is TransitStationPoiBindingOption => Boolean(item))
    .sort(
      (left, right) =>
        left.marker.label.localeCompare(right.marker.label, 'zh-CN') ||
        left.marker.id.localeCompare(right.marker.id, 'zh-CN'),
    );
}

function getTransitStationBoundPoiRefs(
  station: TransitRevisionStation,
): TransitStationPoiBindingRef[] {
  const refs: TransitStationPoiBindingRef[] = [];
  const seen = new Set<string>();
  for (const ref of station.boundPoiRefs ?? []) {
    const markerId = ref.markerId.trim();
    const label = ref.label.trim();
    if (!markerId || !label || seen.has(markerId)) {
      continue;
    }

    refs.push({
      markerId,
      label,
      categoryId: ref.categoryId?.trim() || undefined,
    });
    seen.add(markerId);
  }

  const fallbackMarkerId = station.boundPoiMarkerId?.trim();
  const fallbackLabel = station.boundPoiLabel?.trim();
  if (fallbackMarkerId && fallbackLabel && !seen.has(fallbackMarkerId)) {
    refs.push({ markerId: fallbackMarkerId, label: fallbackLabel });
  }

  return refs;
}

function mergeTransitStationPoiBindingRefs(
  current: TransitStationPoiBindingRef[],
  marker: MapMarker,
): TransitStationPoiBindingRef[] {
  return [
    ...current.filter((ref) => ref.markerId !== marker.id),
    {
      markerId: marker.id,
      label: marker.label,
      categoryId: marker.categoryId,
    },
  ];
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function buildTransitStationAuditContextMarkers(
  referenceCoordinate: [number, number] | null,
  markers: MapMarker[],
  selectedBoundPoiMarkerId?: string,
): TransitStationAuditContextMarker[] {
  if (!referenceCoordinate) {
    return [];
  }

  return markers
    .map((marker) => {
      if ((marker.categoryId ?? '').toLowerCase() === 'player') {
        return null;
      }

      const coordinate = getTransitMarkerRepresentativeCoordinate(marker.geometry);
      if (!coordinate) {
        return null;
      }

      const distanceBlocks = distanceBetweenTransitCoordinates(referenceCoordinate, coordinate);
      if (distanceBlocks > 640) {
        return null;
      }

      return {
        coordinate,
        distanceBlocks,
        marker,
        relation: getTransitStationAuditMarkerRelation(marker, selectedBoundPoiMarkerId),
      } satisfies TransitStationAuditContextMarker;
    })
    .filter((item): item is TransitStationAuditContextMarker => Boolean(item))
    .sort(compareTransitStationAuditContextMarkers)
    .slice(0, 12);
}

function getTransitStationAuditMarkerRelation(
  marker: MapMarker,
  selectedBoundPoiMarkerId?: string,
): TransitStationAuditContextMarker['relation'] {
  if (selectedBoundPoiMarkerId && marker.id === selectedBoundPoiMarkerId) {
    return 'bound-poi';
  }

  if (isRoadReferenceTransitMarker(marker)) {
    return 'road';
  }

  if (isTransitStationReferenceTransitMarker(marker)) {
    return 'station';
  }

  if (isBindableTransitPoiMarker(marker)) {
    return 'poi';
  }

  return 'nearby';
}

function compareTransitStationAuditContextMarkers(
  left: TransitStationAuditContextMarker,
  right: TransitStationAuditContextMarker,
): number {
  return (
    transitStationAuditRelationPriority(left.relation) -
      transitStationAuditRelationPriority(right.relation) ||
    left.distanceBlocks - right.distanceBlocks ||
    left.marker.label.localeCompare(right.marker.label, 'zh-CN')
  );
}

function transitStationAuditRelationPriority(
  relation: TransitStationAuditContextMarker['relation'],
): number {
  if (relation === 'bound-poi') {
    return 0;
  }

  if (relation === 'poi') {
    return 1;
  }

  if (relation === 'road') {
    return 2;
  }

  if (relation === 'station') {
    return 3;
  }

  return 4;
}

function isBindableTransitPoiMarker(marker: MapMarker): boolean {
  const coordinate = getTransitMarkerRepresentativeCoordinate(marker.geometry);
  if (!coordinate) {
    return false;
  }

  const normalizedCategory = (marker.categoryId ?? '').toLowerCase();
  if (normalizedCategory === 'player' || normalizedCategory.includes('transit-line')) {
    return false;
  }

  if (isRoadReferenceTransitMarker(marker)) {
    return false;
  }

  return true;
}

function isRoadReferenceTransitMarker(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'symbolIcon'>,
): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(road|roadpoint|highway)\b/.test(text);
}

function isTransitStationReferenceTransitMarker(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'symbolIcon'>,
): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(station|metro|subway|bus|tram|rail|ferry)/.test(text);
}

function getTransitMarkerRepresentativeCoordinate(geometry: MapGeometry): [number, number] | null {
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }

  if (geometry.type === 'Rectangle') {
    return [
      (geometry.bounds.minX + geometry.bounds.maxX) / 2,
      (geometry.bounds.minZ + geometry.bounds.maxZ) / 2,
    ];
  }

  if (geometry.type === 'MultiRectangle') {
    const rectangles = geometry.rectangles;
    if (rectangles.length === 0) {
      return null;
    }

    const minX = Math.min(...rectangles.map((item) => item.minX));
    const maxX = Math.max(...rectangles.map((item) => item.maxX));
    const minZ = Math.min(...rectangles.map((item) => item.minZ));
    const maxZ = Math.max(...rectangles.map((item) => item.maxZ));
    return [(minX + maxX) / 2, (minZ + maxZ) / 2];
  }

  const coordinates = flattenTransitGeometryCoordinates(geometry);
  if (coordinates.length === 0) {
    return null;
  }

  const bounds = getTransitCoordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

function flattenTransitGeometryCoordinates(geometry: MapGeometry): Array<[number, number]> {
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

function distanceBetweenTransitCoordinates(
  left: [number, number],
  right: [number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function getTransitCoordinateBounds(coordinates: Array<[number, number]>): {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
} {
  const xs = coordinates.map((coordinate) => coordinate[0]);
  const zs = coordinates.map((coordinate) => coordinate[1]);
  return {
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
  };
}

function canEditTransitRevisionStations(revision: TransitDataRevision): boolean {
  return (
    revision.status === 'imported' ||
    revision.status === 'validation_failed' ||
    revision.status === 'pending_review' ||
    revision.status === 'approved' ||
    revision.status === 'rejected'
  );
}

function canEditTransitRevisionLines(revision: TransitDataRevision): boolean {
  return canEditTransitRevisionStations(revision) || revision.status === 'published';
}

function canEditTravelScheduleRevisionTrips(revision: TravelScheduleRevision): boolean {
  return (
    revision.status === 'imported' ||
    revision.status === 'validation_failed' ||
    revision.status === 'pending_review' ||
    revision.status === 'approved' ||
    revision.status === 'published' ||
    revision.status === 'rejected'
  );
}

function parseLineList(value: string): string[] {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultRouteModeForTransitMode(
  mode: TransitRevisionLine['mode'],
): NonNullable<TransitRevisionLine['routeMode']> {
  return mode === 'bus' || mode === 'coach' ? 'road' : 'straight';
}

function createTransitLineRouteNodeDraft(
  kind: TransitLineRouteNodeDraft['kind'],
  index: number,
): TransitLineRouteNodeDraft {
  return {
    id: `route-node-${kind}-${Date.now()}-${index}`,
    kind,
    stationSourceId: '',
    xText: '',
    zText: '',
    direction: 'both',
  };
}

function buildTransitLineRouteNodeDrafts(
  line: TransitRevisionLine | undefined,
): TransitLineRouteNodeDraft[] {
  if (line?.routeNodes?.length) {
    return line.routeNodes.map((node, index) => ({
      id: `route-node-${node.kind}-${index}`,
      kind: node.kind,
      stationSourceId: node.kind === 'station' ? node.stationSourceId : '',
      xText: node.kind === 'waypoint' ? String(node.x) : '',
      zText: node.kind === 'waypoint' ? String(node.z) : '',
      direction: node.direction ?? 'both',
      boundPoiMarkerId: node.kind === 'waypoint' ? node.boundPoiMarkerId : undefined,
      boundPoiLabel: node.kind === 'waypoint' ? node.boundPoiLabel : undefined,
    }));
  }

  if (!line) {
    return [
      createTransitLineRouteNodeDraft('station', 0),
      createTransitLineRouteNodeDraft('station', 1),
    ];
  }

  const stopByStationId = new Map(line.stops.map((stop) => [stop.stationSourceId, stop] as const));
  const pathBySegment = new Map(
    (line.segmentPaths ?? []).map((path) => [
      getTransitSegmentPathKey(path.fromStationSourceId, path.toStationSourceId),
      path,
    ]),
  );
  const drafts: TransitLineRouteNodeDraft[] = [];
  line.stationSourceIds.forEach((stationSourceId, stationIndex) => {
    const oneWay = stopByStationId.get(stationSourceId)?.oneWay;
    drafts.push({
      id: `route-node-station-${stationIndex}`,
      kind: 'station',
      stationSourceId,
      xText: '',
      zText: '',
      direction: oneWay ?? 'both',
    });
    const nextStationSourceId = line.stationSourceIds[stationIndex + 1];
    if (!nextStationSourceId) {
      return;
    }
    const path = pathBySegment.get(getTransitSegmentPathKey(stationSourceId, nextStationSourceId));
    for (const [waypointIndex, point] of (path?.waypoints ?? []).entries()) {
      drafts.push({
        id: `route-node-waypoint-${stationIndex}-${waypointIndex}`,
        kind: 'waypoint',
        stationSourceId: '',
        xText: String(point.x),
        zText: String(point.z),
        direction: point.direction ?? 'both',
        boundPoiMarkerId: point.boundPoiMarkerId,
        boundPoiLabel: point.boundPoiLabel,
      });
    }
  });
  return drafts;
}

function parseTransitLineRouteNodeDrafts(
  drafts: TransitLineRouteNodeDraft[],
  routeMode: NonNullable<TransitRevisionLine['routeMode']>,
): {
  routeNodes: TransitLineRouteNodeSnapshot[];
  stationSourceIds: string[];
  oneWayStops: NonNullable<TransitLineEditorSubmitPayload['oneWayStops']>;
  segmentPaths: NonNullable<TransitRevisionLine['segmentPaths']>;
  error?: string;
} {
  const routeNodes: TransitLineRouteNodeSnapshot[] = [];
  for (const [index, draft] of drafts.entries()) {
    if (draft.kind === 'station') {
      const stationSourceId = draft.stationSourceId.trim();
      if (!stationSourceId) {
        return {
          routeNodes: [],
          stationSourceIds: [],
          oneWayStops: [],
          segmentPaths: [],
          error: `第 ${index + 1} 行尚未选择站点。`,
        };
      }
      routeNodes.push({ kind: 'station', stationSourceId, direction: draft.direction });
      continue;
    }

    const x = Number(draft.xText);
    const z = Number(draft.zText);
    if (!draft.xText.trim() || !draft.zText.trim() || !Number.isFinite(x) || !Number.isFinite(z)) {
      return {
        routeNodes: [],
        stationSourceIds: [],
        oneWayStops: [],
        segmentPaths: [],
        error: `第 ${index + 1} 行的途径点坐标不完整。`,
      };
    }
    routeNodes.push({
      kind: 'waypoint',
      x,
      z,
      direction: draft.direction,
      boundPoiMarkerId: draft.boundPoiMarkerId,
      boundPoiLabel: draft.boundPoiLabel,
    });
  }

  if (routeNodes[0]?.kind !== 'station' || routeNodes.at(-1)?.kind !== 'station') {
    return {
      routeNodes,
      stationSourceIds: [],
      oneWayStops: [],
      segmentPaths: [],
      error: '途径点必须放在两个站点之间。',
    };
  }

  const stationSourceIds = routeNodes
    .filter(
      (node): node is Extract<TransitLineRouteNodeSnapshot, { kind: 'station' }> =>
        node.kind === 'station',
    )
    .map((node) => node.stationSourceId);
  const oneWayStops = routeNodes
    .filter(
      (node): node is Extract<TransitLineRouteNodeSnapshot, { kind: 'station' }> =>
        node.kind === 'station',
    )
    .filter((node) => node.direction !== 'both')
    .map((node) => ({
      stationSourceId: node.stationSourceId,
      oneWay: node.direction as 'up' | 'down',
    }));
  const segmentPaths: NonNullable<TransitRevisionLine['segmentPaths']> = [];
  let currentStationId = '';
  let waypoints: NonNullable<TransitRevisionLine['segmentPaths']>[number]['waypoints'] = [];
  for (const node of routeNodes) {
    if (node.kind === 'waypoint') {
      waypoints.push({
        x: node.x,
        z: node.z,
        direction: node.direction,
        boundPoiMarkerId: node.boundPoiMarkerId,
        boundPoiLabel: node.boundPoiLabel,
      });
      continue;
    }
    if (currentStationId && waypoints.length > 0) {
      segmentPaths.push({
        fromStationSourceId: currentStationId,
        toStationSourceId: node.stationSourceId,
        mode: routeMode,
        waypoints,
      });
    }
    currentStationId = node.stationSourceId;
    waypoints = [];
  }

  return { routeNodes, stationSourceIds, oneWayStops, segmentPaths };
}

function formatTransitDepartureRulesForEditor(line: TransitRevisionLine | undefined): string {
  if (line?.departureRules?.length) {
    return line.departureRules.map((rule) => rule.sourceText).join('\n');
  }
  return (line?.departureTimes ?? []).join('\n');
}

function parseTransitDepartureScheduleText(value: string): {
  rules: TransitDepartureScheduleRule[];
  departureTimes: string[];
  error?: string;
} {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rules: TransitDepartureScheduleRule[] = [];
  const departureTimes: string[] = [];

  for (const [index, line] of lines.entries()) {
    const singleMatch = /^(\d{2}):(\d{2})$/.exec(line);
    if (singleMatch) {
      const startMinutes = parseClockMinutes(singleMatch[1], singleMatch[2]);
      if (startMinutes === null) {
        return { rules: [], departureTimes: [], error: `第 ${index + 1} 行的时刻无效。` };
      }
      const startTime = formatClockMinutes(startMinutes);
      rules.push({ sourceText: line, startTime });
      departureTimes.push(startTime);
      continue;
    }

    const repeatedMatch = /^(\d{2}):(\d{2})\s*\+\s*(\d{2}):(\d{2})\s*\*\s*(\d+)$/.exec(line);
    if (!repeatedMatch) {
      return {
        rules: [],
        departureTimes: [],
        error: `第 ${index + 1} 行格式无效，请使用 HH:mm 或 HH:mm + HH:mm * N。`,
      };
    }
    const startMinutes = parseClockMinutes(repeatedMatch[1], repeatedMatch[2]);
    const intervalHours = Number(repeatedMatch[3]);
    const intervalMinutePart = Number(repeatedMatch[4]);
    const additionalDepartures = Number(repeatedMatch[5]);
    const intervalMinutes = intervalHours * 60 + intervalMinutePart;
    if (
      startMinutes === null ||
      intervalMinutePart >= 60 ||
      intervalMinutes <= 0 ||
      additionalDepartures < 1 ||
      additionalDepartures > 512
    ) {
      return { rules: [], departureTimes: [], error: `第 ${index + 1} 行的间隔或班次数无效。` };
    }
    if (startMinutes + intervalMinutes * additionalDepartures >= 24 * 60) {
      return { rules: [], departureTimes: [], error: `第 ${index + 1} 行展开后跨越次日。` };
    }

    const startTime = formatClockMinutes(startMinutes);
    rules.push({
      sourceText: line,
      startTime,
      intervalMinutes,
      additionalDepartures,
    });
    for (let offset = 0; offset <= additionalDepartures; offset += 1) {
      departureTimes.push(formatClockMinutes(startMinutes + intervalMinutes * offset));
    }
  }

  const uniqueDepartureTimes = Array.from(new Set(departureTimes));
  if (uniqueDepartureTimes.length > 128) {
    return { rules: [], departureTimes: [], error: '展开后的发车时刻不能超过 128 个。' };
  }
  return { rules, departureTimes: uniqueDepartureTimes };
}

function parseClockMinutes(hourText: string, minuteText: string): number | null {
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
}

function formatClockMinutes(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function getTransitSegmentPathKey(fromStationSourceId: string, toStationSourceId: string): string {
  return `${fromStationSourceId}\u0000${toStationSourceId}`;
}

function buildTransitTileStyle(tile: TransitVisibleTile) {
  return {
    height: tile.displaySize,
    left: tile.left,
    top: tile.top,
    width: tile.displaySize,
  };
}

function roundCoordinateValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatTransitCoordinatePair(coordinate: [number, number]): string {
  return `${roundCoordinateValue(coordinate[0])}, ${roundCoordinateValue(coordinate[1])}`;
}

function formatTransitStationBindingSummary(station: TransitRevisionStation): string {
  const coordinate =
    station.x === undefined || station.z === undefined
      ? '待定坐标'
      : `(${roundCoordinateValue(station.x)},${roundCoordinateValue(station.z)})`;
  const poiCount = getTransitStationBoundPoiRefs(station).length;
  return poiCount > 0 ? `${coordinate} · ${poiCount} POI` : coordinate;
}

function parseTransitCoordinatePair(xValue: string, zValue: string): [number, number] | null {
  const x = Number(xValue);
  const z = Number(zValue);
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
}

function getValidationIssues(revision: TransitDataRevision) {
  if (revision.validation.issues?.length) {
    return revision.validation.issues;
  }

  return [
    ...revision.validation.errors.map((message) => ({
      count: 1,
      examples: [] as string[],
      kind: 'broken_line' as const,
      message,
      severity: 'error' as const,
    })),
    ...revision.validation.warnings.map((message) => ({
      count: 1,
      examples: [] as string[],
      kind: 'missing_world_coordinate' as const,
      message,
      severity: 'warning' as const,
    })),
  ];
}

function getScheduleValidationIssues(revision: TravelScheduleRevision) {
  if (revision.validation.issues?.length) {
    return revision.validation.issues;
  }

  return [
    ...revision.validation.errors.map((message) => ({
      count: 1,
      examples: [] as string[],
      kind: 'no_trips' as const,
      message,
      severity: 'error' as const,
    })),
    ...revision.validation.warnings.map((message) => ({
      count: 1,
      examples: [] as string[],
      kind: 'source_unavailable' as const,
      message,
      severity: 'warning' as const,
    })),
  ];
}

function formatValidationIssueKind(
  kind: NonNullable<TransitDataRevision['validation']['issues']>[number]['kind'],
): string {
  const labels: Record<
    NonNullable<TransitDataRevision['validation']['issues']>[number]['kind'],
    string
  > = {
    broken_line: '线路断点',
    duplicate_station_name: '重名站点',
    missing_world_coordinate: '缺少坐标',
    one_way_station: '单向站点',
    orphan_station: '孤立站点',
  };

  return labels[kind];
}
