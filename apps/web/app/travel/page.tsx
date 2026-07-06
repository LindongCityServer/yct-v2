import { AppShell } from '../../components/app-shell';
import { TravelPageContent } from '../../components/travel-page-content';
import { readTransitOverview } from '../../lib/transit-data';
import { readTransitScreenSnapshot } from '../../lib/transit-screen';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const [overview, screen] = await Promise.all([
    readTransitOverview(),
    readTransitScreenSnapshot(),
  ]);

  return (
    <AppShell active="travel" pageTitle="出行" pageTitleKey="page.travel">
      <TravelPageContent overview={overview} screen={screen} />
    </AppShell>
  );
}
