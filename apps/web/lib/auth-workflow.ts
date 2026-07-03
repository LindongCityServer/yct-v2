import { randomUUID } from 'node:crypto';
import type {
  LdpassClientSessionResponse,
  YctAccountSessionSnapshot,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
  YctUserLink,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { createYctSessionSnapshot } from './yct-session';
import { upsertYctUserLinkFromLdpassUser } from './yct-user-link-store';

export async function startYctSessionFromLdpass(input: {
  session: LdpassClientSessionResponse;
  linkedAt?: string;
}): Promise<{
  snapshot?: YctAccountSessionSnapshot;
  userLink?: YctUserLink;
}> {
  const linkedAt = input.linkedAt ?? new Date().toISOString();
  const snapshot = createYctSessionSnapshot(input.session, linkedAt);
  if (!snapshot) {
    return {};
  }

  if (input.session.authenticated && input.session.user) {
    const { link, created } = await upsertYctUserLinkFromLdpassUser(input.session.user, linkedAt);
    if (created) {
      await emitEvent('LdpassUserLinked', 'user', input.session.user.id, {
        yctUserLinkId: link.id,
        ldpassUserId: link.ldpassUserId,
        usernameSnapshot: link.usernameSnapshot,
        serverAccountVerifiedSnapshot: link.serverAccountVerifiedSnapshot,
      });
    }

    await emitEvent('YctSessionStarted', 'user', input.session.user.id, {
      ldpassUserId: input.session.user.id,
      authenticated: true,
      readonly: false,
    });
    return { snapshot, userLink: link };
  }

  if (input.session.readonlyUser) {
    await emitEvent('YctSessionStarted', 'user', input.session.readonlyUser.id, {
      ldpassUserId: input.session.readonlyUser.id,
      authenticated: false,
      readonly: true,
    });
  }

  return { snapshot };
}

export async function ensureYctUserLinkForLdpassSession(
  session: LdpassClientSessionResponse,
): Promise<YctUserLink | undefined> {
  if (!session.authenticated || !session.user) {
    return undefined;
  }

  const { link, created } = await upsertYctUserLinkFromLdpassUser(session.user);
  if (created) {
    await emitEvent('LdpassUserLinked', 'user', session.user.id, {
      yctUserLinkId: link.id,
      ldpassUserId: link.ldpassUserId,
      usernameSnapshot: link.usernameSnapshot,
      serverAccountVerifiedSnapshot: link.serverAccountVerifiedSnapshot,
    });
  }

  return link;
}

export async function endYctSession(input: {
  snapshot?: YctAccountSessionSnapshot;
  reason: YctEventPayloadMap['YctSessionEnded']['reason'];
}): Promise<void> {
  const ldpassUserId =
    input.snapshot?.user?.ldpassUserId ?? input.snapshot?.readonlyUser?.ldpassUserId;
  await emitEvent('YctSessionEnded', ldpassUserId ? 'user' : 'system', ldpassUserId, {
    ldpassUserId,
    reason: input.reason,
  });
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorType: YctEvent<TType>['actor']['type'],
  actorId: string | undefined,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: {
      type: actorType,
      id: actorId,
    },
    payload,
  });
}
