import { randomUUID } from 'node:crypto';
import type { UserMapFavorites, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  createDefaultMapFavorites,
  findMapFavoritesByUserId,
  upsertMapFavorites,
} from './map-favorite-store';

export async function readUserMapFavorites(input: {
  userId: string;
  ldpassUserId: string;
}): Promise<UserMapFavorites> {
  return (
    (await findMapFavoritesByUserId(input.userId)) ??
    createDefaultMapFavorites({
      userId: input.userId,
      ldpassUserId: input.ldpassUserId,
    })
  );
}

export async function updateUserMapFavorites(input: {
  userId: string;
  ldpassUserId: string;
  markerIds: string[];
  source: YctEventPayloadMap['MapFavoritesUpdated']['source'];
}): Promise<UserMapFavorites> {
  const updatedAt = new Date().toISOString();
  const favorites = await upsertMapFavorites({
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    markerIds: input.markerIds,
    updatedAt,
  });

  await emitEvent('MapFavoritesUpdated', input.userId, {
    userId: input.userId,
    markerIds: favorites.markerIds,
    updatedAt,
    source: input.source,
  });

  return favorites;
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
