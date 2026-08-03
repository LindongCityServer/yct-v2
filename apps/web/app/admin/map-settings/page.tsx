import { SecondaryShell } from '../../../components/app-shell';
import { AdminMapSettingsPanel } from '../../../components/admin-map-settings-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.adminMapSettings;

export default function AdminMapSettingsPage() {
  return (
    <SecondaryShell
      title="地图设置"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={
        <AdminSectionNavigation currentPath="/admin/map-settings" includeOverview />
      }
    >
      <AdminMapSettingsPanel />
    </SecondaryShell>
  );
}
