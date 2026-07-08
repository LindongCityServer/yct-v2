import { createHash, randomUUID } from 'node:crypto';
import { publishDomainEvent } from './app-event-bus';
import { readOperationsDetails } from './operations-content';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import { readOperationsStrongReminderRules } from './operations-reminder-rule-store';
import {
  readOperationsReminderSourceState,
  upsertOperationsReminderSourceState,
} from './operations-reminder-source-state-store';

const operationsContentReminderSourceKey = 'operations_content_rule_visibility';

ensureNotificationDeliveryListenersRegistered();

export interface OperationsContentReminderSourceSyncResult {
  sourceKey: string;
  status: 'changed' | 'unchanged';
  candidateCount: number;
  currentSignature: string;
  previousSignature?: string;
  checkedAt: string;
  changedAt?: string;
  refreshRequestedAt?: string;
  refreshTriggered: boolean;
  message: string;
}

export async function syncOperationsContentReminderRuleSource(input: {
  actorId?: string;
  actorType?: 'admin' | 'system';
  forceRefresh?: boolean;
  now?: string;
} = {}): Promise<OperationsContentReminderSourceSyncResult> {
  const checkedAt = input.now ?? new Date().toISOString();
  const actorId = input.actorId?.trim() || 'internal_task';
  const actorType = input.actorType ?? (actorId === 'internal_task' ? 'system' : 'admin');
  const now = toTime(checkedAt);
  const previousState =
    await readOperationsReminderSourceState(operationsContentReminderSourceKey);
  const candidates = await listActiveContentReminderCandidates(now);
  const currentSignature = createActiveContentReminderSignature(candidates);
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
        reason: 'content_visibility_sync',
      },
    });
  }

  await upsertOperationsReminderSourceState({
    sourceKey: operationsContentReminderSourceKey,
    signature: currentSignature,
    candidateCount: candidates.length,
    sourceStatus: 'ready',
    lastCheckedAt: checkedAt,
    lastChangedAt: changedAt,
    lastRefreshRequestedAt: refreshRequestedAt,
    message: candidates.length > 0 ? `当前有 ${candidates.length} 条内容型运营提醒处于可见态。` : '当前没有处于可见态的内容型运营提醒。',
  });

  return {
    sourceKey: operationsContentReminderSourceKey,
    status: changed ? 'changed' : 'unchanged',
    candidateCount: candidates.length,
    currentSignature,
    previousSignature,
    checkedAt,
    changedAt,
    refreshRequestedAt,
    refreshTriggered,
    message:
      refreshTriggered
        ? changed
          ? '内容型运营提醒可见性发生变化，已请求重算运营提醒投递。'
          : '内容型运营提醒可见性未变化，但已按强制模式请求重算运营提醒投递。'
        : '内容型运营提醒可见性未变化，无需重算运营提醒投递。',
  };
}

async function listActiveContentReminderCandidates(now: number): Promise<
  Array<{
    ruleId: string;
    contentId: string;
    publishedAt: string;
    startsAt?: string;
    endsAt?: string;
    expiresAt?: string;
  }>
> {
  const [rules, details] = await Promise.all([
    readOperationsStrongReminderRules(),
    readOperationsDetails(),
  ]);
  const detailById = new Map(details.items.map((item) => [item.id, item]));

  return rules
    .filter((rule) => rule.enabled !== false && rule.sourceKind === 'content')
    .flatMap((rule) => {
      const startsAt = toTime(rule.startsAt);
      const endsAt = toTime(rule.endsAt);
      if (startsAt > 0 && startsAt > now) {
        return [];
      }
      if (endsAt > 0 && endsAt < now) {
        return [];
      }

      const contentId = rule.contentId?.trim();
      if (!contentId) {
        return [];
      }

      const detail = detailById.get(contentId);
      if (!detail) {
        return [];
      }
      const publishedAt = detail.publishedAt?.trim();
      if (!publishedAt) {
        return [];
      }

      const expiresAt = toTime(detail.expiresAt);
      if (expiresAt > 0 && expiresAt < now) {
        return [];
      }

      return [
        {
          ruleId: rule.id,
          contentId: detail.id,
          publishedAt,
          startsAt: rule.startsAt,
          endsAt: rule.endsAt,
          expiresAt: detail.expiresAt,
        },
      ];
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function createActiveContentReminderSignature(
  candidates: Array<{
    ruleId: string;
    contentId: string;
    publishedAt: string;
    startsAt?: string;
    endsAt?: string;
    expiresAt?: string;
  }>,
): string {
  return createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
