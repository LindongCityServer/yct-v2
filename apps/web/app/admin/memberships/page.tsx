import { SecondaryShell } from '../../../components/app-shell';
import { AdminMembershipPanel } from '../../../components/admin-membership-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminMembershipsPage() {
  return (
    <SecondaryShell
      title="管理员成员"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={
        <AdminSectionNavigation currentPath="/admin/memberships" includeOverview />
      }
    >
      <AdminMembershipPanel />
    </SecondaryShell>
  );
}
