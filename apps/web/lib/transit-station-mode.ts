import type { MapMarkerSnapshot, TransitDataRevision } from '@yct/contracts';

export type TransitStationServiceMode = TransitDataRevision['lines'][number]['mode'];

type TransitPoiMarker = Pick<
  MapMarkerSnapshot['markers'][number],
  'categoryId' | 'iconFileName' | 'symbolIcon'
>;

const transitModeByCategoryId: Partial<Record<string, TransitStationServiceMode>> = {
  'bus-stop': 'bus',
  'coach-station': 'coach',
  'ferry-port': 'ferry',
  'metro-entrance': 'metro',
  'metro-station': 'metro',
  'railway-station': 'railway',
  'tram-station': 'tram',
};

/** 站点服务方式由所属线路派生，避免在站点记录中重复维护可失真的 mode 字段。 */
export function getTransitStationServiceModes(
  revision: Pick<TransitDataRevision, 'lines'>,
  stationSourceId: string,
): TransitStationServiceMode[] {
  return Array.from(
    new Set(
      revision.lines
        .filter((line) => line.stationSourceIds.includes(stationSourceId))
        .map((line) => line.mode),
    ),
  );
}

export function getTransitPoiMarkerModes(marker: TransitPoiMarker): TransitStationServiceMode[] {
  const categoryMode = transitModeByCategoryId[marker.categoryId?.trim().toLowerCase() ?? ''];
  if (categoryMode) {
    return [categoryMode];
  }

  const value = [marker.iconFileName, marker.symbolIcon].filter(Boolean).join(' ').toLowerCase();

  if (/metro|subway|underground/.test(value)) return ['metro'];
  if (/coach|intercity|bus[-_ ]?(station|terminal)/.test(value)) return ['coach'];
  if (/ferry|boat|port|pier|harbor/.test(value)) return ['ferry'];
  if (/tram|light[-_ ]?rail/.test(value)) return ['tram'];
  if (/railway|rail[-_ ]?station|train/.test(value)) return ['railway'];
  if (/bus|bus[-_ ]?stop/.test(value)) return ['bus'];
  return [];
}

export function isTransitPoiMarkerCompatibleWithStation(
  marker: TransitPoiMarker,
  stationModes: readonly TransitStationServiceMode[],
): boolean {
  if (stationModes.length === 0) {
    return false;
  }

  return getTransitPoiMarkerModes(marker).some((mode) => stationModes.includes(mode));
}
