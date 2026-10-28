'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { buildPoiWorkspaceReturnHref, type PoiWorkspace } from '../lib/poi-editor-navigation';
import { AdminPoiPanel } from './admin-poi-panel';

export function AdminPoiWorkspacePage({
  initialMarkerId,
  returnContext,
  workspace,
}: Readonly<{ initialMarkerId?: string; returnContext?: string; workspace: PoiWorkspace }>) {
  const router = useRouter();
  const returningRef = useRef(false);
  const returnHref = buildPoiWorkspaceReturnHref(initialMarkerId, returnContext);
  return (
    <AdminPoiPanel
      editorMode="page"
      initialMarkerId={initialMarkerId}
      pageWorkspace={workspace}
      workspaceBackHref={returnHref}
      onEditorClose={() => {
        if (returningRef.current) return;
        returningRef.current = true;
        router.replace(appPath(returnHref));
      }}
    />
  );
}
