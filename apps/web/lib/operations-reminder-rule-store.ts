import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OperationsStrongReminderRule } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface OperationsReminderRuleStoreSnapshot {
  version: 1;
  rules: OperationsStrongReminderRule[];
  updatedAt?: string;
  updatedBy?: string;
}

const emptySnapshot: OperationsReminderRuleStoreSnapshot = {
  version: 1,
  rules: [],
};

export async function readOperationsStrongReminderRules(): Promise<OperationsStrongReminderRule[]> {
  const snapshot = await readSnapshot();
  return normalizeRules(snapshot.rules);
}

export async function writeOperationsStrongReminderRules(input: {
  actorId: string;
  rules: OperationsStrongReminderRule[];
}): Promise<OperationsStrongReminderRule[]> {
  const snapshot = await readSnapshot();
  const existingById = new Map(snapshot.rules.map((rule) => [rule.id, rule]));
  const now = new Date().toISOString();
  const rules = normalizeRules(
    input.rules.map((rule) => {
      const existing = rule.id ? existingById.get(rule.id) : undefined;
      return {
        ...existing,
        ...rule,
        id: rule.id?.trim() || existing?.id || `operations_reminder_rule_${randomUUID()}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        updatedBy: input.actorId,
      };
    }),
  );

  await writeSnapshot({
    version: 1,
    rules,
    updatedAt: now,
    updatedBy: input.actorId,
  });
  return rules;
}

export async function hasEnabledContentReminderRuleForContent(contentId: string): Promise<boolean> {
  const normalizedContentId = normalizeOptionalText(contentId);
  if (!normalizedContentId) {
    return false;
  }

  const rules = await readOperationsStrongReminderRules();
  return rules.some(
    (rule) =>
      rule.enabled !== false &&
      rule.sourceKind === 'content' &&
      normalizeOptionalText(rule.contentId) === normalizedContentId,
  );
}

async function readSnapshot(): Promise<OperationsReminderRuleStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as OperationsReminderRuleStoreSnapshot;
    return {
      version: 1,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: OperationsReminderRuleStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizeRules(rules: OperationsStrongReminderRule[]): OperationsStrongReminderRule[] {
  const byId = new Map<string, OperationsStrongReminderRule>();
  for (const rule of rules) {
    const normalized = normalizeRule(rule);
    byId.set(normalized.id, normalized);
  }

  return Array.from(byId.values()).sort(compareRules);
}

function normalizeRule(rule: OperationsStrongReminderRule): OperationsStrongReminderRule {
  return {
    ...rule,
    id: rule.id.trim(),
    sourceKind: rule.sourceKind,
    enabled: rule.enabled !== false,
    sortOrder: Number.isFinite(rule.sortOrder) ? Math.trunc(rule.sortOrder) : 0,
    tone: rule.tone,
    label: normalizeOptionalText(rule.label),
    title: normalizeOptionalText(rule.title),
    summary: normalizeOptionalText(rule.summary),
    href: normalizeOptionalText(rule.href),
    contentId: normalizeOptionalText(rule.contentId),
    startsAt: normalizeOptionalText(rule.startsAt),
    endsAt: normalizeOptionalText(rule.endsAt),
    createdAt: normalizeOptionalText(rule.createdAt),
    updatedAt: normalizeOptionalText(rule.updatedAt),
    updatedBy: normalizeOptionalText(rule.updatedBy),
  };
}

function compareRules(left: OperationsStrongReminderRule, right: OperationsStrongReminderRule): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.operationsReminderRuleStorePath)
    ? config.operationsReminderRuleStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.operationsReminderRuleStorePath);
}
