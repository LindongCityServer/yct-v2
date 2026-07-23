import { NextResponse } from 'next/server';
import {
  buildEntityTranslationMap,
  entityTranslationKey,
  listEntityTranslations,
} from '../../../../lib/entity-translation-store';
import { readTransitOverview } from '../../../../lib/transit-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [overview, translations] = await Promise.all([
    readTransitOverview(),
    listEntityTranslations(),
  ]);
  const translationMap = buildEntityTranslationMap(translations);
  return NextResponse.json({
    ...overview,
    lines: overview.lines.map((line) => ({
      ...line,
      localizedName: translationMap.get(entityTranslationKey('transit_line', line.id)),
      stationStops: line.stationStops.map((stop) => ({
        ...stop,
        localizedStationName: stop.stationSourceId
          ? translationMap.get(entityTranslationKey('transit_station', stop.stationSourceId))
          : undefined,
      })),
    })),
  });
}
