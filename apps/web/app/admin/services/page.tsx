import { SecondaryShell } from '../../../components/app-shell';
import { AdminServicesPanel } from '../../../components/admin-services-panel';

export const dynamic = 'force-dynamic';

export default function AdminServicesPage() {
  return (
    <SecondaryShell title="服务后台" backHref="/admin">
      <AdminServicesPanel />
    </SecondaryShell>
  );
}
