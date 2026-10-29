'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsOverviewResponse } from '../lib/analytics/overview';
import { appPath } from '../lib/app-paths';
import { AdminRefreshButton } from './admin-refresh-button';

const featureLabels: Record<string, string> = {
  'map.browse': '地图浏览',
  'map.poi_view': '地图点位',
  'map.search': '附近搜索',
  'map.route_plan': '路线估算',
  'travel.line_query': '线路查询',
  'travel.schedule_query': '班次查询',
  'travel.journey_plan': '行程规划',
  'ticket.order': '购票',
  'ticket.checkin': '检票',
  'ridecode.session': '乘车码',
  'material.preview': '物料预览',
  'material.export': '物料导出',
  'material.import': '线网导入',
  'content.view': '内容浏览',
  'service.open': '服务入口',
  'telegraph.print': '电报纸打印',
  'telegraph.download': '电报纸下载',
  'poi.submit': '点位投稿',
  'settings.locale': '语言设置',
  'settings.push': '推送设置',
};

const taskLabels: Record<string, string> = {
  'ticket.order': '购票',
  'material.export': '物料导出',
  'poi.submit': '点位投稿',
};

export function AdminAnalyticsOverview() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [statusText, setStatusText] = useState('正在读取统计数据');

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch(appPath('/api/admin/analytics/overview?days=30'), {
        cache: 'no-store',
      });
      const payload = (await response.json()) as AnalyticsOverviewResponse & { message?: string };

      if (!response.ok) {
        setStatusText(payload.message ?? '统计数据暂不可用');
        return;
      }

      setData(payload);
      setStatusText(
        payload.latest ? `数据截至 ${payload.latest.day}` : '还没有聚合数据，请先运行统计聚合任务',
      );
    } catch {
      setStatusText('统计数据暂不可用');
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const exportTask = data?.latest?.tasks.find((item) => item.id === 'material.export');
  const maxActiveUsers = Math.max(1, ...(data?.series ?? []).map((item) => item.activeUsers ?? 0));
  const features = (data?.latest?.features ?? []).slice(0, 8);

  const metrics = [
    { label: '活跃用户', value: formatCount(data?.latest?.activeUsers) },
    { label: '会话数', value: formatCount(data?.latest?.sessions) },
    { label: '错误率', value: formatPercent(data?.latest?.errorRate) },
    { label: '物料导出成功率', value: formatPercent(exportTask?.rate ?? null) },
  ];

  return (
    <section className="admin-analytics-overview" aria-labelledby="admin-analytics-title">
      <div className="admin-home-overview-heading">
        <div>
          <span className="material-symbols-outlined" aria-hidden="true">
            analytics
          </span>
          <h2 id="admin-analytics-title">数据概览</h2>
        </div>
        <div className="admin-content-actions">
          <span className="muted" role="status">
            {statusText}
          </span>
          <AdminRefreshButton label="刷新数据" onRefresh={loadOverview} resource="all" />
        </div>
      </div>

      <div className="admin-analytics-metrics">
        {metrics.map((metric) => (
          <div className="admin-analytics-metric" key={metric.label}>
            <strong>{metric.value}</strong>
            <small>{metric.label}</small>
          </div>
        ))}
      </div>

      {data && data.series.length > 0 ? (
        <div className="admin-analytics-trend" aria-label="近 30 天活跃用户趋势">
          {data.series.map((item) => (
            <span
              className="admin-analytics-trend-bar"
              key={item.day}
              style={{ height: `${Math.round(((item.activeUsers ?? 0) / maxActiveUsers) * 100)}%` }}
              title={`${item.day}：${item.activeUsers ?? 0} 位活跃用户`}
            />
          ))}
        </div>
      ) : null}

      {features.length > 0 ? (
        <table className="admin-analytics-table">
          <thead>
            <tr>
              <th scope="col">功能</th>
              <th scope="col">活跃用户</th>
              <th scope="col">渗透率</th>
            </tr>
          </thead>
          <tbody>
            {features.map((item) => (
              <tr key={item.id}>
                <td>{featureLabels[item.id] ?? item.id}</td>
                <td>{formatCount(item.users)}</td>
                <td>{formatPercent(item.penetration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="admin-analytics-empty">还没有功能使用数据，前端埋点上报后会在这里出现。</p>
      )}

      {data?.latest?.tasks.length ? (
        <div className="admin-analytics-tasks">
          {data.latest.tasks.map((task) => (
            <span key={task.id}>
              {taskLabels[task.id] ?? task.id}成功率 {formatPercent(task.rate)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return `${(value * 100).toFixed(1)}%`;
}
