'use client';

import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { AdminPoiPanel } from './admin-poi-panel';

export function AdminPoiIntroEditorPage({
  initialMarkerId,
}: Readonly<{
  initialMarkerId?: string;
}>) {
  const router = useRouter();
  // 关闭工作台后回到 POI 后台，并自动重新打开该 POI 的编辑弹窗。
  const backHref = initialMarkerId
    ? `/admin/map-poi?markerId=${encodeURIComponent(initialMarkerId)}`
    : '/admin/map-poi';

  return (
    <AdminPoiPanel
      editorMode="page"
      initialMarkerId={initialMarkerId}
      pageWorkspace="intro"
      onEditorClose={() => router.push(appPath(backHref))}
    />
  );
}
