import { SecondaryShell } from '../../../components/app-shell';
import { AdminPoiPanel } from '../../../components/admin-poi-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminMapPoiPage() {
  return (
    <SecondaryShell
      title="POI 后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/map-poi" includeOverview />}
    >
      <AdminPoiPanel />
    </SecondaryShell>
  );
}
