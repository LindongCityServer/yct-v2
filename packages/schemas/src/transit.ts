import { z } from 'zod';
import { idSchema } from './common';

const transitModeSchema = z.enum(['metro', 'tram', 'bus', 'coach', 'ferry', 'railway', 'custom']);
const ticketableServiceKindSchema = z.enum(['coach', 'ferry', 'flight', 'railway', 'custom']);
const colorHexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const materialSymbolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_]+$/);

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

export type TransitDataImportInput = z.infer<typeof transitDataImportSchema>;
export type TransitDataReviewDecisionInput = z.infer<typeof transitDataReviewDecisionSchema>;
export type TransitModeProfileUpdateInput = z.infer<typeof transitModeProfileUpdateSchema>;
export type TravelScheduleServiceProfileUpdateInput = z.infer<
  typeof travelScheduleServiceProfileUpdateSchema
>;
