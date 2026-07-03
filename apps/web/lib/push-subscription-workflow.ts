import { randomUUID } from 'node:crypto';
import type { PushDeviceSubscription, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  listActivePushSubscriptionsForUser,
  revokePushSubscription,
  upsertPushSubscription,
} from './push-subscription-store';

export async function listUserPushSubscriptions(userId: string): Promise<PushDeviceSubscription[]> {
  return listActivePushSubscriptionsForUser(userId);
}

export async function registerUserPushSubscription(input: {
  userId: string;
  ldpassUserId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}): Promise<PushDeviceSubscription> {
  const { subscription, created } = await upsertPushSubscription(input);

  if (created) {
    await emitEvent('PushDeviceSubscribed', input.userId, {
      userId: input.userId,
      subscriptionId: subscription.subscriptionId,
      endpointHost: readEndpointHost(subscription.endpoint),
    });
  }

  return subscription;
}

export async function revokeUserPushSubscription(input: {
  userId: string;
  endpoint?: string;
  subscriptionId?: string;
}): Promise<PushDeviceSubscription | null> {
  const subscription = await revokePushSubscription(input);

  if (subscription) {
    await emitEvent('PushDeviceSubscriptionRevoked', input.userId, {
      userId: input.userId,
      subscriptionId: subscription.subscriptionId,
      revokedAt: subscription.revokedAt ?? new Date().toISOString(),
    });
  }

  return subscription;
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

function readEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
}
