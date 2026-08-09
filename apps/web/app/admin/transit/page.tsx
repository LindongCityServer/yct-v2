import { SecondaryShell } from '../../../components/app-shell';
import { AdminTransitPanel } from '../../../components/admin-transit-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminTransit');
}

export default async function AdminTransitPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{
    section?: string | string[];
    lineId?: string | string[];
    tripInstanceId?: string | string[];
  }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const rawSection = Array.isArray(resolved?.section) ? resolved.section[0] : resolved?.section;
  const lineId = Array.isArray(resolved?.lineId) ? resolved.lineId[0] : resolved?.lineId;
  const tripInstanceId = Array.isArray(resolved?.tripInstanceId)
    ? resolved.tripInstanceId[0]
    : resolved?.tripInstanceId;
  const section = rawSection === 'trips' || rawSection === 'profiles' ? rawSection : 'lines';
  return (
    <SecondaryShell
      title="线路与班次后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/transit" includeOverview />}
    >
      <AdminTransitPanel
        initialSection={section}
        initialLineId={lineId}
        initialTripInstanceId={tripInstanceId}
      />
    </SecondaryShell>
  );
}
