'use client';

import { useEffect, useRef, useState } from 'react';
import {
  publishAdminDataChanged,
  subscribeAdminDataChanged,
  type AdminDataResource,
} from '../lib/client-admin-data-events';

export function AdminRefreshButton({
  disabled = false,
  label = '刷新数据',
  onRefresh,
  resource = 'all',
}: Readonly<{
  disabled?: boolean;
  label?: string;
  onRefresh: () => Promise<unknown> | unknown;
  resource?: AdminDataResource;
}>) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshHandlerRef = useRef(onRefresh);
  const isRefreshingRef = useRef(false);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    refreshHandlerRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const refresh = async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await refreshHandlerRef.current();
    } catch {
      // 数据读取函数负责更新页面状态；按钮只需结束本次刷新状态。
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && !disabledRef.current) {
        void refresh();
      }
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    return subscribeAdminDataChanged(
      resource,
      () => {
        if (document.visibilityState === 'visible' && !disabledRef.current) {
          void refresh();
        }
      },
      { includeSameWindow: false },
    );
  }, [resource]);

  return (
    <button
      className="secondary-action-button"
      type="button"
      disabled={disabled || isRefreshing}
      onClick={() => {
        publishAdminDataChanged({
          resource,
          reason: 'manual_refresh',
          occurredAt: new Date().toISOString(),
        });
        void refresh();
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        refresh
      </span>
      <span>{isRefreshing ? '正在刷新' : label}</span>
    </button>
  );
}
