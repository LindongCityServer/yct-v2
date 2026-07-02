'use client';

import type {
  TicketableServiceKind,
  TravelScheduleHistoryItem,
  TravelScheduleQueryResult,
  TravelScheduleServiceSummary,
  TravelScheduleTimeScope,
  TravelTripInstance,
} from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  clearTravelScheduleHistory,
  readTravelScheduleHistoryState,
  saveTravelScheduleHistory,
  type TravelScheduleHistoryState,
} from '../lib/client-schedule-history';
import { createTripReminder, formatTripReminderTime } from '../lib/client-trip-reminders';

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
  const [timeFilter, setTimeFilter] = useState<TravelScheduleTimeScope>('all');
  const [query, setQuery] = useState('');
  const [historyState, setHistoryState] = useState<TravelScheduleHistoryState | null>(null);
  const currentMinutes = getCurrentAdjustedMinutes();
  const syncScheduleHistory = () => {
    setHistoryState(readTravelScheduleHistoryState());
  };

  useEffect(() => {
    syncScheduleHistory();
  }, []);

  const filteredTrips = useMemo(
    () =>
      filterTrips(result.trips, {
        serviceFilter,
        stationFilter,
        timeFilter,
        query,
        currentMinutes,
      }),
    [currentMinutes, query, result.trips, serviceFilter, stationFilter, timeFilter],
  );
  const selectedService = result.services.find((service) => service.kind === serviceFilter);
  const emptyMessage =
    serviceFilter !== 'all' && selectedService?.status !== 'active'
      ? selectedService?.message
      : '没有匹配的班次';
  const selectHistoryItem = (item: TravelScheduleHistoryItem) => {
    setServiceFilter(item.serviceKind);
    setStationFilter('all');
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
            <span>车站</span>
            <select
              value={stationFilter}
              onChange={(event) => setStationFilter(event.currentTarget.value)}
            >
              <option value="all">全部车站</option>
              {result.stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
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
        onSelect={selectHistoryItem}
        onClear={clearHistory}
      />

      {result.notice ? (
        <section className="screen-detail-notice" aria-label="班次公告">
          <span className="material-symbols-outlined" aria-hidden="true">
            campaign
          </span>
          <p>{result.notice}</p>
        </section>
      ) : null}

      {filteredTrips.length > 0 ? (
        <div className="schedule-trip-list" aria-label="班次列表">
          {filteredTrips.map((trip) => (
            <ScheduleTripCard
              trip={trip}
              key={trip.tripInstanceId}
              onHistoryChange={syncScheduleHistory}
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
      onClick={onClick}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {getServiceIcon(service.kind)}
      </span>
      <span>{service.label}</span>
      <strong>{service.status === 'active' ? service.tripCount : '未接入'}</strong>
    </button>
  );
}

function ScheduleLocalHistoryPanel({
  state,
  onSelect,
  onClear,
}: Readonly<{
  state: TravelScheduleHistoryState | null;
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
            key={item.id}
            onClick={() => onSelect(item)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {getServiceIcon(item.serviceKind)}
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
  onHistoryChange,
}: Readonly<{
  trip: TravelTripInstance;
  onHistoryChange: () => void;
}>) {
  const [message, setMessage] = useState('');

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

  return (
    <article className="schedule-trip-card" data-service={trip.serviceKind}>
      <div className="schedule-trip-time">
        <time>{trip.departureTime}</time>
        <span>{trip.serviceLabel}</span>
        {trip.tripCode ? <span>班次 {trip.tripCode}</span> : null}
      </div>
      <div className="schedule-trip-main">
        <h3>{trip.lineName}</h3>
        <p>{formatTripEndpoints(trip)}</p>
        <div className="screen-station-flow" aria-label={`${trip.lineName} 停靠站`}>
          {trip.stationNames.map((stationName) => (
            <span key={stationName}>{stationName}</span>
          ))}
        </div>
      </div>
      <dl className="screen-detail-trip-meta schedule-trip-meta">
        <MetaItem label="班次号" value={trip.tripCode ?? '待公布'} />
        {trip.arrivalTime ? <MetaItem label="到达" value={formatArrivalTime(trip)} /> : null}
        <MetaItem
          label={getLocationMetaLabel(trip.serviceKind)}
          value={trip.gateText ?? '待公布'}
        />
        <MetaItem label="运行" value={trip.runtimeText ?? '待公布'} />
        {trip.operatingDays?.length ? (
          <MetaItem label="运行日" value={formatOperatingDays(trip.operatingDays)} />
        ) : null}
        <MetaItem label="票价" value={trip.fareText ?? '待公布'} />
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
        <button className="secondary-action-button" type="button" disabled>
          <span className="material-symbols-outlined" aria-hidden="true">
            confirmation_number
          </span>
          <span>新票务待接入</span>
        </button>
      </div>
      {message ? <p className="schedule-trip-feedback">{message}</p> : null}
    </article>
  );
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
    timeFilter: TravelScheduleTimeScope;
    query: string;
    currentMinutes: number;
  },
): TravelTripInstance[] {
  const query = normalizeSearchValue(input.query);
  const stationFilter = normalizeSearchValue(
    input.stationFilter === 'all' ? '' : input.stationFilter,
  );

  return [...trips]
    .filter((trip) => input.serviceFilter === 'all' || trip.serviceKind === input.serviceFilter)
    .filter(
      (trip) =>
        !stationFilter ||
        trip.stationNames.some(
          (stationName) => normalizeSearchValue(stationName) === stationFilter,
        ),
    )
    .filter((trip) => filterByTime(trip, input.timeFilter, input.currentMinutes))
    .filter((trip) => !query || normalizeSearchValue(buildSearchText(trip)).includes(query))
    .sort(compareTrips);
}

function filterByTime(
  trip: Pick<TravelTripInstance, 'departureTime'>,
  timeFilter: TravelScheduleTimeScope,
  currentMinutes: number,
): boolean {
  if (timeFilter === 'all') {
    return true;
  }

  const tripMinutes = parseAdjustedTime(trip.departureTime);
  return timeFilter === 'upcoming' ? tripMinutes >= currentMinutes : tripMinutes < currentMinutes;
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

function formatTripEndpoints(trip: TravelTripInstance): string {
  const first = trip.originStationName ?? trip.stationNames[0];
  const last = trip.destinationStationName ?? trip.stationNames[trip.stationNames.length - 1];
  const endpoints = first && last ? `${first} - ${last}` : `${trip.stationNames.length} 站`;
  return trip.routeNote ? `${endpoints} · ${trip.routeNote}` : endpoints;
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
