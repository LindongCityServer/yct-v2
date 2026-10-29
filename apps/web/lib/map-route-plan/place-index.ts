import type { MapMarkerSnapshot } from '@yct/contracts';
import { getCoordinateDistance } from '../map-spatial';
import {
  dedupeEquivalentMapPlaceMarkers,
  getEquivalentMapPlaceMarkerIds,
  resolveCanonicalMapPlaceMarker,
  type MapPlaceRelationIndex,
} from '../map-place-relations';
import { formatMarkerDisplayName, getMarkerCenter, normalizeMarkerSearchText } from './helpers';
import type {
  CenterableMarker,
  PointMarker,
  SecondaryPoiLink,
  SecondaryPoiParentLink,
} from './types';

/**
 * 建立“父地点 -> 次级 POI 列表”索引。
 * 次级 POI 包括显式 parentMarkerId、受父区域绑定的点位，以及“父名称-子名称”这类命名约定。
 */
export function buildSecondaryPoiIndex(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Map<string, SecondaryPoiLink[]> {
  const parentMarkerById = new Map(parentMarkers.map((marker) => [marker.id, marker]));
  const declaredParentLinks = resolveSecondaryPoiLinks(markers, parentMarkers, placeRelationIndex);
  const boundRegionLinks = markers.flatMap((marker) =>
    (marker.boundRegionMarkerIds ?? []).flatMap((regionMarkerId) => {
      const parent =
        parentMarkerById.get(regionMarkerId) ??
        parentMarkers.find((candidate) =>
          getEquivalentMapPlaceMarkerIds(candidate.id, placeRelationIndex).has(regionMarkerId),
        );
      if (!parent || parent.id === marker.id) {
        return [];
      }
      return [
        {
          childLabel:
            marker.secondaryLabel ??
            parseSecondaryPoiName(marker.sourceLabel ?? marker.label)?.childName ??
            formatMarkerDisplayName(marker.label),
          marker,
          parent,
        },
      ];
    }),
  );
  const index = new Map<string, Map<string, SecondaryPoiLink>>();
  const links = [...declaredParentLinks, ...boundRegionLinks];
  for (const link of links) {
    for (const parentId of getEquivalentMapPlaceMarkerIds(link.parent.id, placeRelationIndex)) {
      const values = index.get(parentId) ?? new Map<string, SecondaryPoiLink>();
      if (!values.has(link.marker.id)) {
        values.set(link.marker.id, link);
      }
      index.set(parentId, values);
    }
  }

  const sortedIndex = new Map<string, SecondaryPoiLink[]>();
  for (const [parentId, parentLinks] of index) {
    sortedIndex.set(parentId, sortSecondaryPoiLinks([...parentLinks.values()]));
  }

  return sortedIndex;
}

/** 建立“次级 POI -> 父地点”的反向索引，供路线端点回退到父级接入点。 */
export function buildSecondaryPoiParentIndex(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Map<string, SecondaryPoiParentLink> {
  return new Map(
    resolveSecondaryPoiLinks(markers, parentMarkers, placeRelationIndex).map((link) => [
      link.marker.id,
      { childLabel: link.childLabel, marker: link.marker, parent: link.parent },
    ]),
  );
}

function resolveSecondaryPoiLinks(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Array<SecondaryPoiLink & { parent: CenterableMarker }> {
  const markersByName = new Map<string, CenterableMarker[]>();
  const markerById = new Map(parentMarkers.map((marker) => [marker.id, marker]));
  for (const marker of parentMarkers) {
    const key = normalizeMarkerSearchText(marker.sourceLabel ?? marker.label);
    const values = markersByName.get(key) ?? [];
    values.push(marker);
    markersByName.set(key, values);
  }

  const links: Array<SecondaryPoiLink & { parent: CenterableMarker }> = [];
  for (const marker of markers) {
    const explicitParent = marker.parentMarkerId
      ? resolveCanonicalMapPlaceMarker(
          markerById.get(marker.parentMarkerId) ??
            parentMarkers.find((candidate) =>
              getEquivalentMapPlaceMarkerIds(candidate.id, placeRelationIndex).has(
                marker.parentMarkerId ?? '',
              ),
            ) ??
            marker,
          placeRelationIndex,
        )
      : undefined;
    if (explicitParent && explicitParent.id !== marker.id) {
      links.push({
        childLabel:
          marker.secondaryLabel ??
          parseSecondaryPoiName(marker.sourceLabel ?? marker.label)?.childName ??
          formatMarkerDisplayName(marker.label),
        marker,
        parent: explicitParent,
      });
      continue;
    }

    const declaredParentLabel = marker.parentLabel?.trim();
    if (declaredParentLabel) {
      const parentCandidates = dedupeEquivalentMapPlaceMarkers(
        markersByName.get(normalizeMarkerSearchText(declaredParentLabel)) ?? [],
        placeRelationIndex,
      ).filter((candidate) => candidate.id !== marker.id && !isBusStopPoi(candidate));
      const parent = parentCandidates ? findNearestParentPoi(marker, parentCandidates) : undefined;
      if (parent) {
        links.push({
          childLabel: marker.secondaryLabel ?? formatMarkerDisplayName(marker.label),
          marker,
          parent,
        });
        continue;
      }
    }

    const parsed = parseSecondaryPoiName(marker.sourceLabel ?? marker.label);
    if (!parsed) {
      continue;
    }

    const parentCandidates = dedupeEquivalentMapPlaceMarkers(
      markersByName.get(normalizeMarkerSearchText(parsed.parentName)) ?? [],
      placeRelationIndex,
    ).filter((candidate) => candidate.id !== marker.id && !isBusStopPoi(candidate));
    if (!parentCandidates || parentCandidates.length === 0) {
      continue;
    }

    const parent = findNearestParentPoi(marker, parentCandidates);
    if (!parent) {
      continue;
    }

    links.push({ childLabel: parsed.childName, marker, parent });
  }

  return links;
}

function sortSecondaryPoiLinks(links: SecondaryPoiLink[]): SecondaryPoiLink[] {
  return links.sort(
    (left, right) =>
      left.childLabel.localeCompare(right.childLabel, 'zh-CN') ||
      formatMarkerDisplayName(left.marker.label).localeCompare(
        formatMarkerDisplayName(right.marker.label),
        'zh-CN',
      ),
  );
}

function parseSecondaryPoiName(
  label: string,
): { parentName: string; childName: string } | undefined {
  const displayName = formatMarkerDisplayName(label);
  const separatorMatch = /[-－–—]/.exec(displayName);
  if (!separatorMatch || separatorMatch.index <= 0) {
    return undefined;
  }

  const parentName = displayName.slice(0, separatorMatch.index).trim();
  const childName = displayName.slice(separatorMatch.index + separatorMatch[0].length).trim();
  if (!parentName || !childName) {
    return undefined;
  }

  return { parentName, childName };
}

function findNearestParentPoi(
  child: PointMarker,
  candidates: CenterableMarker[],
): CenterableMarker | undefined {
  return candidates
    .flatMap((candidate) => {
      const center = getMarkerCenter(candidate);
      return center
        ? [{ candidate, distance: getCoordinateDistance(child.geometry.coordinates, center) }]
        : [];
    })
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
}

function isBusStopPoi(marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId'>): boolean {
  return marker.categoryId === 'bus-stop';
}
