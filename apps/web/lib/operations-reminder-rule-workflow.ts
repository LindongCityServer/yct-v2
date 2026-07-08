import { randomUUID } from 'node:crypto';
import type {
  OperationsStrongReminderRule,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import {
  readOperationsStrongReminderRules,
  writeOperationsStrongReminderRules,
} from './operations-reminder-rule-store';

ensureNotificationDeliveryListenersRegistered();

export interface OperationsReminderRuleActionResult {
  ok: boolean;
  rules?: OperationsStrongReminderRule[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listOperationsStrongReminderRules(): Promise<OperationsStrongReminderRule[]> {
  return readOperationsStrongReminderRules();
}

export async function updateOperationsStrongReminderRules(input: {
  actorId: string;
  rules: OperationsStrongReminderRule[];
}): Promise<OperationsReminderRuleActionResult> {
  const rules = await writeOperationsStrongReminderRules({
    actorId: input.actorId,
    rules: input.rules,
  });
  const updatedAt = new Date().toISOString();

  await emitEvent('OperationsStrongReminderRulesUpdated', input.actorId, {
    ruleIds: rules.map((rule) => rule.id),
    ruleCount: rules.length,
    activeRuleCount: rules.filter((rule) => isRuleActive(rule, updatedAt)).length,
    updatedBy: input.actorId,
    updatedAt,
    sourceKinds: Array.from(new Set(rules.map((rule) => rule.sourceKind))),
  });

  return { ok: true, rules };
}

function isRuleActive(rule: OperationsStrongReminderRule, nowValue: string): boolean {
  if (!rule.enabled) {
    return false;
  }

  const now = new Date(nowValue).getTime();
  const startsAt = toTime(rule.startsAt);
  const endsAt = toTime(rule.endsAt);
  if (startsAt > 0 && startsAt > now) {
    return false;
  }
  if (endsAt > 0 && endsAt < now) {
    return false;
  }
  return true;
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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
