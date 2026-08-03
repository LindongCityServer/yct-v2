import type {
  TransitFareBreakdownItem,
  TransitFareProfile,
  TransitFareQuote,
  TransportMode,
} from '@yct/contracts';

export interface TransitFareLeg {
  mode: TransportMode;
  lineId: string;
  lineName: string;
  distanceBlocks: number;
  configuredFareText?: string;
}

const blocksPerKilometer = 1_000;
const defaultTransitFareProfile: TransitFareProfile = {
  busDefaultFareCents: 200,
  ferryDefaultFareCents: 200,
  railDistanceBands: [
    { maximumDistanceMeters: 6_000, fareCents: 200 },
    { maximumDistanceMeters: 10_000, fareCents: 300 },
    { maximumDistanceMeters: 14_000, fareCents: 400 },
    { maximumDistanceMeters: 21_000, fareCents: 500 },
    { maximumDistanceMeters: 28_000, fareCents: 600 },
    { maximumDistanceMeters: 38_000, fareCents: 700 },
    { maximumDistanceMeters: 48_000, fareCents: 800 },
  ],
};

export function quoteTransitRouteFare(
  legs: TransitFareLeg[],
  profile: TransitFareProfile = defaultTransitFareProfile,
): TransitFareQuote {
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
      breakdown.push(quoteContinuousRailFare(continuousRailLegs, profile));
      continue;
    }

    breakdown.push(quoteSingleLegFare(leg, profile));
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

export function calculateContinuousRailFare(
  distanceKilometers: number,
  profile: TransitFareProfile = defaultTransitFareProfile,
): number {
  const distanceMeters = Math.max(0, distanceKilometers) * blocksPerKilometer;
  const fareCents =
    profile.railDistanceBands.find((band) => distanceMeters <= band.maximumDistanceMeters)
      ?.fareCents ??
    profile.railDistanceBands.at(-1)?.fareCents ??
    0;
  return centsToAmount(fareCents);
}

function quoteContinuousRailFare(
  legs: TransitFareLeg[],
  profile: TransitFareProfile,
): TransitFareBreakdownItem {
  const distanceBlocks = legs.reduce((total, leg) => total + Math.max(0, leg.distanceBlocks), 0);
  const distanceKilometers = distanceBlocks / blocksPerKilometer;
  return {
    modes: uniqueValues(legs.map((leg) => leg.mode)),
    lineIds: uniqueValues(legs.map((leg) => leg.lineId)),
    lineNames: uniqueValues(legs.map((leg) => leg.lineName)),
    rule: 'rail_distance',
    status: 'estimated',
    amount: calculateContinuousRailFare(distanceKilometers, profile),
    distanceKilometers: roundDistance(distanceKilometers),
  };
}

function quoteSingleLegFare(
  leg: TransitFareLeg,
  profile: TransitFareProfile,
): TransitFareBreakdownItem {
  if (leg.mode === 'ferry') {
    return createSingleLegBreakdown(leg, {
      rule: 'ferry_flat',
      status: 'exact',
      amount: centsToAmount(profile.ferryDefaultFareCents),
    });
  }

  const configuredAmount = parseConfiguredFixedFare(leg.configuredFareText);
  if (leg.mode === 'bus' && !leg.configuredFareText?.trim()) {
    return createSingleLegBreakdown(leg, {
      rule: 'bus_default_flat',
      status: 'exact',
      amount: centsToAmount(profile.busDefaultFareCents),
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

function centsToAmount(cents: number): number {
  return Number((Math.max(0, cents) / 100).toFixed(2));
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
