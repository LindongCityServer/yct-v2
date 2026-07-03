import { randomUUID } from 'node:crypto';
import type { RectangleBounds, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  deleteOfflinePackageRequestForUser,
  listOfflinePackageRequestsForUser,
  upsertOfflinePackageRequest,
  type StoredOfflinePackageRequest,
} from './offline-package-store';

export async function listUserOfflinePackageRequests(
  userId: string,
): Promise<StoredOfflinePackageRequest[]> {
  return listOfflinePackageRequestsForUser(userId);
}

export async function requestOfflinePackage(input: {
  packageId: string;
  userId: string;
  ldpassUserId: string;
  name: string;
  bounds: RectangleBounds;
}): Promise<StoredOfflinePackageRequest> {
  const { request } = await upsertOfflinePackageRequest(input);
  await emitEvent('OfflinePackageRequested', input.userId, {
    userId: input.userId,
    packageId: input.packageId,
    bounds: request.bounds,
  });
  return request;
}

export async function deleteUserOfflinePackageRequest(input: {
  packageId: string;
  userId: string;
}): Promise<{ request: StoredOfflinePackageRequest | null; deletedAt: string }> {
  const deletedAt = new Date().toISOString();
  const request = await deleteOfflinePackageRequestForUser(input);

  if (request) {
    await emitEvent('OfflinePackageRequestDeleted', input.userId, {
      userId: input.userId,
      packageId: input.packageId,
      deletedAt,
    });
  }

  return { request, deletedAt };
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
