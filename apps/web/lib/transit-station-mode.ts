import type { MapMarkerSnapshot, TransitDataRevision } from '@yct/contracts';

export type TransitStationServiceMode = TransitDataRevision['lines'][number]['mode'];

type TransitPoiMarker = Pick<
  MapMarkerSnapshot['markers'][number],
  'categoryId' | 'iconFileName' | 'symbolIcon'
>;

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
  const value = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const modes: TransitStationServiceMode[] = [];

  if (/metro|subway|underground/.test(value)) modes.push('metro');
  if (/tram|light[-_ ]?rail/.test(value)) modes.push('tram');
  if (/coach|intercity|bus[-_ ]?(station|terminal)/.test(value)) modes.push('coach');
  if (/ferry|port|pier|harbor/.test(value)) modes.push('ferry');
  if (/railway|rail[-_ ]?station|train/.test(value)) modes.push('railway');
  if (/bus|bus[-_ ]?stop/.test(value)) modes.push('bus');

  return Array.from(new Set(modes));
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
