import { SecondaryShell } from '../../../components/app-shell';
import { AdminOperationsPanel } from '../../../components/admin-operations-panel';

export const dynamic = 'force-dynamic';

export default function AdminOperationsPage() {
  return (
    <SecondaryShell title="内容后台" backHref="/account">
      <AdminOperationsPanel />
    </SecondaryShell>
  );
}
