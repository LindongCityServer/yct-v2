import type { ApiItemResponse, TransitScreenSnapshot } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import type { TransitOverview } from '../lib/legacy-transit';

export function TravelTaskPanel({
  overview,
  screen,
}: Readonly<{
  overview: TransitOverview;
  screen: ApiItemResponse<TransitScreenSnapshot>;
}>) {
  const coachLines = overview.lines.filter((line) => line.mode === 'coach');
  const coachLineCount = coachLines.length;
  const screenSnapshot = screen.meta.sourceStatus === 'ready' ? screen.item : undefined;
  const tripCount = screenSnapshot
    ? screenSnapshot.trips.length
    : coachLines.reduce((total, line) => total + (line.departureTimes?.length ?? 0), 0);
  const stationCount = screenSnapshot
    ? screenSnapshot.stations.length
    : new Set(coachLines.flatMap((line) => line.stationNames)).size;
  const gateCount = screenSnapshot?.gates.length ?? 0;

  return (
    <section className="travel-task-panel" aria-labelledby="travel-task-title">
      <div className="section-heading">
        <div>
          <h2 id="travel-task-title">出行服务</h2>
          <span className="muted">提醒、班次查询与后续票务入口</span>
        </div>
        <Link className="screen-open-link" href={appPath('/map')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            map
          </span>
          <span>线路去地图查看</span>
        </Link>
      </div>

      <div className="travel-task-grid">
        <TravelTaskCard
          icon="departure_board"
          title="班次查询"
          detail={`客运 ${tripCount} 个班次，${stationCount} 个车站；轮渡与航班预留统一入口`}
          href={appPath('/travel/schedules')}
          actionLabel="查询班次"
          tone="coach"
        />
        <TravelTaskCard
          icon="analytics"
          title="智运大屏"
          detail={`${gateCount} 个检票口数据，展示近期客运班次与运营提示`}
          href={appPath('/travel/screen')}
          actionLabel="查看大屏"
          tone="ticket"
        />
        <TravelTaskCard
          icon="route"
          title="线路与站点"
          detail={`${overview.lines.length} 条线路已迁入地图探索，客运 ${coachLineCount} 条`}
          href={appPath('/map')}
          actionLabel="去地图探索"
          tone="map"
        />
        <TravelTaskCard
          icon="confirmation_number"
          title="票券与订单"
          detail="真实电子票、检票、退票和乘车码后续接入临东通"
          actionLabel="待接入"
          disabled
          tone="future"
        />
      </div>
    </section>
  );
}

function TravelTaskCard({
  icon,
  title,
  detail,
  href,
  actionLabel,
  external,
  disabled,
  tone,
}: Readonly<{
  icon: string;
  title: string;
  detail: string;
  href?: string;
  actionLabel: string;
  external?: boolean;
  disabled?: boolean;
  tone: 'coach' | 'ticket' | 'map' | 'future';
}>) {
  const content = (
    <>
      <span className="material-symbols-outlined travel-task-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="travel-task-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="travel-task-action">
        <span>{actionLabel}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {disabled ? 'hourglass_empty' : external ? 'open_in_new' : 'arrow_forward'}
        </span>
      </span>
    </>
  );

  const className = disabled
    ? `travel-task-card tone-${tone} is-disabled`
    : `travel-task-card tone-${tone}`;

  if (disabled || !href) {
    return (
      <div className={className} aria-disabled="true">
        {content}
      </div>
    );
  }

  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link className={className} href={appPath(href)}>
      {content}
    </Link>
  );
}
