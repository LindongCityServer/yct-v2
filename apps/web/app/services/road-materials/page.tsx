import { AppShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';

export const dynamic = 'force-dynamic';

export default function RoadMaterialsPage() {
  return (
    <AppShell active="services" pageTitle="路牌物料">
      <MaterialStudioPanel title="路牌物料生成" families={['road_sign', 'address_sign']} />
    </AppShell>
  );
}
