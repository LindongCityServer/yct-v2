import { SecondaryShell } from '../../components/app-shell';
import { SearchPageClient } from '../../components/search-page-client';
import { readOperationsFeed } from '../../lib/operations-content';
import { readServiceEntryGroups } from '../../lib/service-entries';
import { readTransitOverview } from '../../lib/transit-data';
import { readTransitStationDetails } from '../../lib/transit-station-details';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ q?: string | string[] }>;
}>) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [feed, transit, stationDetails, serviceGroups] = await Promise.all([
    readOperationsFeed(),
    readTransitOverview(),
    readTransitStationDetails(),
    readServiceEntryGroups(),
  ]);
  const q = resolvedSearchParams?.q;
  const initialQuery = Array.isArray(q) ? (q[0] ?? '') : (q ?? '');

  return (
    <SecondaryShell title="搜索" titleKey="page.search">
      <SearchPageClient
        feed={feed}
        transit={transit}
        stationDetails={stationDetails.items}
        serviceGroups={serviceGroups.items}
        initialQuery={initialQuery}
      />
    </SecondaryShell>
  );
}
