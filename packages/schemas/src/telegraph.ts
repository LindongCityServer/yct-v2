import { z } from 'zod';

const telegraphText = z.string().trim().max(200);

export const telegraphDraftSchema = z.object({
  province: telegraphText,
  city: telegraphText,
  county: telegraphText,
  district: telegraphText,
  recipientInfo: telegraphText,
  body: z.string().trim().max(250),
  senderName: telegraphText,
  senderAddress: telegraphText,
});

export const telegraphRenderRequestSchema = z.object({
  paper: z.enum(['send', 'receive']),
  draft: telegraphDraftSchema,
  serialNumber: z.string().trim().min(1).max(40),
  generatedAt: z.string().datetime({ offset: true }),
});

export type TelegraphDraftSchemaInput = z.infer<typeof telegraphDraftSchema>;
export type TelegraphRenderRequestInput = z.infer<typeof telegraphRenderRequestSchema>;
