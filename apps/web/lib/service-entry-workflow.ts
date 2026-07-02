import { randomUUID } from 'node:crypto';
import type {
  ServiceEntry,
  ServiceEntryStatus,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { InMemoryEventBus } from '@yct/event-bus';
import {
  createLocalServiceEntry,
  findLocalServiceEntry,
  listServiceEntries,
  updateLocalServiceEntry,
  withServiceEntryStatus,
} from './service-entry-store';

const serviceEntryEventBus = new InMemoryEventBus();

const serviceEntryTransitions: Record<ServiceEntryStatus, ServiceEntryStatus[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['approved', 'rejected', 'archived'],
  approved: ['published', 'archived'],
  rejected: ['draft', 'archived'],
  published: ['archived'],
  archived: [],
};

export interface ServiceEntryActionResult {
  ok: boolean;
  entry?: ServiceEntry;
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminServiceEntries(): Promise<ServiceEntry[]> {
  return listServiceEntries();
}

export async function createServiceEntryDraft(input: {
  title: string;
  description?: string;
  categoryId: ServiceEntry['categoryId'];
  icon: string;
  href: string;
  openMode: ServiceEntry['openMode'];
  sortOrder: number;
  actorId: string;
}): Promise<ServiceEntryActionResult> {
  const entry = await createLocalServiceEntry(input);
  return { ok: true, entry };
}

export async function submitServiceEntry(input: {
  serviceEntryId: string;
  actorId: string;
}): Promise<ServiceEntryActionResult> {
  const entry = await findLocalServiceEntry(input.serviceEntryId);
  if (!entry) {
    return notFound();
  }

  const transition = transitionServiceEntryStatus(entry.status, 'pending_review');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateLocalServiceEntry(input.serviceEntryId, (current) =>
    withServiceEntryStatus(current, 'pending_review', {
      submittedBy: input.actorId,
      submittedAt: now,
    }),
  );

  if (updated) {
    await emitEvent('ServiceEntrySubmitted', input.actorId, {
      serviceEntryId: updated.id,
      title: updated.title,
      categoryId: updated.categoryId,
      href: updated.href,
    });
  }

  return { ok: true, entry: updated };
}

export async function reviewServiceEntry(input: {
  serviceEntryId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<ServiceEntryActionResult> {
  const entry = await findLocalServiceEntry(input.serviceEntryId);
  if (!entry) {
    return notFound();
  }

  const nextStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionServiceEntryStatus(entry.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateLocalServiceEntry(input.serviceEntryId, (current) =>
    withServiceEntryStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent('ServiceEntryReviewed', input.actorId, {
      serviceEntryId: updated.id,
      decision: input.decision,
      reviewerId: input.actorId,
      reason: input.reason,
    });
  }

  return { ok: true, entry: updated };
}

export async function publishServiceEntry(input: {
  serviceEntryId: string;
  actorId: string;
}): Promise<ServiceEntryActionResult> {
  const entry = await findLocalServiceEntry(input.serviceEntryId);
  if (!entry) {
    return notFound();
  }

  const transition = transitionServiceEntryStatus(entry.status, 'published');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await updateLocalServiceEntry(input.serviceEntryId, (current) =>
    withServiceEntryStatus(current, 'published', {
      publishedAt,
    }),
  );

  if (updated) {
    await emitEvent('ServiceEntryPublished', input.actorId, {
      serviceEntryId: updated.id,
      categoryId: updated.categoryId,
      href: updated.href,
      publishedAt,
    });
  }

  return { ok: true, entry: updated };
}

function transitionServiceEntryStatus(current: ServiceEntryStatus, next: ServiceEntryStatus) {
  if (current === next) {
    return { ok: true };
  }

  if (!serviceEntryTransitions[current].includes(next)) {
    return {
      ok: false,
      reason: `服务入口不能从 ${current} 转换到 ${next}`,
    };
  }

  return { ok: true };
}

function notFound(): ServiceEntryActionResult {
  return {
    ok: false,
    status: 404,
    error: 'service_entry_not_found',
    message: '服务入口不存在。',
  };
}

function invalidTransition(reason?: string): ServiceEntryActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_service_entry_state',
    message: reason ?? '当前服务入口状态不允许执行该操作。',
  };
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

  await serviceEntryEventBus.emit(event);
}
