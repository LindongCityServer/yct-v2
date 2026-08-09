import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  MapShareLink,
  MapShareLinkTarget,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { mapShareLinkCreateSchema, type MapShareLinkCreateInput } from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
import {
  findMapShareLinkByFingerprint,
  findMapShareLinkById,
  saveMapShareLink,
} from './map-share-link-store';

const shortShareIdLength = 10;

export async function createMapShareLink(input: MapShareLinkCreateInput): Promise<MapShareLink> {
  const target = mapShareLinkCreateSchema.parse(input) as MapShareLinkTarget;
  const fingerprint = createHash('sha256').update(JSON.stringify(target)).digest('hex');
  const existing = await findMapShareLinkByFingerprint(fingerprint);
  if (existing) {
    return existing;
  }

  let attempt = 0;
  while (attempt < 8) {
    const id = createShortShareId();
    if (await findMapShareLinkById(id)) {
      attempt += 1;
      continue;
    }

    const link: MapShareLink = {
      createdAt: new Date().toISOString(),
      id,
      target,
    };
    const saved = await saveMapShareLink(link, fingerprint);
    if (saved.created) {
      await emitMapShareLinkCreated(saved.link);
    }
    return saved.link;
  }

  throw new Error('Unable to allocate a unique map share link id');
}

export { findMapShareLinkById };

function createShortShareId(): string {
  return randomBytes(8).toString('base64url').slice(0, shortShareIdLength);
}

async function emitMapShareLinkCreated(link: MapShareLink): Promise<void> {
  const type: YctEventType = 'MapShareLinkCreated';
  const payload: YctEventPayloadMap[typeof type] = {
    createdAt: link.createdAt,
    shareId: link.id,
    targetKind: link.target.kind,
  };
  await publishDomainEvent({
    actor: { type: 'system', id: 'map-share-link-workflow' },
    eventId: `event_${randomUUID()}`,
    occurredAt: link.createdAt,
    payload,
    type,
  });
}
