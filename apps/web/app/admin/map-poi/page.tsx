import { SecondaryShell } from '../../../components/app-shell';
import { AdminPoiPanel } from '../../../components/admin-poi-panel';

export const dynamic = 'force-dynamic';

export default function AdminMapPoiPage() {
  return (
    <SecondaryShell title="POI 后台" backHref="/admin">
      <AdminPoiPanel />
    </SecondaryShell>
  );
}
