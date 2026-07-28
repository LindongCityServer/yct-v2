import { AppShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';

export const dynamic = 'force-dynamic';

export default function TransitMaterialsPage() {
  return (
    <AppShell active="services" pageTitle="公共交通导视">
      <MaterialStudioPanel
        title="公共交通导视物料生成"
        families={['bus_stop']}
        serverSource="transit_line"
      />
    </AppShell>
  );
}
