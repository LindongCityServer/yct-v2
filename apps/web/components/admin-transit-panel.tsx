'use client';

import type {
  MapGeometry,
  MapMarkerSnapshot,
  TileProviderDescriptor,
  TransitDataRevision,
  TransitDataRevisionStatus,
  TransitModeProfile,
  TravelScheduleQueryResult,
  TravelScheduleRevision,
  TravelScheduleRevisionStatus,
  TravelScheduleServiceProfile,
  TravelTripInstance,
} from '@yct/contracts';
import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

type TransitStatusFilter = TransitDataRevisionStatus | 'all' | 'todo' | 'blocked';
type ScheduleStatusFilter = TravelScheduleRevisionStatus | 'all' | 'todo' | 'blocked';
type TransitModeFilter = TransitDataRevision['lines'][number]['mode'] | 'all';
type ScheduleServiceFilter = TravelScheduleServiceProfile['kind'] | 'all';
type TransitAdminSection =
  'transit_revisions' | 'schedule_revisions' | 'mode_profiles' | 'service_profiles';
type TransitRevisionStation = TransitDataRevision['stations'][number];
type TransitRevisionLine = TransitDataRevision['lines'][number];
type MapMarker = MapMarkerSnapshot['markers'][number];

interface TransitLineEditorSubmitPayload {
  mode: TransitRevisionLine['mode'];
  name: string;
  color?: string;
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
  bookingUrl?: string;
}

interface TransitStationPoiBindingOption {
  coordinate: [number, number];
  marker: MapMarker;
}

interface TransitStationAuditContextMarker {
  coordinate: [number, number];
  distanceBlocks: number;
  marker: MapMarker;
  relation: 'bound-poi' | 'poi' | 'road' | 'station' | 'nearby';
}

interface AdminVersionDiffSummary {
  baselineLabel: string;
  metrics: Array<{
    label: string;
    before: number | string;
    after: number | string;
  }>;
  addedItems: string[];
  removedItems: string[];
  changedItems: string[];
  notes: string[];
}

const transitStatusFilterOptions: Array<{ value: TransitStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'todo', label: '待处理' },
  { value: 'blocked', label: '校验阻塞' },
  { value: 'imported', label: '已导入' },
  { value: 'validation_failed', label: '校验失败' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'superseded', label: '已被替换' },
  { value: 'archived', label: '已归档' },
];
const scheduleStatusFilterOptions: Array<{ value: ScheduleStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'todo', label: '待处理' },
  { value: 'blocked', label: '校验阻塞' },
  { value: 'imported', label: '已导入' },
  { value: 'validation_failed', label: '校验失败' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'superseded', label: '已被替换' },
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

