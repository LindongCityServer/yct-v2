import { SecondaryShell } from '../../../components/app-shell';
import { MaterialStudioPanel } from '../../../components/material-studio-panel';
import { MaterialStudioTopbarActions } from '../../../components/material-studio-topbar-actions';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.roadMaterials;

export default function RoadMaterialsPage() {
  return (
    <SecondaryShell
      title="路牌物料"
      backHref="/services"
      desktopBackHref="/services"
      secondaryActions={<MaterialStudioTopbarActions studioId="road-materials" />}
    >
      <MaterialStudioPanel
        studioId="road-materials"
        title="路牌物料生成"
        families={['road_sign', 'address_sign']}
        serverSources={{ road_sign: 'road_coordinate', address_sign: 'map_location' }}
      />
    </SecondaryShell>
  );
}
