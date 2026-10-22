import { SecondaryShell } from '../../../components/app-shell';
import { TransitScreenDetailPanel, TransitScreenEmptyState } from '../../../components/transit-screen-detail-panel';
import { getPageMetadata } from '../../../lib/site-metadata';
import { readTransitScreenSnapshot } from '../../../lib/transit-screen';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('travelScreen');
}

export default async function TransitScreenPage() {
  const screen = await readTransitScreenSnapshot();

  return (
    <SecondaryShell title="智运大屏" titleKey="page.travelScreen" backHref="/travel">
      {screen.item && screen.meta.sourceStatus === 'ready' ? (
        <TransitScreenDetailPanel snapshot={screen.item} />
      ) : (
        <TransitScreenEmptyState message={screen.meta.message} />
      )}
    </SecondaryShell>
  );
}
