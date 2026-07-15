import { SecondaryShell } from '../../../components/app-shell';
import { AdminTransitPanel } from '../../../components/admin-transit-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminTransitPage() {
  return (
    <SecondaryShell
      title="线路与班次后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/transit" includeOverview />}
    >
      <AdminTransitPanel />
    </SecondaryShell>
  );
}
