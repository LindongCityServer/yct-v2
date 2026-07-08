import { randomUUID } from 'node:crypto';
import type {
  PushNotificationType,
  PushQuietHours,
  UserPushPreference,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import {
  createDefaultPushPreference,
  findPushPreferenceByUserId,
  upsertPushPreference,
} from './notification-preference-store';

ensureNotificationDeliveryListenersRegistered();

export async function readUserPushPreference(input: {
  userId: string;
  ldpassUserId: string;
}): Promise<UserPushPreference> {
  return (
    (await findPushPreferenceByUserId(input.userId)) ??
    createDefaultPushPreference({
      userId: input.userId,
      ldpassUserId: input.ldpassUserId,
    })
  );
}

export async function updateUserPushPreference(input: {
  userId: string;
  ldpassUserId: string;
  enabled: boolean;
  enabledTypes: PushNotificationType[];
  quietHours: PushQuietHours;
}): Promise<UserPushPreference> {
  const preference = await upsertPushPreference({
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    enabled: input.enabled,
    enabledTypes: Array.from(new Set(input.enabledTypes)),
    quietHours: input.quietHours,
    updatedAt: new Date().toISOString(),
  });

  await emitEvent('PushPreferenceUpdated', input.userId, {
    userId: input.userId,
    enabledTypes: preference.enabled ? preference.enabledTypes : [],
    quietHoursEnabled: preference.quietHours.enabled,
  });

  return preference;
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: {
      type: 'user',
      id: actorId,
    },
    payload,
  });
}
