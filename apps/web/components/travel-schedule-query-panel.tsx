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
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  clearTravelScheduleHistory,
  readTravelScheduleHistoryState,
  saveTravelScheduleHistory,
  type TravelScheduleHistoryState,
} from '../lib/client-schedule-history';
import { createTripReminder, formatTripReminderTime } from '../lib/client-trip-reminders';
import { TicketOrderDraftPanel } from './ticket-order-draft-panel';

type ServiceFilter = TicketableServiceKind | 'all';

const timeOptions: Array<{ value: TravelScheduleTimeScope; label: string; icon: string }> = [
  { value: 'all', label: '全部', icon: 'format_list_bulleted' },
  { value: 'upcoming', label: '即将', icon: 'schedule' },
  { value: 'past', label: '已过', icon: 'history' },
];

export function TravelScheduleQueryPanel({
  result,
}: Readonly<{
  result: TravelScheduleQueryResult;
}>) {
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState<TravelScheduleTimeScope>('all');
  const [serviceDate, setServiceDate] = useState(() => toDateInputValue(new Date()));
  const [query, setQuery] = useState('');
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
        setTicketOrderStatusText('登录后可查看订单草稿。');
        return;
      }

      if (!response.ok || !data.items) {
        throw new Error(data.message ?? '订单草稿读取失败');
      }

      setTicketOrders(data.items);
      setTicketOrderStatusText(data.items.length > 0 ? '' : '暂无订单草稿。');
    } catch (error) {
      setTicketOrders([]);
      setTicketOrderStatusText(error instanceof Error ? error.message : '订单草稿读取失败');
    }
  };
  const cancelTicketOrder = async (orderId: string) => {
    if (!window.confirm('要取消这个订单草稿并释放库存占用吗？')) {
      return;
    }

    setCancellingOrderId(orderId);
    setTicketOrderStatusText('正在取消订单草稿');
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };
      if (!response.ok || !data.item) {
        throw new Error(data.message ?? '订单草稿取消失败');
      }

      setTicketOrderStatusText('已取消订单草稿');
      await refreshTicketOrders();
    } catch (error) {
      setTicketOrderStatusText(error instanceof Error ? error.message : '订单草稿取消失败');
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
      : '没有匹配的班次';
  const selectHistoryItem = (item: TravelScheduleHistoryItem) => {
    setServiceFilter(item.serviceKind);
    setStationFilter('all');
    setOriginFilter('all');
    setDestinationFilter('all');
    setTimeFilter('all');
    setQuery(item.tripCode ?? item.lineName);
  };
  const clearHistory = () => {
    if (!window.confirm('要清空本地班次查询历史吗？行程提醒不会被删除。')) {
      return;
    }

    clearTravelScheduleHistory();
    syncScheduleHistory();
  };

  return (
    <section className="module-panel travel-schedule-panel" aria-labelledby="schedule-title">
      <div className="section-heading">
        <div>
          <h2 id="schedule-title">统一班次查询</h2>
          <span className="muted">
            {filteredTrips.length} / {result.trips.length} 个可查询班次
          </span>
        </div>
      </div>

      <div className="schedule-service-strip" aria-label="交通方式">
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
          <span>全部</span>
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

      <div className="schedule-filter-panel" aria-label="班次筛选">
        <div className="search-box schedule-search-box">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="搜索班次、线路、车站、检票口或运营方"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索班次、线路、车站或运营方"
          />
          {query ? (
            <button
              className="search-clear-button"
              type="button"
              aria-label="清空班次搜索"
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
            <span>经过</span>
            <select
              value={stationFilter}
              onChange={(event) => setStationFilter(event.currentTarget.value)}
            >
              <option value="all">任意车站</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>起点</span>
            <select
              value={originFilter}
              onChange={(event) => setOriginFilter(event.currentTarget.value)}
            >
              <option value="all">任意起点</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>终点</span>
            <select
              value={destinationFilter}
              onChange={(event) => setDestinationFilter(event.currentTarget.value)}
            >
              <option value="all">任意终点</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>日期</span>
            <input
              type="date"
              value={serviceDate}
              onChange={(event) => setServiceDate(event.currentTarget.value)}
            />
          </label>

          <div className="schedule-time-filter" aria-label="时间筛选">
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
                <span>{option.label}</span>
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
        <section className="screen-detail-notice" aria-label="班次公告">
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
        <div className="schedule-trip-list" aria-label="班次列表">
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
  if (notices.length === 0) {
    return null;
  }

  return (
    <section className="schedule-service-notice-panel" aria-labelledby="schedule-notice-title">
      <div className="section-heading">
        <div>
          <h3 id="schedule-notice-title">客运提醒</h3>
          <span className="muted">
            {formatScheduleNoticeDate(serviceDate)} · {notices.length} 条
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
      <strong>{service.status === 'active' ? service.tripCount : '未接入'}</strong>
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
  if (!state?.items.length) {
    return null;
  }

  return (
    <section className="schedule-history-panel" aria-labelledby="schedule-history-title">
      <div className="schedule-history-heading">
        <div>
          <h3 id="schedule-history-title">本地班次记录</h3>
          <span className="muted">
            {state.summary.total} 条，{state.summary.reminderLinked} 条已关联提醒
          </span>
        </div>
        <button
          className="icon-action-button"
          type="button"
          onClick={onClear}
          aria-label="清空班次记录"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete_sweep
          </span>
        </button>
      </div>
      <div className="schedule-history-list" aria-label="最近班次记录">
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
              <small>{formatHistoryItemDetail(item)}</small>
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
      detail: formatScheduleReminderDetail(trip),
      remindAt: toDatetimeLocalValue(remindAt),
      source: 'schedule',
    });
    saveTravelScheduleHistory(trip, 'reminder');
    onHistoryChange();
    setMessage(`已添加 ${formatTripReminderTime(remindAt.toISOString())} 的本地提醒`);
  };
  const saveHistory = () => {
    saveTravelScheduleHistory(trip, 'saved');
    onHistoryChange();
    setMessage('已保存到本地班次记录');
  };
  const createOrderDraft = async () => {
    if (trip.ticketing?.status !== 'order_available') {
      setMessage(trip.ticketing?.message ?? '当前班次暂不可创建订单草稿');
      return;
    }

    setIsCreatingOrder(true);
    setMessage('正在创建订单草稿');
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
        throw new Error(data.message ?? '订单草稿创建失败');
      }

      setMessage(
        `已创建订单草稿，库存占用至 ${formatTicketHoldExpiresAt(
          data.item.inventoryHold.expiresAt,
        )}`,
      );
      onTicketOrderChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '订单草稿创建失败');
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
          <span>票价</span>
          <strong>{trip.fareText ?? '待公布'}</strong>
        </div>
      </div>

      <div className="schedule-trip-journey">
        <div className="schedule-trip-time-block">
          <span>出发时间</span>
          <time>{trip.departureTime}</time>
          <small>{trip.originStationName ?? trip.stationNames[0] ?? '出发地点待公布'}</small>
        </div>
        <div className="schedule-trip-duration">
          <span>{trip.runtimeText ?? '运行时间待公布'}</span>
          <strong>{formatStopSummary(trip)}</strong>
        </div>
        <div className="schedule-trip-time-block is-arrival">
          <span>到达时间</span>
          <time>
            {trip.arrivalTime ?? '待定'}
            {trip.arrivalDayOffset && trip.arrivalDayOffset > 0 ? (
              <sup>+{trip.arrivalDayOffset}天</sup>
            ) : null}
          </time>
          <small>
            {trip.destinationStationName ??
              trip.stationNames[trip.stationNames.length - 1] ??
              '到达地点待公布'}
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
          label={getLocationMetaLabel(trip.serviceKind)}
          value={trip.gateText ?? '待公布'}
        />
        {trip.operatingDays?.length ? (
          <MetaItem label="运行日" value={formatOperatingDays(trip.operatingDays)} />
        ) : null}
        <MetaItem label="运营" value={trip.operator ?? '待公布'} />
        <MetaItem label={getVehicleMetaLabel(trip.serviceKind)} value={formatVehicleText(trip)} />
      </dl>
      <div className="schedule-trip-actions">
        <button className="secondary-action-button is-primary" type="button" onClick={addReminder}>
          <span className="material-symbols-outlined" aria-hidden="true">
            add_alarm
          </span>
          <span>添加提醒</span>
        </button>
        <button className="secondary-action-button" type="button" onClick={saveHistory}>
          <span className="material-symbols-outlined" aria-hidden="true">
            bookmark_add
          </span>
          <span>保存记录</span>
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
            <span>旧版参考</span>
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
  const state = getTicketingButtonState(ticketing);

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
      <span>{busy ? '创建中' : state.label}</span>
    </button>
  );
}

