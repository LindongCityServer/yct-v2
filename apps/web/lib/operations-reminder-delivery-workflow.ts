import { randomUUID } from 'node:crypto';
import type { YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';

ensureNotificationDeliveryListenersRegistered();

export async function requestOperationsReminderDeliveryRefresh(input: {
  actorId: string;
  reason?:
    | 'admin_manual_refresh'
    | 'debug_rebuild'
    | 'service_notice_sync'
    | 'content_state_changed'
    | 'content_visibility_sync';
}): Promise<void> {
  const requestedAt = new Date().toISOString();
  await emitEvent('OperationsReminderDeliveryRefreshRequested', input.actorId, {
    requestedBy: input.actorId,
    requestedAt,
    reason: input.reason ?? 'admin_manual_refresh',
  });
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
      type: 'admin',
      id: actorId,
    },
    payload,
  });
}
