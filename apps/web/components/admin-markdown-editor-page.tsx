'use client';

import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { AdminOperationsPanel } from './admin-operations-panel';

export function AdminMarkdownEditorPage({
  initialContentId,
  startNew = false,
}: Readonly<{
  initialContentId?: string;
  startNew?: boolean;
}>) {
  const router = useRouter();

  return (
    <AdminOperationsPanel
      editorMode="page"
      initialContentId={initialContentId}
      startNew={startNew}
      onEditorClose={() => router.push(appPath('/admin/operations'))}
    />
  );
}
