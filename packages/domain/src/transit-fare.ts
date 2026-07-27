import type { TransitFareBreakdownItem, TransitFareQuote, TransportMode } from '@yct/contracts';

export interface TransitFareLeg {
  mode: TransportMode;
  lineId: string;
  lineName: string;
  distanceBlocks: number;
  configuredFareText?: string;
}

const blocksPerKilometer = 1_000;
const railFareThresholds = [
  { maximumKilometers: 6, amount: 2 },
  { maximumKilometers: 10, amount: 3 },
  { maximumKilometers: 14, amount: 4 },
  { maximumKilometers: 21, amount: 5 },
  { maximumKilometers: 28, amount: 6 },
  { maximumKilometers: 38, amount: 7 },
  { maximumKilometers: 48, amount: 8 },
] as const;

export function quoteTransitRouteFare(legs: TransitFareLeg[]): TransitFareQuote {
  const chargeableLegs = legs.filter((leg) => leg.mode !== 'walk' && leg.mode !== 'custom');
  if (chargeableLegs.length === 0) {
    return {
      currency: 'CNY',
      status: 'exact',
      totalAmount: 0,
      knownSubtotal: 0,
      breakdown: [],
    };
  }

  const breakdown: TransitFareBreakdownItem[] = [];
  for (let index = 0; index < chargeableLegs.length; index += 1) {
    const leg = chargeableLegs[index];
    if (!leg) {
      continue;
    }

    if (isContinuousRailMode(leg.mode)) {
      const continuousRailLegs = [leg];
      while (isContinuousRailMode(chargeableLegs[index + 1]?.mode)) {
        index += 1;
        const nextLeg = chargeableLegs[index];
        if (nextLeg) {
          continuousRailLegs.push(nextLeg);
        }
      }
      breakdown.push(quoteContinuousRailFare(continuousRailLegs));
      continue;
    }

    breakdown.push(quoteSingleLegFare(leg));
  }

  const knownItems = breakdown.filter((item) => item.amount !== undefined);
  const unknownItems = breakdown.filter((item) => item.amount === undefined);
  const knownSubtotal = sumAmounts(knownItems);
  if (unknownItems.length > 0) {
    return {
      currency: 'CNY',
      status: knownItems.length > 0 ? 'partial' : 'unavailable',
      knownSubtotal,
      breakdown,
    };
  }

  return {
    currency: 'CNY',
    status: breakdown.some((item) => item.status === 'estimated') ? 'estimated' : 'exact',
    totalAmount: knownSubtotal,
    knownSubtotal,
    breakdown,
  };
}

export function calculateContinuousRailFare(distanceKilometers: number): number {
  const normalizedDistance = Math.max(0, distanceKilometers);
  return (
    railFareThresholds.find((threshold) => normalizedDistance <= threshold.maximumKilometers)
      ?.amount ??
    railFareThresholds.at(-1)?.amount ??
    8
  );
}

function quoteContinuousRailFare(legs: TransitFareLeg[]): TransitFareBreakdownItem {
  const distanceBlocks = legs.reduce((total, leg) => total + Math.max(0, leg.distanceBlocks), 0);
  const distanceKilometers = distanceBlocks / blocksPerKilometer;
  return {
    modes: uniqueValues(legs.map((leg) => leg.mode)),
    lineIds: uniqueValues(legs.map((leg) => leg.lineId)),
    lineNames: uniqueValues(legs.map((leg) => leg.lineName)),
    rule: 'rail_distance',
    status: 'estimated',
    amount: calculateContinuousRailFare(distanceKilometers),
    distanceKilometers: roundDistance(distanceKilometers),
  };
}

function quoteSingleLegFare(leg: TransitFareLeg): TransitFareBreakdownItem {
  if (leg.mode === 'ferry') {
    return createSingleLegBreakdown(leg, {
      rule: 'ferry_flat',
      status: 'exact',
      amount: 2,
    });
  }

  const configuredAmount = parseConfiguredFixedFare(leg.configuredFareText);
  if (leg.mode === 'bus' && !leg.configuredFareText?.trim()) {
    return createSingleLegBreakdown(leg, {
      rule: 'bus_default_flat',
      status: 'exact',
      amount: 2,
    });
  }

  if (configuredAmount !== undefined) {
    return createSingleLegBreakdown(leg, {
      rule:
        leg.mode === 'bus'
          ? 'bus_configured'
          : leg.mode === 'coach'
            ? 'coach_configured'
            : 'configured',
      status: 'exact',
      amount: configuredAmount,
      sourceText: leg.configuredFareText,
    });
  }

  return createSingleLegBreakdown(leg, {
    rule: 'unconfigured',
    status: 'unavailable',
    sourceText: leg.configuredFareText,
  });
}

function createSingleLegBreakdown(
  leg: TransitFareLeg,
  quote: Pick<TransitFareBreakdownItem, 'rule' | 'status' | 'amount' | 'sourceText'>,
): TransitFareBreakdownItem {
  return {
    modes: [leg.mode],
    lineIds: [leg.lineId],
    lineNames: [leg.lineName],
    ...quote,
  };
}

function parseConfiguredFixedFare(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const match = /^(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)\s*元?$/u.exec(normalized);
  const amount = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function isContinuousRailMode(mode: TransportMode | undefined): mode is 'metro' | 'tram' {
  return mode === 'metro' || mode === 'tram';
}

function sumAmounts(items: TransitFareBreakdownItem[]): number {
  return Number(items.reduce((total, item) => total + (item.amount ?? 0), 0).toFixed(2));
}

function roundDistance(distanceKilometers: number): number {
  return Number(distanceKilometers.toFixed(2));
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
