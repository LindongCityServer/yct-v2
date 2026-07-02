import { z } from 'zod';

export const serviceEntryCategorySchema = z.enum([
  'operations',
  'server_sites',
  'toolbox',
  'other',
]);
export const serviceEntryOpenModeSchema = z.enum(['same_tab', 'new_tab']);

export const serviceEntryDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  categoryId: serviceEntryCategorySchema,
  icon: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(1000),
  openMode: serviceEntryOpenModeSchema.default('new_tab'),
  sortOrder: z.number().int().min(0).max(10_000).default(500),
});

export const serviceEntryReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

export type ServiceEntryDraftInput = z.infer<typeof serviceEntryDraftSchema>;
export type ServiceEntryReviewDecisionInput = z.infer<typeof serviceEntryReviewDecisionSchema>;
