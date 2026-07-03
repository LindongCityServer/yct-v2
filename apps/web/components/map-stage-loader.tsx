'use client';

import dynamic from 'next/dynamic';

const LazyMapStage = dynamic(() => import('./map-stage').then((module) => module.MapStage), {
  ssr: false,
  loading: () => (
    <section className="map-stage map-stage-loading" aria-label="地图加载中">
      <div className="map-loading-panel" role="status">
        地图正在加载
      </div>
    </section>
  ),
});

export function MapStageLoader() {
  return <LazyMapStage />;
}
