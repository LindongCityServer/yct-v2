'use client';

import type {
  ApiListResponse,
  ApiItemResponse,
  TicketOrderDraftResult,
  TicketOrderListItem,
  TicketableServiceKind,
  TransitServiceNotice,
  TravelScheduleHistoryItem,
  TravelScheduleQueryResult,
  TravelScheduleServiceSummary,
  TravelScheduleTimeScope,
  TravelTicketingAvailability,
  TravelTripInstance,
} from '@yct/contracts';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { notifyTicketOrderStateChanged } from '../lib/client-ticket-orders';
import {
  clearTravelScheduleHistory,
  readTravelScheduleHistoryState,
  saveTravelScheduleHistory,
  type TravelScheduleHistoryState,
} from '../lib/client-schedule-history';
import { createTripReminder, formatTripReminderTime } from '../lib/client-trip-reminders';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { TicketOrderDraftPanel } from './ticket-order-draft-panel';

type ServiceFilter = TicketableServiceKind | 'all';
type Translate = ReturnType<typeof useI18n>['t'];

const timeOptions: Array<{
  value: TravelScheduleTimeScope;
  labelKey: CommonMessageKey;
  icon: string;
}> = [
  { value: 'all', labelKey: 'travelSchedule.time.all', icon: 'format_list_bulleted' },
  { value: 'upcoming', labelKey: 'travelSchedule.time.upcoming', icon: 'schedule' },
  { value: 'past', labelKey: 'travelSchedule.time.past', icon: 'history' },
];

