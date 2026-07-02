import { SecondaryShell } from '../../../components/app-shell';
import { AdminTransitPanel } from '../../../components/admin-transit-panel';

export const dynamic = 'force-dynamic';

export default function AdminTransitPage() {
  return (
    <SecondaryShell title="线路后台" backHref="/account">
      <AdminTransitPanel />
    </SecondaryShell>
  );
}
