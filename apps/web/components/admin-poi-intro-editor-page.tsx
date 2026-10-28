'use client';

import { AdminPoiWorkspacePage } from './admin-poi-workspace-page';

export function AdminPoiIntroEditorPage({
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
      workspace="intro"
    />
  );
}
