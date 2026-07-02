import { randomUUID } from 'node:crypto';
import type {
  TransitModeProfile,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { InMemoryEventBus } from '@yct/event-bus';
import { readTransitModeProfiles, writeTransitModeProfiles } from './transit-mode-profile-store';

const transitModeProfileEventBus = new InMemoryEventBus();

export interface TransitModeProfileActionResult {
  ok: boolean;
  modes?: TransitModeProfile[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listTransitModeProfiles(): Promise<TransitModeProfile[]> {
  return readTransitModeProfiles();
}

export async function updateTransitModeProfiles(input: {
  actorId: string;
  modes: TransitModeProfile[];
}): Promise<TransitModeProfileActionResult> {
  const modes = await writeTransitModeProfiles({
    actorId: input.actorId,
    modes: input.modes,
  });
  const updatedAt = new Date().toISOString();

  await emitEvent('TransitModeProfileUpdated', input.actorId, {
    modes,
    updatedBy: input.actorId,
    updatedAt,
  });

  return { ok: true, modes };
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

  await transitModeProfileEventBus.emit(event);
}
