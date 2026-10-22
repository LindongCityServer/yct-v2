'use client';

import dynamic from 'next/dynamic';
import { useI18n } from '../lib/client-i18n';

const LazyMapStage = dynamic(() => import('./map-stage').then((module) => module.MapStage), {
  ssr: false,
  loading: () => <MapStageLoadingFallback />,
});

function MapStageLoadingFallback() {
  const { t } = useI18n();
  return (
    <section className="map-stage map-stage-loading" aria-label={t('mapStageLoader.aria')}>
      <div className="map-loading-panel" role="status">
        {t('mapStageLoader.loading')}
      </div>
    </section>
  );
}

export function MapStageLoader() {
  return <LazyMapStage />;
}
