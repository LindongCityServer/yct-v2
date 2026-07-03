import { AppShell } from '../../components/app-shell';
import { MapStageLoader } from '../../components/map-stage-loader';

export default function MapPage() {
  return (
    <AppShell active="map" pageTitle="地图探索" variant="map">
      <MapStageLoader />
    </AppShell>
  );
}
