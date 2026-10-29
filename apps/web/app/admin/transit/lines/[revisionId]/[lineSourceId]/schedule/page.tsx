import { AdminTransitTripWorkbench } from '../../../../../../../components/admin-transit-trip-workbench';
import { getPageMetadata } from '../../../../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return getPageMetadata('adminTransitLineEditor');
}

export default async function AdminTransitTripWorkbenchPage({
  params,
}: Readonly<{
  params: Promise<{ lineSourceId: string; revisionId: string }>;
}>) {
  const { lineSourceId, revisionId } = await params;
  return <AdminTransitTripWorkbench lineSourceId={lineSourceId} revisionId={revisionId} />;
}
