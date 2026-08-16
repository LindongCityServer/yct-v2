'use client';

import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { AdminPoiPanel } from './admin-poi-panel';

export function AdminPoiEditorPage({
  initialMarkerId,
}: Readonly<{
  initialMarkerId?: string;
}>) {
  const router = useRouter();

  return (
    <AdminPoiPanel
      editorMode="page"
      initialMarkerId={initialMarkerId}
      onEditorClose={() => router.push(appPath('/admin/map-poi'))}
    />
  );
}
