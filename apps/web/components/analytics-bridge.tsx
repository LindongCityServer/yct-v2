'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  ensureAnalyticsSession,
  flushAnalyticsQueue,
  isAnalyticsEnabled,
  normalizeAnalyticsRoute,
  trackAnalyticsEvent,
} from '../lib/analytics/client';
import type { AnalyticsFeatureId } from '../lib/analytics/schema';

/**
 * 页面级功能映射。
 *
 * 只收录"进入页面即代表使用该功能"的入口；点击级行为（导出、下单、乘车码）
 * 由对应业务组件显式调用 trackAnalyticsEvent，避免渗透率被页面浏览污染。
 */
const routeFeatures: Array<{ prefix: string; feature: AnalyticsFeatureId }> = [
  { prefix: '/map', feature: 'map.browse' },
  { prefix: '/travel', feature: 'travel.line_query' },
  { prefix: '/services', feature: 'service.open' },
  { prefix: '/operations', feature: 'content.view' },
];

export function AnalyticsBridge() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) {
      return;
    }

    const session = ensureAnalyticsSession();
    if (session.isNew) {
      trackAnalyticsEvent('app.session.started');
    }
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled() || !pathname) {
      return;
    }

    const route = normalizeAnalyticsRoute(pathname);
    if (lastPathRef.current === route) {
      return;
    }
    lastPathRef.current = route;

    trackAnalyticsEvent('page.viewed', { path: route });

    const feature = resolveRouteFeature(route);
    if (feature) {
      trackAnalyticsEvent('feature.used', { feature, surface: 'route' });
    }
  }, [pathname]);

  useEffect(() => {
    if (!isAnalyticsEnabled()) {
      return;
    }

    const handleHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushAnalyticsQueue(true);
      }
    };
    const handlePageHide = () => flushAnalyticsQueue(true);
    const handleError = (event: ErrorEvent) => {
      trackAnalyticsEvent('error.client', {
        kind: 'error',
        message_digest: digestMessage(event.message),
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      trackAnalyticsEvent('error.client', {
        kind: 'unhandledrejection',
        message_digest: digestMessage(String(event.reason)),
      });
    };

    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

function resolveRouteFeature(route: string): AnalyticsFeatureId | undefined {
  return routeFeatures.find((item) => route === item.prefix || route.startsWith(`${item.prefix}/`))
    ?.feature;
}

/** 只上报摘要，避免把错误原文（可能含用户输入）写入统计库。 */
function digestMessage(value: string | undefined): string {
  const text = value?.trim();
  if (!text) {
    return 'empty';
  }

  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}
