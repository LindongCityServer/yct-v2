import { NextResponse } from 'next/server';
import {
  buildEntityTranslationMap,
  entityTranslationKey,
  listEntityTranslations,
} from '../../../../../../lib/entity-translation-store';
import {
  createPublicApiMeta,
  createPublicJsonResponse,
  publicSiteUrl,
} from '../../../../../../lib/public-api';
import { readTransitOverview } from '../../../../../../lib/transit-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const [overview, translations] = await Promise.all([
    readTransitOverview(),
    listEntityTranslations(),
  ]);
  const translationMap = buildEntityTranslationMap(translations);

  return createPublicJsonResponse({
    data: {
      ...overview,
      lines: overview.lines.map((line) => ({
        ...line,
        canonicalUrl: publicSiteUrl(`/map/lines/${encodeURIComponent(line.id)}`),
        localizedName: translationMap.get(entityTranslationKey('transit_line', line.id)),
        stationStops: line.stationStops.map((stop) => ({
          ...stop,
          localizedStationName: stop.stationSourceId
            ? translationMap.get(entityTranslationKey('transit_station', stop.stationSourceId))
            : undefined,
        })),
      })),
    },
    meta: createPublicApiMeta(request, overview.meta, {
      canonicalPath: '/api/v1/public/transit/overview',
    }),
  });
}

export function OPTIONS() {
  return NextResponse.json(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
    },
  });
}
