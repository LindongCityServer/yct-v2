import { SecondaryShell } from '../../../components/app-shell';
import { AdminPoiPanel } from '../../../components/admin-poi-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { pageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.adminMapPoi;

export default async function AdminMapPoiPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<{ markerId?: string | string[] }> }>) {
  const resolved = searchParams ? await searchParams : undefined;
  const markerId = Array.isArray(resolved?.markerId) ? resolved.markerId[0] : resolved?.markerId;
  return (
    <SecondaryShell
      title="POI 后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/map-poi" includeOverview />}
    >
      <AdminPoiPanel initialMarkerId={markerId} />
    </SecondaryShell>
  );
}
