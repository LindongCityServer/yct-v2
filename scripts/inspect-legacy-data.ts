import { join } from 'node:path';
import {
  parseLegacyContentFile,
  parseLegacyContentSource,
  parseLegacyCoachRouteSource,
  parseLegacyCoachRuntimeSegmentSource,
  parseLegacyCoachScreenGateSource,
  parseLegacyCoachScreenStationSource,
  parseLegacyCoachScreenTripSource,
  parseLegacyCoachStopNoticeSource,
  parseLegacyMetroStationDetailSource,
  parseLegacyTransitFile,
  parseLegacyTransitSource,
} from '@yct/legacy-import';
import type { LegacyTransitMode } from '@yct/legacy-import';
import { readLegacyAssetManifest } from '../apps/web/lib/legacy-asset-manifest';

const explicitDataSource = process.argv[2]?.trim();
const dataSource =
  explicitDataSource ||
  process.env.YCT_LEGACY_DATA_REMOTE_BASE_URL ||
  'https://yct.shangxiaoguan.top/data';

const isRemoteSource = /^https?:\/\//i.test(dataSource);

configureRuntimeLegacySource(dataSource, isRemoteSource);

const content = isRemoteSource
  ? parseLegacyContentSource(
      await readRemoteLegacyFile(dataSource, 'content_data.js'),
      joinLegacyDataUrl(dataSource, 'content_data.js'),
    )
  : await parseLegacyContentFile(join(dataSource, 'content_data.js'));
const metro = await readLegacyTransitData({
  dataSource,
  isRemoteSource,
  fileName: 'metro_data.js',
  mode: 'metro',
  exportExpression: 'lines',
  sourcePrefix: 'metro',
});
const tram = await readLegacyTransitData({
  dataSource,
  isRemoteSource,
  fileName: 'tram_data.js',
  mode: 'tram',
  exportExpression: 'tramLines',
  sourcePrefix: 'tram',
});
const bus = await readLegacyTransitData({
  dataSource,
  isRemoteSource,
  fileName: 'bus_data.js',
  mode: 'bus',
  exportExpression: '__legacy_default__',
  sourcePrefix: 'bus',
});
const railway = await readLegacyTransitData({
  dataSource,
  isRemoteSource,
  fileName: 'local_railway_data.js',
  mode: 'railway',
  exportExpression: 'localRailways',
  sourcePrefix: 'local-railway',
});
const coach = isRemoteSource
  ? parseLegacyCoachRouteSource({
      source: await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/route.txt'),
      sourcePath: joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/route.txt'),
      sourcePrefix: 'coach',
    })
  : parseLegacyCoachRouteSource({
      source: await readLocalLegacyPublicFile(dataSource, 'ltcx/route.txt'),
      sourcePath: join(toLegacyLocalRoot(dataSource), 'ltcx/route.txt'),
      sourcePrefix: 'coach',
    });
const coachNotices = isRemoteSource
  ? parseLegacyCoachStopNoticeSource({
      source: await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/stop.txt'),
      sourcePath: joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/stop.txt'),
      sourcePrefix: 'coach-notice',
    })
  : parseLegacyCoachStopNoticeSource({
      source: await readLocalLegacyPublicFile(dataSource, 'ltcx/stop.txt'),
      sourcePath: join(toLegacyLocalRoot(dataSource), 'ltcx/stop.txt'),
      sourcePrefix: 'coach-notice',
    });
