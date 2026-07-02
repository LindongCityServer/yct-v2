import { notFound } from 'next/navigation';
import { SecondaryShell } from '../../../components/app-shell';
import { TransitLineDetailPanel } from '../../../components/transit-line-detail-panel';
import { readTransitOverview } from '../../../lib/transit-data';
import { readTransitStationDetails } from '../../../lib/transit-station-details';

export const dynamic = 'force-dynamic';

export default async function TransitLineDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const [overview, stationDetails] = await Promise.all([
    readTransitOverview(),
    readTransitStationDetails(),
  ]);
  const line = overview.lines.find((item) => item.id === decodedId);

  if (!line) {
    notFound();
  }

  return (
    <SecondaryShell title={line.name} backHref="/travel">
      <TransitLineDetailPanel
        line={line}
        modeProfiles={overview.modeProfiles}
        stationDetails={stationDetails.items.filter((detail) => detail.lineName === line.name)}
      />
    </SecondaryShell>
  );
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
