import { SecondaryShell } from '../../../components/app-shell';
import { getPageMetadata } from '../../../lib/site-metadata';
import { TravelScheduleEmptyState, TravelScheduleQueryPanel } from '../../../components/travel-schedule-query-panel';
import { readTravelScheduleQuery } from '../../../lib/travel-schedules';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('travelSchedules');
}

export default async function TravelSchedulesPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ q?: string | string[] }>;
}>) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawQuery = resolvedSearchParams?.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const schedules = await readTravelScheduleQuery({ query: query?.trim() || undefined });

  return (
    <SecondaryShell title="班次查询" titleKey="page.scheduleSearch" backHref="/travel">
      {schedules.item ? (
        <TravelScheduleQueryPanel initialQuery={query} result={schedules.item} />
      ) : (
        <TravelScheduleEmptyState message={schedules.meta.message} />
      )}
    </SecondaryShell>
  );
}
