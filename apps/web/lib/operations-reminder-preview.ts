import type {
  OperationsStrongReminderItem,
  PushDelivery,
  PushDeliveryStatus,
  UserPushPreference,
} from '@yct/contracts';
import type { InternalTaskRunRecord } from './internal-task-run-store';
import {
  listRecentInternalTaskRuns,
  readLatestInternalTaskRun,
} from './internal-task-run-store';
import { listPushDeliveries } from './notification-delivery-store';
import { listPushPreferences } from './notification-preference-store';
import { listOperationsReminderSourceStates } from './operations-reminder-source-state-store';
import { listOperationsStrongReminderCandidates } from './operations-reminders';
import { listActivePushSubscriptions } from './push-subscription-store';

export interface OperationsReminderPreviewSourceState {
  sourceKey: string;
  sourceStatus: 'ready' | 'not_configured' | 'unavailable' | 'not_checked';
  candidateCount: number;
  message?: string;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastRefreshRequestedAt?: string;
}

export interface OperationsReminderPreviewCandidate extends OperationsStrongReminderItem {
  phase: 'active' | 'scheduled';
  deliveryCounts: Record<PushDeliveryStatus, number>;
}

export interface OperationsReminderPreviewUser {
  userId: string;
  ldpassUserId: string;
  operationsEnabled: boolean;
  subscriptionCount: number;
  expectedAction: 'queued' | 'skipped_no_subscription' | 'ignored_disabled';
  candidateCount: number;
  queuedCount: number;
  skippedCount: number;
  cancelledCount: number;
  lastDeliveryAt?: string;
}

export interface OperationsReminderPreviewSummary {
  candidateCount: number;
  activeCandidateCount: number;
  scheduledCandidateCount: number;
  targetUserCount: number;
  subscribedTargetUserCount: number;
  queuedCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  deferredCount: number;
  cancelledCount: number;
}

export interface OperationsReminderPreview {
  generatedAt: string;
  sourceStates: OperationsReminderPreviewSourceState[];
  taskRun?: InternalTaskRunRecord;
  taskRunHistory: InternalTaskRunRecord[];
  summary: OperationsReminderPreviewSummary;
  candidates: OperationsReminderPreviewCandidate[];
  users: OperationsReminderPreviewUser[];
  deliveries: PushDelivery[];
}

const emptyDeliveryCounts: Record<PushDeliveryStatus, number> = {
  queued: 0,
  deferred: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  cancelled: 0,
};

const expectedReminderSourceStates: Array<{
  sourceKey: string;
  sourceStatus: OperationsReminderPreviewSourceState['sourceStatus'];
  candidateCount: number;
  message: string;
}> = [
  {
    sourceKey: 'operations_content_rule_visibility',
    sourceStatus: 'not_checked',
    candidateCount: 0,
    message: '尚未执行内容型运营提醒可见性同步。',
  },
  {
    sourceKey: 'transit_service_notice',
    sourceStatus: 'not_checked',
    candidateCount: 0,
    message: '尚未执行公告源同步。',
  },
];

