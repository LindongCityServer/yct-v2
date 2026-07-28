import { SecondaryShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';

export const dynamic = 'force-dynamic';

export default function RoadMaterialsPage() {
  return (
    <SecondaryShell title="路牌物料" backHref="/services" desktopBackHref="/services">
      <MaterialStudioPanel
        title="路牌物料生成"
        families={['road_sign', 'address_sign']}
        serverSource="map_location"
        serverFamilies={['road_sign']}
      />
    </SecondaryShell>
  );
}
