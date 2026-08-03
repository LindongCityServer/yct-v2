import { AppShell } from '../../components/app-shell';
import { MapStageLoader } from '../../components/map-stage-loader';
import { pageMetadata } from '../../lib/site-metadata';

export const metadata = pageMetadata.map;

export default function MapPage() {
  return (
    <AppShell active="map" pageTitle="地图探索" pageTitleKey="page.map" variant="map">
      <MapStageLoader />
    </AppShell>
  );
}
