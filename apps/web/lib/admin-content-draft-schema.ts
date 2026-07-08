import { contentRevisionDraftSchema } from '@yct/schemas';
import { z } from 'zod';

const contentCoverImageUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: '封面图链接必须是站内路径或完整 URL。',
  });

export const adminContentDraftSchema = contentRevisionDraftSchema.extend({
  excerpt: z.string().trim().max(500).optional(),
  showInBanner: z.boolean().default(false),
  bannerSortOrder: z.number().int().min(-9999).max(9999).optional(),
  customTags: z.array(z.string().trim().min(1).max(24)).max(16).optional(),
  coverColor: z.string().trim().max(120).optional(),
  coverImageUrl: contentCoverImageUrlSchema.optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export type AdminContentDraftInput = z.infer<typeof adminContentDraftSchema>;
