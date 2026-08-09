import { AdminTransitLineMapEditor } from '../../../../../../../components/admin-transit-line-map-editor';
import { getPageMetadata } from '../../../../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminTransitLineEditor');
}

export default async function AdminTransitLineMapEditorPage({
  params,
}: Readonly<{
  params: Promise<{ lineSourceId: string; revisionId: string }>;
}>) {
  const { lineSourceId, revisionId } = await params;
  return <AdminTransitLineMapEditor lineSourceId={lineSourceId} revisionId={revisionId} />;
}
