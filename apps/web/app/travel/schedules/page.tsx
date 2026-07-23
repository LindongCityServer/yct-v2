import { SecondaryShell } from '../../../components/app-shell';
import { TravelScheduleQueryPanel } from '../../../components/travel-schedule-query-panel';
import { readTravelScheduleQuery } from '../../../lib/travel-schedules';

export const dynamic = 'force-dynamic';

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
        <section className="module-panel empty-state" aria-labelledby="schedule-empty-title">
          <span className="material-symbols-outlined" aria-hidden="true">
            departure_board
          </span>
          <h2 id="schedule-empty-title">班次数据暂不可用</h2>
          <p>{schedules.meta.message ?? '当前没有可用的统一班次数据。'}</p>
        </section>
      )}
    </SecondaryShell>
  );
}
