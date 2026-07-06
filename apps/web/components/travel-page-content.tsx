'use client';

import type { ApiItemResponse, TransitScreenSnapshot } from '@yct/contracts';
import { useI18n } from '../lib/client-i18n';
import type { TransitOverview } from '../lib/legacy-transit';
import { TravelTaskPanel } from './travel-task-panel';
import { TripReminderPanel } from './trip-reminder-panel';

export function TravelPageContent({
  overview,
  screen,
}: Readonly<{
  overview: TransitOverview;
  screen: ApiItemResponse<TransitScreenSnapshot>;
}>) {
  const { t } = useI18n();

  return (
    <section className="module-panel" aria-labelledby="travel-title">
      <div className="section-heading">
        <h1 id="travel-title" className="sr-only">
          {t('page.travel')}
        </h1>
        <span className="muted">{t('travel.subtitle')}</span>
      </div>
      <TravelTaskPanel overview={overview} screen={screen} />
      <TripReminderPanel />
    </section>
  );
}
