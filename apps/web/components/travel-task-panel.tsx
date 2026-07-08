'use client';

import type { ApiItemResponse, TransitScreenSnapshot } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';
import type { TransitOverview } from '../lib/legacy-transit';

export function TravelTaskPanel({
  overview,
  screen,
}: Readonly<{
  overview: TransitOverview;
  screen: ApiItemResponse<TransitScreenSnapshot>;
}>) {
  const { t } = useI18n();
  const coachLines = overview.lines.filter((line) => line.mode === 'coach');
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
          <h2 id="travel-task-title">{t('travel.services.title')}</h2>
          <span className="muted">{t('travel.services.subtitle')}</span>
        </div>
      </div>

      <div className="travel-task-grid">
        <TravelTaskCard
          icon="departure_board"
          title={t('travel.schedules.title')}
          detail={t('travel.schedules.detail', { tripCount, stationCount })}
          href={appPath('/travel/schedules')}
          actionLabel={t('travel.schedules.action')}
          tone="coach"
        />
        <TravelTaskCard
          icon="map"
          title={t('travel.map.title')}
          detail={t('travel.map.detail')}
          href={appPath('/map')}
          actionLabel={t('travel.map.action')}
          tone="map"
        />
        <TravelTaskCard
          icon="analytics"
          title={t('travel.screen.title')}
          detail={t('travel.screen.detail', { gateCount })}
          href={appPath('/travel/screen')}
          actionLabel={t('travel.screen.action')}
          tone="ticket"
        />
        <TravelTaskCard
          icon="confirmation_number"
          title={t('travel.ticketing.title')}
          detail={t('travel.ticketing.detail')}
          actionLabel={t('travel.ticketing.action')}
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
