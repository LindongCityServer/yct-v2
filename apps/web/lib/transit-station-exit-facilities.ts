import type {
  MapMarkerSnapshot,
  PoiFacilitySnapshot,
  TransitStationDetailSnapshot,
} from '@yct/contracts';

type MapMarker = MapMarkerSnapshot['markers'][number];

const accessibleElevatorPattern =
  /无障碍\s*(?:电梯|升降机|直梯)|(?:电梯|升降机|直梯)\s*无障碍|轮椅升降机|wheelchair\s*(?:lift|elevator)|accessible\s*(?:lift|elevator)/iu;

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}

/** 出口 POI 的设施里是否有无障碍电梯/升降机。 */
export function markerHasAccessibleElevator(marker: MapMarker): boolean {
  return (marker.facilities ?? []).some((facility) =>
    accessibleElevatorPattern.test(`${facility.symbolIcon} ${facility.description}`),
  );
}

function findExitMarker(
  detail: TransitStationDetailSnapshot,
  exit: TransitStationDetailSnapshot['exits'][number],
  markers: readonly MapMarker[],
): MapMarker | undefined {
  if (exit.placeMarkerId) {
    const byId = markers.find((marker) => marker.id === exit.placeMarkerId);
    if (byId) return byId;
  }
  const expected = normalizeLabel(`${detail.stationName}-${exit.code}出口`);
  return markers.find(
    (marker) => marker.categoryId === 'metro-entrance' && normalizeLabel(marker.label) === expected,
  );
}

/**
 * 把出口 POI 的设施信息补回 station detail。
 *
 * 设计上设施挂在出口 POI 上，而不是 station detail 的出口记录上；这里做只读 join：
 * - 优先用 exit.placeMarkerId；
 * - 没有 placeMarkerId 时按「车站名-出口编号出口」匹配 metro-entrance 标记；
 * - 只补 facilities / hasAccessibleElevator，不改写几何或线路数据。
 */
export function enrichTransitStationDetailsWithExitMarkers(
  details: readonly TransitStationDetailSnapshot[],
  markers: readonly MapMarker[],
): TransitStationDetailSnapshot[] {
  if (!details.length || !markers.length) return [...details];
  return details.map((detail) => ({
    ...detail,
    exits: detail.exits.map((exit) => {
      const marker = findExitMarker(detail, exit, markers);
      if (!marker) return exit;
      const facilities: PoiFacilitySnapshot[] | undefined = marker.facilities?.length
        ? marker.facilities.map((facility) => ({
            symbolIcon: facility.symbolIcon,
            description: facility.description,
          }))
        : undefined;
      return {
        ...exit,
        ...(facilities ? { facilities } : {}),
        hasAccessibleElevator: markerHasAccessibleElevator(marker),
      };
    }),
  }));
}
