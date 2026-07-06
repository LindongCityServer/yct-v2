import { SecondaryShell } from '../../components/app-shell';
import { OfflinePageContent } from '../../components/offline-page-content';

export default function OfflinePage() {
  return (
    <SecondaryShell title="离线" titleKey="page.offline">
      <OfflinePageContent />
    </SecondaryShell>
  );
}
