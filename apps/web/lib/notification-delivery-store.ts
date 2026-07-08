import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ISODateTimeString,
  PushDelivery,
  PushDeliveryPayload,
  PushDeliverySourceType,
  PushDeliveryStatus,
  PushNotificationType,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface PushDeliveryStoreSnapshot {
  version: 1;
  deliveries: PushDelivery[];
}

const emptySnapshot: PushDeliveryStoreSnapshot = {
  version: 1,
  deliveries: [],
};

export async function upsertPushDelivery(input: {
  sourceKey: string;
  sourceType: PushDeliverySourceType;
  sourceId: string;
  userId: string;
  subscriptionId?: string;
  notificationType: PushNotificationType;
  status: PushDeliveryStatus;
  payload: PushDeliveryPayload;
  dueAt: ISODateTimeString;
  now?: ISODateTimeString;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}): Promise<{ delivery: PushDelivery; created: boolean }> {
  const snapshot = await readSnapshot();
  const now = input.now ?? new Date().toISOString();
  const existing = snapshot.deliveries.find((delivery) => delivery.sourceKey === input.sourceKey);
  const status = existing?.status === 'sent' ? existing.status : input.status;
  const delivery: PushDelivery = {
    deliveryId: existing?.deliveryId ?? createDeliveryId(input.sourceKey),
    sourceKey: input.sourceKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    notificationType: input.notificationType,
    status,
    payload: input.payload,
    dueAt: input.dueAt,
    attempts: existing?.attempts ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sentAt: status === 'sent' ? existing?.sentAt : undefined,
    failedAt: status === 'failed' ? existing?.failedAt : undefined,
    deferredUntil: status === 'deferred' ? existing?.deferredUntil : undefined,
    skippedAt:
      status === 'skipped'
        ? existing?.status === 'skipped'
          ? existing.skippedAt ?? now
          : now
        : undefined,
    cancelledAt: status === 'cancelled' ? existing?.cancelledAt : undefined,
    lastErrorCode:
      status === 'skipped' || status === 'failed' || status === 'deferred'
        ? input.lastErrorCode ?? existing?.lastErrorCode
        : undefined,
    lastErrorMessage:
      status === 'skipped' || status === 'failed' || status === 'deferred'
        ? input.lastErrorMessage ?? existing?.lastErrorMessage
        : undefined,
  };

  await writeSnapshot({
    version: 1,
    deliveries: existing
      ? snapshot.deliveries.map((item) => (item.sourceKey === input.sourceKey ? delivery : item))
      : [...snapshot.deliveries, delivery],
  });

  return { delivery, created: !existing };
}

