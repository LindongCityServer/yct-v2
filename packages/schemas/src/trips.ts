import { z } from 'zod';
import { isoDateTimeSchema } from './common';

export const tripReminderSourceSchema = z.enum([
  'manual',
  'route_plan',
  'schedule',
  'ticket',
  'legacy_order',
]);

export const tripReminderStatusSchema = z.enum([
  'scheduled',
  'notification_queued',
  'notified',
  'sent',
  'ongoing',
  'completed',
  'cancelled',
  'expired',
]);

export const tripReminderRouteSnapshotSchema = z.object({
  departure: z.string().trim().max(120).optional(),
  arrival: z.string().trim().max(120).optional(),
  lineName: z.string().trim().max(120).optional(),
  transportMode: z
    .enum(['metro', 'bus', 'coach', 'tram', 'ferry', 'flight', 'railway', 'walk'])
    .optional(),
  detail: z.string().trim().max(500).optional(),
});

export const tripReminderSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  source: tripReminderSourceSchema,
  remindAt: isoDateTimeSchema,
  status: tripReminderStatusSchema,
  route: tripReminderRouteSnapshotSchema.optional(),
  legacyOrderId: z.string().trim().max(160).optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  syncedAt: isoDateTimeSchema.optional(),
});

export const tripReminderSyncSchema = z.object({
  reminders: z.array(tripReminderSchema).max(200),
});

export const tripReminderDeleteSchema = z
  .object({
    reminderIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    source: tripReminderSourceSchema.optional(),
  })
  .refine((input) => Boolean(input.source || (input.reminderIds?.length ?? 0) > 0), {
    message: '至少需要指定提醒 ID 或来源。',
    path: ['reminderIds'],
  });

export type TripReminderInput = z.infer<typeof tripReminderSchema>;
export type TripReminderSyncInput = z.infer<typeof tripReminderSyncSchema>;
export type TripReminderDeleteInput = z.infer<typeof tripReminderDeleteSchema>;
