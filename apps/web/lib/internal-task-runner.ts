import { replayPendingAppEvents } from './app-event-bus';
import { writeLatestInternalTaskRun } from './internal-task-run-store';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import { syncOperationsContentReminderRuleSource } from './operations-reminder-content-source-sync-workflow';
import { ensureOperationsReminderRefreshListenersRegistered } from './operations-reminder-refresh-listeners';
import { processDuePushDeliveries } from './notification-delivery-workflow';
import type { OperationsReminderSourceSyncResult } from './operations-reminder-source-sync-workflow';
import { syncTransitServiceNoticeReminderSource } from './operations-reminder-source-sync-workflow';
import { processExpiredTicketOrders } from './ticket-order-workflow';

export interface InternalTaskRunResult {
  processedAt: string;
  actorType: 'admin' | 'system';
  actorId?: string;
  status: 'ok' | 'warning';
  statusSummary: string;
  operationsReminders: OperationsReminderSourceSyncResult | {
    sourceKey: 'transit_service_notice';
    status: 'unchanged';
    candidateCount: 0;
    checkedAt: string;
    refreshTriggered: false;
    message: string;
  };
  contentOperationsReminders: Awaited<ReturnType<typeof syncOperationsContentReminderRuleSource>> | {
    sourceKey: 'operations_content_rule_visibility';
    status: 'unchanged';
    candidateCount: 0;
    currentSignature: string;
    checkedAt: string;
    refreshTriggered: false;
    message: string;
  };
  events: Awaited<ReturnType<typeof replayPendingAppEvents>>;
  notifications: Awaited<ReturnType<typeof processDuePushDeliveries>>;
  ticketing: Awaited<ReturnType<typeof processExpiredTicketOrders>>;
}

export async function runInternalTasks(input: {
  actorId?: string;
  actorType?: 'admin' | 'system';
  eventLimit?: number;
  pushLimit?: number;
  now?: string;
  syncOperationsReminders?: boolean;
  forceOperationsReminderRefresh?: boolean;
} = {}): Promise<InternalTaskRunResult> {
  ensureNotificationDeliveryListenersRegistered();
  ensureOperationsReminderRefreshListenersRegistered();
  const processedAt = new Date().toISOString();
  const actorType = input.actorType ?? 'system';
  const actorId = input.actorId?.trim() || undefined;

  const operationsReminders =
    input.syncOperationsReminders === false
      ? {
          sourceKey: 'transit_service_notice' as const,
          status: 'unchanged' as const,
          candidateCount: 0 as const,
          checkedAt: processedAt,
          refreshTriggered: false as const,
          message: '已跳过运营提醒公告源同步。',
        }
      : await syncTransitServiceNoticeReminderSource({
          actorId,
          actorType,
          forceRefresh: input.forceOperationsReminderRefresh,
        });
  const contentOperationsReminders =
    input.syncOperationsReminders === false
      ? {
          sourceKey: 'operations_content_rule_visibility' as const,
          status: 'unchanged' as const,
          candidateCount: 0 as const,
          currentSignature: '',
          checkedAt: processedAt,
          refreshTriggered: false as const,
          message: '已跳过内容型运营提醒可见性同步。',
        }
      : await syncOperationsContentReminderRuleSource({
          actorId,
          actorType,
          forceRefresh: input.forceOperationsReminderRefresh,
          now: input.now,
        });

  const events = await replayPendingAppEvents(input.eventLimit);
  const notifications = await processDuePushDeliveries({
    limit: input.pushLimit,
    now: input.now,
  });
  const ticketing = await processExpiredTicketOrders({
    now: input.now,
  });
  const status = inferInternalTaskRunStatus({
    operationsReminders,
    events,
    notifications,
  });

  const result: InternalTaskRunResult = {
    processedAt,
    actorType,
    actorId,
    status,
    statusSummary: buildInternalTaskRunStatusSummary({
      status,
      operationsReminders,
      contentOperationsReminders,
      events,
      notifications,
      ticketing,
    }),
    operationsReminders,
    contentOperationsReminders,
    events,
    notifications,
    ticketing,
  };

  await writeLatestInternalTaskRun(result);
  return result;
}

function inferInternalTaskRunStatus(input: {
  operationsReminders: InternalTaskRunResult['operationsReminders'];
  events: InternalTaskRunResult['events'];
  notifications: InternalTaskRunResult['notifications'];
}): InternalTaskRunResult['status'] {
  if (
    input.operationsReminders.status === 'not_configured' ||
    input.operationsReminders.status === 'unavailable' ||
    input.events.failed > 0 ||
    input.notifications.failed > 0
  ) {
    return 'warning';
  }

  return 'ok';
}

function buildInternalTaskRunStatusSummary(input: {
  status: InternalTaskRunResult['status'];
  operationsReminders: InternalTaskRunResult['operationsReminders'];
  contentOperationsReminders: InternalTaskRunResult['contentOperationsReminders'];
  events: InternalTaskRunResult['events'];
  notifications: InternalTaskRunResult['notifications'];
  ticketing: InternalTaskRunResult['ticketing'];
}): string {
  const parts = [
    input.status === 'warning' ? '本轮任务存在需要关注的结果。' : '本轮任务执行完成。',
  ];

  if (input.operationsReminders.message) {
    parts.push(input.operationsReminders.message);
  }
  if (input.contentOperationsReminders.message) {
    parts.push(input.contentOperationsReminders.message);
  }
  if (input.events.failed > 0) {
    parts.push(`事件重放失败 ${input.events.failed} 条`);
  }
  if (input.notifications.failed > 0) {
    parts.push(`通知发送失败 ${input.notifications.failed} 条`);
  }
  if (input.ticketing.expiredOrderCount > 0 || input.ticketing.expiredHoldCount > 0) {
    parts.push(
      `已清理过期订单 ${input.ticketing.expiredOrderCount} 条、过期占座 ${input.ticketing.expiredHoldCount} 条`,
    );
  }

  return parts.join(' · ');
}