const metroStationDetails = parseLegacyMetroStationDetailSource({
  source: isRemoteSource
    ? await readRemoteLegacyFile(dataSource, 'metro_station_detail.js')
    : await readLocalLegacyDataFile(dataSource, 'metro_station_detail.js'),
  sourcePath: isRemoteSource
    ? joinLegacyDataUrl(dataSource, 'metro_station_detail.js')
    : join(dataSource, 'metro_station_detail.js'),
  sourcePrefix: 'metro-station-detail',
});
const coachScreenStations = parseLegacyCoachScreenStationSource({
  source: isRemoteSource
    ? await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/station.txt')
    : await readLocalLegacyPublicFile(dataSource, 'ltcx/screen/station.txt'),
  sourcePath: isRemoteSource
    ? joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/station.txt')
    : join(toLegacyLocalRoot(dataSource), 'ltcx/screen/station.txt'),
});
const coachScreenTrips = parseLegacyCoachScreenTripSource({
  source: isRemoteSource
    ? await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/route.txt')
    : await readLocalLegacyPublicFile(dataSource, 'ltcx/route.txt'),
  sourcePath: isRemoteSource
    ? joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/route.txt')
    : join(toLegacyLocalRoot(dataSource), 'ltcx/route.txt'),
  sourcePrefix: 'coach-screen-trip',
});
const coachScreenGates = parseLegacyCoachScreenGateSource({
  source: isRemoteSource
    ? await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/tickets.txt')
    : await readLocalLegacyPublicFile(dataSource, 'ltcx/screen/tickets.txt'),
  sourcePath: isRemoteSource
    ? joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/tickets.txt')
    : join(toLegacyLocalRoot(dataSource), 'ltcx/screen/tickets.txt'),
  sourcePrefix: 'coach-screen-gate',
});
const coachRuntimeSegments = parseLegacyCoachRuntimeSegmentSource({
  source: isRemoteSource
    ? await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/rttime.txt')
    : await readLocalLegacyPublicFile(dataSource, 'ltcx/screen/rttime.txt'),
  sourcePath: isRemoteSource
    ? joinLegacyDataUrl(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/rttime.txt')
    : join(toLegacyLocalRoot(dataSource), 'ltcx/screen/rttime.txt'),
  sourcePrefix: 'coach-runtime-segment',
});
const coachScreenNotice = isRemoteSource
  ? await readRemoteLegacyFile(toLegacyPublicBaseUrl(dataSource), 'ltcx/screen/notice.txt')
  : await readLocalLegacyPublicFile(dataSource, 'ltcx/screen/notice.txt');
const legacyAssetManifest = await readLegacyAssetManifest();

console.log(
  JSON.stringify(
    {
      dataSource,
      sourceKind: isRemoteSource ? 'remote' : 'local',
      content: {
        count: content.length,
        firstTitle: content[0]?.title,
        categories: countBy(content.map((item) => item.categoryId)),
      },
      metro: summarizeTransitImport(metro),
      tram: summarizeTransitImport(tram),
      bus: summarizeTransitImport(bus),
      railway: summarizeTransitImport(railway),
      coach: summarizeTransitImport(coach),
      coachNotices: {
        count: coachNotices.length,
        firstPeriod: coachNotices[0]?.periodText,
        firstReason: coachNotices[0]?.reason,
      },
      metroStationDetails: {
        count: metroStationDetails.length,
        firstLine: metroStationDetails[0]?.lineName,
        firstStation: metroStationDetails[0]?.stationName,
        firstExitCount: metroStationDetails[0]?.exits.length,
        firstFacilityCount: metroStationDetails[0]?.facilities.length,
      },
      coachScreen: {
        stationCount: coachScreenStations.length,
        tripCount: coachScreenTrips.length,
        gateCount: coachScreenGates.length,
        runtimeSegmentCount: coachRuntimeSegments.length,
        noticeLength: coachScreenNotice.trim().length,
        firstTrip: coachScreenTrips[0]
          ? {
              tripId: coachScreenTrips[0].tripId,
              departureTime: coachScreenTrips[0].departureTime,
              lineName: coachScreenTrips[0].lineName,
            }
          : undefined,
      },
      legacyAssets: legacyAssetManifest.item
        ? {
            contentCount: legacyAssetManifest.item.summary.contentCount,
            pageCount: legacyAssetManifest.item.summary.pageCount,
            referenceCount: legacyAssetManifest.item.summary.referenceCount,
            downloadableCount: legacyAssetManifest.item.summary.downloadableCount,
            firstDownloadable: legacyAssetManifest.item.entries.find((entry) => entry.downloadable)
              ?.sourceUrl,
          }
        : {
            status: legacyAssetManifest.meta.sourceStatus,
            message: legacyAssetManifest.meta.message,
          },
    },
    null,
    2,
  ),
);

async function readLegacyTransitData(input: {
  dataSource: string;
  isRemoteSource: boolean;
  fileName: string;
  mode: LegacyTransitMode;
  exportExpression: string;
  sourcePrefix: string;
}) {
  if (input.isRemoteSource) {
    const sourcePath = joinLegacyDataUrl(input.dataSource, input.fileName);
    return parseLegacyTransitSource({
      source: await readRemoteLegacyFile(input.dataSource, input.fileName),
      sourcePath,
      mode: input.mode,
      exportExpression: input.exportExpression,
      sourcePrefix: input.sourcePrefix,
    });
  }

  return parseLegacyTransitFile({
    filePath: join(input.dataSource, input.fileName),
    mode: input.mode,
    exportExpression: input.exportExpression,
    sourcePrefix: input.sourcePrefix,
  });
}

async function readRemoteLegacyFile(baseUrl: string, fileName: string): Promise<string> {
  const sourceUrl = joinLegacyDataUrl(baseUrl, fileName);
  const response = await fetch(sourceUrl, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`旧站数据文件读取失败：${sourceUrl} (${response.status})`);
  }

  return response.text();
}

