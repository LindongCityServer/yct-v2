import { AdminAdministrativeAreaWorkbench } from '../../../../components/admin-administrative-area-workbench';
import { getPageMetadata } from '../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminMapAreas');
}

export default async function AdminMapAreasEditorRoute({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ areaId?: string | string[] }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const areaId = Array.isArray(resolved?.areaId) ? resolved.areaId[0] : resolved?.areaId;
  return <AdminAdministrativeAreaWorkbench areaId={areaId} />;
}
