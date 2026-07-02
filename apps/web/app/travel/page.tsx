import { AppShell } from '../../components/app-shell';
import { TripReminderPanel } from '../../components/trip-reminder-panel';
import { TravelTaskPanel } from '../../components/travel-task-panel';
import { readTransitOverview } from '../../lib/transit-data';
import { readTransitScreenSnapshot } from '../../lib/transit-screen';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const [overview, screen] = await Promise.all([
    readTransitOverview(),
    readTransitScreenSnapshot(),
  ]);

  return (
    <AppShell active="travel" pageTitle="出行">
      <section className="module-panel" aria-labelledby="travel-title">
        <div className="section-heading">
          <h1 id="travel-title" className="sr-only">
            出行
          </h1>
          <span className="muted">提醒、班次与后续票务</span>
        </div>
        <TravelTaskPanel overview={overview} screen={screen} />
        <TripReminderPanel />
      </section>
    </AppShell>
  );
}
