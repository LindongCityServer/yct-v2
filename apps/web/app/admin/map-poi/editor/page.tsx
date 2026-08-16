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
  }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const markerId = Array.isArray(resolved?.markerId) ? resolved.markerId[0] : resolved?.markerId;
  return <AdminPoiEditorPage initialMarkerId={markerId} />;
}
