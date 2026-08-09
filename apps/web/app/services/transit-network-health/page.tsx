import { SecondaryShell } from '../../../components/app-shell';
import { TransitNetworkHealthPanel } from '../../../components/transit-network-health-panel';
import { getPageMetadata } from '../../../lib/site-metadata';
import { readTransitNetworkHealthReport } from '../../../lib/transit-network-health';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('transitNetworkHealth');
}

export default async function TransitNetworkHealthPage() {
  const report = await readTransitNetworkHealthReport();

  return (
    <SecondaryShell title="公共交通网络健康度" backHref="/services" desktopBackHref="/services">
      <TransitNetworkHealthPanel report={report} />
    </SecondaryShell>
  );
}
