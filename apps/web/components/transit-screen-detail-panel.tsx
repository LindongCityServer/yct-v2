'use client';

import type { TransitScreenGate, TransitScreenSnapshot, TransitScreenTrip } from '@yct/contracts';
import { useMemo, useState } from 'react';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

type TimeFilter = 'all' | 'upcoming' | 'past';

export function TransitScreenDetailPanel({
  snapshot,
}: Readonly<{
  snapshot: TransitScreenSnapshot;
}>) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const lineOptions = useMemo(
    () => uniqueSorted(snapshot.trips.map((trip) => trip.lineName)),
    [snapshot.trips],
  );
  const stationOptions = useMemo(
    () => uniqueSorted(snapshot.trips.flatMap((trip) => trip.stationNames)),
    [snapshot.trips],
  );
  const stationNameById = useMemo(
    () => new Map(snapshot.stations.map((station) => [station.stationId, station.name])),
    [snapshot.stations],
  );
  const gatesByLine = useMemo(() => groupGatesByLine(snapshot.gates), [snapshot.gates]);
  const currentMinutes = getCurrentAdjustedMinutes();
  const filteredTrips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...snapshot.trips]
      .filter((trip) => lineFilter === 'all' || trip.lineName === lineFilter)
      .filter((trip) => stationFilter === 'all' || trip.stationNames.includes(stationFilter))
      .filter((trip) => filterByTime(trip, timeFilter, currentMinutes))
      .filter((trip) => {
        if (!normalizedQuery) {
          return true;
        }

        return buildSearchText(trip, gatesByLine.get(trip.lineName), stationNameById, t).includes(
          normalizedQuery,
        );
      })
      .sort(compareTrips);
  }, [
    currentMinutes,
    gatesByLine,
    lineFilter,
    query,
    snapshot.trips,
    stationFilter,
    stationNameById,
    t,
    timeFilter,
  ]);

  return (
    <section className="module-panel transit-screen-detail" aria-labelledby="screen-detail-title">
      <div className="section-heading">
        <h2 id="screen-detail-title">{t('travel.screenDetail.title')}</h2>
        <span className="muted">
          {t('travel.screenDetail.trips', {
            shown: filteredTrips.length,
            total: snapshot.trips.length,
          })}
        </span>
      </div>

      <div className="screen-detail-summary" aria-label={t('travel.screenDetail.summaryAria')}>
        <SummaryItem label={t('travel.screenDetail.stations')} value={snapshot.stations.length} />
        <SummaryItem label={t('travel.screenDetail.trip')} value={snapshot.trips.length} />
        <SummaryItem label={t('travel.screenDetail.routes')} value={lineOptions.length} />
        <SummaryItem label={t('travel.screenDetail.gate')} value={snapshot.gates.length} />
      </div>

      <div className="screen-filter-panel" aria-label={t('travel.screenDetail.filterAria')}>
        <div className="search-box screen-search-box">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label={t('travel.screenDetail.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t('travel.screenDetail.search')}
          />
          {query ? (
            <button
              className="search-clear-button"
              type="button"
              aria-label={t('travel.screenDetail.searchClear')}
              onClick={() => setQuery('')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          ) : null}
        </div>

        <div className="screen-filter-grid">
          <label>
            <span>{t('travel.screenDetail.line')}</span>
            <select
              value={lineFilter}
              onChange={(event) => setLineFilter(event.currentTarget.value)}
            >
              <option value="all">{t('travel.screenDetail.total')}</option>
              {lineOptions.map((lineName) => (
                <option value={lineName} key={lineName}>
                  {lineName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('travel.screenDetail.station')}</span>
            <select
              value={stationFilter}
              onChange={(event) => setStationFilter(event.currentTarget.value)}
            >
              <option value="all">{t('travel.screenDetail.total')}</option>
              {stationOptions.map((stationName) => (
                <option value={stationName} key={stationName}>
                  {stationName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="screen-time-filter" aria-label={t('travel.screenDetail.timeFilterAria')}>
          {timeOptions.map((option) => (
            <button
              className={timeFilter === option.value ? 'is-active' : ''}
              type="button"
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

      {snapshot.notice ? (
        <section className="screen-detail-notice" aria-label={t('travel.screenDetail.noticeAria')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            campaign
          </span>
          <p>{snapshot.notice}</p>
        </section>
      ) : null}

      {filteredTrips.length > 0 ? (
        <div className="screen-detail-trip-list" aria-label={t('travel.screenDetail.listAria')}>
          {filteredTrips.map((trip) => (
            <TripItem
              trip={trip}
              gates={gatesByLine.get(trip.lineName) ?? []}
              stationNameById={stationNameById}
              t={t}
              key={trip.sourceId}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            event_busy
          </span>
          <p>{t('travel.screenDetail.empty')}</p>
        </div>
      )}
    </section>
  );
}

function TripItem({
  trip,
  gates,
  stationNameById,
  t,
}: Readonly<{
  trip: TransitScreenTrip;
  gates: TransitScreenGate[];
  stationNameById: Map<string, string>;
  t: ReturnType<typeof useI18n>['t'];
}>) {
  return (
    <article className="screen-detail-trip-item">
      <div className="screen-detail-trip-time">
        <time>{trip.departureTime}</time>
        <span>{trip.tripId}</span>
      </div>
      <div className="screen-detail-trip-main">
        <h3>{trip.lineName}</h3>
        <p>{formatTripStations(trip, t)}</p>
        <div
          className="screen-station-flow"
          aria-label={t('travel.screenDetail.stationFlowAria', { line: trip.lineName })}
        >
          {trip.stationNames.map((stationName) => (
            <span key={stationName}>{stationName}</span>
          ))}
        </div>
      </div>
      <dl className="screen-detail-trip-meta">
        <MetaItem
          label={t('travel.screenDetail.gate')}
          value={formatGates(gates, stationNameById, t)}
        />
        <MetaItem
          label={t('travel.screenDetail.runtime')}
          value={trip.runtimeText ?? t('lineDetail.toBeAdded')}
        />
        <MetaItem
          label={t('travel.screenDetail.fare')}
          value={trip.fare ?? t('lineDetail.toBeAdded')}
        />
        <MetaItem
          label={t('travel.screenDetail.operator')}
          value={trip.operator ?? t('lineDetail.toBeAdded')}
        />
      </dl>
    </article>
  );
}

function SummaryItem({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="screen-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

const timeOptions: Array<{ value: TimeFilter; labelKey: CommonMessageKey; icon: string }> = [
  { value: 'all', labelKey: 'travel.screenDetail.total', icon: 'format_list_bulleted' },
  { value: 'upcoming', labelKey: 'travel.screenDetail.upcoming', icon: 'schedule' },
  { value: 'past', labelKey: 'travel.screenDetail.past', icon: 'history' },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN', { numeric: true }),
  );
}

function groupGatesByLine(gates: TransitScreenGate[]): Map<string, TransitScreenGate[]> {
  const map = new Map<string, TransitScreenGate[]>();
  for (const gate of gates) {
    const group = map.get(gate.lineName) ?? [];
    group.push(gate);
    map.set(gate.lineName, group);
  }
  return map;
}

function filterByTime(
  trip: TransitScreenTrip,
  timeFilter: TimeFilter,
  currentMinutes: number,
): boolean {
  if (timeFilter === 'all') {
    return true;
  }

  const tripMinutes = parseAdjustedTime(trip.departureTime);
  return timeFilter === 'upcoming' ? tripMinutes >= currentMinutes : tripMinutes < currentMinutes;
}

function compareTrips(left: TransitScreenTrip, right: TransitScreenTrip): number {
  return (
    parseAdjustedTime(left.departureTime) - parseAdjustedTime(right.departureTime) ||
    left.lineName.localeCompare(right.lineName, 'zh-CN', { numeric: true }) ||
    left.tripId.localeCompare(right.tripId, 'zh-CN', { numeric: true })
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

function buildSearchText(
  trip: TransitScreenTrip,
  gates: TransitScreenGate[] | undefined,
  stationNameById: Map<string, string>,
  t: ReturnType<typeof useI18n>['t'],
): string {
  return [
    trip.tripId,
    trip.departureTime,
    trip.lineName,
    ...trip.stationNames,
    trip.fare,
    trip.operator,
    trip.runtimeText,
    gates ? formatGates(gates, stationNameById, t) : undefined,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function formatTripStations(trip: TransitScreenTrip, t: ReturnType<typeof useI18n>['t']): string {
  const first = trip.stationNames[0];
  const last = trip.stationNames[trip.stationNames.length - 1];
  return first && last
    ? `${first} - ${last}`
    : t('travel.screenDetail.stationCount', { count: trip.stationNames.length });
}

function formatGates(
  gates: TransitScreenGate[],
  stationNameById: Map<string, string>,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (gates.length === 0) {
    return t('lineDetail.toBeAdded');
  }

  return gates
    .map((gate) => {
      const stationName = stationNameById.get(gate.stationId);
      return stationName ? `${stationName} ${gate.gate}` : gate.gate;
    })
    .join('、');
}
