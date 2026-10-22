import { SecondaryShell } from '../../components/app-shell';
import { AdminHomeHeading, AdminHomeOverview } from '../../components/admin-home-overview';
import { AdminSectionNavigation } from '../../components/admin-section-navigation';
import { getPageMetadata } from '../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('admin');
}

export default function AdminHomePage() {
  return (
    <SecondaryShell title="管理后台" titleKey="admin.home.title" backHref="/account">
      <section className="module-panel admin-home-panel" aria-labelledby="admin-home-title">
        <AdminHomeHeading />
        <AdminHomeOverview />
        <AdminSectionNavigation currentPath="/admin" />
      </section>
    </SecondaryShell>
  );
}
