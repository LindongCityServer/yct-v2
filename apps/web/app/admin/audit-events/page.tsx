import { SecondaryShell } from '../../../components/app-shell';
import { AdminAuditEventsPanel } from '../../../components/admin-audit-events-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminAuditEventsPage() {
  return (
    <SecondaryShell
      title="审计事件"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={
        <AdminSectionNavigation currentPath="/admin/audit-events" includeOverview />
      }
    >
      <AdminAuditEventsPanel />
    </SecondaryShell>
  );
}