function joinLegacyDataUrl(baseUrl: string, fileName: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${fileName.replace(/^\/+/, '')}`;
}

async function readLocalLegacyPublicFile(dataSource: string, fileName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(join(toLegacyLocalRoot(dataSource), fileName), 'utf8');
}

async function readLocalLegacyDataFile(dataSource: string, fileName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(join(dataSource, fileName), 'utf8');
}

function toLegacyLocalRoot(dataSource: string): string {
  return dataSource.replace(/[\\/]data[\\/]?$/i, '');
}

function toLegacyPublicBaseUrl(dataSource: string): string {
  return dataSource.replace(/\/data\/?$/i, '');
}

function configureRuntimeLegacySource(dataSource: string, isRemoteSource: boolean): void {
  if (isRemoteSource) {
    process.env.YCT_LEGACY_DATA_SOURCE = 'remote';
    process.env.YCT_LEGACY_DATA_REMOTE_BASE_URL = dataSource;
    process.env.YCT_LEGACY_PUBLIC_BASE_URL = toLegacyPublicBaseUrl(dataSource);
    return;
  }

  process.env.YCT_LEGACY_DATA_SOURCE = 'local';
  process.env.YCT_LEGACY_DATA_DIR = dataSource;
  process.env.YCT_LEGACY_PUBLIC_BASE_URL = toLegacyLocalRoot(dataSource);
}

function summarizeTransitImport(imported: Awaited<ReturnType<typeof readLegacyTransitData>>) {
  const stops = imported.lines.flatMap((line) => line.stops ?? []);

  return {
    lineCount: imported.lines.length,
    stationCount: imported.stations.length,
    firstLine: imported.lines[0]?.name,
    stopMetadataCount: stops.filter(hasStopMetadata).length,
    oneWayStopCount: stops.filter((stop) => stop.oneWay).length,
    statusStopCount: stops.filter((stop) => stop.status).length,
  };
}

function hasStopMetadata(
  stop: NonNullable<
    Awaited<ReturnType<typeof readLegacyTransitData>>['lines'][number]['stops']
  >[number],
): boolean {
  return Boolean(
    stop.oneWay ||
    stop.status ||
    stop.travelTime !== undefined ||
    stop.platformSide ||
    stop.fareZone ||
    stop.labelOffset ||
    stop.trainPosition !== undefined,
  );
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
