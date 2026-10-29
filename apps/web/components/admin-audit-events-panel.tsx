'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { AdminRefreshButton } from './admin-refresh-button';

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

interface AdminUserDirectoryEntry {
  id: string;
  ldpassUserId: string;
  displayName: string;
}

const auditStatusFilterOptions: Array<{ value: AdminAuditStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '待派发' },
  { value: 'dispatched', label: '已派发' },
  { value: 'failed', label: '失败' },
];

export function AdminAuditEventsPanel() {
  const [auditEvents, setAuditEvents] = useState<AdminAuditEventRecord[]>([]);
  const [userDirectory, setUserDirectory] = useState<AdminUserDirectoryEntry[]>([]);
  const [statusText, setStatusText] = useState('正在读取后台审计事件');
  const [statusFilter, setStatusFilter] = useState<AdminAuditStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const statusCounts = useMemo(
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
  const eventTypeOptions = useMemo(
    () =>
      Array.from(new Set(auditEvents.map((event) => event.type))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [auditEvents],
  );
  const hasActiveFilters =
    statusFilter !== 'all' ||
    typeFilter.trim().length > 0 ||
    entityFilter.trim().length > 0 ||
    actorFilter.trim().length > 0 ||
    searchText.trim().length > 0;
  const actorNameById = useMemo(
    () => new Map(userDirectory.map((actor) => [actor.ldpassUserId, actor.displayName] as const)),
    [userDirectory],
  );

  const loadUserDirectory = async () => {
    try {
      const response = await fetch(appPath('/api/admin/user-links'), { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { actors?: AdminUserDirectoryEntry[] };
      setUserDirectory(data.actors ?? []);
    } catch {
      // 用户目录仅用于展示名称，读取失败时回退显示原始 ID。
    }
  };

  const loadAuditEvents = async () => {
    const params = new URLSearchParams({ limit: '100' });
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    if (typeFilter.trim()) {
      params.set('type', typeFilter.trim());
    }
    if (entityFilter.trim()) {
      params.set('entityId', entityFilter.trim());
    }
    const actorKeyword = actorFilter.trim();
    if (actorKeyword) {
      const matchedActor = userDirectory.find(
        (actor) =>
          actor.displayName.toLocaleLowerCase('zh-CN') === actorKeyword.toLocaleLowerCase('zh-CN'),
      );
      params.set('actorId', matchedActor?.ldpassUserId ?? actorKeyword);
    }
    if (searchText.trim()) {
      params.set('search', searchText.trim());
    }

    setIsBusy(true);
    setStatusText('正在读取后台审计事件');
    try {
      const response = await fetch(appPath(`/api/admin/audit-events?${params.toString()}`), {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        items?: AdminAuditEventRecord[];
        message?: string;
      };
      if (!response.ok) {
        setStatusText(data.message ?? '后台审计事件暂不可用');
        return;
      }

      setAuditEvents(data.items ?? []);
      const filterSummary = describeAuditFilterSummary({
        status: statusFilter,
        type: typeFilter,
        entityId: entityFilter,
        actorId: actorFilter,
        search: searchText,
      });
      setStatusText(
        data.items?.length
          ? `已读取 ${data.items.length} 条审计事件${filterSummary ? ` · ${filterSummary}` : ''}`
          : filterSummary
            ? `当前筛选下暂无审计事件 · ${filterSummary}`
            : '暂无后台审计事件',
      );
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void loadUserDirectory();
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAuditEvents();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [actorFilter, entityFilter, searchText, statusFilter, typeFilter, userDirectory]);

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('');
    setEntityFilter('');
    setActorFilter('');
    setSearchText('');
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-audit-title">
      <div className="section-heading">
        <h1 id="admin-audit-title">审计事件</h1>
        <span className="muted">{statusText}</span>
      </div>
      <div className="admin-report-summary" aria-label="后台事件摘要">
        <ReportMetric label="最近事件" value={auditEvents.length} />
        <ReportMetric label="待派发" value={statusCounts.queued} />
        <ReportMetric
          label="已派发"
          value={statusCounts.dispatched}
          tone={statusCounts.dispatched > 0 ? 'ok' : undefined}
        />
        <ReportMetric
          label="失败"
          value={statusCounts.failed}
          tone={statusCounts.failed > 0 ? 'warning' : undefined}
        />
      </div>
      <div className="admin-poi-toolbar admin-content-toolbar" aria-label="后台审计筛选">
        <label>
          <span>状态</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value as AdminAuditStatusFilter)}
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
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.currentTarget.value)}
            placeholder="如 ContentPublished"
          />
        </label>
        <label className="admin-poi-search">
          <span>实体</span>
          <input
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.currentTarget.value)}
            placeholder="contentId / poiId / revisionId"
          />
        </label>
        <label className="admin-poi-search">
          <span>操作者</span>
          <input
            value={actorFilter}
            onChange={(event) => setActorFilter(event.currentTarget.value)}
            placeholder="用户名或用户 ID"
          />
        </label>
        <label className="admin-poi-search">
          <span>关键词</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            placeholder="事件名、载荷字段、状态"
          />
        </label>
        <button type="button" disabled={!hasActiveFilters} onClick={clearFilters}>
          清空筛选
        </button>
        <datalist id="admin-audit-event-types">
          {eventTypeOptions.map((eventType) => (
            <option value={eventType} key={eventType} />
          ))}
        </datalist>
      </div>
      <div className="admin-toolbar">
        <AdminRefreshButton
          disabled={isBusy}
          label="刷新审计"
          onRefresh={loadAuditEvents}
          resource="audit"
        />
      </div>
      <div className="admin-content-list" aria-label="后台审计事件列表">
        {auditEvents.map((event) => (
          <article className="admin-content-item admin-audit-event-item" key={event.eventId}>
            <div>
              <strong title={event.type}>{describeAuditEventType(event.type)}</strong>
              <p className="muted">
                {describeAuditEventStatus(event.status)} ·{' '}
                {describeAuditActor(event.actor, actorNameById)} · 发生{' '}
                {formatDateTime(event.occurredAt)} · 尝试 {event.attempts}
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
              {hasActiveFilters ? '当前筛选下暂无后台审计事件。' : '暂无后台审计事件。'}
            </p>
            <button type="button" onClick={() => void loadAuditEvents()}>
              重新读取
            </button>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters}>
                清空筛选
              </button>
            ) : null}
          </div>
        ) : null}
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

