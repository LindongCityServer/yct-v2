import { AppShell } from '../../components/app-shell';
import { MapStageLoader } from '../../components/map-stage-loader';
import { getPageMetadata } from '../../lib/site-metadata';

export async function generateMetadata() {
  return getPageMetadata('map');
}

export default function MapPage() {
  return (
    <AppShell active="map" pageTitle="地图探索" pageTitleKey="page.map" variant="map">
      <MapStageLoader />
    </AppShell>
  );
}
