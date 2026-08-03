import { SecondaryShell } from '../../../components/app-shell';
import { AdminServicesPanel } from '../../../components/admin-services-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.adminServices;

export default function AdminServicesPage() {
  return (
    <SecondaryShell
      title="服务后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/services" includeOverview />}
    >
      <AdminServicesPanel />
    </SecondaryShell>
  );
}
