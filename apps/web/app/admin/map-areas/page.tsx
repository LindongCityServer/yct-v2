import { SecondaryShell } from '../../../components/app-shell';
import { AdminAdministrativeAreaPanel } from '../../../components/admin-administrative-area-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMapAreas');
}

export default function AdminMapAreasPage() {
  return (
    <SecondaryShell
      title="行政区划"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/map-areas" includeOverview />}
    >
      <AdminAdministrativeAreaPanel />
    </SecondaryShell>
  );
}
