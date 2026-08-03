import { SecondaryShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';
import { MaterialStudioTopbarActions } from '../../../components/material-studio-topbar-actions';
import { METRO_WAYFINDING_TEMPLATE_ID } from '../../../lib/metro-wayfinding';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.transitMaterials;

export default function TransitMaterialsPage() {
  return (
    <SecondaryShell
      title="公共交通导视"
      backHref="/services"
      desktopBackHref="/services"
      secondaryActions={<MaterialStudioTopbarActions studioId="transit-materials" />}
    >
      <MaterialStudioPanel
        studioId="transit-materials"
        title="公共交通导视物料生成"
        families={['bus_stop']}
        serverSources={{ bus_stop: 'transit_station' }}
        serverFamilies={['bus_stop']}
        includedTemplateIds={[METRO_WAYFINDING_TEMPLATE_ID]}
        allowTransitNetworkImport
      />
    </SecondaryShell>
  );
}
