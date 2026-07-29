import { SecondaryShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';

export const dynamic = 'force-dynamic';

export default function TransitMaterialsPage() {
  return (
    <SecondaryShell title="公共交通导视" backHref="/services" desktopBackHref="/services">
      <MaterialStudioPanel
        title="公共交通导视物料生成"
        families={['bus_stop']}
        serverSource="transit_station"
      />
    </SecondaryShell>
  );
}
