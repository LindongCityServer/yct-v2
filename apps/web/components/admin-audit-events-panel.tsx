'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

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

const auditStatusFilterOptions: Array<{ value: AdminAuditStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '待派发' },
  { value: 'dispatched', label: '已派发' },
  { value: 'failed', label: '失败' },
];

export function AdminAuditEventsPanel() {
  const [auditEvents, setAuditEvents] = useState<AdminAuditEventRecord[]>([]);
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
    if (actorFilter.trim()) {
      params.set('actorId', actorFilter.trim());
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
    const timerId = window.setTimeout(() => {
      void loadAuditEvents();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [actorFilter, entityFilter, searchText, statusFilter, typeFilter]);

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
            placeholder="Published / Reviewed / Updated"
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
            placeholder="admin 或用户 ID"
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
        <button
          className="secondary-action-button"
          type="button"
          disabled={isBusy}
          onClick={() => void loadAuditEvents()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
          <span>刷新审计</span>
        </button>
      </div>
      <div className="admin-content-list" aria-label="后台审计事件列表">
        {auditEvents.map((event) => (
          <article className="admin-content-item admin-audit-event-item" key={event.eventId}>
            <div>
              <strong>{event.type}</strong>
              <p className="muted">
                {describeAuditEventStatus(event.status)} · {describeAuditActor(event.actor)} ·
                发生 {formatDateTime(event.occurredAt)} · 尝试 {event.attempts}
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

function describeAuditActor(actor: AdminAuditEventRecord['actor']): string {
  return actor.id ? `${actor.type} ${actor.id}` : actor.type;
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
