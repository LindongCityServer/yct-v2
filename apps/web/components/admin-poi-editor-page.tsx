'use client';

import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { AdminPoiPanel } from './admin-poi-panel';

export function AdminPoiEditorPage({
  initialParentMarkerId,
  initialMarkerId,
  startNew = false,
}: Readonly<{
  initialParentMarkerId?: string;
  initialMarkerId?: string;
  startNew?: boolean;
}>) {
  const router = useRouter();

  return (
    <AdminPoiPanel
      editorMode="page"
      initialParentMarkerId={initialParentMarkerId}
      initialMarkerId={initialMarkerId}
      startNew={startNew}
      onEditorClose={() => router.push(appPath('/admin/map-poi'))}
    />
  );
}
