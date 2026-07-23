import type { MapMarkerSnapshot } from '@yct/contracts';

export type SearchableMapMarker = MapMarkerSnapshot['markers'][number];

export function normalizeMapMarkerSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s　|]+/g, '');
}

export function buildMapMarkerSearchText(marker: SearchableMapMarker): string {
  return [
    marker.label,
    marker.categoryId,
    marker.description,
    marker.href,
    marker.openingHours,
    marker.address,
    marker.addressRoadMarkerId,
    marker.floorLabel,
    marker.parentLabel,
    marker.secondaryLabel,
    marker.parentMarkerId,
    ...Object.values(marker.localizedLabels ?? {}),
    ...(marker.boundRegionMarkerIds ?? []),
    ...(marker.facilities?.flatMap((facility) => [facility.symbolIcon, facility.description]) ??
      []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

export function filterMapMarkers<T extends SearchableMapMarker>(markers: T[], query: string): T[] {
  const normalizedQuery = normalizeMapMarkerSearchText(query);
  if (!normalizedQuery) {
    return markers;
  }

  return markers.filter((marker) =>
    normalizeMapMarkerSearchText(buildMapMarkerSearchText(marker)).includes(normalizedQuery),
  );
}

export function getMapMarkerSearchMatchPriority(
  marker: SearchableMapMarker,
  query: string,
): 0 | 1 | 2 {
  const normalizedQuery = normalizeMapMarkerSearchText(query);
  if (!normalizedQuery) {
    return 2;
  }

  const titleFields = [
    marker.label,
    marker.secondaryLabel,
    ...Object.values(marker.localizedLabels ?? {}),
  ].filter((value): value is string => Boolean(value));
  if (titleFields.some((value) => normalizeMapMarkerSearchText(value).includes(normalizedQuery))) {
    return 0;
  }

  return normalizeMapMarkerSearchText(buildMapMarkerSearchText(marker)).includes(normalizedQuery)
    ? 1
    : 2;
}
