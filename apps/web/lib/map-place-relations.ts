import type { MapMarkerSnapshot } from '@yct/contracts';

export type MapPlaceMarker = MapMarkerSnapshot['markers'][number];

export interface MapPlaceRelationIndex<TMarker extends MapPlaceMarker = MapPlaceMarker> {
  canonicalByMarkerId: ReadonlyMap<string, TMarker>;
  equivalentMarkerIdsByMarkerId: ReadonlyMap<string, ReadonlySet<string>>;
}

export function buildMapPlaceRelationIndex<TMarker extends MapPlaceMarker>(
  markers: TMarker[],
): MapPlaceRelationIndex<TMarker> {
  return {
    canonicalByMarkerId: new Map(markers.map((marker) => [marker.id, marker])),
    equivalentMarkerIdsByMarkerId: new Map(
      markers.map((marker) => [marker.id, new Set([marker.id])]),
    ),
  };
}

export function resolveCanonicalMapPlaceMarker<TMarker extends MapPlaceMarker>(
  marker: TMarker,
  index: MapPlaceRelationIndex<TMarker>,
): TMarker {
  return index.canonicalByMarkerId.get(marker.id) ?? marker;
}

export function getEquivalentMapPlaceMarkerIds(
  markerId: string,
  index: MapPlaceRelationIndex,
): ReadonlySet<string> {
  return index.equivalentMarkerIdsByMarkerId.get(markerId) ?? new Set([markerId]);
}

export function dedupeEquivalentMapPlaceMarkers<TMarker extends MapPlaceMarker>(
  markers: TMarker[],
  index: MapPlaceRelationIndex<TMarker>,
): TMarker[] {
  const deduped = new Map<string, TMarker>();
  for (const marker of markers) {
    const canonical = resolveCanonicalMapPlaceMarker(marker, index);
    deduped.set(canonical.id, canonical);
  }
  return [...deduped.values()];
}

export function enrichMapMarkerPlaceRelations(snapshot: MapMarkerSnapshot): MapMarkerSnapshot {
  const index = buildMapPlaceRelationIndex(snapshot.markers);
  return {
    ...snapshot,
    markers: snapshot.markers.map((marker) => {
      if (!marker.parentMarkerId) {
        return marker;
      }
      const parent = index.canonicalByMarkerId.get(marker.parentMarkerId);
      return parent && parent.id !== marker.id
        ? {
            ...marker,
            parentMarkerId: parent.id,
            parentLabel: marker.parentLabel ?? parent.label,
          }
        : marker;
    }),
  };
}