export async function readOperationsReminderPreview(): Promise<OperationsReminderPreview> {
  const generatedAt = new Date().toISOString();
  const [
    candidateResponse,
    preferences,
    subscriptions,
    deliveries,
    sourceStates,
    latestTaskRun,
    taskRunHistory,
  ] = await Promise.all([
    listOperationsStrongReminderCandidates({ includeFuture: true }),
    listPushPreferences(),
    listActivePushSubscriptions(),
    listPushDeliveries({ sourceType: 'operations', limit: 200 }),
    listOperationsReminderSourceStates(),
    readLatestInternalTaskRun(),
    listRecentInternalTaskRuns(),
  ]);

  const candidates = candidateResponse.items;
  const candidateRuleIds = new Set(candidates.map((candidate) => candidate.ruleId));
  const currentDeliveries = deliveries.filter((delivery) => candidateRuleIds.has(delivery.sourceId));
  const deliveriesBySourceId = groupDeliveriesBySourceId(currentDeliveries);
  const subscriptionsByUserId = groupSubscriptionsByUserId(subscriptions);

  const previewCandidates = candidates.map((candidate) => {
    const candidateDeliveries = deliveriesBySourceId.get(candidate.ruleId) ?? [];
    const phase: OperationsReminderPreviewCandidate['phase'] = isFutureCandidate(
      candidate,
      generatedAt,
    )
      ? 'scheduled'
      : 'active';
    return {
      ...candidate,
      phase,
      deliveryCounts: countDeliveriesByStatus(candidateDeliveries),
    };
  });

  const previewUsers = preferences
    .map((preference) =>
      createPreviewUser({
        preference,
        candidateCount: candidates.length,
        subscriptions: subscriptionsByUserId.get(preference.userId) ?? [],
        deliveries: currentDeliveries.filter((delivery) => delivery.userId === preference.userId),
      }),
    )
    .sort(comparePreviewUsers);

  return {
    generatedAt,
    sourceStates: createPreviewSourceStates(sourceStates),
    taskRun: latestTaskRun,
    taskRunHistory,
    summary: {
      candidateCount: previewCandidates.length,
      activeCandidateCount: previewCandidates.filter((candidate) => candidate.phase === 'active').length,
      scheduledCandidateCount: previewCandidates.filter((candidate) => candidate.phase === 'scheduled')
        .length,
      targetUserCount: previewUsers.filter((user) => user.operationsEnabled).length,
      subscribedTargetUserCount: previewUsers.filter(
        (user) => user.operationsEnabled && user.subscriptionCount > 0,
      ).length,
      queuedCount: currentDeliveries.filter((delivery) => delivery.status === 'queued').length,
      skippedCount: currentDeliveries.filter((delivery) => delivery.status === 'skipped').length,
      sentCount: currentDeliveries.filter((delivery) => delivery.status === 'sent').length,
      failedCount: currentDeliveries.filter((delivery) => delivery.status === 'failed').length,
      deferredCount: currentDeliveries.filter((delivery) => delivery.status === 'deferred').length,
      cancelledCount: currentDeliveries.filter((delivery) => delivery.status === 'cancelled').length,
    },
    candidates: previewCandidates,
    users: previewUsers,
    deliveries: currentDeliveries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

function createPreviewSourceStates(
  sourceStates: Array<{
    sourceKey: string;
    sourceStatus: 'ready' | 'not_configured' | 'unavailable';
    candidateCount: number;
    message?: string;
    lastCheckedAt?: string;
    lastChangedAt?: string;
    lastRefreshRequestedAt?: string;
  }>,
): OperationsReminderPreviewSourceState[] {
  const stateByKey = new Map(sourceStates.map((state) => [state.sourceKey, state]));
  const merged = expectedReminderSourceStates.map((expected) => {
    const state = stateByKey.get(expected.sourceKey);
    if (!state) {
      return expected;
    }

    return {
      sourceKey: state.sourceKey,
      sourceStatus: state.sourceStatus,
      candidateCount: state.candidateCount,
      message: state.message,
      lastCheckedAt: state.lastCheckedAt,
      lastChangedAt: state.lastChangedAt,
      lastRefreshRequestedAt: state.lastRefreshRequestedAt,
    };
  });

  const additionalStates = sourceStates
    .filter((state) => !expectedReminderSourceStates.some((expected) => expected.sourceKey === state.sourceKey))
    .map((state) => ({
      sourceKey: state.sourceKey,
      sourceStatus: state.sourceStatus,
      candidateCount: state.candidateCount,
      message: state.message,
      lastCheckedAt: state.lastCheckedAt,
      lastChangedAt: state.lastChangedAt,
      lastRefreshRequestedAt: state.lastRefreshRequestedAt,
    }));

  return [...merged, ...additionalStates].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function createPreviewUser(input: {
  preference: UserPushPreference;
  candidateCount: number;
  subscriptions: Array<{ subscriptionId: string }>;
  deliveries: PushDelivery[];
}): OperationsReminderPreviewUser {
  const operationsEnabled =
    input.preference.enabled && input.preference.enabledTypes.includes('operations');
  const subscriptionCount = input.subscriptions.length;
  const expectedAction = !operationsEnabled
    ? 'ignored_disabled'
    : subscriptionCount > 0
      ? 'queued'
      : 'skipped_no_subscription';

  return {
    userId: input.preference.userId,
    ldpassUserId: input.preference.ldpassUserId,
    operationsEnabled,
    subscriptionCount,
    expectedAction,
    candidateCount: operationsEnabled ? input.candidateCount : 0,
    queuedCount: input.deliveries.filter((delivery) => delivery.status === 'queued').length,
    skippedCount: input.deliveries.filter((delivery) => delivery.status === 'skipped').length,
    cancelledCount: input.deliveries.filter((delivery) => delivery.status === 'cancelled').length,
    lastDeliveryAt: input.deliveries[0]?.createdAt,
  };
}

function groupDeliveriesBySourceId(deliveries: PushDelivery[]): Map<string, PushDelivery[]> {
  const groups = new Map<string, PushDelivery[]>();
  for (const delivery of deliveries) {
    const group = groups.get(delivery.sourceId);
    if (group) {
      group.push(delivery);
    } else {
      groups.set(delivery.sourceId, [delivery]);
    }
  }
  return groups;
}

function groupSubscriptionsByUserId(
  subscriptions: Array<{ userId: string; subscriptionId: string }>,
): Map<string, Array<{ subscriptionId: string }>> {
  const groups = new Map<string, Array<{ subscriptionId: string }>>();
  for (const subscription of subscriptions) {
    const group = groups.get(subscription.userId);
    if (group) {
      group.push(subscription);
    } else {
      groups.set(subscription.userId, [subscription]);
    }
  }
  return groups;
}

function countDeliveriesByStatus(
  deliveries: PushDelivery[],
): Record<PushDeliveryStatus, number> {
  const counts = { ...emptyDeliveryCounts };
  for (const delivery of deliveries) {
    counts[delivery.status] += 1;
  }
  return counts;
}

function isFutureCandidate(candidate: { startsAt?: string }, nowValue: string): boolean {
  if (!candidate.startsAt) {
    return false;
  }

  const startsAt = new Date(candidate.startsAt).getTime();
  const now = new Date(nowValue).getTime();
  return Number.isFinite(startsAt) && startsAt > now;
}

function comparePreviewUsers(
  left: OperationsReminderPreviewUser,
  right: OperationsReminderPreviewUser,
): number {
  const leftRank = rankPreviewUser(left);
  const rightRank = rankPreviewUser(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.userId.localeCompare(right.userId);
}

function rankPreviewUser(user: OperationsReminderPreviewUser): number {
  if (user.operationsEnabled && user.subscriptionCount > 0) {
    return 0;
  }
  if (user.operationsEnabled) {
    return 1;
  }
  return 2;
}
