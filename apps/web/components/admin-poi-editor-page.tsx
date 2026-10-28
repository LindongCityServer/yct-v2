'use client';

import { useRouter } from 'next/navigation';
import { buildPoiEditorReturnHref } from '../lib/admin-poi-return';
import { AdminPoiPanel } from './admin-poi-panel';

export function AdminPoiEditorPage({
  initialMarkerId,
  fromPoiDialog = false,
}: Readonly<{
  initialMarkerId?: string;
  fromPoiDialog?: boolean;
}>) {
  const router = useRouter();
  const returnHref = buildPoiEditorReturnHref(initialMarkerId, fromPoiDialog);

  return (
    <AdminPoiPanel
      editorMode="page"
      initialMarkerId={initialMarkerId}
      pageBackHref={returnHref}
      onEditorClose={() => router.push(returnHref)}
    />
  );
}
