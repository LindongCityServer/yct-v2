'use client';

import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';

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
        <Link className="secondary-action-button" href={appPath('/')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            article
          </span>
          <span>{t('offline.operations')}</span>
        </Link>
        <Link className="secondary-action-button" href={appPath('/map')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            map
          </span>
          <span>{t('offline.map')}</span>
        </Link>
        <Link className="secondary-action-button" href={appPath('/travel/schedules')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            departure_board
          </span>
          <span>{t('offline.schedules')}</span>
        </Link>
        <Link className="secondary-action-button" href={appPath('/account')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            download_for_offline
          </span>
          <span>{t('offline.manageAfterOnline')}</span>
        </Link>
      </div>
      <p className="settings-row-note">{t('offline.note')}</p>
    </section>
  );
}
