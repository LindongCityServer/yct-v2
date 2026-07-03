import { randomUUID } from 'node:crypto';
import type {
  PushDelivery,
  PushQuietHours,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import {
  cancelPendingPushDeliveries,
  deferPushDelivery,
  findLatestSentPushDelivery,
  listDuePushDeliveries,
  markPushDeliveryFailed,
  markPushDeliverySent,
  markPushDeliverySkipped,
  upsertPushDelivery,
} from './notification-delivery-store';
import { findPushPreferenceByUserId } from './notification-preference-store';
import {
  listActivePushSubscriptionsForUser,
  revokePushSubscription,
} from './push-subscription-store';
import { createYctEvent, emitAppEvent } from './app-event-bus';
import { readRuntimeConfig } from './runtime-config';
import { sendWebPushDelivery } from './web-push-sender';

export async function queueTripReminderPushDelivery(
  event: Extract<YctEvent, { type: 'TripReminderScheduled' }>,
): Promise<PushDelivery[]> {
  const userId = event.payload.userId;
  if (!userId) {
    return [];
  }

  const now = new Date().toISOString();
  const preference = await findPushPreferenceByUserId(userId);
  const payload = {
    title: event.payload.title?.trim() || '雨城通行程提醒',
    body: '你有一条行程即将开始，请留意出发时间和站点信息。',
    url: '/travel',
    tag: `yct-trip-${event.payload.reminderId}`,
  };

  if (!preference?.enabled || !preference.enabledTypes.includes('trip')) {
    const { delivery } = await upsertPushDelivery({
      sourceKey: createSourceKey(userId, event.payload.reminderId, 'preference'),
      sourceType: 'trip_reminder',
      sourceId: event.payload.reminderId,
      userId,
      notificationType: 'trip',
      status: 'skipped',
      payload,
      dueAt: event.payload.remindAt,
      now,
      lastErrorCode: 'push_preference_disabled',
      lastErrorMessage: '用户未启用行程 Push 通知。',
    });
    return [delivery];
  }

  const subscriptions = await listActivePushSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    const { delivery } = await upsertPushDelivery({
      sourceKey: createSourceKey(userId, event.payload.reminderId, 'no-subscription'),
      sourceType: 'trip_reminder',
      sourceId: event.payload.reminderId,
      userId,
      notificationType: 'trip',
      status: 'skipped',
      payload,
      dueAt: event.payload.remindAt,
      now,
      lastErrorCode: 'no_active_push_subscription',
      lastErrorMessage: '用户没有可用的浏览器 Push 设备订阅。',
    });
    return [delivery];
  }

  const deliveries: PushDelivery[] = [];
  for (const subscription of subscriptions) {
    const { delivery, created } = await upsertPushDelivery({
      sourceKey: createSourceKey(userId, event.payload.reminderId, subscription.subscriptionId),
      sourceType: 'trip_reminder',
      sourceId: event.payload.reminderId,
      userId,
      subscriptionId: subscription.subscriptionId,
      notificationType: 'trip',
      status: 'queued',
      payload,
      dueAt: event.payload.remindAt,
      now,
    });
    deliveries.push(delivery);

    if (created) {
      await emitDeliveryEvent('PushDeliveryQueued', userId, {
        deliveryId: delivery.deliveryId,
        userId,
        sourceType: delivery.sourceType,
        sourceId: delivery.sourceId,
        dueAt: delivery.dueAt,
      });
    }
  }

  return deliveries;
}

export async function cancelTripReminderPushDeliveries(
  event: Extract<YctEvent, { type: 'TripReminderDeleted' }>,
): Promise<PushDelivery[]> {
  return cancelPendingPushDeliveries({
    userId: event.payload.userId,
    sourceType: 'trip_reminder',
    sourceIds: event.payload.reminderIds,
    cancelledAt: event.payload.deletedAt,
  });
}