function formatDateTime(value: string | undefined): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '未生成';
}

function describeAuditEventStatus(status: AdminAuditEventRecord['status']): string {
  const labels: Record<AdminAuditEventRecord['status'], string> = {
    queued: '待派发',
    dispatched: '已派发',
    failed: '失败',
  };

  return labels[status];
}

function describeAuditActor(
  actor: AdminAuditEventRecord['actor'],
  actorNameById: Map<string, string>,
): string {
  const typeLabel = auditActorTypeLabels[actor.type] ?? actor.type;
  return actor.id ? `${typeLabel} ${formatAuditActorName(actor.id, actorNameById)}` : typeLabel;
}

/** 将 LDPass 用户 ID 显示为“用户名（ID 末段）”，缺少快照时回退为原始 ID。 */
function formatAuditActorName(actorId: string, actorNameById: Map<string, string>): string {
  const name = actorNameById.get(actorId);
  if (!name || name === actorId) {
    return actorId;
  }

  const suffix = actorId.length > 8 ? actorId.slice(-6) : actorId;
  return `${name}（${suffix}）`;
}

const auditActorTypeLabels: Record<AdminAuditEventRecord['actor']['type'], string> = {
  anonymous: '匿名',
  user: '用户',
  admin: '管理员',
  system: '系统',
  adapter: '适配器',
};

const auditEventEntityLabels: Array<[string, string]> = [
  ['ApplicationRelease', '应用发布'],
  ['ReleaseNotes', '更新说明'],
  ['ContentAsset', '内容素材'],
  ['ContentPoiBindings', '内容 POI 绑定'],
  ['ContentLegacy', '旧内容'],
  ['Content', '内容'],
  ['PoiSubmissionImage', 'POI 投稿图片'],
  ['PoiCategoryProfile', 'POI 分类配置'],
  ['PoiCategoryIcon', 'POI 分类图标'],
  ['PoiCategory', 'POI 分类'],
  ['PoiSubmission', 'POI 投稿'],
  ['PoiConflictDecision', 'POI 冲突决策'],
  ['Poi', 'POI'],
  ['LegacyMapMarker', '旧地图标记'],
  ['TransitDataRevisionStationDetail', '交通数据站点设施'],
  ['TransitDataRevisionStation', '交通数据站点'],
  ['TransitDataRevisionLine', '交通数据线路'],
  ['TransitDataRevision', '交通数据批次'],
  ['TransitLine', '线路'],
  ['TransitOperationStatus', '运营状态'],
  ['TransitModeProfile', '出行方式配置'],
  ['TileProvider', '底图服务商'],
  ['MapSpatialProfile', '地图空间配置'],
  ['RoutingTopology', '路由拓扑'],
  ['MapShareLink', '地图分享链接'],
  ['MapFavorites', '地图收藏'],
  ['AdministrativeArea', '行政区划'],
  ['PlayerLocationPresence', '玩家在线状态'],
  ['PlayerLocations', '玩家位置'],
  ['PlayerLocation', '玩家位置'],
  ['ServerStatus', '服务器状态'],
  ['TripReminder', '行程提醒'],
  ['PushPreference', '推送偏好'],
  ['PushDeviceSubscription', '推送设备订阅'],
  ['PushDevice', '推送设备'],
  ['PushDelivery', '推送投递'],
  ['OfflinePackage', '离线包'],
  ['LdpassThemeSchedule', '临东通主题排期'],
  ['LdpassTicketStatus', '临东通票证状态'],
  ['LdpassUser', '临东通账号'],
  ['LocalePreference', '语言偏好'],
  ['TranslationCatalog', '翻译目录'],
  ['EntityTranslation', '实体翻译'],
  ['MaterialRoadPinyinOverride', '道路拼音覆盖'],
  ['MaterialTransitLineNumberOverride', '线路编号覆盖'],
  ['MaterialTransitNetworkProject', '线路网络项目'],
  ['MaterialSymbolAsset', '符号素材'],
  ['MaterialTemplate', '物料模板'],
  ['MaterialDraft', '物料草稿'],
  ['MaterialPreview', '物料预览'],
  ['MaterialExport', '物料导出'],
  ['TelegraphDraft', '电报表单草稿'],
  ['TelegraphPrint', '电报表单打印'],
  ['TelegraphArtifact', '电报表单产物'],
  ['OperationsStrongReminderRules', '强提醒规则'],
  ['OperationsReminderDelivery', '运营提醒投递'],
  ['ServiceEntry', '服务入口'],
  ['TravelScheduleServiceProfile', '班次服务档案'],
  ['TravelScheduleRevision', '班次修订'],
  ['TravelScheduleTrip', '班次'],
  ['TravelSchedule', '班次'],
  ['TravelJourney', '行程'],
  ['Ticket', '票务'],
  ['RideCode', '乘车码'],
  ['YctSession', '雨城通会话'],
  ['AdminMembership', '管理员权限'],
  ['Admin', '管理员'],
];
auditEventEntityLabels.sort((left, right) => right[0].length - left[0].length);

