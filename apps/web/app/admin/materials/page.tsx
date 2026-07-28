import { SecondaryShell } from '../../../components/app-shell';
import { AdminMaterialsPanel } from '../../../components/admin-materials-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

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
