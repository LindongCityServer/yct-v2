import { SecondaryShell } from '../../../components/app-shell';
import { TransitScreenDetailPanel } from '../../../components/transit-screen-detail-panel';
import { readTransitScreenSnapshot } from '../../../lib/transit-screen';

export const dynamic = 'force-dynamic';

export default async function TransitScreenPage() {
  const screen = await readTransitScreenSnapshot();

  return (
    <SecondaryShell title="智运大屏" backHref="/travel">
      {screen.item && screen.meta.sourceStatus === 'ready' ? (
        <TransitScreenDetailPanel snapshot={screen.item} />
      ) : (
        <section className="module-panel empty-state" aria-labelledby="screen-empty-title">
          <span className="material-symbols-outlined" aria-hidden="true">
            departure_board
          </span>
          <h2 id="screen-empty-title">大屏数据暂不可用</h2>
          <p>{screen.meta.message ?? '旧客运大屏数据源尚未返回可用数据。'}</p>
        </section>
      )}
    </SecondaryShell>
  );
}
