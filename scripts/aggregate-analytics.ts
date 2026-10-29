import { runAggregation } from '../apps/web/lib/analytics/aggregate';

async function main() {
  const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
  const parsedDays = daysArg ? Number(daysArg.slice('--days='.length)) : 3;
  const days = Number.isFinite(parsedDays) ? parsedDays : 3;
  const purge = !process.argv.includes('--no-purge');

  const result = await runAggregation({ days, purge });

  console.log(
    JSON.stringify(
      {
        ok: true,
        metricsFilePath: result.metricsFilePath,
        purged: result.purged,
        days: result.results.map((item) => ({
          day: item.day,
          projects: Object.fromEntries(
            Object.entries(item.projects).map(([project, rows]) => [
              project,
              (rows ?? []).map((row) => ({
                metric: row.metric,
                dimension: row.dimension,
                value: row.value,
              })),
            ]),
          ),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '统计聚合失败。');
  process.exitCode = 1;
});
