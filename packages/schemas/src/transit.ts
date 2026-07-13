import { z } from 'zod';
import { idSchema } from './common';

const transitModeSchema = z.enum(['metro', 'tram', 'bus', 'coach', 'ferry', 'railway', 'custom']);
const ticketableServiceKindSchema = z.enum(['coach', 'ferry', 'flight', 'railway', 'custom']);
const travelTripAvailabilitySchema = z.enum([
  'query_only',
  'booking_reference',
  'ticketing_unavailable',
  'not_connected',
]);
const colorHexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const materialSymbolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_]+$/);
const stationSourceIdSchema = z.string().trim().min(1).max(120);
const transitLineSegmentPathSchema = z
  .object({
    fromStationSourceId: stationSourceIdSchema,
    toStationSourceId: stationSourceIdSchema,
    mode: z.enum(['straight', 'road']),
    waypoints: z.array(z.object({ x: z.number().finite(), z: z.number().finite() })).max(24),
    note: z.string().trim().max(120).optional(),
  })
  .superRefine((path, context) => {
    if (path.mode === 'road' && path.waypoints.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '沿道路走行的站间路径至少需要 1 个途径点。',
        path: ['waypoints'],
      });
    }
  });

export const transitDataImportSchema = z.object({
  sourceProviderId: idSchema.default('legacy-yct'),
});

export const transitDataReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

export const transitModeProfileSchema = z.object({
  mode: transitModeSchema,
  label: z.string().trim().min(1).max(40),
  color: colorHexSchema,
  icon: materialSymbolNameSchema,
  sortOrder: z.number().int().min(0).max(999),
  enabled: z.boolean().default(true),
});

export const transitModeProfileUpdateSchema = z.object({
  modes: z.array(transitModeProfileSchema).min(1).max(16),
});

export const travelScheduleServiceProfileSchema = z.object({
  kind: ticketableServiceKindSchema,
  label: z.string().trim().min(1).max(40),
  color: colorHexSchema,
  icon: materialSymbolNameSchema,
  sortOrder: z.number().int().min(0).max(999),
  enabled: z.boolean().default(true),
});

export const travelScheduleServiceProfileUpdateSchema = z.object({
  services: z.array(travelScheduleServiceProfileSchema).min(1).max(16),
});

export const travelScheduleRevisionImportSchema = z.object({
  sourceProviderId: idSchema.default('runtime-travel-schedules'),
});

export const transitLineDraftSchema = z.object({
  mode: transitModeSchema,
  name: z.string().trim().min(1).max(120),
  color: colorHexSchema.optional(),
  stationSourceIds: z.array(stationSourceIdSchema).min(2).max(256),
  oneWayStops: z
    .array(
      z.object({
        stationSourceId: stationSourceIdSchema,
        oneWay: z.enum(['up', 'down']).nullable().optional(),
      }),
    )
    .max(256)
    .optional(),
  segmentPaths: z.array(transitLineSegmentPathSchema).max(255).optional(),
  operator: z.string().trim().max(120).optional(),
  fare: z.string().trim().max(80).optional(),
  firstBus: z.string().trim().max(40).optional(),
  lastBus: z.string().trim().max(40).optional(),
  departureTimes: z.array(z.string().trim().min(1).max(40)).max(128).optional(),
  bookingUrl: z.string().trim().max(500).optional(),
});

export const travelScheduleTripUpdateSchema = z.object({
  tripCode: z.string().trim().max(80).optional(),
  serviceKind: ticketableServiceKindSchema.optional(),
  departureTime: z.string().trim().min(1).max(40).optional(),
  arrivalTime: z.string().trim().max(40).optional(),
  arrivalDayOffset: z.number().int().min(0).max(7).optional(),
  lineName: z.string().trim().min(1).max(120).optional(),
  routeNote: z.string().trim().max(200).optional(),
  stationNames: z.array(z.string().trim().min(1).max(80)).min(1).max(80).optional(),
  originStationName: z.string().trim().max(80).optional(),
  destinationStationName: z.string().trim().max(80).optional(),
  fareText: z.string().trim().max(80).optional(),
  operator: z.string().trim().max(80).optional(),
  bookingUrl: z.string().trim().max(500).optional(),
  runtimeText: z.string().trim().max(120).optional(),
  gateText: z.string().trim().max(80).optional(),
  vehicleTypeText: z.string().trim().max(80).optional(),
  vehicleModelText: z.string().trim().max(80).optional(),
  operatingDays: z.array(z.string().trim().min(1).max(40)).max(31).optional(),
  availability: travelTripAvailabilitySchema.optional(),
  sourcePath: z.string().trim().max(240).optional(),
});

export const travelScheduleTripDraftSchema = travelScheduleTripUpdateSchema.extend({
  serviceKind: ticketableServiceKindSchema,
  departureTime: z.string().trim().min(1).max(40),
  lineName: z.string().trim().min(1).max(120),
  stationNames: z.array(z.string().trim().min(1).max(80)).min(1).max(80),
  availability: travelTripAvailabilitySchema.default('ticketing_unavailable'),
});

export const transitStationCoordinateUpdateSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  boundPoiMarkerId: z.string().trim().max(160).optional().nullable(),
  boundPoiLabel: z.string().trim().max(120).optional().nullable(),
});

export const transitLineStationOrderUpdateSchema = z.object({
  stationSourceIds: z.array(z.string().trim().min(1).max(120)).min(2).max(256),
});

export type TransitDataImportInput = z.infer<typeof transitDataImportSchema>;
export type TransitDataReviewDecisionInput = z.infer<typeof transitDataReviewDecisionSchema>;
export type TransitModeProfileUpdateInput = z.infer<typeof transitModeProfileUpdateSchema>;
export type TravelScheduleServiceProfileUpdateInput = z.infer<
  typeof travelScheduleServiceProfileUpdateSchema
>;
export type TravelScheduleRevisionImportInput = z.infer<typeof travelScheduleRevisionImportSchema>;
export type TransitLineDraftInput = z.infer<typeof transitLineDraftSchema>;
export type TravelScheduleTripDraftInput = z.infer<typeof travelScheduleTripDraftSchema>;
export type TravelScheduleTripUpdateInput = z.infer<typeof travelScheduleTripUpdateSchema>;
export type TransitStationCoordinateUpdateInput = z.infer<
  typeof transitStationCoordinateUpdateSchema
>;
export type TransitLineStationOrderUpdateInput = z.infer<
  typeof transitLineStationOrderUpdateSchema
>;
