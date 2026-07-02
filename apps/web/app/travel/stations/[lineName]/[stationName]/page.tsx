import { notFound } from 'next/navigation';
import { SecondaryShell } from '../../../../../components/app-shell';
import { TransitStationDetailPanel } from '../../../../../components/transit-station-detail-panel';
import { readTransitOverview } from '../../../../../lib/transit-data';
import { readTransitStationDetails } from '../../../../../lib/transit-station-details';

export const dynamic = 'force-dynamic';

export default async function TransitStationDetailPage({
  params,
}: Readonly<{
  params: Promise<{ lineName: string; stationName: string }>;
}>) {
  const { lineName, stationName } = await params;
  const decodedLineName = decodeSegment(lineName);
  const decodedStationName = decodeSegment(stationName);
  const [overview, stationDetails] = await Promise.all([
    readTransitOverview(),
    readTransitStationDetails(),
  ]);
  const detail = stationDetails.items.find(
    (item) => item.lineName === decodedLineName && item.stationName === decodedStationName,
  );

  if (!detail) {
    notFound();
  }

  const line = overview.lines.find((item) => item.name === detail.lineName);

  return (
    <SecondaryShell
      title={detail.stationName}
      backHref={line ? `/travel/${encodeURIComponent(line.id)}` : '/travel'}
    >
      <TransitStationDetailPanel detail={detail} line={line} />
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
