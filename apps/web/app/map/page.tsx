import { AppShell } from '../../components/app-shell';
import { MapStage } from '../../components/map-stage';

export default function MapPage() {
  return (
    <AppShell active="map" pageTitle="地图探索" variant="map">
      <MapStage />
    </AppShell>
  );
}
