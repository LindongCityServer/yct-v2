export type TransitLineTravelDirection = 'forward' | 'reverse';
export type TransitLineDirectionScope = 'both' | 'up' | 'down';

export function getTransitLineDirectionScope(
  direction: TransitLineTravelDirection,
): Exclude<TransitLineDirectionScope, 'both'> {
  return direction === 'forward' ? 'down' : 'up';
}

export function isTransitLineDirectionIncluded(
  scope: TransitLineDirectionScope | undefined,
  direction: TransitLineTravelDirection,
): boolean {
  return !scope || scope === 'both' || scope === getTransitLineDirectionScope(direction);
}
