import { AdminPoiIntroEditorPage } from '../../../../components/admin-poi-intro-editor-page';
import { getPageMetadata } from '../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMapPoi');
}

export default async function AdminMapPoiIntroEditorRoute({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{
    markerId?: string | string[];
    from?: string | string[];
  }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const markerId = Array.isArray(resolved?.markerId) ? resolved.markerId[0] : resolved?.markerId;
  const from = Array.isArray(resolved?.from) ? resolved.from[0] : resolved?.from;
  return (
    <AdminPoiIntroEditorPage initialMarkerId={markerId} fromPoiDialog={from === 'poi-dialog'} />
  );
}
