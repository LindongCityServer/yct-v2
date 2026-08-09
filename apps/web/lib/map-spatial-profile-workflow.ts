import { randomUUID } from 'node:crypto';
import type { MapSpatialProfile } from '@yct/contracts';
import type { MapSpatialProfileUpdateInput } from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
import { readMapSpatialProfile, writeMapSpatialProfile } from './map-spatial-profile-store';
import { ensureRoutingTopologyInvalidationListenersRegistered } from './routing-topology-invalidation-listeners';

ensureRoutingTopologyInvalidationListenersRegistered();

export async function getMapSpatialProfile(): Promise<MapSpatialProfile> {
  return readMapSpatialProfile();
}

export async function updateMapSpatialProfile(input: {
  actorId: string;
  update: MapSpatialProfileUpdateInput;
}): Promise<MapSpatialProfile> {
  const previous = await readMapSpatialProfile();
  const updatedAt = new Date().toISOString();
  const profile = await writeMapSpatialProfile({
    profile: {
      ...previous,
      ...input.update,
      updatedAt,
      updatedBy: input.actorId,
    },
  });
  const changedFields = (
    [
      'worldName',
      'defaultY',
      'verticalTolerance',
      'defaultDrivingSpeedKmh',
      'roadTiming',
      'taxiFare',
      'transitFare',
    ] as const
  ).filter((field) =>
    typeof previous[field] === 'object'
      ? JSON.stringify(previous[field]) !== JSON.stringify(profile[field])
      : previous[field] !== profile[field],
  );

  if (changedFields.length > 0) {
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'MapSpatialProfileUpdated',
      occurredAt: updatedAt,
      actor: { type: 'admin', id: input.actorId },
      payload: {
        profile,
        changedFields,
        updatedBy: input.actorId,
        updatedAt,
      },
    });
  }

  return profile;
}
