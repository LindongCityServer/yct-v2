import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listOutboxEvents, type EventOutboxStatus } from '../../../../../lib/event-outbox-store';

const outboxStatuses = new Set<EventOutboxStatus | 'all'>([
  'all',
  'queued',
  'dispatched',
  'failed',
]);

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const status = parseStatus(url.searchParams.get('status'));
  const type = parseOptionalFilter(url.searchParams.get('type'));
  const entityId = parseOptionalFilter(url.searchParams.get('entityId'));
  const actorId = parseOptionalFilter(url.searchParams.get('actorId'));
  const search = parseOptionalFilter(url.searchParams.get('search'));
  const records = await listOutboxEvents({ limit, status, type, entityId, actorId, search });

  return NextResponse.json({
    items: records.map((record) => ({
      eventId: record.eventId,
      type: record.type,
      status: record.status,
      attempts: record.attempts,
      actor: record.event.actor,
      payload: record.event.payload,
      occurredAt: record.event.occurredAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      dispatchedAt: record.dispatchedAt,
      failedAt: record.failedAt,
      lastErrorMessage: record.lastErrorMessage,
    })),
  });
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 50;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 50;
}

function parseStatus(value: string | null): EventOutboxStatus | 'all' {
  return value && outboxStatuses.has(value as EventOutboxStatus | 'all')
    ? (value as EventOutboxStatus | 'all')
    : 'all';
}

function parseOptionalFilter(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
