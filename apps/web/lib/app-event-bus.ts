import type { YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { InMemoryEventBus } from '@yct/event-bus';
import {
  listPendingOutboxEvents,
  markOutboxEventDispatched,
  markOutboxEventFailed,
  queueOutboxEvent,
} from './event-outbox-store';

const appEventBus = new InMemoryEventBus();

export function getAppEventBus() {
  return appEventBus;
}

export async function emitAppEvent<TType extends YctEventType>(
  event: YctEvent<TType>,
): Promise<void> {
  await queueOutboxEvent(event);
  await dispatchAppEvent(event);
}

export async function replayPendingAppEvents(limit = 50): Promise<{
  processed: number;
  dispatched: number;
  failed: number;
}> {
  const records = await listPendingOutboxEvents(limit);
  let dispatched = 0;
  let failed = 0;

  for (const record of records) {
    try {
      await dispatchAppEvent(record.event);
      dispatched += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    processed: records.length,
    dispatched,
    failed,
  };
}

export async function publishDomainEvent<TType extends YctEventType>(input: {
  eventId: string;
  type: TType;
  occurredAt?: string;
  actor: YctEvent<TType>['actor'];
  payload: YctEventPayloadMap[TType];
}): Promise<void> {
  await emitAppEvent(
    createYctEvent({
      eventId: input.eventId,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      actor: input.actor,
      payload: input.payload,
    }),
  );
}

export function createYctEvent<TType extends YctEventType>(input: {
  eventId: string;
  type: TType;
  occurredAt: string;
  actor: YctEvent<TType>['actor'];
  payload: YctEventPayloadMap[TType];
}): YctEvent<TType> {
  return {
    eventId: input.eventId,
    type: input.type,
    occurredAt: input.occurredAt,
    profileId: 'default',
    actor: input.actor,
    payload: input.payload,
  } as YctEvent<TType>;
}

async function dispatchAppEvent<TType extends YctEventType>(event: YctEvent<TType>): Promise<void> {
  try {
    await appEventBus.emit(event);
    await markOutboxEventDispatched(event.eventId);
  } catch (error) {
    await markOutboxEventFailed({
      eventId: event.eventId,
      errorMessage: error instanceof Error ? error.message : '事件监听器执行失败。',
    });
    throw error;
  }
}
