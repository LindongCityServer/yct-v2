import { AdminTransitLineMapEditor } from '../../../../../../../components/admin-transit-line-map-editor';
import { pageMetadata } from '../../../../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.adminTransitLineEditor;

export default async function AdminTransitLineMapEditorPage({
  params,
}: Readonly<{
  params: Promise<{ lineSourceId: string; revisionId: string }>;
}>) {
  const { lineSourceId, revisionId } = await params;
  return <AdminTransitLineMapEditor lineSourceId={lineSourceId} revisionId={revisionId} />;
}
