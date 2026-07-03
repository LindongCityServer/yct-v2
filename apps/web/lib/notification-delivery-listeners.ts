import { getAppEventBus } from './app-event-bus';
import {
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
}
