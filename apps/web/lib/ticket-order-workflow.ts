import { randomUUID } from 'node:crypto';
import type {
  TicketInventoryHold,
  TicketOrder,
  TicketOrderDraftResult,
  TicketOrderListItem,
  TravelTripInstance,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { createYctEvent, emitAppEvent } from './app-event-bus';
import { readTicketingCatalog } from './ticketing-catalog-store';
import { readTicketOrderStore, writeTicketOrderStore } from './ticket-order-store';
import { findTicketingOrderCandidate } from './travel-ticketing';

const defaultHoldDurationMs = 15 * 60 * 1000;

export class TicketOrderWorkflowError extends Error {
  constructor(
    public readonly code:
      | 'order_not_found'
      | 'order_not_cancellable'
      | 'ticketing_unavailable'
      | 'fare_not_configured'
      | 'inventory_not_configured'
      | 'sold_out',
    message: string,
  ) {
    super(message);
  }
}

export async function listTicketOrdersForUser(userId: string): Promise<TicketOrderListItem[]> {
  const orderStore = await readTicketOrderStore();
  const holdById = new Map(orderStore.inventoryHolds.map((hold) => [hold.inventoryHoldId, hold]));

  return orderStore.orders
    .filter((order) => order.userId === userId)
    .map((order) => ({
      order,
      inventoryHold: order.inventoryHoldId ? holdById.get(order.inventoryHoldId) : undefined,
    }))
    .sort(
      (left, right) =>
        new Date(right.order.updatedAt).getTime() - new Date(left.order.updatedAt).getTime(),
    );
}

export async function getTicketOrderForUser(input: {
  orderId: string;
  userId: string;
  ldpassUserId: string;
}): Promise<TicketOrderListItem> {
  const orderStore = await readTicketOrderStore();
  const order = orderStore.orders.find(
    (item) =>
      item.orderId === input.orderId &&
      item.userId === input.userId &&
      item.ldpassUserId === input.ldpassUserId,
  );

  if (!order) {
    throw new TicketOrderWorkflowError('order_not_found', '没有找到对应订单。');
  }

  return {
    order,
    inventoryHold: order.inventoryHoldId
      ? orderStore.inventoryHolds.find((hold) => hold.inventoryHoldId === order.inventoryHoldId)
      : undefined,
  };
}

export async function createTicketOrderDraft(input: {
  trip: TravelTripInstance;
  userId: string;
  ldpassUserId: string;
  fareProductId?: string;
  passengerCount: number;
}): Promise<TicketOrderDraftResult> {
  const now = new Date();
  const catalog = await readTicketingCatalog();
  const orderStore = await readTicketOrderStore();
  const candidate = findTicketingOrderCandidate({
    trip: input.trip,
    catalog,
    orderStore,
    fareProductId: input.fareProductId,
    passengerCount: input.passengerCount,
    now,
  });

  if (!candidate.ok) {
    throw new TicketOrderWorkflowError(
      toWorkflowErrorCode(candidate.ticketing.status),
      candidate.ticketing.message,
    );
  }

  const orderId = `ticket_order_${randomUUID()}`;
  const inventoryHoldId = `ticket_hold_${randomUUID()}`;
  const heldAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + defaultHoldDurationMs).toISOString();
  const inventoryHold: TicketInventoryHold = {
    inventoryHoldId,
    inventoryPoolId: candidate.inventoryPool.inventoryPoolId,
    tripInstanceId: input.trip.tripInstanceId,
    fareProductId: candidate.fareProduct.fareProductId,
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    quantity: input.passengerCount,
    status: 'held',
    heldAt,
    expiresAt,
    orderId,
  };
  const order: TicketOrder = {
    orderId,
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    serviceKind: input.trip.serviceKind,
    tripInstanceId: input.trip.tripInstanceId,
    fareProductId: candidate.fareProduct.fareProductId,
    inventoryHoldId,
    passengerCount: input.passengerCount,
    status: 'draft',
    createdAt: heldAt,
    updatedAt: heldAt,
  };

  await writeTicketOrderStore({
    version: 1,
    orders: [...orderStore.orders, order],
    inventoryHolds: [...orderStore.inventoryHolds, inventoryHold],
    updatedAt: heldAt,
  });

  await emitEvent('TicketInventoryHeld', input.userId, {
    inventoryHoldId,
    tripInstanceId: input.trip.tripInstanceId,
    fareProductId: candidate.fareProduct.fareProductId,
    userId: input.userId,
    quantity: input.passengerCount,
    expiresAt,
  });
  await emitEvent('TicketOrderCreated', input.userId, {
    orderId,
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    scheduleId: input.trip.serviceId ?? input.trip.serviceKind,
    serviceKind: input.trip.serviceKind,
    tripInstanceId: input.trip.tripInstanceId,
    fareProductId: candidate.fareProduct.fareProductId,
    inventoryHoldId,
    passengerCount: input.passengerCount,
    status: 'draft',
  });

  return {
    order,
    inventoryHold,
    fareProduct: {
      fareProductId: candidate.fareProduct.fareProductId,
      name: candidate.fareProduct.name,
      priceAmount: candidate.fareProduct.priceAmount,
      currency: candidate.fareProduct.currency,
    },
    ticketing: candidate.ticketing,
  };
}

