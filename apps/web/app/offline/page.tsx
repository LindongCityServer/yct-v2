import { SecondaryShell } from '../../components/app-shell';
import { OfflinePageContent } from '../../components/offline-page-content';
import { getPageMetadata } from '../../lib/site-metadata';

export async function generateMetadata() {
  return getPageMetadata('offline');
}

export default function OfflinePage() {
  return (
    <SecondaryShell title="离线" titleKey="page.offline">
      <OfflinePageContent />
    </SecondaryShell>
  );
}
