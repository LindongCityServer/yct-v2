import { randomUUID, createHash } from 'node:crypto';
import type { TransitServiceNotice } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import {
  readOperationsReminderSourceState,
  upsertOperationsReminderSourceState,
} from './operations-reminder-source-state-store';
import { readTransitServiceNotices } from './transit-service-notices';

const transitServiceNoticeSourceKey = 'transit_service_notice';

ensureNotificationDeliveryListenersRegistered();

export interface OperationsReminderSourceSyncResult {
  sourceKey: string;
  status: 'changed' | 'unchanged' | 'not_configured' | 'unavailable';
  candidateCount: number;
  currentSignature?: string;
  previousSignature?: string;
  checkedAt: string;
  changedAt?: string;
  refreshRequestedAt?: string;
  refreshTriggered: boolean;
  message?: string;
}

export async function syncTransitServiceNoticeReminderSource(input: {
  actorId?: string;
  actorType?: 'admin' | 'system';
  forceRefresh?: boolean;
} = {}): Promise<OperationsReminderSourceSyncResult> {
  const checkedAt = new Date().toISOString();
  const actorId = input.actorId?.trim() || 'internal_task';
  const actorType = input.actorType ?? (actorId === 'internal_task' ? 'system' : 'admin');
  const response = await readTransitServiceNotices();
  const previousState = await readOperationsReminderSourceState(transitServiceNoticeSourceKey);

  if (response.meta.sourceStatus !== 'ready') {
    await upsertOperationsReminderSourceState({
      sourceKey: transitServiceNoticeSourceKey,
      signature: previousState?.signature,
      candidateCount: previousState?.candidateCount ?? 0,
      sourceStatus: response.meta.sourceStatus,
      message: response.meta.message,
      lastCheckedAt: checkedAt,
      lastChangedAt: previousState?.lastChangedAt,
      lastRefreshRequestedAt: previousState?.lastRefreshRequestedAt,
    });

    return {
      sourceKey: transitServiceNoticeSourceKey,
      status: response.meta.sourceStatus,
      candidateCount: previousState?.candidateCount ?? 0,
      currentSignature: previousState?.signature,
      previousSignature: previousState?.signature,
      checkedAt,
      changedAt: previousState?.lastChangedAt,
      refreshRequestedAt: previousState?.lastRefreshRequestedAt,
      refreshTriggered: false,
      message: response.meta.message,
    };
  }

  const currentSignature = createTransitServiceNoticeSignature(response.items);
  const previousSignature = previousState?.signature;
  const changed = previousSignature !== currentSignature;
  const refreshTriggered = changed || input.forceRefresh === true;
  const changedAt = changed ? checkedAt : previousState?.lastChangedAt;
  const refreshRequestedAt = refreshTriggered ? checkedAt : previousState?.lastRefreshRequestedAt;

  if (refreshTriggered) {
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'OperationsReminderDeliveryRefreshRequested',
      occurredAt: checkedAt,
      actor: {
        type: actorType,
        id: actorId,
      },
      payload: {
        requestedBy: actorId,
        requestedAt: checkedAt,
        reason: 'service_notice_sync',
      },
    });
  }

  await upsertOperationsReminderSourceState({
    sourceKey: transitServiceNoticeSourceKey,
    signature: currentSignature,
    candidateCount: response.items.length,
    sourceStatus: 'ready',
    message: response.meta.message,
    lastCheckedAt: checkedAt,
    lastChangedAt: changedAt,
    lastRefreshRequestedAt: refreshRequestedAt,
  });

  return {
    sourceKey: transitServiceNoticeSourceKey,
    status: changed ? 'changed' : 'unchanged',
    candidateCount: response.items.length,
    currentSignature,
    previousSignature,
    checkedAt,
    changedAt,
    refreshRequestedAt,
    refreshTriggered,
    message:
      response.meta.message ??
      (refreshTriggered
        ? changed
          ? '客运公告源发生变化，已请求重算运营提醒投递。'
          : '客运公告源未变化，但已按强制模式请求重算运营提醒投递。'
        : '客运公告源未变化，无需重算运营提醒投递。'),
  };
}

function createTransitServiceNoticeSignature(items: TransitServiceNotice[]): string {
  const normalized = [...items]
    .map((item) => ({
      id: item.id,
      mode: item.mode,
      title: item.title,
      periodText: item.periodText,
      reason: item.reason,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      sourcePath: item.sourcePath,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
