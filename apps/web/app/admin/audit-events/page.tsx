import { SecondaryShell } from '../../../components/app-shell';
import { AdminEventLogPanel } from '../../../components/admin-event-log-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminAuditEvents');
}

export default function AdminAuditEventsPage() {
  return (
    <SecondaryShell
      title="事件记录"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={
        <AdminSectionNavigation currentPath="/admin/audit-events" includeOverview />
      }
    >
      <AdminEventLogPanel />
    </SecondaryShell>
  );
}