export function TravelScheduleQueryPanel({
  initialQuery = '',
  result,
}: Readonly<{
  initialQuery?: string;
  result: TravelScheduleQueryResult;
}>) {
  const { t } = useI18n();
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState<TravelScheduleTimeScope>('all');
  const [serviceDate, setServiceDate] = useState(() => toDateInputValue(new Date()));
  const [query, setQuery] = useState(initialQuery);
  const [historyState, setHistoryState] = useState<TravelScheduleHistoryState | null>(null);
  const [ticketOrders, setTicketOrders] = useState<TicketOrderListItem[] | null>(null);
  const [ticketOrderStatusText, setTicketOrderStatusText] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const currentMinutes = getCurrentAdjustedMinutes();
  const syncScheduleHistory = () => {
    setHistoryState(readTravelScheduleHistoryState());
  };
  const refreshTicketOrders = async () => {
    try {
      const response = await fetch(appPath('/api/travel/ticketing/orders'), { cache: 'no-store' });
      const data = (await response.json()) as Partial<ApiListResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (response.status === 401) {
        setTicketOrders([]);
        setTicketOrderStatusText(t('travelSchedule.order.loginRequired'));
        return;
      }

      if (!response.ok || !data.items) {
        throw new Error(data.message ?? t('travelSchedule.order.readFailed'));
      }

      setTicketOrders(data.items);
      setTicketOrderStatusText(data.items.length > 0 ? '' : t('travelSchedule.order.empty'));
    } catch (error) {
      setTicketOrders([]);
      setTicketOrderStatusText(
        error instanceof Error ? error.message : t('travelSchedule.order.readFailed'),
      );
    }
  };
  const cancelTicketOrder = async (orderId: string) => {
    if (!window.confirm(t('travelSchedule.order.cancelConfirm'))) {
      return;
    }

    setCancellingOrderId(orderId);
    setTicketOrderStatusText(t('travelSchedule.order.canceling'));
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };
      if (!response.ok || !data.item) {
        throw new Error(data.message ?? t('travelSchedule.order.cancelFailed'));
      }

      setTicketOrderStatusText(t('travelSchedule.order.cancelDone'));
      await refreshTicketOrders();
      notifyTicketOrderStateChanged();
    } catch (error) {
      setTicketOrderStatusText(
        error instanceof Error ? error.message : t('travelSchedule.order.cancelFailed'),
      );
    } finally {
      setCancellingOrderId(null);
    }
  };

  useEffect(() => {
    syncScheduleHistory();
    void refreshTicketOrders();
  }, []);

  const filteredTrips = useMemo(
    () =>
      filterTrips(result.trips, {
        serviceFilter,
        stationFilter,
        originFilter,
        destinationFilter,
        timeFilter,
        serviceDate,
        query,
        currentMinutes,
      }),
    [
      currentMinutes,
      destinationFilter,
      originFilter,
      query,
      result.trips,
      serviceDate,
      serviceFilter,
      stationFilter,
      timeFilter,
    ],
  );
  const serviceNotices = useMemo(
    () => filterServiceNoticesByDate(result.serviceNotices ?? [], serviceDate),
    [result.serviceNotices, serviceDate],
  );
  const selectedService = result.services.find((service) => service.kind === serviceFilter);
  const serviceByKind = useMemo(
    () => new Map(result.services.map((service) => [service.kind, service])),
    [result.services],
  );
  const tripById = useMemo(
    () => new Map(result.trips.map((trip) => [trip.tripInstanceId, trip])),
    [result.trips],
  );
  const emptyMessage =
    serviceFilter !== 'all' && selectedService?.status !== 'active'
      ? selectedService?.message
      : t('travelSchedule.empty.noMatch');
  const selectHistoryItem = (item: TravelScheduleHistoryItem) => {
    setServiceFilter(item.serviceKind);
    setStationFilter('all');
    setOriginFilter('all');
    setDestinationFilter('all');
    setTimeFilter('all');
    setQuery(item.tripCode ?? item.lineName);
  };
  const clearHistory = () => {
    if (!window.confirm(t('travelSchedule.history.clearConfirm'))) {
      return;
    }

    clearTravelScheduleHistory();
    syncScheduleHistory();
  };

  return (
    <section className="module-panel travel-schedule-panel" aria-labelledby="schedule-title">
      <div className="section-heading">
        <div>
          <h2 id="schedule-title">{t('travelSchedule.title')}</h2>
          <span className="muted">
            {t('travelSchedule.resultCount', {
              count: filteredTrips.length,
              total: result.trips.length,
            })}
          </span>
        </div>
      </div>

      <div className="schedule-service-strip" aria-label={t('travelSchedule.service.aria')}>
        <button
          className={serviceFilter === 'all' ? 'is-active' : ''}
          type="button"
          aria-pressed={serviceFilter === 'all'}
          data-service="all"
          onClick={() => setServiceFilter('all')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            travel_explore
          </span>
          <span>{t('travelSchedule.service.all')}</span>
          <strong>{result.trips.length}</strong>
        </button>
        {result.services.map((service) => (
          <ServiceFilterButton
            service={service}
            active={serviceFilter === service.kind}
            key={service.serviceId}
            onClick={() => setServiceFilter(service.kind)}
          />
        ))}
      </div>

      <div className="schedule-filter-panel" aria-label={t('travelSchedule.filters.aria')}>
        <div className="search-box schedule-search-box">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label={t('travelSchedule.search.aria')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t('travelSchedule.search.placeholder')}
          />
          {query ? (
            <button
              className="search-clear-button"
              type="button"
              aria-label={t('travelSchedule.search.clear')}
              onClick={() => setQuery('')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          ) : null}
        </div>

        <div className="schedule-filter-row">
          <label>
            <span>{t('travelSchedule.filter.via')}</span>
            <select
              value={stationFilter}
              onChange={(event) => setStationFilter(event.currentTarget.value)}
            >
              <option value="all">{t('travelSchedule.filter.anyStation')}</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('travelSchedule.filter.origin')}</span>
            <select
              value={originFilter}
              onChange={(event) => setOriginFilter(event.currentTarget.value)}
            >
              <option value="all">{t('travelSchedule.filter.anyOrigin')}</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('travelSchedule.filter.destination')}</span>
            <select
              value={destinationFilter}
              onChange={(event) => setDestinationFilter(event.currentTarget.value)}
            >
              <option value="all">{t('travelSchedule.filter.anyDestination')}</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('travelSchedule.filter.date')}</span>
            <input
              type="date"
              value={serviceDate}
              onChange={(event) => setServiceDate(event.currentTarget.value)}
            />
          </label>

          <div className="schedule-time-filter" aria-label={t('travelSchedule.time.aria')}>
            {timeOptions.map((option) => (
              <button
                className={timeFilter === option.value ? 'is-active' : ''}
                type="button"
                aria-pressed={timeFilter === option.value}
                key={option.value}
                onClick={() => setTimeFilter(option.value)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {option.icon}
                </span>
                <span>{t(option.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScheduleLocalHistoryPanel
        state={historyState}
        serviceByKind={serviceByKind}
        onSelect={selectHistoryItem}
        onClear={clearHistory}
      />

      <ScheduleServiceNoticePanel notices={serviceNotices} serviceDate={serviceDate} />

      {result.notice ? (
        <section className="screen-detail-notice" aria-label={t('travelSchedule.notice.aria')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            campaign
          </span>
          <p>{result.notice}</p>
        </section>
      ) : null}

      <TicketOrderDraftPanel
        cancellingOrderId={cancellingOrderId}
        orders={ticketOrders}
        statusText={ticketOrderStatusText}
        tripById={tripById}
        onCancel={(orderId) => void cancelTicketOrder(orderId)}
        onRefresh={() => void refreshTicketOrders()}
      />

      {filteredTrips.length > 0 ? (
        <div className="schedule-trip-list" aria-label={t('travelSchedule.tripList.aria')}>
          {filteredTrips.map((trip) => (
            <ScheduleTripCard
              trip={trip}
              service={serviceByKind.get(trip.serviceKind)}
              serviceDate={serviceDate}
              key={trip.tripInstanceId}
              onHistoryChange={syncScheduleHistory}
              onTicketOrderChange={() => void refreshTicketOrders()}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state schedule-empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            event_busy
          </span>
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

function ScheduleServiceNoticePanel({
  notices,
  serviceDate,
}: Readonly<{
  notices: TransitServiceNotice[];
  serviceDate: string;
}>) {
  const { t } = useI18n();

  if (notices.length === 0) {
    return null;
  }

  return (
    <section className="schedule-service-notice-panel" aria-labelledby="schedule-notice-title">
      <div className="section-heading">
        <div>
          <h3 id="schedule-notice-title">{t('travelSchedule.notice.title')}</h3>
          <span className="muted">
            {formatScheduleNoticeDate(serviceDate)} ·{' '}
            {t('travelSchedule.notice.count', { count: notices.length })}
          </span>
        </div>
      </div>
      <div className="transit-notice-list">
        {notices.map((notice) => (
          <article className="transit-notice-item" key={notice.id}>
            <span className="material-symbols-outlined" aria-hidden="true">
              campaign
            </span>
            <div>
              <h3>{notice.title}</h3>
              <p>{notice.reason}</p>
              <span className="muted">{formatServiceNoticePeriod(notice)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ServiceFilterButton({
  service,
  active,
  onClick,
}: Readonly<{
  service: TravelScheduleServiceSummary;
  active: boolean;
  onClick: () => void;
}>) {
  const { t } = useI18n();

  return (
    <button
      className={active ? 'is-active' : ''}
      type="button"
      aria-pressed={active}
      data-service={service.kind}
      data-status={service.status}
      style={createServiceToneStyle(service.color)}
      onClick={onClick}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {service.icon}
      </span>
      <span>{service.label}</span>
      <strong>
        {service.status === 'active' ? service.tripCount : t('travelSchedule.service.unavailable')}
      </strong>
    </button>
  );
}

function ScheduleLocalHistoryPanel({
  state,
  serviceByKind,
  onSelect,
  onClear,
}: Readonly<{
  state: TravelScheduleHistoryState | null;
  serviceByKind: Map<TicketableServiceKind, TravelScheduleServiceSummary>;
  onSelect: (item: TravelScheduleHistoryItem) => void;
  onClear: () => void;
}>) {
  const { t } = useI18n();

  if (!state?.items.length) {
    return null;
  }

  return (
    <section className="schedule-history-panel" aria-labelledby="schedule-history-title">
      <div className="schedule-history-heading">
        <div>
          <h3 id="schedule-history-title">{t('travelSchedule.history.title')}</h3>
          <span className="muted">
            {t('travelSchedule.history.summary', {
              count: state.summary.total,
              reminderCount: state.summary.reminderLinked,
            })}
          </span>
        </div>
        <button
          className="icon-action-button"
          type="button"
          onClick={onClear}
          aria-label={t('travelSchedule.history.clear')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete_sweep
          </span>
        </button>
      </div>
      <div className="schedule-history-list" aria-label={t('travelSchedule.history.recentAria')}>
        {state.items.slice(0, 5).map((item) => (
          <button
            className="schedule-history-item"
            type="button"
            data-service={item.serviceKind}
            style={createServiceToneStyle(serviceByKind.get(item.serviceKind)?.color)}
            key={item.id}
            onClick={() => onSelect(item)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {serviceByKind.get(item.serviceKind)?.icon ?? getServiceIcon(item.serviceKind)}
            </span>
            <span>
              <strong>{formatHistoryItemTitle(item)}</strong>
              <small>{renderHistoryItemDetail(item, t)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScheduleTripCard({
  trip,
  service,
  serviceDate,
  onHistoryChange,
  onTicketOrderChange,
}: Readonly<{
  trip: TravelTripInstance;
  service?: TravelScheduleServiceSummary;
  serviceDate: string;
  onHistoryChange: () => void;
  onTicketOrderChange: () => void;
}>) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const addReminder = () => {
    const remindAt = getDefaultReminderTime(trip.departureTime);
    createTripReminder({
      title: formatScheduleReminderTitle(trip),
      departure: trip.originStationName,
      arrival: trip.destinationStationName,
      lineName: trip.lineName,
      transportMode: toReminderTransportMode(trip.serviceKind),
      detail: formatScheduleReminderDetail(trip, t),
      remindAt: toDatetimeLocalValue(remindAt),
      source: 'schedule',
    });
    saveTravelScheduleHistory(trip, 'reminder');
    onHistoryChange();
    setMessage(
      t('travelSchedule.feedback.reminderAdded', {
        time: formatTripReminderTime(remindAt.toISOString()),
      }),
    );
  };
  const saveHistory = () => {
    saveTravelScheduleHistory(trip, 'saved');
    onHistoryChange();
    setMessage(t('travelSchedule.feedback.historySaved'));
  };
  const createOrderDraft = async () => {
    if (trip.ticketing?.status !== 'order_available') {
      setMessage(trip.ticketing?.message ?? t('travelSchedule.order.unavailable'));
      return;
    }

    setIsCreatingOrder(true);
    setMessage(t('travelSchedule.order.creating'));
    try {
      const response = await fetch(appPath('/api/travel/ticketing/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          passengerCount: 1,
          serviceDate,
          tripInstanceId: trip.tripInstanceId,
        }),
      });
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderDraftResult>> & {
        message?: string;
      };
      if (!response.ok || !data.item) {
        throw new Error(data.message ?? t('travelSchedule.order.createFailed'));
      }

      setMessage(
        t('travelSchedule.order.created', {
          expiresAt: formatTicketHoldExpiresAt(data.item.inventoryHold.expiresAt),
        }),
      );
      onTicketOrderChange();
      notifyTicketOrderStateChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('travelSchedule.order.createFailed'));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <article
      className="schedule-trip-card"
      data-service={trip.serviceKind}
      style={createServiceToneStyle(service?.color)}
    >
      <div className="schedule-trip-header">
        <span className="schedule-trip-service-mark">
          <span className="material-symbols-outlined" aria-hidden="true">
            {service?.icon ?? getServiceIcon(trip.serviceKind)}
          </span>
        </span>
        <div className="schedule-trip-title">
          <strong>{formatTripHeading(trip)}</strong>
          <span>{trip.serviceLabel}</span>
        </div>
        <div className="schedule-trip-fare">
          <span>{t('travelSchedule.trip.fare')}</span>
          <strong>{trip.fareText ?? t('travelSchedule.trip.toBeAnnounced')}</strong>
        </div>
      </div>

      <div className="schedule-trip-journey">
        <div className="schedule-trip-time-block">
          <span>{t('travelSchedule.trip.departureTime')}</span>
          <time>{trip.departureTime}</time>
          <small>
            {trip.originStationName ??
              trip.stationNames[0] ??
              t('travelSchedule.trip.departureUnknown')}
          </small>
        </div>
        <div className="schedule-trip-duration">
          <span>{trip.runtimeText ?? t('travelSchedule.trip.runtimeUnknown')}</span>
          <strong>{formatStopSummary(trip, t)}</strong>
        </div>
        <div className="schedule-trip-time-block is-arrival">
          <span>{t('travelSchedule.trip.arrivalTime')}</span>
          <time>
            {trip.arrivalTime ?? t('travelSchedule.trip.timeUnknown')}
            {trip.arrivalDayOffset && trip.arrivalDayOffset > 0 ? (
              <ScheduleDayOffset
                className="schedule-trip-day-offset"
                t={t}
                value={trip.arrivalDayOffset}
              />
            ) : null}
          </time>
          <small>
            {trip.destinationStationName ??
              trip.stationNames[trip.stationNames.length - 1] ??
              t('travelSchedule.trip.arrivalUnknown')}
          </small>
        </div>
      </div>

      <div className="schedule-trip-main">
        <p>{formatTripEndpoints(trip)}</p>
        <div className="screen-station-flow" aria-label={`${trip.lineName} 停靠站`}>
          {trip.stationNames.map((stationName) => (
            <span key={stationName}>{stationName}</span>
          ))}
        </div>
      </div>
      <dl className="screen-detail-trip-meta schedule-trip-meta">
        <MetaItem
          label={getLocationMetaLabel(trip.serviceKind, t)}
          value={trip.gateText ?? t('travelSchedule.trip.toBeAnnounced')}
        />
        {trip.operatingDays?.length ? (
          <MetaItem
            label={t('travelSchedule.trip.operatingDays')}
            value={formatOperatingDays(trip.operatingDays, t)}
          />
        ) : null}
        <MetaItem
          label={t('travelSchedule.trip.operator')}
          value={trip.operator ?? t('travelSchedule.trip.toBeAnnounced')}
        />
        <MetaItem
          label={getVehicleMetaLabel(trip.serviceKind, t)}
          value={formatVehicleText(trip, t)}
        />
      </dl>
      <div className="schedule-trip-actions">
        <button className="secondary-action-button is-primary" type="button" onClick={addReminder}>
          <span className="material-symbols-outlined" aria-hidden="true">
            add_alarm
          </span>
          <span>{t('travelSchedule.action.addReminder')}</span>
        </button>
        <button className="secondary-action-button" type="button" onClick={saveHistory}>
          <span className="material-symbols-outlined" aria-hidden="true">
            bookmark_add
          </span>
          <span>{t('travelSchedule.action.saveRecord')}</span>
        </button>
        {trip.bookingUrl ? (
          <a
            className="secondary-action-button"
            href={trip.bookingUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              open_in_new
            </span>
            <span>{t('travelSchedule.action.legacyReference')}</span>
          </a>
        ) : null}
        <TicketingStatusButton
          ticketing={trip.ticketing}
          busy={isCreatingOrder}
          onCreateOrder={createOrderDraft}
        />
      </div>
      {message ? <p className="schedule-trip-feedback">{message}</p> : null}
    </article>
  );
}

function TicketingStatusButton({
  busy,
  onCreateOrder,
  ticketing,
}: Readonly<{
  busy: boolean;
  onCreateOrder: () => void;
  ticketing?: TravelTicketingAvailability;
}>) {
  const { t } = useI18n();
  const state = getTicketingButtonState(ticketing, t);

  return (
    <button
      className="secondary-action-button"
      type="button"
      disabled={busy || !state.canCreate}
      title={state.message}
      onClick={onCreateOrder}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {busy ? 'progress_activity' : state.icon}
      </span>
      <span>{busy ? t('travelSchedule.ticketing.creating') : state.label}</span>
    </button>
  );
}

function getTicketingButtonState(
  ticketing: TravelTicketingAvailability | undefined,
  t: Translate,
): {
  canCreate: boolean;
  icon: string;
  label: string;
  message: string;
} {
  if (!ticketing) {
    return {
      canCreate: false,
      icon: 'confirmation_number',
      label: t('travelSchedule.ticketing.pending'),
      message: t('travelSchedule.ticketing.statusMissing'),
    };
  }

  if (ticketing.status === 'order_available') {
    return {
      canCreate: true,
      icon: 'confirmation_number',
      label: t('travelSchedule.ticketing.createDraft'),
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'legacy_reference_only') {
    return {
      canCreate: false,
      icon: 'open_in_new',
      label: t('travelSchedule.ticketing.legacyReference'),
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'inventory_not_configured') {
    return {
      canCreate: false,
      icon: 'inventory_2',
      label: t('travelSchedule.ticketing.inventoryPending'),
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'sold_out') {
    return {
      canCreate: false,
      icon: 'event_busy',
      label: t('travelSchedule.ticketing.soldOut'),
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'service_not_connected' || ticketing.status === 'trip_not_found') {
    return {
      canCreate: false,
      icon: 'sync_problem',
      label: t('travelSchedule.ticketing.unavailable'),
      message: ticketing.message,
    };
  }

  return {
    canCreate: false,
    icon: 'confirmation_number',
    label: t('travelSchedule.ticketing.pending'),
    message: ticketing.message,
  };
}

function MetaItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function filterTrips(
  trips: TravelTripInstance[],
  input: {
    serviceFilter: ServiceFilter;
    stationFilter: string;
    originFilter: string;
    destinationFilter: string;
    timeFilter: TravelScheduleTimeScope;
    serviceDate: string;
    query: string;
    currentMinutes: number;
  },
): TravelTripInstance[] {
  const query = normalizeSearchValue(input.query);
  const stationFilter = normalizeSearchValue(
    input.stationFilter === 'all' ? '' : input.stationFilter,
  );
  const originFilter = normalizeSearchValue(input.originFilter === 'all' ? '' : input.originFilter);
  const destinationFilter = normalizeSearchValue(
    input.destinationFilter === 'all' ? '' : input.destinationFilter,
  );
  const serviceDate = normalizeServiceDate(input.serviceDate);
  const serviceDateState = getServiceDateState(serviceDate);
  const serviceDay = getServiceDay(serviceDate);

  return [...trips]
    .filter((trip) => input.serviceFilter === 'all' || trip.serviceKind === input.serviceFilter)
    .filter((trip) => filterByServiceDay(trip, serviceDay))
    .filter((trip) => filterByStationPair(trip, originFilter, destinationFilter))
    .filter(
      (trip) =>
        !stationFilter ||
        trip.stationNames.some(
          (stationName) => normalizeSearchValue(stationName) === stationFilter,
        ),
    )
    .filter((trip) => filterByTime(trip, input.timeFilter, serviceDateState, input.currentMinutes))
    .filter((trip) => !query || normalizeSearchValue(buildSearchText(trip)).includes(query))
    .sort(compareTrips);
}

function filterServiceNoticesByDate(
  notices: TransitServiceNotice[],
  serviceDate: string,
): TransitServiceNotice[] {
  const normalizedDate = normalizeServiceDate(serviceDate) ?? toDateInputValue(new Date());
  const dayStart = new Date(`${normalizedDate}T00:00:00+08:00`).getTime();
  const dayEnd = new Date(`${normalizedDate}T23:59:59.999+08:00`).getTime();

  return notices.filter((notice) => {
    const startsAt = notice.startsAt ? new Date(notice.startsAt).getTime() : Number.NaN;
    const endsAt = notice.endsAt ? new Date(notice.endsAt).getTime() : Number.NaN;
    const hasStart = Number.isFinite(startsAt);
    const hasEnd = Number.isFinite(endsAt);

    if (!hasStart && !hasEnd) {
      return true;
    }

    return (!hasStart || startsAt <= dayEnd) && (!hasEnd || endsAt >= dayStart);
  });
}

function filterByTime(
  trip: Pick<TravelTripInstance, 'departureTime'>,
  timeFilter: TravelScheduleTimeScope,
  serviceDateState: ServiceDateState,
  currentMinutes: number,
): boolean {
  if (timeFilter === 'all') {
    return true;
  }

  if (serviceDateState === 'future') {
    return timeFilter === 'upcoming';
  }

  if (serviceDateState === 'past') {
    return timeFilter === 'past';
  }

  const tripMinutes = parseAdjustedTime(trip.departureTime);
  return timeFilter === 'upcoming' ? tripMinutes >= currentMinutes : tripMinutes < currentMinutes;
}

type ServiceDateState = 'unspecified' | 'past' | 'today' | 'future';

function filterByServiceDay(trip: TravelTripInstance, serviceDay: string | undefined): boolean {
  if (!serviceDay || !trip.operatingDays?.length) {
    return true;
  }

  return trip.operatingDays.includes(serviceDay);
}

function filterByStationPair(
  trip: TravelTripInstance,
  originStationName: string,
  destinationStationName: string,
): boolean {
  if (!originStationName && !destinationStationName) {
    return true;
  }

  const stationNames = trip.stationNames.map(normalizeSearchValue);
  const originIndex = originStationName ? stationNames.indexOf(originStationName) : -1;
  const destinationIndex = destinationStationName
    ? stationNames.indexOf(destinationStationName)
    : -1;

  if (originStationName && originIndex < 0) {
    return false;
  }

  if (destinationStationName && destinationIndex < 0) {
    return false;
  }

  return !originStationName || !destinationStationName || originIndex <= destinationIndex;
}

function getServiceDateState(serviceDate: string | undefined): ServiceDateState {
  if (!serviceDate) {
    return 'unspecified';
  }

  const today = toDateInputValue(new Date());
  if (serviceDate === today) {
    return 'today';
  }

  return serviceDate > today ? 'future' : 'past';
}

function getServiceDay(serviceDate: string | undefined): string | undefined {
  if (!serviceDate) {
    return undefined;
  }

  const [yearText, monthText, dayText] = serviceDate.split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  const dayKeys = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return dayKeys[date.getDay()];
}

function normalizeServiceDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }

  const [yearText, monthText, dayText] = trimmed.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? trimmed
    : undefined;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatScheduleNoticeDate(serviceDate: string): string {
  const normalizedDate = normalizeServiceDate(serviceDate) ?? toDateInputValue(new Date());
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(`${normalizedDate}T00:00:00+08:00`));
}

function formatServiceNoticePeriod(notice: TransitServiceNotice): string {
  if (notice.startsAt && notice.endsAt) {
    return `${formatDateTime(notice.startsAt)} 至 ${formatDateTime(notice.endsAt)}`;
  }

  return notice.periodText;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function compareTrips(left: TravelTripInstance, right: TravelTripInstance): number {
  return (
    parseAdjustedTime(left.departureTime) - parseAdjustedTime(right.departureTime) ||
    left.lineName.localeCompare(right.lineName, 'zh-CN', { numeric: true }) ||
    left.tripInstanceId.localeCompare(right.tripInstanceId, 'zh-CN', { numeric: true })
  );
}

function parseAdjustedTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return getAdjustedMinutes(Number(match[1]), Number(match[2]));
}

function getCurrentAdjustedMinutes(): number {
  const now = new Date();
  return getAdjustedMinutes(now.getHours(), now.getMinutes());
}

function getAdjustedMinutes(hours: number, minutes: number): number {
  const total = hours * 60 + minutes;
  return total < 180 ? total + 24 * 60 : total;
}

function buildSearchText(trip: TravelTripInstance): string {
  return [
    trip.tripInstanceId,
    trip.tripCode,
    trip.serviceLabel,
    trip.departureTime,
    trip.arrivalTime,
    trip.lineName,
    trip.routeNote,
    ...trip.stationNames,
    trip.fareText,
    trip.operator,
    trip.runtimeText,
    trip.gateText,
    trip.vehicleTypeText,
    trip.vehicleModelText,
    ...(trip.operatingDays ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeSearchValue(value: string): string {
  return value
    .replace(/[|\s\u3000]+/g, '')
    .trim()
    .toLowerCase();
}

function createServiceToneStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--schedule-service-tone': color } as CSSProperties) : undefined;
}

function formatHistoryItemTitle(item: TravelScheduleHistoryItem): string {
  return item.tripCode ? `${item.lineName} 班次 ${item.tripCode}` : item.lineName;
}

function renderHistoryItemDetail(item: TravelScheduleHistoryItem, t: Translate): ReactNode {
  const parts: Array<ReactNode | undefined> = [
    item.serviceLabel,
    item.departureTime,
    item.arrivalTime ? (
      <span>
        到达 {item.arrivalTime}
        {item.arrivalDayOffset && item.arrivalDayOffset > 0 ? (
          <ScheduleDayOffset
            className="schedule-history-day-offset"
            t={t}
            value={item.arrivalDayOffset}
          />
        ) : null}
      </span>
    ) : undefined,
    formatHistoryEndpoints(item),
  ];
  const visibleParts = parts.filter(
    (part) => part !== undefined && part !== null && part !== false,
  );

  return visibleParts.map((part, index) => (
    <span className="schedule-history-detail-part" key={index}>
      {index > 0 ? <span aria-hidden="true"> · </span> : null}
      {part}
    </span>
  ));
}

function ScheduleDayOffset({
  className,
  t,
  value,
}: Readonly<{
  className: string;
  t: Translate;
  value: number;
}>) {
  return <sup className={className}>{formatScheduleDayOffset(value, t)}</sup>;
}

function formatHistoryEndpoints(item: TravelScheduleHistoryItem): string {
  const first = item.originStationName ?? item.stationNames[0];
  const last = item.destinationStationName ?? item.stationNames[item.stationNames.length - 1];
  return first && last ? `${first} - ${last}` : `${item.stationNames.length} 站`;
}

function formatTicketHoldExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function formatTripEndpoints(trip: TravelTripInstance): string {
  const first = trip.originStationName ?? trip.stationNames[0];
  const last = trip.destinationStationName ?? trip.stationNames[trip.stationNames.length - 1];
  const endpoints = first && last ? `${first} - ${last}` : `${trip.stationNames.length} 站`;
  return trip.routeNote ? `${endpoints} · ${trip.routeNote}` : endpoints;
}

function formatTripHeading(trip: TravelTripInstance): string {
  const prefix = trip.tripCode ?? `${trip.serviceLabel}班次`;
  return trip.lineName ? `${prefix} - ${trip.lineName}` : prefix;
}

function formatStopSummary(trip: TravelTripInstance, t: Translate): string {
  if (trip.routeNote) {
    return trip.routeNote;
  }

  if (trip.stationNames.length <= 2) {
    return t('travelSchedule.trip.direct');
  }

  const middleStations = trip.stationNames.slice(1, -1);
  return middleStations.length > 2
    ? t('travelSchedule.trip.viaMany', {
        stations: middleStations.slice(0, 2).join('、'),
        count: middleStations.length,
      })
    : t('travelSchedule.trip.via', { stations: middleStations.join('、') });
}

function getServiceIcon(kind: TicketableServiceKind): string {
  if (kind === 'coach') {
    return 'directions_bus';
  }

  if (kind === 'ferry') {
    return 'directions_boat';
  }

  if (kind === 'flight') {
    return 'flight_takeoff';
  }

  if (kind === 'railway') {
    return 'train';
  }

  return 'route';
}

function getVehicleMetaLabel(kind: TicketableServiceKind, t?: Translate): string {
  if (kind === 'flight') {
    return t ? t('travelSchedule.trip.aircraftType') : '机型';
  }

  if (kind === 'ferry') {
    return t ? t('travelSchedule.trip.vesselType') : '船型';
  }

  return t ? t('travelSchedule.trip.vehicleType') : '车型';
}

function formatVehicleText(trip: TravelTripInstance, t?: Translate): string {
  return (
    [trip.vehicleTypeText, trip.vehicleModelText].filter(Boolean).join(' / ') ||
    (t ? t('travelSchedule.trip.toBeAnnounced') : '待公布')
  );
}

function getLocationMetaLabel(kind: TicketableServiceKind, t?: Translate): string {
  if (kind === 'flight') {
    return t ? t('travelSchedule.trip.checkInArrival') : '值机/到达';
  }

  if (kind === 'ferry') {
    return t ? t('travelSchedule.trip.boardingGate') : '登船口';
  }

  return t ? t('travelSchedule.trip.gate') : '检票口';
}

function formatArrivalTime(trip: TravelTripInstance, t?: Translate): string {
  const dayOffset = trip.arrivalDayOffset;
  if (!trip.arrivalTime) {
    return t ? t('travelSchedule.trip.toBeAnnounced') : '待公布';
  }

  return dayOffset && dayOffset > 0
    ? `${trip.arrivalTime} ${formatScheduleDayOffset(dayOffset, t)}`
    : trip.arrivalTime;
}

function formatScheduleDayOffset(value: number, t?: Translate): string {
  return t ? t('travelSchedule.trip.dayOffset', { count: value }) : `+${value}天`;
}

function formatOperatingDays(days: string[], t: Translate): string {
  const normalized = days.map((day) => day.trim()).filter(Boolean);
  const dayLabels: Record<string, string> = {
    MON: t('travelSchedule.weekday.mon'),
    TUE: t('travelSchedule.weekday.tue'),
    WED: t('travelSchedule.weekday.wed'),
    THU: t('travelSchedule.weekday.thu'),
    FRI: t('travelSchedule.weekday.fri'),
    SAT: t('travelSchedule.weekday.sat'),
    SUN: t('travelSchedule.weekday.sun'),
  };
  const allDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  if (allDays.every((day) => normalized.includes(day))) {
    return t('travelSchedule.weekday.everyday');
  }

  return (
    normalized.map((day) => dayLabels[day] ?? day).join('、') ||
    t('travelSchedule.trip.toBeAnnounced')
  );
}

function formatScheduleReminderTitle(trip: TravelTripInstance): string {
  return trip.tripCode
    ? `${trip.lineName} 班次 ${trip.tripCode}`
    : `${trip.lineName} ${trip.departureTime} 班次`;
}

function formatScheduleReminderDetail(trip: TravelTripInstance, t?: Translate): string {
  return [
    trip.tripCode ? `班次 ${trip.tripCode}` : undefined,
    `发车 ${trip.departureTime}`,
    trip.arrivalTime ? `到达 ${formatArrivalTime(trip, t)}` : undefined,
    trip.gateText ? `${getLocationMetaLabel(trip.serviceKind, t)} ${trip.gateText}` : undefined,
    trip.fareText ? `票价 ${trip.fareText}` : undefined,
    trip.operator,
    formatVehicleText(trip, t) !== (t ? t('travelSchedule.trip.toBeAnnounced') : '待公布')
      ? `${getVehicleMetaLabel(trip.serviceKind, t)} ${formatVehicleText(trip, t)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function getDefaultReminderTime(departureTime: string): Date {
  const departure = getNextDepartureDate(departureTime);
  const reminder = new Date(departure.getTime() - 30 * 60 * 1000);
  const minimum = new Date(Date.now() + 60 * 1000);
  return reminder.getTime() > minimum.getTime() ? reminder : minimum;
}

function getNextDepartureDate(departureTime: string): Date {
  const match = departureTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  const now = new Date();
  if (!match) {
    return new Date(now.getTime() + 31 * 60 * 1000);
  }

  const departure = new Date(now);
  departure.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (departure.getTime() <= now.getTime()) {
    departure.setDate(departure.getDate() + 1);
  }
  return departure;
}

function toDatetimeLocalValue(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function toReminderTransportMode(kind: TicketableServiceKind) {
  if (kind === 'coach' || kind === 'ferry' || kind === 'flight' || kind === 'railway') {
    return kind;
  }

  return undefined;
}
