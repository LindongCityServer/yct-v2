import { randomUUID } from 'node:crypto';
import type {
  TravelScheduleServiceProfile,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { InMemoryEventBus } from '@yct/event-bus';
import {
  readTravelServiceProfiles,
  writeTravelServiceProfiles,
} from './travel-service-profile-store';

const travelServiceProfileEventBus = new InMemoryEventBus();

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
  const services = await writeTravelServiceProfiles({
    actorId: input.actorId,
    services: input.services,
  });
  const updatedAt = new Date().toISOString();

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
  const event: YctEvent<TType> = {
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    profileId: 'default',
    actor: {
      type: 'admin',
      id: actorId,
    },
    payload,
  } as YctEvent<TType>;

  await travelServiceProfileEventBus.emit(event);
}
