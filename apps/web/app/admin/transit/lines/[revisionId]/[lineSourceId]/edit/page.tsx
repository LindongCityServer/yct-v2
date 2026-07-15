import { AdminTransitLineMapEditor } from '../../../../../../../components/admin-transit-line-map-editor';

export const dynamic = 'force-dynamic';

export default async function AdminTransitLineMapEditorPage({
  params,
}: Readonly<{
  params: Promise<{ lineSourceId: string; revisionId: string }>;
}>) {
  const { lineSourceId, revisionId } = await params;
  return <AdminTransitLineMapEditor lineSourceId={lineSourceId} revisionId={revisionId} />;
}
