import { SecondaryShell } from '../../../components/app-shell';
import { AdminMaterialsPanel } from '../../../components/admin-materials-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMaterials');
}

export default function AdminMaterialsPage() {
  return (
    <SecondaryShell
      title="物料后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/materials" includeOverview />}
    >
      <AdminMaterialsPanel />
    </SecondaryShell>
  );
}
