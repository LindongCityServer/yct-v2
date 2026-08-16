import { AdminMarkdownEditorPage } from '../../../../components/admin-markdown-editor-page';
import { getPageMetadata } from '../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminOperations');
}

export default async function AdminMarkdownEditorRoute({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ contentId?: string | string[] }>;
}>) {
  const resolved = searchParams ? await searchParams : undefined;
  const contentId = Array.isArray(resolved?.contentId)
    ? resolved.contentId[0]
    : resolved?.contentId;
  return <AdminMarkdownEditorPage initialContentId={contentId} />;
}
