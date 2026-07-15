import { randomUUID } from 'node:crypto';
import type { TransitModeProfile, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { readTransitModeProfiles, writeTransitModeProfiles } from './transit-mode-profile-store';
import { ensureTransitCacheInvalidationListenersRegistered } from './transit-cache-invalidation-listeners';

ensureTransitCacheInvalidationListenersRegistered();

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
  const previousModes = await readTransitModeProfiles();
  const modes = await writeTransitModeProfiles({
    actorId: input.actorId,
    modes: input.modes,
  });
  const updatedAt = new Date().toISOString();

  const previousByMode = new Map(previousModes.map((profile) => [profile.mode, profile]));
  const nextByMode = new Map(modes.map((profile) => [profile.mode, profile]));
  for (const profile of modes) {
    if (!previousByMode.has(profile.mode)) {
      await emitEvent('TransitModeProfileCreated', input.actorId, {
        profile,
        createdBy: input.actorId,
        createdAt: updatedAt,
      });
    }
  }
  for (const profile of previousModes) {
    if (!nextByMode.has(profile.mode)) {
      await emitEvent('TransitModeProfileDeleted', input.actorId, {
        profile,
        deletedBy: input.actorId,
        deletedAt: updatedAt,
      });
    }
  }

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
