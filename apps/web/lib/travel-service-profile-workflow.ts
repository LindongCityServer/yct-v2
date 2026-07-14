import { randomUUID } from 'node:crypto';
import type {
  TravelScheduleServiceProfile,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  readTravelServiceProfiles,
  writeTravelServiceProfiles,
} from './travel-service-profile-store';

export interface TravelServiceProfileActionResult {
  ok: boolean;
  services?: TravelScheduleServiceProfile[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listTravelServiceProfiles(): Promise<TravelScheduleServiceProfile[]> {
  return readTravelServiceProfiles();
}

export async function updateTravelServiceProfiles(input: {
  actorId: string;
  services: TravelScheduleServiceProfile[];
}): Promise<TravelServiceProfileActionResult> {
  const previousServices = await readTravelServiceProfiles();
  const services = await writeTravelServiceProfiles({
    actorId: input.actorId,
    services: input.services,
  });
  const updatedAt = new Date().toISOString();

  const previousByKind = new Map(previousServices.map((profile) => [profile.kind, profile]));
  const nextByKind = new Map(services.map((profile) => [profile.kind, profile]));
  for (const profile of services) {
    if (!previousByKind.has(profile.kind)) {
      await emitEvent('TravelScheduleServiceProfileCreated', input.actorId, {
        profile,
        createdBy: input.actorId,
        createdAt: updatedAt,
      });
    }
  }
  for (const profile of previousServices) {
    if (!nextByKind.has(profile.kind)) {
      await emitEvent('TravelScheduleServiceProfileDeleted', input.actorId, {
        profile,
        deletedBy: input.actorId,
        deletedAt: updatedAt,
      });
    }
  }

  await emitEvent('TravelScheduleServiceProfileUpdated', input.actorId, {
    services,
    updatedBy: input.actorId,
    updatedAt,
  });

  return { ok: true, services };
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