export async function listDuePushDeliveries(
  input: {
    now?: ISODateTimeString;
    limit?: number;
  } = {},
): Promise<PushDelivery[]> {
  const snapshot = await readSnapshot();
  const nowTime = new Date(input.now ?? new Date().toISOString()).getTime();
  const limit = input.limit ?? 50;
  return snapshot.deliveries
    .filter((delivery) => {
      if (delivery.status !== 'queued' && delivery.status !== 'deferred') {
        return false;
      }
      const dueTime = new Date(delivery.deferredUntil ?? delivery.dueAt).getTime();
      return Number.isFinite(dueTime) && dueTime <= nowTime;
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .slice(0, limit);
}

export async function listPushDeliveriesForUser(userId: string): Promise<PushDelivery[]> {
  const snapshot = await readSnapshot();
  return snapshot.deliveries
    .filter((delivery) => delivery.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listPushDeliveries(
  input: {
    sourceType?: PushDeliverySourceType;
    userId?: string;
    limit?: number;
  } = {},
): Promise<PushDelivery[]> {
  const snapshot = await readSnapshot();
  const deliveries = snapshot.deliveries
    .filter((delivery) => {
      if (input.sourceType && delivery.sourceType !== input.sourceType) {
        return false;
      }
      if (input.userId && delivery.userId !== input.userId) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return input.limit && input.limit > 0 ? deliveries.slice(0, input.limit) : deliveries;
}

export async function findLatestSentPushDelivery(input: {
  userId: string;
  notificationType: PushNotificationType;
  beforeOrAt?: ISODateTimeString;
}): Promise<PushDelivery | undefined> {
  const snapshot = await readSnapshot();
  const beforeOrAt = new Date(input.beforeOrAt ?? new Date().toISOString()).getTime();
  return snapshot.deliveries
    .filter((delivery) => {
      if (
        delivery.userId !== input.userId ||
        delivery.notificationType !== input.notificationType ||
        delivery.status !== 'sent' ||
        !delivery.sentAt
      ) {
        return false;
      }

      const sentTime = new Date(delivery.sentAt).getTime();
      return Number.isFinite(sentTime) && sentTime <= beforeOrAt;
    })
    .sort((left, right) => (right.sentAt ?? '').localeCompare(left.sentAt ?? ''))[0];
}

export async function markPushDeliverySent(input: {
  deliveryId: string;
  sentAt?: ISODateTimeString;
}): Promise<PushDelivery | null> {
  const sentAt = input.sentAt ?? new Date().toISOString();
  return updateDelivery(input.deliveryId, (delivery) => ({
    ...delivery,
    status: 'sent',
    attempts: delivery.attempts + 1,
    updatedAt: sentAt,
    sentAt,
    deferredUntil: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  }));
}

export async function markPushDeliverySkipped(input: {
  deliveryId: string;
  errorCode: string;
  errorMessage: string;
  skippedAt?: ISODateTimeString;
}): Promise<PushDelivery | null> {
  const skippedAt = input.skippedAt ?? new Date().toISOString();
  return updateDelivery(input.deliveryId, (delivery) => ({
    ...delivery,
    status: 'skipped',
    updatedAt: skippedAt,
    skippedAt,
    deferredUntil: undefined,
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage,
  }));
}

export async function markPushDeliveryFailed(input: {
  deliveryId: string;
  errorCode: string;
  errorMessage: string;
  failedAt?: ISODateTimeString;
}): Promise<PushDelivery | null> {
  const failedAt = input.failedAt ?? new Date().toISOString();
  return updateDelivery(input.deliveryId, (delivery) => ({
    ...delivery,
    status: 'failed',
    attempts: delivery.attempts + 1,
    updatedAt: failedAt,
    failedAt,
    deferredUntil: undefined,
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage,
  }));
}

export async function deferPushDelivery(input: {
  deliveryId: string;
  deferredUntil: ISODateTimeString;
  errorCode: string;
  errorMessage: string;
  now?: ISODateTimeString;
}): Promise<PushDelivery | null> {
  return updateDelivery(input.deliveryId, (delivery) => ({
    ...delivery,
    status: 'deferred',
    attempts: delivery.attempts + 1,
    updatedAt: input.now ?? new Date().toISOString(),
    deferredUntil: input.deferredUntil,
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage,
  }));
}

export async function cancelPendingPushDeliveries(input: {
  userId: string;
  sourceType: PushDeliverySourceType;
  sourceIds: string[];
  cancelledAt?: ISODateTimeString;
}): Promise<PushDelivery[]> {
  if (input.sourceIds.length === 0) {
    return [];
  }

  const sourceIds = new Set(input.sourceIds);
  const cancelledAt = input.cancelledAt ?? new Date().toISOString();
  const snapshot = await readSnapshot();
  const cancelled: PushDelivery[] = [];
  const deliveries = snapshot.deliveries.map((delivery) => {
    if (
      delivery.userId !== input.userId ||
      delivery.sourceType !== input.sourceType ||
      !sourceIds.has(delivery.sourceId) ||
      (delivery.status !== 'queued' && delivery.status !== 'deferred')
    ) {
      return delivery;
    }

    const next: PushDelivery = {
      ...delivery,
      status: 'cancelled',
      updatedAt: cancelledAt,
      cancelledAt,
    };
    cancelled.push(next);
    return next;
  });

  if (cancelled.length > 0) {
    await writeSnapshot({
      version: 1,
      deliveries,
    });
  }

  return cancelled;
}

export async function cancelPendingPushDeliveriesExcept(input: {
  sourceType: PushDeliverySourceType;
  keepSourceIds: string[];
  cancelledAt?: ISODateTimeString;
}): Promise<PushDelivery[]> {
  const keepSourceIds = new Set(input.keepSourceIds);
  const cancelledAt = input.cancelledAt ?? new Date().toISOString();
  const snapshot = await readSnapshot();
  const cancelled: PushDelivery[] = [];
  const deliveries = snapshot.deliveries.map((delivery) => {
    if (
      delivery.sourceType !== input.sourceType ||
      keepSourceIds.has(delivery.sourceId) ||
      (delivery.status !== 'queued' && delivery.status !== 'deferred')
    ) {
      return delivery;
    }

    const next: PushDelivery = {
      ...delivery,
      status: 'cancelled',
      updatedAt: cancelledAt,
      cancelledAt,
    };
    cancelled.push(next);
    return next;
  });

  if (cancelled.length > 0) {
    await writeSnapshot({
      version: 1,
      deliveries,
    });
  }

  return cancelled;
}

export async function cancelPushDeliveriesByIds(input: {
  deliveryIds: string[];
  cancelledAt?: ISODateTimeString;
}): Promise<PushDelivery[]> {
  if (input.deliveryIds.length === 0) {
    return [];
  }

  const deliveryIds = new Set(input.deliveryIds);
  const cancelledAt = input.cancelledAt ?? new Date().toISOString();
  const snapshot = await readSnapshot();
  const cancelled: PushDelivery[] = [];
  const deliveries = snapshot.deliveries.map((delivery) => {
    if (
      !deliveryIds.has(delivery.deliveryId) ||
      (delivery.status !== 'queued' &&
        delivery.status !== 'deferred' &&
        delivery.status !== 'skipped')
    ) {
      return delivery;
    }

    const next: PushDelivery = {
      ...delivery,
      status: 'cancelled',
      updatedAt: cancelledAt,
      cancelledAt,
    };
    cancelled.push(next);
    return next;
  });

  if (cancelled.length > 0) {
    await writeSnapshot({
      version: 1,
      deliveries,
    });
  }

  return cancelled;
}

async function updateDelivery(
  deliveryId: string,
  updater: (delivery: PushDelivery) => PushDelivery,
): Promise<PushDelivery | null> {
  const snapshot = await readSnapshot();
  const existing = snapshot.deliveries.find((delivery) => delivery.deliveryId === deliveryId);
  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await writeSnapshot({
    version: 1,
    deliveries: snapshot.deliveries.map((delivery) =>
      delivery.deliveryId === deliveryId ? updated : delivery,
    ),
  });
  return updated;
}

async function readSnapshot(): Promise<PushDeliveryStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PushDeliveryStoreSnapshot;
    return {
      version: 1,
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PushDeliveryStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.pushDeliveryStorePath)
    ? config.pushDeliveryStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.pushDeliveryStorePath);
}

function createDeliveryId(sourceKey: string): string {
  const hash = createHash('sha256').update(sourceKey).digest('hex').slice(0, 24);
  return `push_delivery_${hash}_${randomUUID().slice(0, 8)}`;
}
