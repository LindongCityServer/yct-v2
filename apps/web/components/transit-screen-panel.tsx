import type { ApiItemResponse, TransitScreenSnapshot, TransitScreenTrip } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';

export function TransitScreenPanel({
  screen,
}: Readonly<{
  screen: ApiItemResponse<TransitScreenSnapshot>;
}>) {
  if (!screen.item || screen.meta.sourceStatus !== 'ready') {
    return null;
  }

  const snapshot = screen.item;
  const lineCount = new Set(snapshot.trips.map((trip) => trip.lineName)).size;
  const upcomingTrips = selectUpcomingTrips(snapshot.trips, new Date(), 4);

  return (
    <section className="transit-screen-panel" aria-labelledby="transit-screen-title">
      <div className="section-heading">
        <h2 id="transit-screen-title">智运大屏</h2>
        <div className="screen-panel-actions">
          <Link className="screen-open-link" href={appPath('/travel/screen')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              departure_board
            </span>
            <span>查看班次</span>
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
            <span>旧版</span>
          </a>
        </div>
      </div>

      <div className="screen-summary-grid" aria-label="客运大屏数据摘要">
        <SummaryItem label="车站" value={snapshot.stations.length} />
        <SummaryItem label="班次" value={snapshot.trips.length} />
        <SummaryItem label="线路" value={lineCount} />
        <SummaryItem label="检票口" value={snapshot.gates.length} />
      </div>

      {upcomingTrips.length > 0 ? (
        <div className="screen-trip-list" aria-label="近期班次">
          {upcomingTrips.map((trip) => (
            <article className="screen-trip-item" key={trip.sourceId}>
              <time>{trip.departureTime}</time>
              <div>
                <strong>{trip.lineName}</strong>
                <span>{formatTripStations(trip)}</span>
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

function formatTripStations(trip: TransitScreenTrip): string {
  const first = trip.stationNames[0];
  const last = trip.stationNames[trip.stationNames.length - 1];
  return first && last ? `${first} - ${last}` : `${trip.stationNames.length} 站`;
}