function getTicketingButtonState(ticketing: TravelTicketingAvailability | undefined): {
  canCreate: boolean;
  icon: string;
  label: string;
  message: string;
} {
  if (!ticketing) {
    return {
      canCreate: false,
      icon: 'confirmation_number',
      label: '新票务待接入',
      message: '新版票务状态尚未返回。',
    };
  }

  if (ticketing.status === 'order_available') {
    return {
      canCreate: true,
      icon: 'confirmation_number',
      label: '创建草稿',
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'legacy_reference_only') {
    return {
      canCreate: false,
      icon: 'open_in_new',
      label: '旧版参考可用',
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'inventory_not_configured') {
    return {
      canCreate: false,
      icon: 'inventory_2',
      label: '库存待配置',
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'sold_out') {
    return {
      canCreate: false,
      icon: 'event_busy',
      label: '暂无余票',
      message: ticketing.message,
    };
  }

  if (ticketing.status === 'service_not_connected' || ticketing.status === 'trip_not_found') {
    return {
      canCreate: false,
      icon: 'sync_problem',
      label: '暂不可订',
      message: ticketing.message,
    };
  }

  return {
    canCreate: false,
    icon: 'confirmation_number',
    label: '新票务待接入',
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

function formatHistoryItemDetail(item: TravelScheduleHistoryItem): string {
  return [
    item.serviceLabel,
    item.departureTime,
    item.arrivalTime ? `到达 ${formatHistoryArrivalTime(item)}` : undefined,
    formatHistoryEndpoints(item),
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatHistoryEndpoints(item: TravelScheduleHistoryItem): string {
  const first = item.originStationName ?? item.stationNames[0];
  const last = item.destinationStationName ?? item.stationNames[item.stationNames.length - 1];
  return first && last ? `${first} - ${last}` : `${item.stationNames.length} 站`;
}

function formatHistoryArrivalTime(item: TravelScheduleHistoryItem): string {
  if (!item.arrivalTime) {
    return '待公布';
  }

  return item.arrivalDayOffset && item.arrivalDayOffset > 0
    ? `${item.arrivalTime} +${item.arrivalDayOffset}天`
    : item.arrivalTime;
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

function formatStopSummary(trip: TravelTripInstance): string {
  if (trip.routeNote) {
    return trip.routeNote;
  }

  if (trip.stationNames.length <= 2) {
    return '直达';
  }

  const middleStations = trip.stationNames.slice(1, -1);
  return middleStations.length > 2
    ? `经停 ${middleStations.slice(0, 2).join('、')} 等 ${middleStations.length} 站`
    : `经停 ${middleStations.join('、')}`;
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

function getVehicleMetaLabel(kind: TicketableServiceKind): string {
  if (kind === 'flight') {
    return '机型';
  }

  if (kind === 'ferry') {
    return '船型';
  }

  return '车型';
}

function formatVehicleText(trip: TravelTripInstance): string {
  return [trip.vehicleTypeText, trip.vehicleModelText].filter(Boolean).join(' / ') || '待公布';
}

function getLocationMetaLabel(kind: TicketableServiceKind): string {
  if (kind === 'flight') {
    return '值机/到达';
  }

  if (kind === 'ferry') {
    return '登船口';
  }

  return '检票口';
}

function formatArrivalTime(trip: TravelTripInstance): string {
  const dayOffset = trip.arrivalDayOffset;
  if (!trip.arrivalTime) {
    return '待公布';
  }

  return dayOffset && dayOffset > 0 ? `${trip.arrivalTime} +${dayOffset}天` : trip.arrivalTime;
}

function formatOperatingDays(days: string[]): string {
  const normalized = days.map((day) => day.trim()).filter(Boolean);
  const dayLabels: Record<string, string> = {
    MON: '周一',
    TUE: '周二',
    WED: '周三',
    THU: '周四',
    FRI: '周五',
    SAT: '周六',
    SUN: '周日',
  };
  const allDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  if (allDays.every((day) => normalized.includes(day))) {
    return '每日';
  }

  return normalized.map((day) => dayLabels[day] ?? day).join('、') || '待公布';
}

function formatScheduleReminderTitle(trip: TravelTripInstance): string {
  return trip.tripCode
    ? `${trip.lineName} 班次 ${trip.tripCode}`
    : `${trip.lineName} ${trip.departureTime} 班次`;
}

function formatScheduleReminderDetail(trip: TravelTripInstance): string {
  return [
    trip.tripCode ? `班次 ${trip.tripCode}` : undefined,
    `发车 ${trip.departureTime}`,
    trip.arrivalTime ? `到达 ${formatArrivalTime(trip)}` : undefined,
    trip.gateText ? `${getLocationMetaLabel(trip.serviceKind)} ${trip.gateText}` : undefined,
    trip.fareText ? `票价 ${trip.fareText}` : undefined,
    trip.operator,
    formatVehicleText(trip) !== '待公布'
      ? `${getVehicleMetaLabel(trip.serviceKind)} ${formatVehicleText(trip)}`
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
