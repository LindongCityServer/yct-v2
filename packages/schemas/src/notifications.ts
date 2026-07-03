import { z } from 'zod';

export const pushNotificationTypeSchema = z.enum(['trip', 'operations', 'ticket', 'check_in']);

export const pushQuietHoursSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, '免打扰开始时间必须是 HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, '免打扰结束时间必须是 HH:mm'),
  timezone: z.string().trim().min(1).max(80),
});

export const pushPreferenceSchema = z.object({
  enabled: z.boolean(),
  enabledTypes: z.array(pushNotificationTypeSchema).max(4),
  quietHours: pushQuietHoursSchema,
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(512),
    auth: z.string().trim().min(1).max(256),
  }),
  userAgent: z.string().trim().max(500).optional(),
});

export const pushSubscriptionDeleteSchema = z
  .object({
    endpoint: z.string().trim().url().max(2048).optional(),
    subscriptionId: z.string().trim().min(1).max(160).optional(),
  })
  .refine((input) => Boolean(input.endpoint || input.subscriptionId), {
    message: '至少需要指定 endpoint 或 subscriptionId。',
    path: ['endpoint'],
  });

export type PushPreferenceInput = z.infer<typeof pushPreferenceSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionDeleteInput = z.infer<typeof pushSubscriptionDeleteSchema>;