export function AdminTransitPanel() {
  const [revisions, setRevisions] = useState<TransitDataRevision[]>([]);
  const [modeProfiles, setModeProfiles] = useState<TransitModeProfile[]>([]);
  const [serviceProfiles, setServiceProfiles] = useState<TravelScheduleServiceProfile[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<TravelScheduleQueryResult | null>(null);
  const [scheduleRevisions, setScheduleRevisions] = useState<TravelScheduleRevision[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [statusText, setStatusText] = useState('正在读取交通数据版本');
  const [profileStatusText, setProfileStatusText] = useState('正在读取交通方式配置');
  const [serviceProfileStatusText, setServiceProfileStatusText] =
    useState('正在读取可排班服务配置');
  const [scheduleStatusText, setScheduleStatusText] = useState('正在读取统一班次摘要');
  const [scheduleRevisionStatusText, setScheduleRevisionStatusText] =
    useState('正在读取班次数据版本');
  const [tilePreviewTemplate, setTilePreviewTemplate] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [serviceProfileBusy, setServiceProfileBusy] = useState(false);
  const [scheduleRevisionBusy, setScheduleRevisionBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<TransitAdminSection>('transit_revisions');
  const [statusFilter, setStatusFilter] = useState<TransitStatusFilter>('all');
  const [modeFilter, setModeFilter] = useState<TransitModeFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedTransitRevisionId, setSelectedTransitRevisionId] = useState('');
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<ScheduleStatusFilter>('all');
  const [scheduleServiceFilter, setScheduleServiceFilter] = useState<ScheduleServiceFilter>('all');
  const [scheduleQuery, setScheduleQuery] = useState('');
  const [selectedScheduleRevisionId, setSelectedScheduleRevisionId] = useState('');
  const [rejectTarget, setRejectTarget] = useState<TransitDataRevision | null>(null);
  const [publishTarget, setPublishTarget] = useState<TransitDataRevision | null>(null);
  const [stationEditTarget, setStationEditTarget] = useState<{
    revision: TransitDataRevision;
    station: TransitRevisionStation;
  } | null>(null);
  const [lineEditTarget, setLineEditTarget] = useState<{
    revision: TransitDataRevision;
    line: TransitRevisionLine;
  } | null>(null);
  const [lineCreateTarget, setLineCreateTarget] = useState<TransitDataRevision | null>(null);
  const [scheduleRejectTarget, setScheduleRejectTarget] = useState<TravelScheduleRevision | null>(
    null,
  );
  const [schedulePublishTarget, setSchedulePublishTarget] = useState<TravelScheduleRevision | null>(
    null,
  );
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

  const publishedTransitRevision = useMemo(
    () => revisions.find((revision) => revision.status === 'published') ?? null,
    [revisions],
  );

  const transitDiffByRevisionId = useMemo(() => {
    const entries = revisions.map(
      (revision) =>
        [
          revision.revisionId,
          buildTransitRevisionDiffSummary(revision, publishedTransitRevision),
        ] as const,
    );
    return new Map(entries);
  }, [publishedTransitRevision, revisions]);

  const publishedScheduleRevision = useMemo(
    () => scheduleRevisions.find((revision) => revision.status === 'published') ?? null,
    [scheduleRevisions],
  );

  const scheduleDiffByRevisionId = useMemo(() => {
    const entries = scheduleRevisions.map(
      (revision) =>
        [
          revision.revisionId,
          buildScheduleRevisionDiffSummary(revision, publishedScheduleRevision),
        ] as const,
    );
    return new Map(entries);
  }, [publishedScheduleRevision, scheduleRevisions]);

  const statusCounts = useMemo(() => {
    const counts = new Map<TransitDataRevisionStatus, number>();
    for (const revision of revisions) {
      counts.set(revision.status, (counts.get(revision.status) ?? 0) + 1);
    }
    return counts;
  }, [revisions]);
  const scheduleStatusCounts = useMemo(() => {
    const counts = new Map<TravelScheduleRevisionStatus, number>();
    for (const revision of scheduleRevisions) {
      counts.set(revision.status, (counts.get(revision.status) ?? 0) + 1);
    }
    return counts;
  }, [scheduleRevisions]);
  const transitModeFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部交通方式' },
      ...Array.from(
        new Set(revisions.flatMap((revision) => revision.summary.map((item) => item.mode))),
      )
        .sort((left, right) => formatTransitMode(left).localeCompare(formatTransitMode(right)))
        .map((mode) => ({ value: mode, label: formatTransitMode(mode) })),
    ],
    [revisions],
  );
  const scheduleServiceFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部服务类型' },
      ...Array.from(
        new Set(
          scheduleRevisions.flatMap((revision) => revision.services.map((service) => service.kind)),
        ),
      )
        .sort((left, right) =>
          formatScheduleServiceKind(left).localeCompare(formatScheduleServiceKind(right)),
        )
        .map((kind) => ({ value: kind, label: formatScheduleServiceKind(kind) })),
    ],
    [scheduleRevisions],
  );

  const filteredRevisions = useMemo(
    () =>
      sortedRevisions.filter((revision) => {
        if (!matchesTransitStatusFilter(revision, statusFilter)) {
          return false;
        }

        if (
          modeFilter !== 'all' &&
          !revision.summary.some((item) => item.mode === modeFilter) &&
          !revision.lines.some((line) => line.mode === modeFilter)
        ) {
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
            statusLabel(revision.status),
            formatSummary(revision),
            revision.summary
              .map((item) => `${item.label}${item.lineCount}${item.stationCount}`)
              .join(' '),
            revision.validation.errors.join(' '),
            revision.validation.warnings.join(' '),
            getValidationIssues(revision)
              .map((issue) => `${issue.message}${issue.examples.join(' ')}`)
              .join(' '),
            revision.lines
              .slice(0, 40)
              .map((line) => line.name)
              .join(' '),
          ].join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [modeFilter, query, sortedRevisions, statusFilter],
  );
  const filteredScheduleRevisions = useMemo(
    () =>
      sortedScheduleRevisions.filter((revision) => {
        if (!matchesScheduleRevisionStatusFilter(revision, scheduleStatusFilter)) {
          return false;
        }

        if (
          scheduleServiceFilter !== 'all' &&
          !revision.services.some((service) => service.kind === scheduleServiceFilter) &&
          !revision.trips.some((trip) => trip.serviceKind === scheduleServiceFilter)
        ) {
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
            travelScheduleRevisionStatusLabel(revision.status),
            revision.validation.errors.join(' '),
            revision.validation.warnings.join(' '),
            getScheduleValidationIssues(revision)
              .map((issue) => `${issue.message}${issue.examples.join(' ')}`)
              .join(' '),
            revision.services.map((service) => `${service.label}${service.tripCount}`).join(' '),
            revision.trips
              .slice(0, 40)
              .map((trip) => `${trip.lineName}${trip.tripCode ?? ''}${trip.stationNames.join(' ')}`)
              .join(' '),
          ].join(' '),
        );

        return haystack.includes(normalizedQuery);
      }),
    [scheduleQuery, scheduleServiceFilter, scheduleStatusFilter, sortedScheduleRevisions],
  );
  const hasActiveTransitFilters =
    statusFilter !== 'all' || modeFilter !== 'all' || query.trim().length > 0;
  const hasActiveScheduleFilters =
    scheduleStatusFilter !== 'all' ||
    scheduleServiceFilter !== 'all' ||
    scheduleQuery.trim().length > 0;
  const currentSectionStatusText = useMemo(() => {
    if (activeSection === 'transit_revisions') {
      return statusText;
    }
    if (activeSection === 'schedule_revisions') {
      return scheduleRevisionStatusText;
    }
    if (activeSection === 'mode_profiles') {
      return profileStatusText;
    }
    return serviceProfileStatusText;
  }, [
    activeSection,
    profileStatusText,
    scheduleRevisionStatusText,
    serviceProfileStatusText,
    statusText,
  ]);
  const selectedTransitRevision = useMemo(
    () =>
      filteredRevisions.find((revision) => revision.revisionId === selectedTransitRevisionId) ??
      null,
    [filteredRevisions, selectedTransitRevisionId],
  );
  const selectedScheduleRevision = useMemo(
    () =>
      filteredScheduleRevisions.find(
        (revision) => revision.revisionId === selectedScheduleRevisionId,
      ) ?? null,
    [filteredScheduleRevisions, selectedScheduleRevisionId],
  );
  const transitLineRows = useMemo(
    () =>
      filteredRevisions.flatMap((revision) =>
        revision.lines.map((line) => ({
          line,
          revision,
        })),
      ),
    [filteredRevisions],
  );
  const scheduleTripRows = useMemo(
    () =>
      filteredScheduleRevisions.flatMap((revision) =>
        revision.trips.map((trip) => ({
          revision,
          trip,
        })),
      ),
    [filteredScheduleRevisions],
  );

  useEffect(() => {
    if (
      selectedTransitRevisionId &&
      filteredRevisions.some((revision) => revision.revisionId === selectedTransitRevisionId)
    ) {
      return;
    }

    const preferredRevision =
      filteredRevisions.find((revision) => revision.status === 'published') ?? filteredRevisions[0];
    setSelectedTransitRevisionId(preferredRevision?.revisionId ?? '');
  }, [filteredRevisions, selectedTransitRevisionId]);

  useEffect(() => {
    if (
      selectedScheduleRevisionId &&
      filteredScheduleRevisions.some(
        (revision) => revision.revisionId === selectedScheduleRevisionId,
      )
    ) {
      return;
    }

    const preferredRevision =
      filteredScheduleRevisions.find((revision) => revision.status === 'published') ??
      filteredScheduleRevisions[0];
    setSelectedScheduleRevisionId(preferredRevision?.revisionId ?? '');
  }, [filteredScheduleRevisions, selectedScheduleRevisionId]);

  const loadRevisions = async () => {
    const response = await fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: TransitDataRevision[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '交通数据后台暂不可用');
      return;
    }

    setRevisions(data.items ?? []);
    setStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个交通数据版本` : '暂无交通数据版本',
    );
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
      setScheduleRevisionStatusText(data.message ?? '班次数据版本后台暂不可用');
      return;
    }

    setScheduleRevisions(data.items ?? []);
    setScheduleRevisionStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个班次数据版本` : '暂无班次数据版本',
    );
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
        setScheduleRevisionStatusText(data.message ?? '导入班次数据版本失败');
        return;
      }

      setScheduleRevisionStatusText('已导入当前统一班次快照');
      await Promise.all([loadScheduleRevisions(), loadScheduleSummary()]);
    } finally {
      setScheduleRevisionBusy(false);
    }
  };

  const runAction = async (
    revisionId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'restore',
    reason?: string,
  ) => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/submit`)
          : action === 'publish'
            ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/publish`)
            : action === 'archive'
              ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/archive`)
              : action === 'restore'
                ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/restore`)
                : appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/review`);
      const body =
        action === 'approve'
          ? { decision: 'approved' }
          : action === 'reject'
            ? { decision: 'rejected', reason: reason?.trim() || '后台退回' }
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
      await loadRevisions();
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
  ): Promise<string | null> => {
    setIsBusy(true);
    try {
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
        return data.message ?? (lineSourceId ? '线路保存失败' : '线路新增失败');
      }

      setRevisions((current) =>
        current.map((revision) => (revision.revisionId === data.revisionId ? data : revision)),
      );
      setStatusText(lineSourceId ? `已更新线路：${payload.name}` : `已新增线路：${payload.name}`);
      return null;
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

  const runScheduleRevisionAction = async (
    revisionId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'restore',
    reason?: string,
  ) => {
    setScheduleRevisionBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? appPath(`/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/submit`)
          : action === 'publish'
            ? appPath(
                `/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/publish`,
              )
            : action === 'archive'
              ? appPath(
                  `/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/archive`,
                )
              : action === 'restore'
                ? appPath(
                    `/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/restore`,
                  )
                : appPath(
                    `/api/admin/travel/schedule-revisions/${encodeURIComponent(revisionId)}/review`,
                  );
      const body =
        action === 'approve'
          ? { decision: 'approved' }
          : action === 'reject'
            ? { decision: 'rejected', reason: reason?.trim() || '后台退回' }
            : {};
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setScheduleRevisionStatusText(data.message ?? '班次数据版本操作失败');
        return false;
      }

      setScheduleRevisionStatusText('班次数据版本操作已完成');
      await (action === 'publish' || action === 'restore'
        ? Promise.all([loadScheduleRevisions(), loadScheduleSummary()])
        : loadScheduleRevisions());
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
            className={activeSection === 'transit_revisions' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'transit_revisions'}
            onClick={() => setActiveSection('transit_revisions')}
          >
            线路列表
          </button>
          <button
            className={activeSection === 'schedule_revisions' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'schedule_revisions'}
            onClick={() => setActiveSection('schedule_revisions')}
          >
            班次列表
          </button>
          <button
            className={activeSection === 'mode_profiles' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'mode_profiles'}
            onClick={() => setActiveSection('mode_profiles')}
          >
            交通方式
          </button>
          <button
            className={activeSection === 'service_profiles' ? 'is-active' : ''}
            type="button"
            aria-pressed={activeSection === 'service_profiles'}
            onClick={() => setActiveSection('service_profiles')}
          >
            可排班服务
          </button>
        </div>
      </fieldset>

      {activeSection === 'transit_revisions' ? (
        <>
          <div className="admin-report-summary transit-admin-summary" aria-label="交通数据版本摘要">
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
            <TransitAdminMetric
              label="校验失败"
              value={statusCounts.get('validation_failed') ?? 0}
              tone={(statusCounts.get('validation_failed') ?? 0) > 0 ? 'warning' : undefined}
            />
            <TransitAdminMetric label="已发布" value={statusCounts.get('published') ?? 0} />
            <TransitAdminMetric label="当前结果" value={filteredRevisions.length} />
          </div>

          <div className="admin-toolbar transit-admin-toolbar" aria-label="交通数据版本操作与筛选">
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
                placeholder="版本、来源、线路、校验问题"
              />
            </label>
            <label>
              <span>查看版本</span>
              <select
                value={selectedTransitRevisionId}
                disabled={filteredRevisions.length === 0}
                onChange={(event) => setSelectedTransitRevisionId(event.currentTarget.value)}
              >
                {filteredRevisions.map((revision) => (
                  <option value={revision.revisionId} key={revision.revisionId}>
                    {`${statusLabel(revision.status)} · ${revision.revisionId} · ${formatSummary(revision)}`}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!hasActiveTransitFilters} onClick={resetFilters}>
              重置筛选
            </button>
          </div>

          <TransitLineEntityList
            isBusy={isBusy}
            rows={transitLineRows}
            onDeleteLine={(revision, line) => {
              if (window.confirm(`确认删除线路 ${line.name}？删除后会立即从所属版本中移除。`)) {
                void deleteTransitLineByAdmin(revision.revisionId, line);
              }
            }}
            onEditLine={(revision, line) => setLineEditTarget({ revision, line })}
          />

          {selectedTransitRevision ? (
            <section className="admin-content-list" aria-label="当前交通数据版本详情">
              <article className="admin-content-item transit-revision-item transit-selected-version-card">
                <div>
                  <strong>{selectedTransitRevision.revisionId}</strong>
                  <p className="muted">
                    {statusLabel(selectedTransitRevision.status)} ·{' '}
                    {formatSummary(selectedTransitRevision)} ·{' '}
                    {formatDate(selectedTransitRevision.importedAt)}
                  </p>
                  <div className="transit-revision-summary" aria-label="版本摘要">
                    {selectedTransitRevision.summary.map((item) => (
                      <span key={item.mode}>
                        {item.label} {item.lineCount} 线 / {item.stationCount} 站
                      </span>
                    ))}
                  </div>
                  <div className="transit-revision-validation" aria-label="校验结果">
                    <span>错误 {selectedTransitRevision.validation.errorCount}</span>
                    <span>提醒 {selectedTransitRevision.validation.warningCount}</span>
                    {getValidationIssues(selectedTransitRevision)
                      .slice(0, 3)
                      .map((issue) => (
                        <span key={`${issue.severity}-${issue.kind}`}>{issue.message}</span>
                      ))}
                  </div>
                  {getValidationIssues(selectedTransitRevision).length > 0 ? (
                    <ul className="transit-validation-issue-list" aria-label="详细校验问题">
                      {getValidationIssues(selectedTransitRevision)
                        .slice(0, 12)
                        .map((issue) => (
                          <li
                            className={
                              issue.severity === 'error'
                                ? 'transit-validation-issue is-error'
                                : 'transit-validation-issue is-warning'
                            }
                            key={`${selectedTransitRevision.revisionId}-${issue.severity}-${issue.kind}`}
                          >
                            <strong>
                              {formatValidationIssueKind(issue.kind)} · {issue.count}
                            </strong>
                            <span>{issue.message}</span>
                            {issue.examples.length > 0 ? (
                              <small>例如：{issue.examples.join('；')}</small>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  <div className="transit-revision-preview" aria-label="线路预览">
                    {selectedTransitRevision.lines.slice(0, 8).map((line) => (
                      <span key={line.sourceId}>{line.name}</span>
                    ))}
                  </div>
                  <AdminVersionDiffSummaryCard
                    summary={transitDiffByRevisionId.get(selectedTransitRevision.revisionId)}
                    title="与当前发布线路对比"
                  />
                  <TransitRevisionDetail
                    canEditStations={canEditTransitRevisionStations(selectedTransitRevision)}
                    canEditLines={canEditTransitRevisionLines(selectedTransitRevision)}
                    revision={selectedTransitRevision}
                    tilePreviewTemplate={tilePreviewTemplate}
                    onCreateLine={() => setLineCreateTarget(selectedTransitRevision)}
                    onDeleteLine={(line) => {
                      if (
                        window.confirm(`确认删除线路 ${line.name}？删除后会立即从当前版本中移除。`)
                      ) {
                        void deleteTransitLineByAdmin(selectedTransitRevision.revisionId, line);
                      }
                    }}
                    onEditLine={(line) =>
                      setLineEditTarget({ revision: selectedTransitRevision, line })
                    }
                    onEditStation={(station) =>
                      setStationEditTarget({ revision: selectedTransitRevision, station })
                    }
                  />
                  <p className="muted">
                    来源：{selectedTransitRevision.sourceFiles.join('、') || '未记录'}
                  </p>
                </div>
                <div className="admin-content-actions">
                  <button
                    type="button"
                    disabled={isBusy || selectedTransitRevision.status !== 'imported'}
                    onClick={() => runAction(selectedTransitRevision.revisionId, 'submit')}
                  >
                    提交
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || selectedTransitRevision.status !== 'pending_review'}
                    onClick={() => runAction(selectedTransitRevision.revisionId, 'approve')}
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || selectedTransitRevision.status !== 'pending_review'}
                    onClick={() => setRejectTarget(selectedTransitRevision)}
                  >
                    驳回
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || selectedTransitRevision.status !== 'approved'}
                    onClick={() => setPublishTarget(selectedTransitRevision)}
                  >
                    发布
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || selectedTransitRevision.status !== 'superseded'}
                    onClick={() => {
                      if (
                        window.confirm(
                          `确认恢复交通数据版本 ${selectedTransitRevision.revisionId} 为当前发布版本？当前发布版本会被标记为已被替换。`,
                        )
                      ) {
                        void runAction(selectedTransitRevision.revisionId, 'restore');
                      }
                    }}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    disabled={
                      isBusy ||
                      selectedTransitRevision.status === 'published' ||
                      selectedTransitRevision.status === 'archived'
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          `确认归档交通数据版本 ${selectedTransitRevision.revisionId}？归档后不会进入待办和发布候选。`,
                        )
                      ) {
                        void runAction(selectedTransitRevision.revisionId, 'archive');
                      }
                    }}
                  >
                    归档
                  </button>
                </div>
              </article>
            </section>
          ) : (
            <div className="admin-content-empty">
              <p className="muted">
                {hasActiveTransitFilters
                  ? '当前筛选条件下没有可切换的线路版本。'
                  : '暂无可用线路版本，请先导入一版数据。'}
              </p>
              {hasActiveTransitFilters ? (
                <button type="button" onClick={resetFilters}>
                  查看全部版本
                </button>
              ) : (
                <button type="button" disabled={isBusy} onClick={importLatest}>
                  从旧站导入最新线路
                </button>
              )}
            </div>
          )}
        </>
      ) : null}

      {activeSection === 'schedule_revisions' ? (
        <>
          <TravelScheduleAdminSummary result={scheduleSummary} statusText={scheduleStatusText} />
          <div className="admin-report-summary transit-admin-summary" aria-label="班次数据版本摘要">
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
            <TransitAdminMetric
              label="校验失败"
              value={scheduleStatusCounts.get('validation_failed') ?? 0}
              tone={
                (scheduleStatusCounts.get('validation_failed') ?? 0) > 0 ? 'warning' : undefined
              }
            />
            <TransitAdminMetric label="已发布" value={scheduleStatusCounts.get('published') ?? 0} />
            <TransitAdminMetric label="当前结果" value={filteredScheduleRevisions.length} />
          </div>
          <div className="admin-toolbar transit-admin-toolbar" aria-label="班次数据版本操作与筛选">
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
                placeholder="版本、线路、班次、站点、校验问题"
              />
            </label>
            <label>
              <span>查看版本</span>
              <select
                value={selectedScheduleRevisionId}
                disabled={filteredScheduleRevisions.length === 0}
                onChange={(event) => setSelectedScheduleRevisionId(event.currentTarget.value)}
              >
                {filteredScheduleRevisions.map((revision) => (
                  <option value={revision.revisionId} key={revision.revisionId}>
                    {`${travelScheduleRevisionStatusLabel(revision.status)} · ${revision.revisionId} · ${revision.trips.length} 班 / ${revision.stationOptions.length} 站`}
                  </option>
                ))}
              </select>
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
            rows={scheduleTripRows}
            onDeleteTrip={(revision, trip) => {
              if (
                window.confirm(
                  `确认删除班次 ${formatTripDiffLabel(trip)}？删除后会立即从所属版本中移除。`,
                )
              ) {
                void deleteScheduleTrip(revision.revisionId, trip);
              }
            }}
            onEditTrip={(revision, trip) => setScheduleTripEditTarget({ revision, trip })}
          />
          {selectedScheduleRevision ? (
            <div className="travel-schedule-revision-list" aria-label="当前班次版本详情">
              <article className="travel-schedule-revision-item transit-selected-version-card">
                <div>
                  <strong>{selectedScheduleRevision.revisionId}</strong>
                  <p className="muted">
                    {travelScheduleRevisionStatusLabel(selectedScheduleRevision.status)} ·{' '}
                    {selectedScheduleRevision.trips.length} 班 /{' '}
                    {selectedScheduleRevision.stationOptions.length} 站点选项 ·{' '}
                    {formatDate(selectedScheduleRevision.importedAt)}
                  </p>
                  <div className="transit-revision-validation" aria-label="班次版本校验结果">
                    <span>错误 {selectedScheduleRevision.validation.errorCount}</span>
                    <span>提醒 {selectedScheduleRevision.validation.warningCount}</span>
                    {getScheduleValidationIssues(selectedScheduleRevision)
                      .slice(0, 3)
                      .map((issue) => (
                        <span
                          key={`${selectedScheduleRevision.revisionId}-${issue.severity}-${issue.kind}`}
                        >
                          {issue.message}
                        </span>
                      ))}
                  </div>
                  <div className="travel-schedule-revision-services" aria-label="班次服务摘要">
                    {selectedScheduleRevision.services.map((service) => (
                      <span key={service.serviceId} data-status={service.status}>
                        {service.label} · {service.tripCount} 班 / {service.stationCount} 站
                      </span>
                    ))}
                  </div>
                  <AdminVersionDiffSummaryCard
                    summary={scheduleDiffByRevisionId.get(selectedScheduleRevision.revisionId)}
                    title="与当前发布班次对比"
                  />
                  <ScheduleRevisionTripDetail
                    canEditTrips={canEditTravelScheduleRevisionTrips(selectedScheduleRevision)}
                    revision={selectedScheduleRevision}
                    onCreateTrip={() => setScheduleTripCreateTarget(selectedScheduleRevision)}
                    onDeleteTrip={(trip) => {
                      if (
                        window.confirm(
                          `确认删除班次 ${formatTripDiffLabel(trip)}？删除后会立即从当前版本中移除。`,
                        )
                      ) {
                        void deleteScheduleTrip(selectedScheduleRevision.revisionId, trip);
                      }
                    }}
                    onEditTrip={(trip) =>
                      setScheduleTripEditTarget({ revision: selectedScheduleRevision, trip })
                    }
                  />
                  <p className="muted">
                    来源：{selectedScheduleRevision.sourceFiles.join('、') || '未记录'}
                  </p>
                </div>
                <div className="admin-content-actions">
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy || selectedScheduleRevision.status !== 'imported'
                    }
                    onClick={() =>
                      runScheduleRevisionAction(selectedScheduleRevision.revisionId, 'submit')
                    }
                  >
                    提交
                  </button>
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy || selectedScheduleRevision.status !== 'pending_review'
                    }
                    onClick={() =>
                      runScheduleRevisionAction(selectedScheduleRevision.revisionId, 'approve')
                    }
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy || selectedScheduleRevision.status !== 'pending_review'
                    }
                    onClick={() => setScheduleRejectTarget(selectedScheduleRevision)}
                  >
                    驳回
                  </button>
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy || selectedScheduleRevision.status !== 'approved'
                    }
                    onClick={() => setSchedulePublishTarget(selectedScheduleRevision)}
                  >
                    发布
                  </button>
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy || selectedScheduleRevision.status !== 'superseded'
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          `确认恢复班次版本 ${selectedScheduleRevision.revisionId} 为当前发布版本？当前发布版本会被标记为已被替换。`,
                        )
                      ) {
                        void runScheduleRevisionAction(
                          selectedScheduleRevision.revisionId,
                          'restore',
                        );
                      }
                    }}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    disabled={
                      scheduleRevisionBusy ||
                      selectedScheduleRevision.status === 'published' ||
                      selectedScheduleRevision.status === 'archived'
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          `确认归档班次版本 ${selectedScheduleRevision.revisionId}？归档后不会进入待办和发布候选。`,
                        )
                      ) {
                        void runScheduleRevisionAction(
                          selectedScheduleRevision.revisionId,
                          'archive',
                        );
                      }
                    }}
                  >
                    归档
                  </button>
                </div>
              </article>
            </div>
          ) : (
            <div className="admin-content-empty">
              <p className="muted">
                {hasActiveScheduleFilters
                  ? '当前筛选条件下没有可切换的班次版本。'
                  : '暂无可用班次版本，请先导入当前班次快照。'}
              </p>
              {hasActiveScheduleFilters ? (
                <button type="button" onClick={resetScheduleFilters}>
                  查看全部版本
                </button>
              ) : (
                <button
                  type="button"
                  disabled={scheduleRevisionBusy}
                  onClick={importCurrentScheduleRevision}
                >
                  导入当前班次快照
                </button>
              )}
            </div>
          )}
        </>
      ) : null}

      {activeSection === 'mode_profiles' ? (
        <section
          className="transit-mode-profile-editor"
          aria-labelledby="transit-mode-profile-title"
        >
          <div className="section-heading">
            <h2 id="transit-mode-profile-title">交通方式配置</h2>
            <span className="muted">{profileStatusText}</span>
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

      {activeSection === 'service_profiles' ? (
        <section
          className="transit-mode-profile-editor"
          aria-labelledby="travel-service-profile-title"
        >
          <div className="section-heading">
            <h2 id="travel-service-profile-title">可排班服务配置</h2>
            <span className="muted">{serviceProfileStatusText}</span>
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
      {rejectTarget ? (
        <TransitRejectDialog
          isBusy={isBusy}
          revision={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (reason) => {
            const ok = await runAction(rejectTarget.revisionId, 'reject', reason);
            if (ok) {
              setRejectTarget(null);
            }
          }}
        />
      ) : null}
      {publishTarget ? (
        <TransitPublishDialog
          isBusy={isBusy}
          revision={publishTarget}
          onClose={() => setPublishTarget(null)}
          onSubmit={async () => {
            const ok = await runAction(publishTarget.revisionId, 'publish');
            if (ok) {
              setPublishTarget(null);
            }
          }}
        />
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
          onSubmit={async (payload) => {
            const error = await saveTransitLine(
              lineEditTarget.revision.revisionId,
              payload,
              lineEditTarget.line.sourceId,
            );
            if (!error) {
              setLineEditTarget(null);
            }
            return error;
          }}
        />
      ) : null}
      {lineCreateTarget ? (
        <TransitLineEditorDialog
          isBusy={isBusy}
          modeProfiles={modeProfiles}
          revision={lineCreateTarget}
          tilePreviewTemplate={tilePreviewTemplate}
          onClose={() => setLineCreateTarget(null)}
          onSubmit={async (payload) => {
            const error = await saveTransitLine(lineCreateTarget.revisionId, payload);
            if (!error) {
              setLineCreateTarget(null);
            }
            return error;
          }}
        />
      ) : null}
      {scheduleRejectTarget ? (
        <ScheduleRevisionRejectDialog
          isBusy={scheduleRevisionBusy}
          revision={scheduleRejectTarget}
          onClose={() => setScheduleRejectTarget(null)}
          onSubmit={async (reason) => {
            const ok = await runScheduleRevisionAction(
              scheduleRejectTarget.revisionId,
              'reject',
              reason,
            );
            if (ok) {
              setScheduleRejectTarget(null);
            }
          }}
        />
      ) : null}
      {schedulePublishTarget ? (
        <ScheduleRevisionPublishDialog
          isBusy={scheduleRevisionBusy}
          revision={schedulePublishTarget}
          onClose={() => setSchedulePublishTarget(null)}
          onSubmit={async () => {
            const ok = await runScheduleRevisionAction(schedulePublishTarget.revisionId, 'publish');
            if (ok) {
              setSchedulePublishTarget(null);
            }
          }}
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

function AdminVersionDiffSummaryCard({
  summary,
  title,
}: Readonly<{
  summary?: AdminVersionDiffSummary;
  title: string;
}>) {
  if (!summary) {
    return null;
  }

  const hasItems =
    summary.addedItems.length > 0 ||
    summary.removedItems.length > 0 ||
    summary.changedItems.length > 0 ||
    summary.notes.length > 0;

  return (
    <div className="admin-version-diff-card" aria-label={title}>
      <div className="admin-version-diff-heading">
        <strong>{title}</strong>
        <span>{summary.baselineLabel}</span>
      </div>
      <div className="admin-version-diff-metrics" aria-label="数量变化">
        {summary.metrics.map((metric) => (
          <span key={metric.label}>
            <small>{metric.label}</small>
            <strong>
              {metric.before}
              {' -> '}
              {metric.after}
            </strong>
          </span>
        ))}
      </div>
      {hasItems ? (
        <div className="admin-version-diff-groups">
          <AdminVersionDiffGroup label="新增" items={summary.addedItems} />
          <AdminVersionDiffGroup label="移除" items={summary.removedItems} />
          <AdminVersionDiffGroup label="可能变化" items={summary.changedItems} />
          <AdminVersionDiffGroup label="提示" items={summary.notes} />
        </div>
      ) : (
        <p className="muted">未发现主要数量、名称或关键字段差异。</p>
      )}
    </div>
  );
}

function AdminVersionDiffGroup({
  items,
  label,
}: Readonly<{
  items: string[];
  label: string;
}>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <p>
      <strong>{label}</strong>
      <span>{items.slice(0, 6).join('；')}</span>
      {items.length > 6 ? <small>另有 {items.length - 6} 项</small> : null}
    </p>
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
  isBusy,
  onDeleteLine,
  onEditLine,
  rows,
}: Readonly<{
  isBusy: boolean;
  onDeleteLine: (revision: TransitDataRevision, line: TransitRevisionLine) => void;
  onEditLine: (revision: TransitDataRevision, line: TransitRevisionLine) => void;
  rows: Array<{ line: TransitRevisionLine; revision: TransitDataRevision }>;
}>) {
  return (
    <section className="transit-entity-list" aria-label="线路完整列表">
      <div className="section-heading">
        <h2>线路列表</h2>
        <span className="muted">{`${rows.length} 条线路，按当前版本筛选展开`}</span>
      </div>
      <div className="transit-entity-table">
        {rows.map(({ line, revision }) => {
          const canEdit = canEditTransitRevisionLines(revision);
          return (
            <article className="transit-entity-row" key={`${revision.revisionId}-${line.sourceId}`}>
              <div>
                <strong>{line.name}</strong>
                <p className="muted">
                  {formatTransitMode(line.mode)} · {line.stationSourceIds.length} 站 · 单向{' '}
                  {countOneWayStops(line)} · 自定义路径 {line.segmentPaths?.length ?? 0} 段
                </p>
                <p className="muted">
                  {statusLabel(revision.status)} · {revision.revisionId}
                </p>
              </div>
              <div className="admin-content-actions">
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
  isBusy,
  onDeleteTrip,
  onEditTrip,
  rows,
}: Readonly<{
  isBusy: boolean;
  onDeleteTrip: (revision: TravelScheduleRevision, trip: TravelTripInstance) => void;
  onEditTrip: (revision: TravelScheduleRevision, trip: TravelTripInstance) => void;
  rows: Array<{ revision: TravelScheduleRevision; trip: TravelTripInstance }>;
}>) {
  return (
    <section className="transit-entity-list" aria-label="班次完整列表">
      <div className="section-heading">
        <h2>班次列表</h2>
        <span className="muted">{`${rows.length} 个班次，按当前版本筛选展开`}</span>
      </div>
      <div className="transit-entity-table">
        {rows.map(({ revision, trip }) => {
          const canEdit = canEditTravelScheduleRevisionTrips(revision);
          return (
            <article
              className="transit-entity-row"
              key={`${revision.revisionId}-${trip.tripInstanceId}`}
            >
              <div>
                <strong>{formatTripDiffLabel(trip)}</strong>
                <p className="muted">
                  {trip.serviceLabel} · {trip.lineName} · {trip.stationNames.join(' → ')}
                </p>
                <p className="muted">
                  {travelScheduleRevisionStatusLabel(revision.status)} · {revision.revisionId}
                </p>
              </div>
              <div className="admin-content-actions">
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

function ScheduleRevisionTripDetail({
  canEditTrips,
  onCreateTrip,
  onDeleteTrip,
  revision,
  onEditTrip,
}: Readonly<{
  canEditTrips: boolean;
  onCreateTrip: () => void;
  onDeleteTrip: (trip: TravelTripInstance) => void;
  revision: TravelScheduleRevision;
  onEditTrip: (trip: TravelTripInstance) => void;
}>) {
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeSearchText(query);
  const filteredTrips = useMemo(
    () =>
      revision.trips.filter((trip) =>
        normalizedQuery ? travelTripMatchesQuery(trip, normalizedQuery) : true,
      ),
    [normalizedQuery, revision.trips],
  );

  return (
    <section className="travel-schedule-trip-detail" aria-label="班次明细">
      <div className="section-heading">
        <h3>班次明细</h3>
        <span className="muted">
          {canEditTrips ? '导入态/待审核/待发布/已发布/已驳回可人工修正' : '当前状态只读'}
        </span>
      </div>
      <div className="travel-schedule-trip-toolbar">
        <label>
          <span>搜索班次</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="班次号、线路、站点、运营方、来源"
          />
        </label>
        <span className="muted">{`${filteredTrips.length} 条`}</span>
        <button type="button" disabled={!canEditTrips} onClick={onCreateTrip}>
          新增班次
        </button>
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
            }}
          >
            清空
          </button>
        ) : null}
      </div>
      <div className="travel-schedule-trip-table">
        {filteredTrips.map((trip) => (
          <article className="travel-schedule-trip-row" key={trip.tripInstanceId}>
            <div>
              <strong>{formatTripDiffLabel(trip)}</strong>
              <p className="muted">
                {trip.serviceLabel} · {trip.lineName} · {trip.stationNames.join(' → ')}
              </p>
              <p className="muted">
                {[
                  trip.arrivalTime ? `到达 ${trip.arrivalTime}` : '',
                  formatTripAvailability(trip.availability),
                  trip.fareText,
                  trip.operator,
                  trip.sourcePath,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="admin-content-actions">
              <button type="button" disabled={!canEditTrips} onClick={() => onEditTrip(trip)}>
                编辑
              </button>
              <button type="button" disabled={!canEditTrips} onClick={() => onDeleteTrip(trip)}>
                删除
              </button>
            </div>
          </article>
        ))}
        {filteredTrips.length === 0 ? <p className="muted">没有匹配当前关键词的班次。</p> : null}
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

function TransitRevisionDetail({
  canEditLines,
  canEditStations,
  onCreateLine,
  onDeleteLine,
  onEditLine,
  onEditStation,
  revision,
  tilePreviewTemplate,
}: Readonly<{
  canEditLines: boolean;
  canEditStations: boolean;
  onCreateLine: () => void;
  onDeleteLine: (line: TransitRevisionLine) => void;
  onEditLine: (line: TransitRevisionLine) => void;
  onEditStation: (station: TransitRevisionStation) => void;
  revision: TransitDataRevision;
  tilePreviewTemplate: string | null;
}>) {
  const stationsMissingCoordinate = revision.stations.filter(
    (station) => station.x === undefined || station.z === undefined,
  );
  const stationCoordinatePreview = [
    ...stationsMissingCoordinate,
    ...revision.stations.filter((station) => station.x !== undefined && station.z !== undefined),
  ].slice(0, 16);

  return (
    <div className="transit-revision-detail" aria-label="交通数据版本详情">
      <dl>
        <div>
          <dt>数据集</dt>
          <dd>{revision.datasetId}</dd>
        </div>
        <div>
          <dt>来源适配器</dt>
          <dd>{revision.sourceProviderId}</dd>
        </div>
        <div>
          <dt>导入人</dt>
          <dd>{revision.importedBy}</dd>
        </div>
        <div>
          <dt>审核记录</dt>
          <dd>{formatTransitReviewTrail(revision)}</dd>
        </div>
      </dl>
      <div className="transit-revision-mode-table" aria-label="交通方式汇总">
        {revision.summary.map((item) => (
          <span key={item.mode}>
            <strong>{item.label}</strong>
            <small>
              {item.lineCount} 条线路 · {item.stationCount} 个站点
            </small>
          </span>
        ))}
      </div>
      <TransitRevisionGeometryPreview
        revision={revision}
        tilePreviewTemplate={tilePreviewTemplate}
      />
      <div className="transit-revision-line-table" aria-label="线路站点顺序核对">
        {canEditLines ? (
          <span>
            <strong>新增线路</strong>
            <small>手动补录线路及站点序列</small>
            <button type="button" onClick={onCreateLine}>
              新增线路
            </button>
          </span>
        ) : null}
        {revision.lines.map((line) => (
          <span key={line.sourceId}>
            <strong>{line.name}</strong>
            <small>
              {formatTransitMode(line.mode)} · {line.stationSourceIds.length} 站 · 单向{' '}
              {countOneWayStops(line)}
            </small>
            <div className="admin-content-actions">
              <button type="button" disabled={!canEditLines} onClick={() => onEditLine(line)}>
                编辑线路
              </button>
              <button type="button" disabled={!canEditLines} onClick={() => onDeleteLine(line)}>
                删除线路
              </button>
            </div>
          </span>
        ))}
      </div>
      {stationsMissingCoordinate.length > 0 ? (
        <p className="muted">
          缺少世界坐标站点示例：
          {stationsMissingCoordinate
            .slice(0, 8)
            .map((station) => station.name)
            .join('、')}
        </p>
      ) : null}
      <div className="transit-station-coordinate-table" aria-label="站点坐标核对">
        <div className="transit-station-coordinate-heading">
          <strong>站点坐标核对</strong>
          <span>
            {stationsMissingCoordinate.length > 0
              ? `${stationsMissingCoordinate.length} 个站点缺少坐标`
              : '全部站点已有坐标'}
          </span>
        </div>
        {stationCoordinatePreview.map((station) => (
          <div className="transit-station-coordinate-row" key={station.sourceId}>
            <span>
              <strong>{station.name}</strong>
              <small>{station.sourceId}</small>
              {station.boundPoiLabel ? <small>{`已绑定 ${station.boundPoiLabel}`}</small> : null}
            </span>
            <span>
              {station.x === undefined || station.z === undefined
                ? '待补坐标'
                : `${roundCoordinateValue(station.x)}, ${roundCoordinateValue(station.z)}`}
            </span>
            {canEditStations ? (
              <button type="button" onClick={() => onEditStation(station)}>
                修正坐标
              </button>
            ) : (
              <small>当前状态只读</small>
            )}
          </div>
        ))}
      </div>
      <div className="transit-revision-line-table" aria-label="线路详细预览">
        {revision.lines.map((line) => (
          <span key={line.sourceId}>
            <strong>{line.name}</strong>
            <small>
              {formatTransitMode(line.mode)} · {line.stationSourceIds.length} 站
              {countOneWayStops(line) ? ` · 单向 ${countOneWayStops(line)} 站` : ''}
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}

function TransitRejectDialog({
  isBusy,
  onClose,
  onSubmit,
  revision,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  revision: TransitDataRevision;
}>) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('请填写驳回原因。');
      return;
    }

    await onSubmit(reason);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-transit-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-transit-reject-title">驳回交通数据版本</h2>
          <span className="muted">{revision.revisionId}</span>
        </div>
        <label>
          <span>驳回原因</span>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setError('');
            }}
            maxLength={500}
            placeholder="说明需要重新导入或修正的数据问题"
          />
        </label>
        <div className="admin-poi-reject-presets" aria-label="常用驳回原因">
          {transitRejectReasonPresets.map((preset) => (
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

function TransitPublishDialog({
  isBusy,
  onClose,
  onSubmit,
  revision,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  revision: TransitDataRevision;
}>) {
  const [checked, setChecked] = useState({
    validation: false,
    preview: false,
    source: false,
  });
  const canSubmit = checked.validation && checked.preview && checked.source;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-transit-publish-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-transit-publish-title">发布交通数据版本</h2>
          <span className="muted">{revision.revisionId}</span>
        </div>
        <p>
          发布后会替换当前公开线路/站点数据，并将旧发布版本标记为已被替换。请确认校验结果和来源数据已复核。
        </p>
        <div className="admin-poi-publish-confirm" aria-label="发布前确认项">
          <label>
            <input
              type="checkbox"
              checked={checked.validation}
              onChange={(event) =>
                setChecked((current) => ({ ...current, validation: event.currentTarget.checked }))
              }
            />
            <span>已确认错误数为 0，校验提醒可接受</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={checked.preview}
              onChange={(event) =>
                setChecked((current) => ({ ...current, preview: event.currentTarget.checked }))
              }
            />
            <span>已抽查线路、站点顺序和缺坐标提示</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={checked.source}
              onChange={(event) =>
                setChecked((current) => ({ ...current, source: event.currentTarget.checked }))
              }
            />
            <span>已确认来源文件和导入时间符合预期</span>
          </label>
        </div>
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="button" disabled={isBusy || !canSubmit} onClick={onSubmit}>
            确认发布
          </button>
        </div>
      </div>
    </div>
  );
}

function TransitRevisionGeometryPreview({
  revision,
  tilePreviewTemplate,
}: Readonly<{ revision: TransitDataRevision; tilePreviewTemplate: string | null }>) {
  const model = buildTransitRevisionGeometryPreview(revision);
  if (!model) {
    return (
      <section className="transit-revision-geometry-preview" aria-label="线路几何预览">
        <div className="section-heading">
          <h3>线路几何预览</h3>
          <span className="muted">暂无可用站点坐标</span>
        </div>
        <p className="muted">需要先补齐站点 X/Z 坐标，才能绘制线路走向预览。</p>
      </section>
    );
  }

  const tiles = buildTransitPreviewTiles(model.bounds, tilePreviewTemplate);

  return (
    <section className="transit-revision-geometry-preview" aria-label="线路几何预览">
      <div className="section-heading">
        <h3>线路几何预览</h3>
        <span className="muted">
          {model.lineCount} 条线路 · {model.stationCount} 个有坐标站点
        </span>
      </div>
      <div className="transit-revision-geometry-stage">
        {tiles.length > 0 ? (
          <div className="transit-revision-geometry-tiles" aria-hidden="true">
            {tiles.map((tile) => (
              <img
                draggable={false}
                key={tile.id}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
                src={tile.url}
                style={{
                  height: tile.displaySize,
                  left: tile.left,
                  top: tile.top,
                  width: tile.displaySize,
                }}
              />
            ))}
          </div>
        ) : null}
        <svg viewBox="0 0 260 160" role="img" aria-label="线路站点几何预览">
          <rect className="transit-revision-geometry-grid" x="0" y="0" width="260" height="160" />
          {model.lines.map((line) => (
            <polyline
              className="transit-revision-geometry-line"
              key={line.id}
              points={line.points}
              style={{ stroke: line.color }}
            />
          ))}
          {model.stations.map((station) => (
            <g
              className="transit-revision-geometry-station"
              key={station.id}
              transform={`translate(${station.x} ${station.y})`}
            >
              <circle r="3.5" />
              <title>{station.name}</title>
            </g>
          ))}
        </svg>
      </div>
      {model.missingCoordinateCount > 0 ? (
        <p className="muted">{`${model.missingCoordinateCount} 个站点缺少坐标，线路预览可能不完整。`}</p>
      ) : null}
    </section>
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
  const [poiSearchText, setPoiSearchText] = useState(station.boundPoiLabel ?? station.name);
  const [boundPoiMarkerId, setBoundPoiMarkerId] = useState(station.boundPoiMarkerId ?? '');
  const [boundPoiLabelValue, setBoundPoiLabelValue] = useState(station.boundPoiLabel ?? '');
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
        selectedBoundPoi?.marker.id,
      ),
    [mapMarkers, pickerReferenceCoordinate, selectedBoundPoi?.marker.id],
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
      boundPoiMarkerId: selectedBoundPoi?.marker.id || boundPoiMarkerId.trim() || undefined,
      boundPoiLabel: selectedBoundPoi?.marker.label || boundPoiLabelValue.trim() || undefined,
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
      if (!markerId) {
        setBoundPoiLabelValue('');
      }
      return;
    }

    setPoiSearchText(option.marker.label);
    setBoundPoiLabelValue(option.marker.label);
    applyPoiCoordinate(option);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
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
          坐标使用 Minecraft 世界坐标 X/Z。保存后会重新校验当前交通数据版本，并记录事件审计。
        </p>
        <div className="transit-station-binding-card">
          <div className="section-heading">
            <h3>绑定现有 POI</h3>
            <span className="muted">
              {selectedBoundPoi
                ? `当前绑定 ${selectedBoundPoi.marker.label}`
                : boundPoiMarkerId
                  ? `当前绑定 ${boundPoiLabelValue || boundPoiMarkerId}`
                  : '未绑定'}
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
              disabled={!boundPoiMarkerId}
              onClick={() => {
                setBoundPoiMarkerId('');
                setBoundPoiLabelValue('');
                setError('');
              }}
            >
              解除绑定
            </button>
          </div>
          {selectedBoundPoi ? (
            <p className="muted">
              {selectedBoundPoi.marker.label} · {selectedBoundPoi.marker.categoryId ?? '未分类'} ·
              坐标 {formatTransitCoordinatePair(selectedBoundPoi.coordinate)}
            </p>
          ) : boundPoiMarkerId ? (
            <p className="muted">{`当前绑定 ${boundPoiLabelValue || boundPoiMarkerId}，但未在本次地图标记快照中命中可回填坐标。`}</p>
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
          boundPoi={selectedBoundPoi}
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
  const stageWidth = 260;
  const stageHeight = 160;
  const model = buildTransitStationCoordinatePickerModel({
    boundPoiCoordinate: boundPoi?.coordinate ?? null,
    contextMarkers,
    currentCoordinate,
    originalCoordinate,
  });

  if (!model) {
    return (
      <div className="transit-station-binding-card">
        <p className="muted">当前没有可用于地图点选的基准坐标，请先绑定一个 POI 或手动输入坐标。</p>
      </div>
    );
  }

  const tiles = buildTransitPreviewTiles(model.bounds, tilePreviewTemplate);
  const pickCoordinate = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point: [number, number] = [
      ((event.clientX - rect.left) / rect.width) * stageWidth,
      ((event.clientY - rect.top) / rect.height) * stageHeight,
    ];
    onPick(unprojectTransitPreviewCoordinate(point, model.bounds, stageWidth, stageHeight));
  };

  return (
    <button
      className="transit-station-coordinate-picker"
      type="button"
      onClick={pickCoordinate}
      aria-label="在地图预览中点选站点坐标"
    >
      <span className="transit-station-coordinate-picker-stage" aria-hidden="true">
        {tiles.length > 0 ? (
          <span className="transit-revision-geometry-tiles">
            {tiles.map((tile) => (
              <img
                draggable={false}
                key={tile.id}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
                src={tile.url}
                style={{
                  height: tile.displaySize,
                  left: tile.left,
                  top: tile.top,
                  width: tile.displaySize,
                }}
              />
            ))}
          </span>
        ) : null}
        <svg viewBox={`0 0 ${stageWidth} ${stageHeight}`}>
          <rect
            className="transit-revision-geometry-grid"
            x="0"
            y="0"
            width={stageWidth}
            height={stageHeight}
          />
          {model.contextMarkers.map((marker) => (
            <circle
              className={`transit-station-coordinate-context is-${marker.relation}`}
              cx={marker.point[0]}
              cy={marker.point[1]}
              key={marker.marker.id}
              r={marker.relation === 'bound-poi' ? 5 : 4}
            />
          ))}
          {model.boundPoiPoint ? (
            <circle
              className="transit-station-coordinate-bound-poi"
              cx={model.boundPoiPoint[0]}
              cy={model.boundPoiPoint[1]}
              r="6"
            />
          ) : null}
          {model.originalPoint ? (
            <circle
              className="transit-station-coordinate-original"
              cx={model.originalPoint[0]}
              cy={model.originalPoint[1]}
              r="6"
            />
          ) : null}
          <circle
            className="transit-station-coordinate-current"
            cx={model.currentPoint[0]}
            cy={model.currentPoint[1]}
            r="5"
          />
        </svg>
      </span>
      <span>
        点击地图回填坐标
        {currentCoordinate ? ` · 当前 ${formatTransitCoordinatePair(currentCoordinate)}` : ''}
      </span>
    </button>
  );
}

function TransitLineEditorDialog({
  isBusy,
  line,
  modeProfiles,
  onClose,
  onSubmit,
  revision,
  tilePreviewTemplate,
}: Readonly<{
  isBusy: boolean;
  line?: TransitRevisionLine;
  modeProfiles: TransitModeProfile[];
  onClose: () => void;
  onSubmit: (payload: TransitLineEditorSubmitPayload) => Promise<string | null>;
  revision: TransitDataRevision;
  tilePreviewTemplate: string | null;
}>) {
  const [mode, setMode] = useState<TransitRevisionLine['mode']>(line?.mode ?? 'bus');
  const [name, setName] = useState(line?.name ?? '');
  const [color, setColor] = useState(line?.color ?? '');
  const [operator, setOperator] = useState(line?.operator ?? '');
  const [fare, setFare] = useState(line?.fare ?? '');
  const [firstBus, setFirstBus] = useState(line?.firstLastBus?.first ?? '');
  const [lastBus, setLastBus] = useState(line?.firstLastBus?.last ?? '');
  const [bookingUrl, setBookingUrl] = useState(line?.bookingUrl ?? '');
  const [departureTimesText, setDepartureTimesText] = useState(
    (line?.departureTimes ?? []).join('\n'),
  );
  const [stationSourceIdsText, setStationSourceIdsText] = useState(
    (line?.stationSourceIds ?? []).join('\n'),
  );
  const [oneWayStopsText, setOneWayStopsText] = useState(formatOneWayStopsForEditor(line));
  const [segmentPathsText, setSegmentPathsText] = useState(formatSegmentPathsForEditor(line));
  const [error, setError] = useState('');
  const stationById = useMemo(
    () => new Map(revision.stations.map((station) => [station.sourceId, station])),
    [revision.stations],
  );
  const parsedStationSourceIds = parseLineList(stationSourceIdsText);
  const missingStationSourceIds = parsedStationSourceIds.filter(
    (stationSourceId) => !stationById.has(stationSourceId),
  );
  const parsedOneWayStops = parseOneWayStopsText(oneWayStopsText);
  const parsedSegmentPaths = parseTransitSegmentPathsText(segmentPathsText);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    if (parsedOneWayStops.error) {
      setError(parsedOneWayStops.error);
      return;
    }
    if (parsedSegmentPaths.error) {
      setError(parsedSegmentPaths.error);
      return;
    }
    const nonAdjacentSegmentPath = findNonAdjacentSegmentPath(
      parsedSegmentPaths.items,
      parsedStationSourceIds,
    );
    if (nonAdjacentSegmentPath) {
      setError(
        `站间路径 ${nonAdjacentSegmentPath.fromStationSourceId} -> ${nonAdjacentSegmentPath.toStationSourceId} 不在当前相邻站序中。`,
      );
      return;
    }

    const submitError = await onSubmit({
      mode,
      name: name.trim(),
      color: color.trim() || undefined,
      stationSourceIds: parsedStationSourceIds,
      oneWayStops: parsedOneWayStops.items,
      segmentPaths: parsedSegmentPaths.items,
      operator: operator.trim() || undefined,
      fare: fare.trim() || undefined,
      firstBus: firstBus.trim() || undefined,
      lastBus: lastBus.trim() || undefined,
      departureTimes: parseLineList(departureTimesText),
      bookingUrl: bookingUrl.trim() || undefined,
    });
    if (submitError) {
      setError(submitError);
    }
  };

  const modeOptions =
    modeProfiles.length > 0
      ? modeProfiles.filter((profile) => profile.enabled || profile.mode === mode)
      : ([
          { mode: 'metro', label: '地铁' },
          { mode: 'tram', label: '有轨电车' },
          { mode: 'bus', label: '公交' },
          { mode: 'coach', label: '客运' },
          { mode: 'ferry', label: '轮渡' },
          { mode: 'railway', label: '铁路' },
          { mode: 'custom', label: '自定义' },
        ] as const);

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
        <div className="schedule-trip-edit-grid">
          <label>
            <span>线路名称</span>
            <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <label>
            <span>交通方式</span>
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.currentTarget.value as TransitRevisionLine['mode'])
              }
            >
              {modeOptions.map((profile) => (
                <option value={profile.mode} key={profile.mode}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>颜色</span>
            <input
              value={color}
              onChange={(event) => setColor(event.currentTarget.value)}
              placeholder="#2677e8"
            />
          </label>
          <label>
            <span>运营方</span>
            <input value={operator} onChange={(event) => setOperator(event.currentTarget.value)} />
          </label>
          <label>
            <span>票价</span>
            <input value={fare} onChange={(event) => setFare(event.currentTarget.value)} />
          </label>
          <label>
            <span>首班</span>
            <input value={firstBus} onChange={(event) => setFirstBus(event.currentTarget.value)} />
          </label>
          <label>
            <span>末班</span>
            <input value={lastBus} onChange={(event) => setLastBus(event.currentTarget.value)} />
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
        <label>
          <span>站点 sourceId</span>
          <textarea
            value={stationSourceIdsText}
            onChange={(event) => {
              setStationSourceIdsText(event.currentTarget.value);
              setError('');
            }}
            placeholder="每行一个站点 sourceId，顺序即线路走向"
          />
        </label>
        <label>
          <span>单向站规则</span>
          <textarea
            value={oneWayStopsText}
            onChange={(event) => {
              setOneWayStopsText(event.currentTarget.value);
              setError('');
            }}
            placeholder="每行一个规则：stationSourceId:up 或 stationSourceId:down；留空表示双向停靠"
          />
        </label>
        <label>
          <span>站间路径</span>
          <textarea
            value={segmentPathsText}
            onChange={(event) => {
              setSegmentPathsText(event.currentTarget.value);
              setError('');
            }}
            placeholder="每行：起点sourceId -> 终点sourceId | straight 或 road | x,z; x,z"
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
            placeholder="每行一个时刻，例如 07:30"
          />
        </label>
        <div className="transit-line-order-preview" aria-label="站点序列预览">
          <TransitLineOrderMapPreview
            color={color.trim() || line?.color}
            segmentPaths={parsedSegmentPaths.items}
            stationById={stationById}
            stationSourceIds={parsedStationSourceIds}
            tilePreviewTemplate={tilePreviewTemplate}
          />
          <p className="muted">
            单向站写在 stop 元数据里：`up` 表示仅上行停靠，`down`
            表示仅下行停靠；需要上下行站点不同但站名相同的场景，优先复用同名标记点绑定，再分别在站序中引用对应
            sourceId。
          </p>
        </div>
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

function ScheduleRevisionRejectDialog({
  isBusy,
  onClose,
  onSubmit,
  revision,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  revision: TravelScheduleRevision;
}>) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('请填写驳回原因。');
      return;
    }

    await onSubmit(reason);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-schedule-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="section-heading">
          <h2 id="admin-schedule-reject-title">驳回班次数据版本</h2>
          <span className="muted">{revision.revisionId}</span>
        </div>
        <label>
          <span>驳回原因</span>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setError('');
            }}
            maxLength={500}
            placeholder="说明需要重新导入或修正的班次数据问题"
          />
        </label>
        <div className="admin-poi-reject-presets" aria-label="常用驳回原因">
          {scheduleRejectReasonPresets.map((preset) => (
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

function ScheduleRevisionPublishDialog({
  isBusy,
  onClose,
  onSubmit,
  revision,
}: Readonly<{
  isBusy: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  revision: TravelScheduleRevision;
}>) {
  const [checked, setChecked] = useState({
    source: false,
    validation: false,
    ticketing: false,
  });
  const canSubmit = checked.source && checked.validation && checked.ticketing;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel admin-transit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-schedule-publish-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="admin-schedule-publish-title">发布班次数据版本</h2>
          <span className="muted">{revision.revisionId}</span>
        </div>
        <p>
          发布后公开班次查询会优先读取该快照，并替换旧已发布版本；没有已发布版本时才回退实时来源。
        </p>
        <div className="admin-poi-publish-confirm" aria-label="班次发布前确认项">
          <label>
            <input
              type="checkbox"
              checked={checked.source}
              onChange={(event) =>
                setChecked((current) => ({ ...current, source: event.currentTarget.checked }))
              }
            />
            <span>已确认来源文件、班次数量和服务接入状态符合预期</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={checked.validation}
              onChange={(event) =>
                setChecked((current) => ({ ...current, validation: event.currentTarget.checked }))
              }
            />
            <span>已确认错误数为 0，校验提醒可接受</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={checked.ticketing}
              onChange={(event) =>
                setChecked((current) => ({ ...current, ticketing: event.currentTarget.checked }))
              }
            />
            <span>已确认该版本不代表未配置票务库存的班次可售</span>
          </label>
        </div>
        <div className="admin-content-actions">
          <button type="button" onClick={onClose} disabled={isBusy}>
            取消
          </button>
          <button type="button" disabled={isBusy || !canSubmit} onClick={onSubmit}>
            确认发布
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSummary(revision: TransitDataRevision): string {
  const lineCount = revision.summary.reduce((total, item) => total + item.lineCount, 0);
  const stationCount = revision.summary.reduce((total, item) => total + item.stationCount, 0);
  return `${lineCount} 条线路 / ${stationCount} 个站点`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: TransitDataRevisionStatus): string {
  const labels: Record<TransitDataRevisionStatus, string> = {
    imported: '已导入',
    validation_failed: '校验失败',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    superseded: '已被替换',
    archived: '已归档',
  };

  return labels[status];
}

function travelScheduleRevisionStatusLabel(status: TravelScheduleRevisionStatus): string {
  const labels: Record<TravelScheduleRevisionStatus, string> = {
    imported: '已导入',
    validation_failed: '校验失败',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    superseded: '已被替换',
    archived: '已归档',
  };

  return labels[status];
}

function buildTransitRevisionDiffSummary(
  revision: TransitDataRevision,
  baseline: TransitDataRevision | null,
): AdminVersionDiffSummary {
  if (!baseline) {
    return {
      baselineLabel: '暂无当前发布版本',
      metrics: [
        { label: '线路', before: 0, after: revision.lines.length },
        { label: '站点', before: 0, after: revision.stations.length },
        { label: '错误', before: 0, after: revision.validation.errorCount },
        { label: '提醒', before: 0, after: revision.validation.warningCount },
      ],
      addedItems: revision.lines.slice(0, 12).map((line) => `线路 ${line.name}`),
      removedItems: [],
      changedItems: [],
      notes: ['该版本发布后会成为第一份公开线路基线。'],
    };
  }

  if (baseline.revisionId === revision.revisionId) {
    return {
      baselineLabel: '当前发布版本',
      metrics: [
        { label: '线路', before: baseline.lines.length, after: revision.lines.length },
        { label: '站点', before: baseline.stations.length, after: revision.stations.length },
        {
          label: '错误',
          before: baseline.validation.errorCount,
          after: revision.validation.errorCount,
        },
        {
          label: '提醒',
          before: baseline.validation.warningCount,
          after: revision.validation.warningCount,
        },
      ],
      addedItems: [],
      removedItems: [],
      changedItems: [],
      notes: ['这是当前公开线路版本。'],
    };
  }

  const baselineLineById = new Map(baseline.lines.map((line) => [line.sourceId, line]));
  const revisionLineById = new Map(revision.lines.map((line) => [line.sourceId, line]));
  const baselineStationById = new Map(
    baseline.stations.map((station) => [station.sourceId, station]),
  );
  const revisionStationById = new Map(
    revision.stations.map((station) => [station.sourceId, station]),
  );

  const addedLines = revision.lines
    .filter((line) => !baselineLineById.has(line.sourceId))
    .map((line) => `线路 ${line.name}`);
  const removedLines = baseline.lines
    .filter((line) => !revisionLineById.has(line.sourceId))
    .map((line) => `线路 ${line.name}`);
  const changedLines = revision.lines.flatMap((line) => {
    const previous = baselineLineById.get(line.sourceId);
    if (!previous) {
      return [];
    }

    const changes = [
      previous.name !== line.name ? `名称 ${previous.name} -> ${line.name}` : '',
      previous.stationSourceIds.length !== line.stationSourceIds.length
        ? `站点 ${previous.stationSourceIds.length} -> ${line.stationSourceIds.length}`
        : '',
      previous.stops.length !== line.stops.length
        ? `停靠 ${previous.stops.length} -> ${line.stops.length}`
        : '',
      (previous.color ?? '') !== (line.color ?? '')
        ? `颜色 ${previous.color ?? '未填'} -> ${line.color ?? '未填'}`
        : '',
    ].filter(Boolean);

    return changes.length > 0 ? [`线路 ${line.name}：${changes.join('，')}`] : [];
  });

  const addedStations = revision.stations
    .filter((station) => !baselineStationById.has(station.sourceId))
    .map((station) => `站点 ${station.name}`);
  const removedStations = baseline.stations
    .filter((station) => !revisionStationById.has(station.sourceId))
    .map((station) => `站点 ${station.name}`);
  const changedStations = revision.stations.flatMap((station) => {
    const previous = baselineStationById.get(station.sourceId);
    if (!previous) {
      return [];
    }

    const coordinateChanged = previous.x !== station.x || previous.z !== station.z;
    const aliasesChanged = previous.aliases.join('|') !== station.aliases.join('|');
    if (!coordinateChanged && !aliasesChanged && previous.name === station.name) {
      return [];
    }

    return [
      `站点 ${station.name}：${[
        previous.name !== station.name ? `名称 ${previous.name} -> ${station.name}` : '',
        coordinateChanged ? '坐标变化' : '',
        aliasesChanged ? '别名变化' : '',
      ]
        .filter(Boolean)
        .join('，')}`,
    ];
  });

  return {
    baselineLabel: `当前发布 ${baseline.revisionId}`,
    metrics: [
      { label: '线路', before: baseline.lines.length, after: revision.lines.length },
      { label: '站点', before: baseline.stations.length, after: revision.stations.length },
      {
        label: '错误',
        before: baseline.validation.errorCount,
        after: revision.validation.errorCount,
      },
      {
        label: '提醒',
        before: baseline.validation.warningCount,
        after: revision.validation.warningCount,
      },
    ],
    addedItems: [...addedLines, ...addedStations],
    removedItems: [...removedLines, ...removedStations],
    changedItems: [...changedLines, ...changedStations],
    notes: buildDiffNotes({
      addedCount: addedLines.length + addedStations.length,
      changedCount: changedLines.length + changedStations.length,
      removedCount: removedLines.length + removedStations.length,
    }),
  };
}

function buildScheduleRevisionDiffSummary(
  revision: TravelScheduleRevision,
  baseline: TravelScheduleRevision | null,
): AdminVersionDiffSummary {
  if (!baseline) {
    return {
      baselineLabel: '暂无当前发布版本',
      metrics: [
        { label: '服务', before: 0, after: revision.services.length },
        { label: '班次', before: 0, after: revision.trips.length },
        { label: '站点选项', before: 0, after: revision.stationOptions.length },
        { label: '公告', before: 0, after: revision.serviceNotices?.length ?? 0 },
      ],
      addedItems: revision.trips.slice(0, 12).map(formatTripDiffLabel),
      removedItems: [],
      changedItems: [],
      notes: ['该版本发布后会成为第一份公开班次基线。'],
    };
  }

  if (baseline.revisionId === revision.revisionId) {
    return {
      baselineLabel: '当前发布版本',
      metrics: [
        { label: '服务', before: baseline.services.length, after: revision.services.length },
        { label: '班次', before: baseline.trips.length, after: revision.trips.length },
        {
          label: '站点选项',
          before: baseline.stationOptions.length,
          after: revision.stationOptions.length,
        },
        {
          label: '公告',
          before: baseline.serviceNotices?.length ?? 0,
          after: revision.serviceNotices?.length ?? 0,
        },
      ],
      addedItems: [],
      removedItems: [],
      changedItems: [],
      notes: ['这是当前公开班次版本。'],
    };
  }

  const baselineTripById = new Map(baseline.trips.map((trip) => [trip.tripInstanceId, trip]));
  const revisionTripById = new Map(revision.trips.map((trip) => [trip.tripInstanceId, trip]));
  const baselineServiceById = new Map(
    baseline.services.map((service) => [service.serviceId, service]),
  );
  const revisionServiceById = new Map(
    revision.services.map((service) => [service.serviceId, service]),
  );
  const baselineStationOptions = new Set(baseline.stationOptions);
  const revisionStationOptions = new Set(revision.stationOptions);

  const addedTrips = revision.trips
    .filter((trip) => !baselineTripById.has(trip.tripInstanceId))
    .map(formatTripDiffLabel);
  const removedTrips = baseline.trips
    .filter((trip) => !revisionTripById.has(trip.tripInstanceId))
    .map(formatTripDiffLabel);
  const changedTrips = revision.trips.flatMap((trip) => {
    const previous = baselineTripById.get(trip.tripInstanceId);
    if (!previous) {
      return [];
    }

    const changes = [
      previous.departureTime !== trip.departureTime
        ? `发车 ${previous.departureTime} -> ${trip.departureTime}`
        : '',
      (previous.arrivalTime ?? '') !== (trip.arrivalTime ?? '')
        ? `到达 ${previous.arrivalTime ?? '未填'} -> ${trip.arrivalTime ?? '未填'}`
        : '',
      previous.stationNames.join('|') !== trip.stationNames.join('|') ? '经停变化' : '',
      (previous.gateText ?? '') !== (trip.gateText ?? '') ? '检票/值机位置变化' : '',
      (previous.fareText ?? '') !== (trip.fareText ?? '') ? '票价文本变化' : '',
      (previous.availability ?? '') !== (trip.availability ?? '') ? '可用性变化' : '',
    ].filter(Boolean);

    return changes.length > 0 ? [`${formatTripDiffLabel(trip)}：${changes.join('，')}`] : [];
  });

  const changedServices = revision.services.flatMap((service) => {
    const previous = baselineServiceById.get(service.serviceId);
    if (!previous) {
      return [`服务 ${service.label} 新增`];
    }

    const changes = [
      previous.status !== service.status ? `状态 ${previous.status} -> ${service.status}` : '',
      previous.tripCount !== service.tripCount
        ? `班次 ${previous.tripCount} -> ${service.tripCount}`
        : '',
      previous.stationCount !== service.stationCount
        ? `站点 ${previous.stationCount} -> ${service.stationCount}`
        : '',
    ].filter(Boolean);

    return changes.length > 0 ? [`服务 ${service.label}：${changes.join('，')}`] : [];
  });
  const removedServices = baseline.services
    .filter((service) => !revisionServiceById.has(service.serviceId))
    .map((service) => `服务 ${service.label}`);
  const addedStations = revision.stationOptions
    .filter((station) => !baselineStationOptions.has(station))
    .map((station) => `站点选项 ${station}`);
  const removedStations = baseline.stationOptions
    .filter((station) => !revisionStationOptions.has(station))
    .map((station) => `站点选项 ${station}`);

  return {
    baselineLabel: `当前发布 ${baseline.revisionId}`,
    metrics: [
      { label: '服务', before: baseline.services.length, after: revision.services.length },
      { label: '班次', before: baseline.trips.length, after: revision.trips.length },
      {
        label: '站点选项',
        before: baseline.stationOptions.length,
        after: revision.stationOptions.length,
      },
      {
        label: '公告',
        before: baseline.serviceNotices?.length ?? 0,
        after: revision.serviceNotices?.length ?? 0,
      },
    ],
    addedItems: [...addedTrips, ...addedStations],
    removedItems: [...removedTrips, ...removedServices, ...removedStations],
    changedItems: [...changedTrips, ...changedServices],
    notes: buildDiffNotes({
      addedCount: addedTrips.length + addedStations.length,
      changedCount: changedTrips.length + changedServices.length,
      removedCount: removedTrips.length + removedServices.length + removedStations.length,
    }),
  };
}

function buildDiffNotes(input: {
  addedCount: number;
  changedCount: number;
  removedCount: number;
}): string[] {
  const notes = [];
  if (input.removedCount > 0) {
    notes.push(`有 ${input.removedCount} 项移除，发布前需要确认不是来源缺失。`);
  }

  if (input.changedCount > 0) {
    notes.push(`有 ${input.changedCount} 项关键字段变化，建议抽查详情。`);
  }

  if (input.addedCount > 0) {
    notes.push(`有 ${input.addedCount} 项新增，建议确认命名和来源。`);
  }

  return notes;
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

function matchesTransitStatusFilter(
  revision: TransitDataRevision,
  filter: TransitStatusFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return (
      revision.status === 'imported' ||
      revision.status === 'pending_review' ||
      revision.status === 'approved'
    );
  }

  if (filter === 'blocked') {
    return revision.status === 'validation_failed' || revision.validation.errorCount > 0;
  }

  return revision.status === filter;
}

function matchesScheduleRevisionStatusFilter(
  revision: TravelScheduleRevision,
  filter: ScheduleStatusFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'todo') {
    return (
      revision.status === 'imported' ||
      revision.status === 'pending_review' ||
      revision.status === 'approved'
    );
  }

  if (filter === 'blocked') {
    return revision.status === 'validation_failed' || revision.validation.errorCount > 0;
  }

  return revision.status === filter;
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

function formatTransitReviewTrail(revision: TransitDataRevision): string {
  if (revision.status === 'rejected' && revision.reviewReason) {
    return `${revision.reviewedBy ?? '管理员'} 于 ${formatDate(revision.reviewedAt ?? revision.importedAt)} 驳回：${revision.reviewReason}`;
  }

  if (revision.reviewedAt) {
    return `${revision.reviewedBy ?? '管理员'} 于 ${formatDate(revision.reviewedAt)} 审核`;
  }

  if (revision.submittedAt) {
    return `${revision.submittedBy ?? '管理员'} 于 ${formatDate(revision.submittedAt)} 提交`;
  }

  return '尚未提交审核';
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

function buildTransitRevisionGeometryPreview(revision: TransitDataRevision): {
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number };
  lineCount: number;
  lines: Array<{ color?: string; id: string; points: string }>;
  missingCoordinateCount: number;
  stationCount: number;
  stations: Array<{ id: string; name: string; x: string; y: string }>;
} | null {
  const stationsWithCoordinate = revision.stations.filter(
    (station) => station.x !== undefined && station.z !== undefined,
  );
  if (stationsWithCoordinate.length === 0) {
    return null;
  }

  const stationById = new Map(revision.stations.map((station) => [station.sourceId, station]));
  const pathCoordinates = revision.lines.flatMap((line) =>
    (line.segmentPaths ?? []).flatMap((path) =>
      path.waypoints.map((point) => [point.x, point.z] as [number, number]),
    ),
  );
  const bounds = expandTransitPreviewBounds(
    getTransitPreviewBounds([
      ...stationsWithCoordinate.map(
        (station) => [station.x as number, station.z as number] as [number, number],
      ),
      ...pathCoordinates,
    ]),
    80,
  );
  const project = (x: number, z: number) => projectTransitPreviewCoordinate([x, z], bounds);
  const visibleLines = revision.lines.slice(0, 12).flatMap((line) => {
    const points = getTransitLinePreviewCoordinates(line, stationById).map(([xValue, zValue]) => {
      const [x, y] = project(xValue, zValue);
      return `${roundCoordinateValue(x)},${roundCoordinateValue(y)}`;
    });

    return points.length >= 2
      ? [
          {
            color: line.color,
            id: line.sourceId,
            points: points.join(' '),
          },
        ]
      : [];
  });

  return {
    bounds,
    lineCount: visibleLines.length,
    lines: visibleLines,
    missingCoordinateCount: revision.stations.length - stationsWithCoordinate.length,
    stationCount: stationsWithCoordinate.length,
    stations: stationsWithCoordinate.slice(0, 80).map((station) => {
      const [x, y] = project(station.x as number, station.z as number);
      return {
        id: station.sourceId,
        name: station.name,
        x: roundCoordinateValue(x),
        y: roundCoordinateValue(y),
      };
    }),
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

function formatOneWayStopsForEditor(line: TransitRevisionLine | undefined): string {
  return (line?.stops ?? [])
    .filter((stop) => stop.oneWay)
    .map((stop) => `${stop.stationSourceId}:${stop.oneWay}`)
    .join('\n');
}

function parseOneWayStopsText(value: string): {
  error?: string;
  items: NonNullable<TransitLineEditorSubmitPayload['oneWayStops']>;
} {
  const items: NonNullable<TransitLineEditorSubmitPayload['oneWayStops']> = [];
  const lines = value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [stationSourceId, oneWay] = line.split(/[:：\s,，]+/, 2).map((item) => item.trim());
    if (!stationSourceId || (oneWay !== 'up' && oneWay !== 'down')) {
      return {
        error: `单向站规则格式不正确：${line}`,
        items: [],
      };
    }

    items.push({
      stationSourceId,
      oneWay,
    });
  }

  return { items };
}

function formatSegmentPathsForEditor(line: TransitRevisionLine | undefined): string {
  return (line?.segmentPaths ?? [])
    .map((path) =>
      [
        `${path.fromStationSourceId} -> ${path.toStationSourceId}`,
        path.mode,
        path.waypoints
          .map((point) => `${roundCoordinateValue(point.x)},${roundCoordinateValue(point.z)}`)
          .join('; '),
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
}

function parseTransitSegmentPathsText(value: string): {
  error?: string;
  items: NonNullable<TransitRevisionLine['segmentPaths']>;
} {
  const items: NonNullable<TransitRevisionLine['segmentPaths']> = [];
  const lines = value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [stationPart, modePart = 'straight', waypointPart = '', notePart = ''] = line
      .split('|')
      .map((item) => item.trim());
    const [fromStationSourceId, toStationSourceId] = stationPart
      .split(/\s*->\s*/)
      .map((item) => item.trim());
    const mode = modePart === 'road' ? 'road' : modePart === 'straight' ? 'straight' : null;
    if (!fromStationSourceId || !toStationSourceId || !mode) {
      return {
        error: `站间路径格式不正确：${line}`,
        items: [],
      };
    }

    const waypoints = waypointPart
      ? waypointPart
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [xValue, zValue] = item.split(/[,，\s]+/, 2);
            const x = Number(xValue);
            const z = Number(zValue);
            return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
          })
      : [];
    if (waypoints.some((point) => !point)) {
      return {
        error: `站间路径途径点坐标不正确：${line}`,
        items: [],
      };
    }
    if (mode === 'road' && waypoints.length === 0) {
      return {
        error: `沿道路走行至少需要 1 个途径点：${line}`,
        items: [],
      };
    }

    items.push({
      fromStationSourceId,
      toStationSourceId,
      mode,
      waypoints: waypoints.filter((point): point is { x: number; z: number } => Boolean(point)),
      note: notePart || undefined,
    });
  }

  return { items };
}

function findNonAdjacentSegmentPath(
  segmentPaths: NonNullable<TransitRevisionLine['segmentPaths']>,
  stationSourceIds: string[],
): NonNullable<TransitRevisionLine['segmentPaths']>[number] | null {
  const adjacentKeys = new Set(
    stationSourceIds
      .slice(0, -1)
      .map((stationSourceId, index) =>
        getTransitSegmentPathKey(stationSourceId, stationSourceIds[index + 1] ?? ''),
      ),
  );

  return (
    segmentPaths.find(
      (path) =>
        !adjacentKeys.has(
          getTransitSegmentPathKey(path.fromStationSourceId, path.toStationSourceId),
        ),
    ) ?? null
  );
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
