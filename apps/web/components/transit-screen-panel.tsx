'use client';

import type { ApiItemResponse, TransitScreenSnapshot, TransitScreenTrip } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';

export function TransitScreenPanel({
  screen,
}: Readonly<{
  screen: ApiItemResponse<TransitScreenSnapshot>;
}>) {
  const { t } = useI18n();

  if (!screen.item || screen.meta.sourceStatus !== 'ready') {
    return null;
  }

  const snapshot = screen.item;
  const lineCount = new Set(snapshot.trips.map((trip) => trip.lineName)).size;
  const upcomingTrips = selectUpcomingTrips(snapshot.trips, new Date(), 4);

  return (
    <section className="transit-screen-panel" aria-labelledby="transit-screen-title">
      <div className="section-heading">
        <h2 id="transit-screen-title">{t('travel.screen.title')}</h2>
        <div className="screen-panel-actions">
          <Link className="screen-open-link" href={appPath('/travel/screen')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              departure_board
            </span>
            <span>{t('transitScreen.viewTrips')}</span>
          </Link>
          <a
            className="screen-open-link"
            href="https://yct.shangxiaoguan.top/ltcx_schedule/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              open_in_new
            </span>
            <span>{t('transitScreen.legacy')}</span>
          </a>
        </div>
      </div>

      <div className="screen-summary-grid" aria-label={t('transitScreen.summaryAria')}>
        <SummaryItem label={t('travel.screenDetail.station')} value={snapshot.stations.length} />
        <SummaryItem label={t('travel.screenDetail.trip')} value={snapshot.trips.length} />
        <SummaryItem label={t('travel.screenDetail.line')} value={lineCount} />
        <SummaryItem label={t('travel.screenDetail.gate')} value={snapshot.gates.length} />
      </div>

      {upcomingTrips.length > 0 ? (
        <div className="screen-trip-list" aria-label={t('transitScreen.upcomingAria')}>
          {upcomingTrips.map((trip) => (
            <article className="screen-trip-item" key={trip.sourceId}>
              <time>{trip.departureTime}</time>
              <div>
                <strong>{trip.lineName}</strong>
                <span>{formatTripStations(trip, t)}</span>
              </div>
              <span className="screen-trip-code">{trip.tripId}</span>
            </article>
          ))}
        </div>
      ) : null}

      {snapshot.notice ? <p className="screen-notice">{snapshot.notice}</p> : null}
    </section>
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

function selectUpcomingTrips(
  trips: TransitScreenTrip[],
  now: Date,
  limit: number,
): TransitScreenTrip[] {
  const current = getAdjustedMinutes(now.getHours(), now.getMinutes());

  return [...trips]
    .map((trip) => ({
      trip,
      adjustedMinutes: parseAdjustedTime(trip.departureTime),
    }))
    .filter((item) => item.adjustedMinutes >= current)
    .sort((left, right) => left.adjustedMinutes - right.adjustedMinutes)
    .slice(0, limit)
    .map((item) => item.trip);
}

function parseAdjustedTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return getAdjustedMinutes(Number(match[1]), Number(match[2]));
}

function getAdjustedMinutes(hours: number, minutes: number): number {
  const total = hours * 60 + minutes;
  return total < 180 ? total + 24 * 60 : total;
}

function formatTripStations(trip: TransitScreenTrip, t: ReturnType<typeof useI18n>['t']): string {
  const first = trip.stationNames[0];
  const last = trip.stationNames[trip.stationNames.length - 1];
  return first && last
    ? `${first} - ${last}`
    : t('travel.screenDetail.stationCount', { count: trip.stationNames.length });
}
