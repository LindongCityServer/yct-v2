import { SecondaryShell } from '../../../components/app-shell';
import { AdminAuditEventsPanel } from '../../../components/admin-audit-events-panel';

export const dynamic = 'force-dynamic';

export default function AdminAuditEventsPage() {
  return (
    <SecondaryShell title="审计事件" backHref="/admin">
      <AdminAuditEventsPanel />
    </SecondaryShell>
  );
}