export async function processDuePushDeliveries(
  input: {
    now?: string;
    limit?: number;
  } = {},
): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
  items: PushDelivery[];
}> {
  const dueDeliveries = await listDuePushDeliveries(input);
  const completed: PushDelivery[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  const now = input.now ? new Date(input.now) : new Date();

  for (const delivery of dueDeliveries) {
    const preference = await findPushPreferenceByUserId(delivery.userId);
    if (!preference?.enabled || !preference.enabledTypes.includes(delivery.notificationType)) {
      const updated = await markPushDeliverySkipped({
        deliveryId: delivery.deliveryId,
        errorCode: 'push_preference_disabled',
        errorMessage: '用户已关闭该类型 Push 通知。',
      });
      if (updated) {
        completed.push(updated);
        skipped += 1;
      }
      continue;
    }

    if (preference.quietHours.enabled && isWithinQuietHours(now, preference.quietHours)) {
      const deferredUntil = createDeferredUntilAfterQuietHours(now, preference.quietHours);
      const updated = await deferPushDelivery({
        deliveryId: delivery.deliveryId,
        deferredUntil,
        errorCode: 'quiet_hours_active',
        errorMessage: '用户当前处于免打扰时段，投递已延后。',
      });
      if (updated) {
        completed.push(updated);
        deferred += 1;
      }
      continue;
    }

    const rateLimitDeferredUntil = await readRateLimitDeferredUntil(delivery, now);
    if (rateLimitDeferredUntil) {
      const updated = await deferPushDelivery({
        deliveryId: delivery.deliveryId,
        deferredUntil: rateLimitDeferredUntil.toISOString(),
        errorCode: 'push_rate_limited',
        errorMessage: '同一用户同类 Push 通知触发过于频繁，投递已延后。',
        now: now.toISOString(),
      });
      if (updated) {
        completed.push(updated);
        deferred += 1;
      }
      continue;
    }

    const subscription = delivery.subscriptionId
      ? (await listActivePushSubscriptionsForUser(delivery.userId)).find(
          (item) => item.subscriptionId === delivery.subscriptionId,
        )
      : undefined;

    if (!subscription) {
      const updated = await markPushDeliverySkipped({
        deliveryId: delivery.deliveryId,
        errorCode: 'subscription_not_found',
        errorMessage: '对应浏览器 Push 设备订阅不存在或已撤销。',
      });
      if (updated) {
        completed.push(updated);
        skipped += 1;
      }
      continue;
    }

    const result = await sendWebPushDelivery({ delivery, subscription });
    if (result.ok) {
      const updated = await markPushDeliverySent({ deliveryId: delivery.deliveryId });
      if (updated) {
        completed.push(updated);
        sent += 1;
        await emitDeliveryEvent('PushDeliveryCompleted', delivery.userId, {
          deliveryId: delivery.deliveryId,
          userId: delivery.userId,
          subscriptionId: delivery.subscriptionId,
          status: 'sent',
          completedAt: updated.sentAt ?? updated.updatedAt,
        });
      }
      continue;
    }

    const shouldRevokeSubscription = result.errorCode === 'subscription_gone';
    if (shouldRevokeSubscription) {
      await revokePushSubscription({
        userId: delivery.userId,
        subscriptionId: subscription.subscriptionId,
      });
    }

    if (result.errorCode === 'web_push_not_configured') {
      const updated = await deferPushDelivery({
        deliveryId: delivery.deliveryId,
        deferredUntil: createDeferredUntil(now),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage ?? 'Web Push 未配置。',
        now: now.toISOString(),
      });
      if (updated) {
        completed.push(updated);
        deferred += 1;
      }
      continue;
    }

    const updated = await markPushDeliveryFailed({
      deliveryId: delivery.deliveryId,
      errorCode: result.errorCode ?? 'web_push_send_failed',
      errorMessage: result.errorMessage ?? 'Web Push 发送失败。',
    });
    if (updated) {
      completed.push(updated);
      failed += 1;
      await emitDeliveryEvent('PushDeliveryCompleted', delivery.userId, {
        deliveryId: delivery.deliveryId,
        userId: delivery.userId,
        subscriptionId: delivery.subscriptionId,
        status: 'failed',
        completedAt: updated.failedAt ?? updated.updatedAt,
        errorCode: updated.lastErrorCode,
      });
    }
  }

  return {
    processed: dueDeliveries.length,
    sent,
    failed,
    skipped,
    deferred,
    items: completed,
  };
}

async function emitDeliveryEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await emitAppEvent(
    createYctEvent({
      eventId: `event_${randomUUID()}`,
      type,
      occurredAt: new Date().toISOString(),
      actor: {
        type: 'system',
        id: actorId,
      },
      payload,
    }),
  );
}

function createSourceKey(userId: string, reminderId: string, target: string): string {
  return `trip_reminder:${userId}:${reminderId}:${target}`;
}

async function readRateLimitDeferredUntil(
  delivery: PushDelivery,
  now: Date,
): Promise<Date | undefined> {
  const config = readRuntimeConfig();
  if (config.pushDeliveryMinIntervalMs <= 0) {
    return undefined;
  }

  const latestSent = await findLatestSentPushDelivery({
    userId: delivery.userId,
    notificationType: delivery.notificationType,
    beforeOrAt: now.toISOString(),
  });
  if (!latestSent?.sentAt) {
    return undefined;
  }

  const latestSentTime = new Date(latestSent.sentAt).getTime();
  if (!Number.isFinite(latestSentTime)) {
    return undefined;
  }

  const nextAllowedTime = latestSentTime + config.pushDeliveryMinIntervalMs;
  return nextAllowedTime > now.getTime() ? new Date(nextAllowedTime) : undefined;
}

function createDeferredUntil(now: Date): string {
  return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
}

function createDeferredUntilAfterQuietHours(now: Date, quietHours: PushQuietHours): string {
  let candidate = new Date(now.getTime() + 15 * 60 * 1000);
  for (let index = 0; index < 96; index += 1) {
    if (!isWithinQuietHours(candidate, quietHours)) {
      return candidate.toISOString();
    }
    candidate = new Date(candidate.getTime() + 15 * 60 * 1000);
  }

  return createDeferredUntil(now);
}

function isWithinQuietHours(date: Date, quietHours: PushQuietHours): boolean {
  const start = parseClockMinutes(quietHours.startTime);
  const end = parseClockMinutes(quietHours.endTime);
  if (start === null || end === null || start === end) {
    return false;
  }

  const current = readClockMinutesInTimezone(date, quietHours.timezone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function parseClockMinutes(value: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!matched) {
    return null;
  }

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function readClockMinutesInTimezone(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}
