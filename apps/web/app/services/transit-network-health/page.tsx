import { SecondaryShell } from '../../../components/app-shell';
import { TransitNetworkHealthPanel } from '../../../components/transit-network-health-panel';
import { pageMetadata } from '../../../lib/site-metadata';
import { readTransitNetworkHealthReport } from '../../../lib/transit-network-health';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.transitNetworkHealth;

export default async function TransitNetworkHealthPage() {
  const report = await readTransitNetworkHealthReport();

  return (
    <SecondaryShell title="公共交通网络健康度" backHref="/services" desktopBackHref="/services">
      <TransitNetworkHealthPanel report={report} />
    </SecondaryShell>
  );
}
