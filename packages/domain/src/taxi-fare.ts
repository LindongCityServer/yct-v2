import type { TaxiFareProfile, TransitFareQuote } from '@yct/contracts';

export function quoteTaxiFare(distanceMeters: number, profile: TaxiFareProfile): TransitFareQuote {
  const billableDistanceMeters = Math.max(0, distanceMeters);
  const incrementCount = Math.max(
    0,
    Math.ceil(
      (billableDistanceMeters - profile.baseDistanceMeters) / profile.incrementDistanceMeters,
    ),
  );
  const meteredFareCents = profile.baseFareCents + incrementCount * profile.incrementFareCents;
  const longDistanceIncrementCount = Math.max(
    0,
    Math.ceil(
      (billableDistanceMeters - profile.longDistanceThresholdMeters) /
        profile.incrementDistanceMeters,
    ),
  );
  const surchargeBaseCents =
    profile.longDistanceSurchargeScope === 'whole_metered_fare' &&
    billableDistanceMeters > profile.longDistanceThresholdMeters
      ? meteredFareCents
      : longDistanceIncrementCount * profile.incrementFareCents;
  const surchargeCents = Math.round(
    (surchargeBaseCents * profile.longDistanceSurchargePermille) / 1000,
  );
  const amount = (meteredFareCents + surchargeCents) / 100;

  return {
    currency: 'CNY',
    status: 'estimated',
    totalAmount: amount,
    knownSubtotal: amount,
    breakdown: [
      {
        modes: ['taxi'],
        lineIds: [],
        lineNames: [],
        rule: 'taxi_metered',
        status: 'estimated',
        amount,
        distanceKilometers: billableDistanceMeters / 1000,
      },
    ],
  };
}
