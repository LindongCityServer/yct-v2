'use client';

import { useEffect, useState } from 'react';
import {
  subscribeToastRequested,
  type ClientToastRequestedPayload,
  type ClientToastTone,
} from '../lib/client-toast-events';
import { useI18n } from '../lib/client-i18n';

interface ToastItemState extends Required<Pick<ClientToastRequestedPayload, 'message' | 'tone'>> {
  dedupeKey: string;
  durationMs: number;
  id: string;
}

const maximumVisibleToasts = 3;
const defaultDurations: Record<ClientToastTone, number> = {
  info: 4000,
  success: 3200,
  warning: 5000,
  error: 6500,
};
const toneIcons: Record<ClientToastTone, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItemState[]>([]);

  useEffect(
    () =>
      subscribeToastRequested((payload) => {
        const tone = payload.tone ?? 'info';
        const dedupeKey = payload.dedupeKey?.trim() || `${tone}:${payload.message}`;
        const item: ToastItemState = {
          dedupeKey,
          durationMs: normalizeToastDuration(payload.durationMs, tone),
          id: createToastId(),
          message: payload.message,
          tone,
        };
        setItems((current) =>
          [...current.filter((existing) => existing.dedupeKey !== dedupeKey), item].slice(
            -maximumVisibleToasts,
          ),
        );
      }),
    [],
  );

  const dismiss = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="app-toast-viewport">
      {items.map((item) => (
        <ToastItem item={item} key={item.id} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>
  );
}

function ToastItem({ item, onDismiss }: Readonly<{ item: ToastItemState; onDismiss: () => void }>) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || item.durationMs === 0) {
      return;
    }
    const timer = window.setTimeout(onDismiss, item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.durationMs, onDismiss, paused]);

  const isAssertive = item.tone === 'error';
  return (
    <div
      className={`app-toast is-${item.tone}`}
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="material-symbols-outlined app-toast-icon" aria-hidden="true">
        {toneIcons[item.tone]}
      </span>
      <span className="app-toast-message">{item.message}</span>
      <button
        className="app-toast-close"
        type="button"
        aria-label={t('toast.close')}
        title={t('toast.close')}
        onClick={onDismiss}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}

function normalizeToastDuration(durationMs: number | undefined, tone: ClientToastTone): number {
  if (durationMs === 0) {
    return 0;
  }
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return defaultDurations[tone];
  }
  return Math.min(20_000, Math.max(1500, Math.round(durationMs)));
}

function createToastId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
