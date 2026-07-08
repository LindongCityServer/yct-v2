import { z } from 'zod';

const reminderToneValues = [
  'primary',
  'metro',
  'bus',
  'coach',
  'tram',
  'ferry',
  'flight',
  'railway',
  'custom',
  'warning',
  'danger',
] as const;

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalDateTime = z
  .string()
  .datetime()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const operationsStrongReminderRuleSchema = z
  .object({
    id: optionalText(160),
    sourceKind: z.enum(['manual', 'content']),
    enabled: z.boolean().default(true),
    sortOrder: z.number().int().min(-9999).max(9999).default(0),
    tone: z.enum(reminderToneValues).optional(),
    label: optionalText(40),
    title: optionalText(120),
    summary: optionalText(280),
    href: optionalText(1000),
    contentId: optionalText(160),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
  })
  .superRefine((value, ctx) => {
    if (value.sourceKind === 'manual' && !value.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: '手动强提醒至少需要标题。',
      });
    }

    if (value.sourceKind === 'content' && !value.contentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contentId'],
        message: '内容型强提醒必须关联一个内容 ID。',
      });
    }

    if (value.href && !/^(?:https?:\/\/|\/)/i.test(value.href)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['href'],
        message: '跳转链接必须是站内路径或 http(s) 链接。',
      });
    }

    if (value.startsAt && value.endsAt) {
      const startsAt = new Date(value.startsAt).getTime();
      const endsAt = new Date(value.endsAt).getTime();
      if (Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt >= endsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endsAt'],
          message: '结束时间必须晚于开始时间。',
        });
      }
    }
  });

export const operationsStrongReminderRuleUpdateSchema = z.object({
  items: z.array(operationsStrongReminderRuleSchema).max(50),
});
