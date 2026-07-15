import { SecondaryShell } from '../../../components/app-shell';
import { AdminOperationsPanel } from '../../../components/admin-operations-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminOperationsPage() {
  return (
    <SecondaryShell
      title="内容后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/operations" includeOverview />}
    >
      <AdminOperationsPanel />
    </SecondaryShell>
  );
}
