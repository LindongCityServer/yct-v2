'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyticsEventNames, type AnalyticsEventListItem } from '../lib/analytics/schema';
import { appPath } from '../lib/app-paths';
import { AdminRefreshButton } from './admin-refresh-button';

const pageSize = 50;

const eventLabels: Record<string, string> = {
  'app.session.started': '会话开始',
  'page.viewed': '页面浏览',
  'feature.used': '功能使用',
  'map.search.performed': '地图搜索',
  'map.route.failed': '路线失败',
  'material.export.started': '导出开始',
  'material.export.succeeded': '导出成功',
  'material.export.failed': '导出失败',
  'material.preview.succeeded': '预览成功',
  'ticket.order.started': '下单开始',
  'ticket.order.succeeded': '下单成功',
  'ticket.order.failed': '下单失败',
  'poi.submit.started': '投稿开始',
  'poi.submit.succeeded': '投稿成功',
  'poi.review.completed': '审核完成',
  'error.client': '前端错误',
  'error.api': '接口错误',
};

export function AdminAnalyticsEventsPanel() {
  const [items, setItems] = useState<AnalyticsEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [eventName, setEventName] = useState('');
  const [route, setRoute] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [statusText, setStatusText] = useState('正在读取行为事件');

  const loadEvents = useCallback(
    async (nextOffset: number) => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(nextOffset),
      });
      if (eventName) {
        params.set('eventName', eventName);
      }
      if (route.trim()) {
        params.set('route', route.trim());
      }
      if (fromDay) {
        params.set('fromDay', fromDay);
      }
      if (toDay) {
        params.set('toDay', toDay);
      }

      setIsBusy(true);
      setStatusText('正在读取行为事件');
      try {
        const response = await fetch(appPath(`/api/admin/analytics/events?${params.toString()}`), {
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          items?: AnalyticsEventListItem[];
          total?: number;
          message?: string;
        };

        if (!response.ok) {
          setStatusText(data.message ?? '行为事件暂不可用');
          return;
        }

        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setOffset(nextOffset);
        setStatusText(
          data.total ? `共 ${data.total} 条行为事件（保留期 90 天）` : '当前筛选下暂无行为事件',
        );
      } catch {
        setStatusText('行为事件暂不可用');
      } finally {
        setIsBusy(false);
      }
    },
    [eventName, route, fromDay, toDay],
  );

  useEffect(() => {
    void loadEvents(0);
  }, [loadEvents]);

  const rangeText =
    total === 0
      ? '共 0 条'
      : `第 ${offset + 1}-${Math.min(offset + pageSize, total)} 条 / 共 ${total} 条`;

  return (
    <section className="admin-analytics-events" aria-labelledby="admin-analytics-events-title">
      <div className="admin-home-overview-heading">
        <div>
          <span className="material-symbols-outlined" aria-hidden="true">
            list_alt
          </span>
          <h2 id="admin-analytics-events-title">行为事件</h2>
        </div>
        <div className="admin-content-actions">
          <span className="muted" role="status">
            {statusText}
          </span>
          <AdminRefreshButton
            label="刷新事件"
            onRefresh={() => loadEvents(offset)}
            resource="all"
          />
        </div>
      </div>

      <form
        className="admin-analytics-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void loadEvents(0);
        }}
      >
        <label>
          <span>事件</span>
          <select value={eventName} onChange={(event) => setEventName(event.target.value)}>
            <option value="">全部事件</option>
            {analyticsEventNames.map((name) => (
              <option value={name} key={name}>
                {eventLabels[name] ?? name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>路由</span>
          <input
            value={route}
            onChange={(event) => setRoute(event.target.value)}
            placeholder="/map"
            spellCheck={false}
          />
        </label>
        <label>
          <span>开始日期</span>
          <input type="date" value={fromDay} onChange={(event) => setFromDay(event.target.value)} />
        </label>
        <label>
          <span>结束日期</span>
          <input type="date" value={toDay} onChange={(event) => setToDay(event.target.value)} />
        </label>
        <button className="secondary-action-button" type="submit" disabled={isBusy}>
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <span>查询</span>
        </button>
      </form>

      {items.length > 0 ? (
        <table className="admin-analytics-table is-events">
          <thead>
            <tr>
              <th scope="col">时间</th>
              <th scope="col">事件</th>
              <th scope="col">路由</th>
              <th scope="col">用户</th>
              <th scope="col" className="admin-analytics-props-column">
                属性
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.eventId}>
                <td>{formatEventTime(item.occurredAt)}</td>
                <td>
                  {eventLabels[item.eventName] ?? item.eventName}
                  <small className="admin-analytics-event-name">{item.eventName}</small>
                </td>
                <td>{item.route ?? '—'}</td>
                <td>
                  {item.userId ? `用户 ${shortId(item.userId)}` : `匿名 ${shortId(item.clientId)}`}
                </td>
                <td className="admin-analytics-props-column">
                  {summarizeProperties(item.properties)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="admin-analytics-empty">当前筛选下没有行为事件。</p>
      )}

      <div className="admin-analytics-pagination">
        <button
          className="secondary-action-button"
          type="button"
          disabled={offset === 0 || isBusy}
          onClick={() => void loadEvents(Math.max(offset - pageSize, 0))}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
          <span>上一页</span>
        </button>
        <span>{rangeText}</span>
        <button
          className="secondary-action-button"
          type="button"
          disabled={offset + pageSize >= total || isBusy}
          onClick={() => void loadEvents(offset + pageSize)}
        >
          <span>下一页</span>
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>
    </section>
  );
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(-6) : value;
}

/** 优先展示最有排查价值的字段，其余折成一行 JSON。 */
function summarizeProperties(properties: Record<string, unknown>): string {
  const preferredKeys = [
    'feature',
    'reason',
    'template_id',
    'source_kind',
    'path',
    'kind',
    'order_count',
  ];

  for (const key of preferredKeys) {
    const value = properties[key];
    if (value !== undefined && value !== null) {
      return `${key}: ${String(value)}`;
    }
  }

  const serialized = JSON.stringify(properties);
  if (!serialized || serialized === '{}') {
    return '—';
  }

  return serialized.length > 60 ? `${serialized.slice(0, 60)}…` : serialized;
}