export async function cancelTicketOrderDraft(input: {
  orderId: string;
  userId: string;
  ldpassUserId: string;
}): Promise<TicketOrderListItem> {
  const now = new Date().toISOString();
  const orderStore = await readTicketOrderStore();
  const order = orderStore.orders.find(
    (item) =>
      item.orderId === input.orderId &&
      item.userId === input.userId &&
      item.ldpassUserId === input.ldpassUserId,
  );

  if (!order) {
    throw new TicketOrderWorkflowError('order_not_found', '没有找到对应订单。');
  }

  if (order.status !== 'draft' && order.status !== 'pending_issue') {
    throw new TicketOrderWorkflowError('order_not_cancellable', '当前订单状态不允许取消。');
  }

  const updatedOrder: TicketOrder = {
    ...order,
    status: 'cancelled',
    cancellationReason: 'user_cancelled',
    cancelledAt: now,
    updatedAt: now,
  };
  let releasedHold: TicketInventoryHold | undefined;
  const inventoryHolds = orderStore.inventoryHolds.map((hold) => {
    if (
      hold.inventoryHoldId !== order.inventoryHoldId ||
      (hold.status !== 'held' && hold.status !== 'confirmed')
    ) {
      return hold;
    }

    releasedHold = {
      ...hold,
      status: 'cancelled',
      releasedAt: now,
    };
    return releasedHold;
  });

  await writeTicketOrderStore({
    version: 1,
    orders: orderStore.orders.map((item) => (item.orderId === order.orderId ? updatedOrder : item)),
    inventoryHolds,
    updatedAt: now,
  });

  await emitEvent('TicketOrderCancelled', input.userId, {
    orderId: order.orderId,
    cancelledAt: now,
    reason: 'user_cancelled',
  });

  return {
    order: updatedOrder,
    inventoryHold: releasedHold,
  };
}

function toWorkflowErrorCode(
  status: ReturnType<typeof findTicketingOrderCandidate>['ticketing']['status'],
): TicketOrderWorkflowError['code'] {
  if (status === 'inventory_not_configured') {
    return 'inventory_not_configured';
  }

  if (status === 'sold_out') {
    return 'sold_out';
  }

  if (status === 'fare_not_configured' || status === 'legacy_reference_only') {
    return 'fare_not_configured';
  }

  return 'ticketing_unavailable';
}

async function emitEvent<TType extends YctEventType>(
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
        type: 'user',
        id: actorId,
      },
      payload,
    }),
  );
}
