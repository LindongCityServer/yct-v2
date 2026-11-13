import { SecondaryShell } from '../../../components/app-shell';
import { AdminAdministrativeAreaPanel } from '../../../components/admin-administrative-area-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMapAreas');
}

export default async function AdminMapAreasPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ areaId?: string | string[] }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const areaId = Array.isArray(resolved?.areaId) ? resolved.areaId[0] : resolved?.areaId;
  return (
    <SecondaryShell
      title="行政区划"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/map-areas" includeOverview />}
    >
      <AdminAdministrativeAreaPanel initialAreaId={areaId} />
    </SecondaryShell>
  );
}
