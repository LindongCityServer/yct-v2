'use client';

import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';
import { ButtonLink } from './ui/button';

export function OfflinePageContent() {
  const { t } = useI18n();

  return (
    <section className="module-panel offline-page-panel" aria-labelledby="offline-title">
      <span className="material-symbols-outlined" aria-hidden="true">
        cloud_off
      </span>
      <h1 id="offline-title">{t('offline.title')}</h1>
      <p>{t('offline.description')}</p>
      <div className="settings-action-row" aria-label={t('offline.actions')}>
        <ButtonLink variant="secondary" href={appPath('/')} icon="article">
          {t('offline.operations')}
        </ButtonLink>
        <ButtonLink variant="secondary" href={appPath('/map')} icon="map">
          {t('offline.map')}
        </ButtonLink>
        <ButtonLink variant="secondary" href={appPath('/travel/schedules')} icon="departure_board">
          {t('offline.schedules')}
        </ButtonLink>
        <ButtonLink variant="secondary" href={appPath('/account')} icon="download_for_offline">
          {t('offline.manageAfterOnline')}
        </ButtonLink>
      </div>
      <p className="settings-row-note">{t('offline.note')}</p>
    </section>
  );
}
