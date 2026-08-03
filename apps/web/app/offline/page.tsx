import { SecondaryShell } from '../../components/app-shell';
import { OfflinePageContent } from '../../components/offline-page-content';
import { pageMetadata } from '../../lib/site-metadata';

export const metadata = pageMetadata.offline;

export default function OfflinePage() {
  return (
    <SecondaryShell title="离线" titleKey="page.offline">
      <OfflinePageContent />
    </SecondaryShell>
  );
}
