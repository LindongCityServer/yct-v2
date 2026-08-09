import { AdminPoiEditorPage } from '../../../../components/admin-poi-editor-page';
import { getPageMetadata } from '../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMapPoi');
}

export default async function AdminMapPoiEditorRoute({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{
    markerId?: string | string[];
    new?: string | string[];
    parentMarkerId?: string | string[];
  }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const markerId = Array.isArray(resolved?.markerId) ? resolved.markerId[0] : resolved?.markerId;
  const newValue = Array.isArray(resolved?.new) ? resolved.new[0] : resolved?.new;
  const parentMarkerId = Array.isArray(resolved?.parentMarkerId)
    ? resolved.parentMarkerId[0]
    : resolved?.parentMarkerId;

  return (
    <AdminPoiEditorPage
      initialParentMarkerId={parentMarkerId}
      initialMarkerId={markerId}
      startNew={!markerId || newValue === '1' || newValue === 'true'}
    />
  );
}
