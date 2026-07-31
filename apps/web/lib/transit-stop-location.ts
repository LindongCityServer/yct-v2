import type { TransitLineStopLocationRef } from '@yct/contracts';
import {
  getTransitLineDirectionScope,
  type TransitLineTravelDirection,
} from './transit-line-direction';

export function getTransitStopLocationRefsForDirection(
  refs: readonly TransitLineStopLocationRef[] | undefined,
  direction: TransitLineTravelDirection,
): TransitLineStopLocationRef[] {
  const directionScope = getTransitLineDirectionScope(direction);
  const directionalRefs = (refs ?? []).filter((ref) => ref.scope === directionScope);
  if (directionalRefs.length > 0) {
    return directionalRefs;
  }

  return (refs ?? []).filter((ref) => ref.scope === 'both');
}

export function getTransitStopLocationMarkerIdsForDirection(
  refs: readonly TransitLineStopLocationRef[] | undefined,
  direction: TransitLineTravelDirection,
): string[] {
  return Array.from(
    new Set(
      getTransitStopLocationRefsForDirection(refs, direction)
        .map((ref) => ref.markerId.trim())
        .filter(Boolean),
    ),
  );
}
