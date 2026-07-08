import { getAppEventBus } from './app-event-bus';
import {
  queueOperationsReminderPushDeliveries,
  refreshOperationsReminderPushDeliveriesForUser,
  cancelTripReminderPushDeliveries,
  queueTripReminderPushDelivery,
} from './notification-delivery-workflow';

let registered = false;

export function ensureNotificationDeliveryListenersRegistered(): void {
  if (registered) {
    return;
  }

  registered = true;
  const eventBus = getAppEventBus();
  eventBus.subscribe('TripReminderScheduled', async (event) => {
    await queueTripReminderPushDelivery(event);
  });
  eventBus.subscribe('TripReminderDeleted', async (event) => {
    await cancelTripReminderPushDeliveries(event);
  });
  eventBus.subscribe('OperationsStrongReminderRulesUpdated', async (event) => {
    await queueOperationsReminderPushDeliveries(event);
  });
  eventBus.subscribe('OperationsReminderDeliveryRefreshRequested', async (event) => {
    await queueOperationsReminderPushDeliveries(event);
  });
  eventBus.subscribe('PushPreferenceUpdated', async (event) => {
    await refreshOperationsReminderPushDeliveriesForUser(event.payload.userId);
  });
  eventBus.subscribe('PushDeviceSubscribed', async (event) => {
    await refreshOperationsReminderPushDeliveriesForUser(event.payload.userId);
  });
  eventBus.subscribe('PushDeviceSubscriptionRevoked', async (event) => {
    await refreshOperationsReminderPushDeliveriesForUser(event.payload.userId);
  });
}
