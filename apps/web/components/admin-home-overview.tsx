'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface AdminPendingReviewSummary {
  contents: number;
  contentAssets: number;
  services: number;
  transit: number;
  poi: number;
}

interface AccountStatusResponse {
  admin?: {
    pendingReviewCount: number;
    pendingReview: AdminPendingReviewSummary;
  };
  message?: string;
}

export function AdminHomeOverview() {
  const [summary, setSummary] = useState<AdminPendingReviewSummary | null>(null);
  const [statusText, setStatusText] = useState('正在读取后台待办');

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch(appPath('/api/account/status'), { cache: 'no-store' });
        const data = (await response.json()) as AccountStatusResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok || !data.admin) {
          setStatusText(data.message ?? '后台概览暂不可用');
          return;
        }

        setSummary(data.admin.pendingReview);
        setStatusText(
          data.admin.pendingReviewCount > 0
            ? `共有 ${data.admin.pendingReviewCount} 项待处理`
            : '当前没有待审核项目',
        );
      } catch {
        if (!cancelled) {
          setStatusText('后台概览暂不可用');
        }
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = [
    {
      label: '内容与素材',
      value: summary ? summary.contents + summary.contentAssets : undefined,
      icon: 'article',
    },
    { label: '服务入口', value: summary?.services, icon: 'dashboard_customize' },
    { label: '线路与班次', value: summary?.transit, icon: 'route' },
    { label: 'POI', value: summary?.poi, icon: 'add_location_alt' },
  ];

  return (
    <section className="admin-home-overview" aria-labelledby="admin-home-overview-title">
      <div className="admin-home-overview-heading">
        <div>
          <span className="material-symbols-outlined" aria-hidden="true">
            monitoring
          </span>
          <h2 id="admin-home-overview-title">概览</h2>
        </div>
        <span className="muted" role="status">
          {statusText}
        </span>
      </div>
      <div className="admin-home-overview-grid">
        {metrics.map((metric) => (
          <div className="admin-home-overview-metric" key={metric.label}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {metric.icon}
            </span>
            <span>
              <strong>{metric.value ?? '-'}</strong>
              <small>{metric.label}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