const auditEventActionLabels: Array<[string, string]> = [
  ['MigrationCompleted', '迁移完成'],
  ['ConflictDetected', '冲突检测'],
  ['GateEventReceived', '闸机事件接收'],
  ['AuthorizationSynchronized', '授权同步'],
  ['AuthorizationReleased', '授权释放'],
  ['InventoryHoldExpired', '占座过期'],
  ['RedemptionLinkCreated', '核销链接创建'],
  ['ActionLinkCreated', '操作链接创建'],
  ['JourneyDraftCreated', '行程草稿创建'],
  ['RefundRequested', '退款申请'],
  ['RefreshRequested', '刷新请求'],
  ['PresenceChanged', '在线状态变更'],
  ['ApprovalChanged', '审核状态变更'],
  ['OperationStatusChanged', '运营状态变更'],
  ['InventoryHeld', '占座'],
  ['RedemptionLinked', '核销关联'],
  ['RefundCompleted', '退款完成'],
  ['RequestDeleted', '请求删除'],
  ['OrderCancelled', '订单取消'],
  ['OrderCreated', '订单创建'],
  ['SessionCreated', '会话创建'],
  ['TimingUpdated', '时刻更新'],
  ['DraftUpdated', '草稿更新'],
  ['RulesUpdated', '规则更新'],
  ['EntryFrozen', '入口冻结'],
  ['FareCaptured', '扣费'],
  ['Initialized', '初始化'],
  ['Generated', '生成'],
  ['Downloaded', '下载'],
  ['Subscribed', '订阅'],
  ['Upserted', '新增或更新'],
  ['Promoted', '提升'],
  ['Restored', '恢复'],
  ['Imported', '导入'],
  ['Uploaded', '上传'],
  ['Renamed', '重命名'],
  ['Scheduled', '排期'],
  ['Submitted', '提交'],
  ['Reviewed', '审核'],
  ['Published', '发布'],
  ['Archived', '归档'],
  ['Updated', '更新'],
  ['Created', '创建'],
  ['Deleted', '删除'],
  ['Queued', '入队'],
  ['Completed', '完成'],
  ['Requested', '请求'],
  ['Cancelled', '取消'],
  ['Started', '开始'],
  ['Ended', '结束'],
  ['Detected', '检测'],
  ['Changed', '变更'],
  ['Synced', '同步'],
  ['Synchronized', '同步'],
  ['Linked', '关联'],
  ['Adopted', '接管'],
  ['Frozen', '冻结'],
  ['Captured', '扣费'],
  ['Released', '释放'],
  ['Issued', '出票'],
  ['Selected', '选择'],
  ['Viewed', '查看'],
  ['Invalidated', '失效'],
  ['Progress', '进度'],
  ['Observed', '采集'],
  ['Expired', '过期'],
  ['Edited', '编辑'],
  ['Received', '接收'],
  ['Revoked', '撤销'],
  ['Planned', '规划'],
];
auditEventActionLabels.sort((left, right) => right[0].length - left[0].length);

/** 按“实体前缀 + 动作后缀”生成中文事件名，无法识别时回退原始事件名。 */
function describeAuditEventType(type: string): string {
  const entity = auditEventEntityLabels.find(([prefix]) => type.startsWith(prefix));
  if (!entity) {
    return type;
  }

  const actionKey = type.slice(entity[0].length);
  const action = auditEventActionLabels.find(([suffix]) => actionKey.endsWith(suffix));
  return action ? `${entity[1]} ${action[1]}` : type;
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
