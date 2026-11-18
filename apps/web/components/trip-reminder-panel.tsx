'use client';

import type { TripReminder, TripReminderStatus } from '@yct/contracts';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  createTripReminder,
  deleteTripReminder,
  formatTripReminderTime,
  readTripReminderState,
  splitTripReminders,
  toDatetimeLocalValue,
  updateTripReminderStatus,
  type TripReminderState,
} from '../lib/client-trip-reminders';
import { useI18n } from '../lib/client-i18n';
import { Button, IconButton } from './ui/button';
import { EmptyState, FormErrorText } from './ui/status';
import { Modal } from './ui/modal';

type Translate = ReturnType<typeof useI18n>['t'];

const emptyDraft = {
  title: '',
  departure: '',
  arrival: '',
  lineName: '',
};

export function TripReminderPanel() {
  const { t } = useI18n();
  const [state, setState] = useState<TripReminderState | null>(null);
  const [draft, setDraft] = useState({ ...emptyDraft, remindAt: '' });
  const [errorText, setErrorText] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  // 提交按钮位于 form 之外（弹窗直接子级操作栏，保证吸底几何正确），用 form 属性关联。
  const reminderFormId = useId();

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
      setErrorText(t('tripReminder.error.missingContent'));
      return;
    }

    const remindAt = new Date(draft.remindAt);
    if (!draft.remindAt || Number.isNaN(remindAt.getTime())) {
      setErrorText(t('tripReminder.error.invalidTime'));
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
          <h2 id="trip-reminder-title">{t('tripReminder.title')}</h2>
          <span className="muted">
            {state
              ? t('tripReminder.summary', {
                  scheduled: state.summary.scheduled,
                  history: state.summary.history,
                })
              : t('tripReminder.loading')}
          </span>
        </div>
        <div className="trip-heading-actions">
          <span className="trip-local-badge">
            {t('tripReminder.localBadge', { count: state?.summary.localOnly ?? 0 })}
          </span>
          <Button icon="add_alarm" onClick={() => setFormOpen(true)}>
            {t('tripReminder.add')}
          </Button>
        </div>
      </div>

      {state?.legacyImportedCount ? (
        <p className="trip-import-notice">
          {t('tripReminder.imported', { count: state.legacyImportedCount, source: 'orders' })}
        </p>
      ) : null}

      {formOpen ? (
        <Modal
          labelledBy="trip-reminder-form-title"
          className="trip-reminder-modal"
          onBackdropClick={() => setFormOpen(false)}
        >
          <div className="section-heading">
            <h3 id="trip-reminder-form-title">{t('tripReminder.formTitle')}</h3>
            <IconButton
              icon="close"
              label={t('tripReminder.close')}
              onClick={() => setFormOpen(false)}
            />
          </div>
          <form className="trip-reminder-form" id={reminderFormId} onSubmit={createReminder}>
            <label>
              <span>{t('tripReminder.field.title')}</span>
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => updateDraft('title', event.currentTarget.value)}
                placeholder={t('tripReminder.placeholder.title')}
              />
            </label>
            <label>
              <span>{t('tripReminder.field.remindAt')}</span>
              <input
                type="datetime-local"
                value={draft.remindAt}
                onChange={(event) => updateDraft('remindAt', event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('tripReminder.field.departure')}</span>
              <input
                value={draft.departure}
                onChange={(event) => updateDraft('departure', event.currentTarget.value)}
                placeholder={t('tripReminder.placeholder.optional')}
              />
            </label>
            <label>
              <span>{t('tripReminder.field.arrival')}</span>
              <input
                value={draft.arrival}
                onChange={(event) => updateDraft('arrival', event.currentTarget.value)}
                placeholder={t('tripReminder.placeholder.optional')}
              />
            </label>
            <label>
              <span>{t('tripReminder.field.lineName')}</span>
              <input
                value={draft.lineName}
                onChange={(event) => updateDraft('lineName', event.currentTarget.value)}
                placeholder={t('tripReminder.placeholder.optional')}
              />
            </label>
          </form>
          {errorText ? <FormErrorText>{errorText}</FormErrorText> : null}
          <div className="admin-content-actions">
            <Button type="submit" form={reminderFormId} icon="add_alarm">
              {t('tripReminder.add')}
            </Button>
          </div>
        </Modal>
      ) : null}

      <TripReminderList
        title={t('tripReminder.activeTitle')}
        reminders={split.active}
        emptyText={t('tripReminder.activeEmpty')}
        onComplete={updateStatus}
        onCancel={updateStatus}
        onDelete={removeReminder}
        t={t}
      />

      <TripReminderList
        title={t('tripReminder.historyTitle')}
        reminders={split.history}
        emptyText={t('tripReminder.historyEmpty')}
        compact
        onComplete={updateStatus}
        onCancel={updateStatus}
        onDelete={removeReminder}
        t={t}
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
  t,
}: Readonly<{
  title: string;
  reminders: TripReminder[];
  emptyText: string;
  compact?: boolean;
  onComplete: (reminder: TripReminder, status: 'completed') => void;
  onCancel: (reminder: TripReminder, status: 'cancelled') => void;
  onDelete: (reminder: TripReminder) => void;
  t: Translate;
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
                  {formatTripReminderStatusLabel(reminder.status, t)}
                </span>
                <h4>{reminder.title}</h4>
                <p>{routeText(reminder, t)}</p>
                <span className="muted">
                  {formatTripReminderTime(reminder.remindAt)}
                  {' · '}
                  {reminder.source === 'legacy_order'
                    ? t('tripReminder.source.legacy')
                    : t('tripReminder.source.local')}
                </span>
              </div>
              <div className="trip-reminder-actions">
                {!compact ? (
                  <>
                    <IconButton
                      icon="task_alt"
                      label={t('tripReminder.action.complete')}
                      onClick={() => onComplete(reminder, 'completed')}
                    />
                    <IconButton
                      icon="notifications_off"
                      label={t('tripReminder.action.cancel')}
                      onClick={() => onCancel(reminder, 'cancelled')}
                    />
                  </>
                ) : null}
                <IconButton
                  icon="delete"
                  label={t('tripReminder.action.delete')}
                  onClick={() => onDelete(reminder)}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="event_upcoming" compact>
          <p>{emptyText}</p>
        </EmptyState>
      )}
    </section>
  );
}

function routeText(reminder: TripReminder, t: Translate): string {
  const route = reminder.route;
  if (!route) {
    return t('tripReminder.routeMissing');
  }

  const parts = [
    route.departure && route.arrival
      ? `${route.departure} → ${route.arrival}`
      : (route.departure ?? route.arrival),
    route.lineName,
    route.detail,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : t('tripReminder.routeMissing');
}

function formatTripReminderStatusLabel(status: TripReminderStatus, t: Translate): string {
  const labels: Record<TripReminderStatus, string> = {
    scheduled: t('tripReminder.status.scheduled'),
    notification_queued: t('tripReminder.status.notificationQueued'),
    notified: t('tripReminder.status.notified'),
    sent: t('tripReminder.status.sent'),
    ongoing: t('tripReminder.status.ongoing'),
    completed: t('tripReminder.status.completed'),
    cancelled: t('tripReminder.status.cancelled'),
    expired: t('tripReminder.status.expired'),
  };

  return labels[status];
}
