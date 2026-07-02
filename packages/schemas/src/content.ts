import { z } from 'zod';
import {
  idSchema,
  isoDateTimeSchema,
  markdownSchema,
  nonEmptyTextSchema,
  urlSchema,
} from './common';

export const contentRevisionStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'published',
  'archived',
]);

export const contentAssetStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'archived',
]);
export const contentAssetKindSchema = z.enum(['image', 'attachment']);
export const contentPublishModeSchema = z.enum(['immediate', 'scheduled']);

export const contentRevisionDraftSchema = z.object({
  title: nonEmptyTextSchema,
  categoryId: idSchema,
  markdown: markdownSchema,
  assetIds: z.array(idSchema).max(80).default([]),
  scheduledAt: isoDateTimeSchema.optional(),
});

export const contentReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

export const contentPublishRequestSchema = z
  .object({
    mode: contentPublishModeSchema,
    scheduledAt: isoDateTimeSchema.optional(),
  })
  .refine((value) => value.mode === 'immediate' || Boolean(value.scheduledAt), {
    message: '定时发布必须提供 scheduledAt',
    path: ['scheduledAt'],
  });

export const contentAssetUploadSchema = z.object({
  kind: contentAssetKindSchema,
  fileName: nonEmptyTextSchema,
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  url: urlSchema,
  sourceUrl: urlSchema.optional(),
});

export type ContentRevisionDraftInput = z.infer<typeof contentRevisionDraftSchema>;
export type ContentReviewDecisionInput = z.infer<typeof contentReviewDecisionSchema>;
export type ContentPublishRequestInput = z.infer<typeof contentPublishRequestSchema>;
export type ContentAssetUploadInput = z.infer<typeof contentAssetUploadSchema>;
