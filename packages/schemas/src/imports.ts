import { z } from 'zod';
import { idSchema, isoDateTimeSchema, nonEmptyTextSchema } from './common';

export const legacyImportKindSchema = z.enum([
  'content',
  'transit_lines',
  'transit_stations',
  'transit_schedules',
  'poi',
]);

export const legacyImportBatchSchema = z.object({
  profileId: idSchema,
  kind: legacyImportKindSchema,
  sourcePath: z.string().trim().min(1).max(500),
  sourceProviderId: idSchema,
});

export const legacyContentImportItemSchema = z.object({
  sourceId: idSchema,
  title: nonEmptyTextSchema,
  categoryId: idSchema,
  markdown: z.string().min(1).max(120_000),
  sourcePath: z.string().trim().min(1).max(500),
  summary: z.string().trim().max(2000).optional(),
  image: z.string().trim().max(1000).optional(),
  link: z.string().trim().max(1000).optional(),
  date: z.string().trim().max(40).optional(),
  expireDate: z.string().trim().max(40).optional(),
  showInBanner: z.boolean().optional(),
});

export const legacyTransitLineImportItemSchema = z.object({
  sourceId: idSchema,
  mode: z.enum(['metro', 'tram', 'bus', 'coach', 'ferry', 'railway', 'custom']),
  name: nonEmptyTextSchema,
  stationSourceIds: z.array(idSchema).min(1).max(500),
  stops: z
    .array(
      z.object({
        stationSourceId: idSchema,
        sequence: z.number().int().nonnegative(),
        oneWay: z.enum(['up', 'down']).optional(),
        status: z.string().trim().max(120).optional(),
        travelTime: z.number().finite().optional(),
        platformSide: z.string().trim().max(40).optional(),
        fareZone: z.string().trim().max(120).optional(),
        labelOffset: z
          .object({
            x: z.number().finite().optional(),
            y: z.number().finite().optional(),
          })
          .optional(),
        trainPosition: z.number().finite().optional(),
      }),
    )
    .max(500)
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  operator: z.string().trim().max(200).optional(),
  fare: z.string().trim().max(120).optional(),
  firstLastBus: z
    .object({
      first: z.string().trim().max(40).optional(),
      last: z.string().trim().max(40).optional(),
    })
    .optional(),
  departureTimes: z.array(z.string().trim().min(1).max(40)).max(500).optional(),
  bookingUrl: z.string().trim().max(1000).optional(),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyTransitStationImportItemSchema = z.object({
  sourceId: idSchema,
  name: nonEmptyTextSchema,
  aliases: z.array(nonEmptyTextSchema).max(20).default([]),
  diagramX: z.number().finite().optional(),
  diagramY: z.number().finite().optional(),
  x: z.number().finite().optional(),
  z: z.number().finite().optional(),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyTransitServiceNoticeImportItemSchema = z.object({
  sourceId: idSchema,
  mode: z.enum(['metro', 'tram', 'bus', 'coach', 'ferry', 'railway', 'custom']),
  title: nonEmptyTextSchema,
  periodText: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(2000),
  startsAt: isoDateTimeSchema.optional(),
  endsAt: isoDateTimeSchema.optional(),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyCoachScreenStationImportItemSchema = z.object({
  stationId: idSchema,
  name: nonEmptyTextSchema,
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyCoachScreenTripImportItemSchema = z.object({
  sourceId: idSchema,
  tripId: idSchema,
  departureTime: z.string().trim().min(1).max(40),
  lineName: nonEmptyTextSchema,
  stationNames: z.array(nonEmptyTextSchema).min(1).max(80),
  fare: z.string().trim().max(120).optional(),
  operator: z.string().trim().max(200).optional(),
  bookingUrl: z.string().trim().max(1000).optional(),
  runtimeText: z.string().trim().max(80).optional(),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyCoachScreenGateImportItemSchema = z.object({
  sourceId: idSchema,
  stationId: idSchema,
  lineName: nonEmptyTextSchema,
  gate: z.string().trim().min(1).max(80),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyCoachRuntimeSegmentImportItemSchema = z.object({
  sourceId: idSchema,
  lineName: nonEmptyTextSchema,
  fromStationName: nonEmptyTextSchema,
  toStationName: nonEmptyTextSchema,
  durationMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60),
  fareReduction: z.string().trim().max(120).optional(),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const legacyMetroStationDetailImportItemSchema = z.object({
  sourceId: idSchema,
  lineName: nonEmptyTextSchema,
  stationName: nonEmptyTextSchema,
  overGround: z.boolean().optional(),
  layers: z
    .array(
      z.object({
        floor: z.string().trim().min(1).max(40),
        type: z.string().trim().min(1).max(80),
      }),
    )
    .max(64),
  facilities: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(80),
        location: z.number().finite().optional(),
        floor: z.string().trim().max(40).optional(),
        endFloor: z.string().trim().max(40).optional(),
        direction: z.string().trim().max(80).optional(),
        oneWay: z.string().trim().max(40).optional(),
      }),
    )
    .max(256),
  transfers: z
    .array(
      z.object({
        line: z.string().trim().min(1).max(80),
        floor: z.string().trim().max(40).optional(),
        direction: z.string().trim().max(80).optional(),
        location: z.number().finite().optional(),
      }),
    )
    .max(64),
  exits: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(40),
        description: z.string().trim().max(300).optional(),
        floor: z.string().trim().max(40).optional(),
        direction: z.enum(['upwards', 'downwards']).optional(),
      }),
    )
    .max(256),
  surroundingStationNames: z.array(nonEmptyTextSchema).max(80),
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export type LegacyImportBatchInput = z.infer<typeof legacyImportBatchSchema>;
export type LegacyContentImportItemInput = z.infer<typeof legacyContentImportItemSchema>;
export type LegacyTransitLineImportItemInput = z.infer<typeof legacyTransitLineImportItemSchema>;
export type LegacyTransitStationImportItemInput = z.infer<
  typeof legacyTransitStationImportItemSchema
>;
export type LegacyTransitServiceNoticeImportItemInput = z.infer<
  typeof legacyTransitServiceNoticeImportItemSchema
>;
export type LegacyCoachScreenStationImportItemInput = z.infer<
  typeof legacyCoachScreenStationImportItemSchema
>;
export type LegacyCoachScreenTripImportItemInput = z.infer<
  typeof legacyCoachScreenTripImportItemSchema
>;
export type LegacyCoachScreenGateImportItemInput = z.infer<
  typeof legacyCoachScreenGateImportItemSchema
>;
export type LegacyCoachRuntimeSegmentImportItemInput = z.infer<
  typeof legacyCoachRuntimeSegmentImportItemSchema
>;
export type LegacyMetroStationDetailImportItemInput = z.infer<
  typeof legacyMetroStationDetailImportItemSchema
>;
