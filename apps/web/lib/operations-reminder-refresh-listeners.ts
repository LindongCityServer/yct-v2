import { randomUUID } from 'node:crypto';
import type { YctEvent } from '@yct/contracts';
import { getAppEventBus, publishDomainEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import { hasEnabledContentReminderRuleForContent } from './operations-reminder-rule-store';

let registered = false;

export function ensureOperationsReminderRefreshListenersRegistered(): void {
  if (registered) {
    return;
  }

  registered = true;
  ensureNotificationDeliveryListenersRegistered();

  const eventBus = getAppEventBus();
  eventBus.subscribe('ContentPublished', async (event) => {
    await refreshOperationsRemindersForContentEvent(event);
  });
  eventBus.subscribe('ContentArchived', async (event) => {
    if (event.payload.previousStatus !== 'published') {
      return;
    }

    await refreshOperationsRemindersForContentEvent(event);
  });
}

async function refreshOperationsRemindersForContentEvent(
  event: Extract<YctEvent, { type: 'ContentPublished' | 'ContentArchived' }>,
): Promise<void> {
  const matchesReminderRule = await hasEnabledContentReminderRuleForContent(event.payload.contentId);
  if (!matchesReminderRule) {
    return;
  }

  const requestedAt = new Date().toISOString();
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'OperationsReminderDeliveryRefreshRequested',
    occurredAt: requestedAt,
    actor: {
      type: 'system',
      id: 'operations_reminder_content_listener',
    },
    payload: {
      requestedBy: event.actor.id?.trim() || event.payload.contentId,
      requestedAt,
      reason: 'content_state_changed',
    },
  });
}
