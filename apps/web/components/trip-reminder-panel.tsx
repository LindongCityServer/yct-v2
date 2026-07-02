'use client';

import type { TripReminder } from '@yct/contracts';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createTripReminder,
  deleteTripReminder,
  formatTripReminderTime,
  readTripReminderState,
  splitTripReminders,
  statusLabel,
  toDatetimeLocalValue,
  updateTripReminderStatus,
  type TripReminderState,
} from '../lib/client-trip-reminders';

const emptyDraft = {
  title: '',
  departure: '',
  arrival: '',
  lineName: '',
};

export function TripReminderPanel() {
  const [state, setState] = useState<TripReminderState | null>(null);
  const [draft, setDraft] = useState({ ...emptyDraft, remindAt: '' });
  const [errorText, setErrorText] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      remindAt: current.remindAt || toDatetimeLocalValue(),
    }));
    setState(readTripReminderState());
  }, []);

  const split = useMemo(() => {
    if (!state) {
      return { active: [], history: [] };
    }

    return splitTripReminders(state.reminders);
  }, [state]);

  const refresh = () => {
    setState(readTripReminderState());
  };

  const updateDraft = (key: keyof typeof draft, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const createReminder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText('');

    if (
      !draft.title.trim() &&
      !draft.departure.trim() &&
      !draft.arrival.trim() &&
      !draft.lineName.trim()
    ) {
      setErrorText('至少填写标题、线路或起终点之一。');
      return;
    }

    const remindAt = new Date(draft.remindAt);
    if (!draft.remindAt || Number.isNaN(remindAt.getTime())) {
      setErrorText('请选择有效的提醒时间。');
      return;
    }

    createTripReminder({
      title: draft.title,
      departure: draft.departure,
      arrival: draft.arrival,
      lineName: draft.lineName,
      remindAt: draft.remindAt,
    });
    setDraft({ ...emptyDraft, remindAt: toDatetimeLocalValue() });
    setFormOpen(false);
    refresh();
  };

  const updateStatus = (reminder: TripReminder, status: 'completed' | 'cancelled') => {
    updateTripReminderStatus(reminder.id, status);
    refresh();
  };

  const removeReminder = (reminder: TripReminder) => {
    deleteTripReminder(reminder.id);
    refresh();
  };

  return (
    <div className="trip-reminder-panel" aria-labelledby="trip-reminder-title">
      <div className="section-heading">
        <div>
          <h2 id="trip-reminder-title">行程提醒</h2>
          <span className="muted">
            {state
              ? `${state.summary.scheduled} 个即将进行，${state.summary.history} 个历史记录`
              : '正在读取本地行程'}
          </span>
        </div>
        <div className="trip-heading-actions">
          <span className="trip-local-badge">{state?.summary.localOnly ?? 0} 个本地记录</span>
          <button className="primary-action-button" type="button" onClick={() => setFormOpen(true)}>
            <span className="material-symbols-outlined" aria-hidden="true">
              add_alarm
            </span>
            <span>添加提醒</span>
          </button>
        </div>
      </div>

      {state?.legacyImportedCount ? (
        <p className="trip-import-notice">
          已从旧站本地 <code>orders</code> 导入 {state.legacyImportedCount} 条行程记录。
        </p>
      ) : null}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFormOpen(false)}>
          <section
            className="modal-panel trip-reminder-modal"
            aria-labelledby="trip-reminder-form-title"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h3 id="trip-reminder-form-title">添加行程提醒</h3>
              <button
                className="icon-action-button"
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="关闭"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <form className="trip-reminder-form" onSubmit={createReminder}>
              <label>
                <span>标题</span>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(event) => updateDraft('title', event.currentTarget.value)}
                  placeholder="例如：去大学城"
                />
              </label>
              <label>
                <span>提醒时间</span>
                <input
                  type="datetime-local"
                  value={draft.remindAt}
                  onChange={(event) => updateDraft('remindAt', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>出发</span>
                <input
                  value={draft.departure}
                  onChange={(event) => updateDraft('departure', event.currentTarget.value)}
                  placeholder="可选"
                />
              </label>
              <label>
                <span>到达</span>
                <input
                  value={draft.arrival}
                  onChange={(event) => updateDraft('arrival', event.currentTarget.value)}
                  placeholder="可选"
                />
              </label>
              <label>
                <span>线路</span>
                <input
                  value={draft.lineName}
                  onChange={(event) => updateDraft('lineName', event.currentTarget.value)}
                  placeholder="可选"
                />
              </label>
              <button className="primary-action-button" type="submit">
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_alarm
                </span>
                <span>添加提醒</span>
              </button>
            </form>
            {errorText ? <p className="form-error-text">{errorText}</p> : null}
          </section>
        </div>
      ) : null}

      <TripReminderList
        title="即将进行"
        reminders={split.active}
        emptyText="暂无即将进行的行程。"
        onComplete={updateStatus}
        onCancel={updateStatus}
        onDelete={removeReminder}
      />

      <TripReminderList
        title="历史行程"
        reminders={split.history}
        emptyText="暂无历史行程。"
        compact
        onComplete={updateStatus}
        onCancel={updateStatus}
        onDelete={removeReminder}
      />
    </div>
  );
}

function TripReminderList({
  title,
  reminders,
  emptyText,
  compact,
  onComplete,
  onCancel,
  onDelete,
}: Readonly<{
  title: string;
  reminders: TripReminder[];
  emptyText: string;
  compact?: boolean;
  onComplete: (reminder: TripReminder, status: 'completed') => void;
  onCancel: (reminder: TripReminder, status: 'cancelled') => void;
  onDelete: (reminder: TripReminder) => void;
}>) {
  return (
    <section
      className={compact ? 'trip-reminder-group is-compact' : 'trip-reminder-group'}
      aria-label={title}
    >
      <h3>{title}</h3>
      {reminders.length > 0 ? (
        <div className="trip-reminder-list">
          {reminders.map((reminder) => (
            <article className="trip-reminder-item" key={reminder.id}>
              <div className="trip-reminder-main">
                <span className="trip-status-chip" data-status={reminder.status}>
                  {statusLabel(reminder.status)}
                </span>
                <h4>{reminder.title}</h4>
                <p>{routeText(reminder)}</p>
                <span className="muted">
                  {formatTripReminderTime(reminder.remindAt)}
                  {reminder.source === 'legacy_order' ? ' · 旧站导入' : ' · 本地保存'}
                </span>
              </div>
              <div className="trip-reminder-actions">
                {!compact ? (
                  <>
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => onComplete(reminder, 'completed')}
                      aria-label="标记完成"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        task_alt
                      </span>
                    </button>
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => onCancel(reminder, 'cancelled')}
                      aria-label="取消提醒"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        notifications_off
                      </span>
                    </button>
                  </>
                ) : null}
                <button
                  className="icon-action-button"
                  type="button"
                  onClick={() => onDelete(reminder)}
                  aria-label="删除记录"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state is-compact">
          <span className="material-symbols-outlined" aria-hidden="true">
            event_upcoming
          </span>
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}

function routeText(reminder: TripReminder): string {
  const route = reminder.route;
  if (!route) {
    return '未填写路线信息';
  }

  const parts = [
    route.departure && route.arrival
      ? `${route.departure} → ${route.arrival}`
      : (route.departure ?? route.arrival),
    route.lineName,
    route.detail,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : '未填写路线信息';
}
