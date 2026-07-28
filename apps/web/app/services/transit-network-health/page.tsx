import { SecondaryShell } from '../../../components/app-shell';
import { TransitNetworkHealthPanel } from '../../../components/transit-network-health-panel';
import { readTransitNetworkHealthReport } from '../../../lib/transit-network-health';

export const dynamic = 'force-dynamic';

export default async function TransitNetworkHealthPage() {
  const report = await readTransitNetworkHealthReport();

  return (
    <SecondaryShell title="公共交通网络健康度" backHref="/services" desktopBackHref="/services">
      <TransitNetworkHealthPanel report={report} />
    </SecondaryShell>
  );
}
