import { SecondaryShell } from '../../../components/app-shell';
import { AdminOperationsPanel } from '../../../components/admin-operations-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminOperations');
}

export default async function AdminOperationsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<{ contentId?: string | string[] }> }>) {
  const resolved = searchParams ? await searchParams : undefined;
  const contentId = Array.isArray(resolved?.contentId)
    ? resolved.contentId[0]
    : resolved?.contentId;
  return (
    <SecondaryShell
      title="内容后台"
      backHref="/admin"
      desktopBackHref="/account"
      desktopNavigation={<AdminSectionNavigation currentPath="/admin/operations" includeOverview />}
    >
      <AdminOperationsPanel initialContentId={contentId} />
    </SecondaryShell>
  );
}
