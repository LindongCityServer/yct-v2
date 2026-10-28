'use client';

import { AdminPoiWorkspacePage } from './admin-poi-workspace-page';

export function AdminPoiEditorPage({
  initialMarkerId,
  returnContext,
}: Readonly<{
  initialMarkerId?: string;
  returnContext?: string;
}>) {
  return (
    <AdminPoiWorkspacePage
      initialMarkerId={initialMarkerId}
      returnContext={returnContext}
      workspace="geometry"
    />
  );
}
