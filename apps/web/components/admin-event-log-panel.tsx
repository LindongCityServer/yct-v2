'use client';

import { useState } from 'react';
import { AdminAnalyticsEventsPanel } from './admin-analytics-events-panel';
import { AdminAuditEventsPanel } from './admin-audit-events-panel';

type EventLogTab = 'audit' | 'behavior';

const eventLogTabs: Array<{ id: EventLogTab; label: string }> = [
  { id: 'audit', label: '领域事件' },
  { id: 'behavior', label: '行为事件' },
];

/**
 * 事件记录页：领域事件（outbox 投递记录）与行为事件（统计埋点）共用同一个入口。
 *
 * 两者数据源、保留期和用途不同，这里只合并展示入口，不做数据层合并。
 */
export function AdminEventLogPanel() {
  const [tab, setTab] = useState<EventLogTab>('audit');

  return (
    <section className="admin-event-log">
      <div className="admin-event-log-tabs" role="tablist" aria-label="事件类型">
        {eventLogTabs.map((item) => (
          <button
            className={tab === item.id ? 'is-active' : ''}
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'audit' ? <AdminAuditEventsPanel /> : <AdminAnalyticsEventsPanel />}
    </section>
  );
}
