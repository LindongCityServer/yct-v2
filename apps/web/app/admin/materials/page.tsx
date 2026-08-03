import { SecondaryShell } from '../../../components/app-shell';
import { AdminMaterialsPanel } from '../../../components/admin-materials-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.adminMaterials;

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
