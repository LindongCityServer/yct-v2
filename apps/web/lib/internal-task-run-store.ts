import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InternalTaskRunResult } from './internal-task-runner';
import { readRuntimeConfig } from './runtime-config';

const maxTaskRunHistory = 8;

export interface InternalTaskRunRecord {
  processedAt: string;
  actorType: 'admin' | 'system';
  actorId?: string;
  status: 'ok' | 'warning';
  statusSummary: string;
  operationsReminders: {
    sourceKey: string;
    status: 'changed' | 'unchanged' | 'not_configured' | 'unavailable';
    candidateCount: number;
    checkedAt: string;
    changedAt?: string;
    refreshRequestedAt?: string;
    refreshTriggered: boolean;
    message?: string;
  };
  contentOperationsReminders: {
    sourceKey: string;
    status: 'changed' | 'unchanged';
    candidateCount: number;
    checkedAt: string;
    changedAt?: string;
    refreshRequestedAt?: string;
    refreshTriggered: boolean;
    message?: string;
  };
  events: {
    processed: number;
    dispatched: number;
    failed: number;
  };
  notifications: {
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    deferred: number;
  };
  playerLocations: {
    status: 'ready' | 'not_configured' | 'unavailable';
    checkedAt: string;
    onlineCount: number;
    changed: boolean;
    message: string;
  };
  ticketing: {
    processedAt: string;
    expiredOrderCount: number;
    expiredHoldCount: number;
  };
}

interface InternalTaskRunSnapshot {
  version: 1;
  latest?: InternalTaskRunRecord;
  recent: InternalTaskRunRecord[];
}

const emptySnapshot: InternalTaskRunSnapshot = {
  version: 1,
  recent: [],
};

export async function readLatestInternalTaskRun(): Promise<InternalTaskRunRecord | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.latest;
}

export async function listRecentInternalTaskRuns(
  limit = maxTaskRunHistory,
): Promise<InternalTaskRunRecord[]> {
  const snapshot = await readSnapshot();
  return snapshot.recent.slice(0, Math.max(0, Math.trunc(limit)));
}

export async function writeLatestInternalTaskRun(
  latest: InternalTaskRunResult,
): Promise<InternalTaskRunRecord> {
  const snapshot = await readSnapshot();
  const record = toInternalTaskRunRecord(latest);
  const nextRecent = [record, ...snapshot.recent.filter((item) => item.processedAt !== record.processedAt)]
    .sort((left, right) => right.processedAt.localeCompare(left.processedAt))
    .slice(0, maxTaskRunHistory);

  await writeSnapshot({
    ...snapshot,
    latest: record,
    recent: nextRecent,
  });
  return record;
}

function toInternalTaskRunRecord(result: InternalTaskRunResult): InternalTaskRunRecord {
  return {
    processedAt: result.processedAt,
    actorType: result.actorType,
    actorId: normalizeOptionalText(result.actorId),
    status: result.status,
    statusSummary: result.statusSummary,
    operationsReminders: {
      sourceKey: result.operationsReminders.sourceKey,
      status: result.operationsReminders.status,
      candidateCount: result.operationsReminders.candidateCount,
      checkedAt: result.operationsReminders.checkedAt,
      changedAt: normalizeOptionalText(
        'changedAt' in result.operationsReminders ? result.operationsReminders.changedAt : undefined,
      ),
      refreshRequestedAt: normalizeOptionalText(
        'refreshRequestedAt' in result.operationsReminders
          ? result.operationsReminders.refreshRequestedAt
          : undefined,
      ),
      refreshTriggered: result.operationsReminders.refreshTriggered,
      message: normalizeOptionalText(result.operationsReminders.message),
    },
    contentOperationsReminders: {
      sourceKey: result.contentOperationsReminders.sourceKey,
      status: result.contentOperationsReminders.status,
      candidateCount: result.contentOperationsReminders.candidateCount,
      checkedAt: result.contentOperationsReminders.checkedAt,
      changedAt: normalizeOptionalText(
        'changedAt' in result.contentOperationsReminders
          ? result.contentOperationsReminders.changedAt
          : undefined,
      ),
      refreshRequestedAt: normalizeOptionalText(
        'refreshRequestedAt' in result.contentOperationsReminders
          ? result.contentOperationsReminders.refreshRequestedAt
          : undefined,
      ),
      refreshTriggered: result.contentOperationsReminders.refreshTriggered,
      message: normalizeOptionalText(result.contentOperationsReminders.message),
    },
    events: {
      processed: result.events.processed,
      dispatched: result.events.dispatched,
      failed: result.events.failed,
    },
    notifications: {
      processed: result.notifications.processed,
      sent: result.notifications.sent,
      failed: result.notifications.failed,
      skipped: result.notifications.skipped,
      deferred: result.notifications.deferred,
    },
    playerLocations: {
      status: result.playerLocations.status,
      checkedAt: result.playerLocations.checkedAt,
      onlineCount: result.playerLocations.onlineCount,
      changed: result.playerLocations.changed,
      message: result.playerLocations.message,
    },
    ticketing: {
      processedAt: result.ticketing.processedAt,
      expiredOrderCount: result.ticketing.expiredOrderCount,
      expiredHoldCount: result.ticketing.expiredHoldCount,
    },
  };
}

async function readSnapshot(): Promise<InternalTaskRunSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as InternalTaskRunSnapshot;
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.map(normalizeRecord).sort((left, right) => right.processedAt.localeCompare(left.processedAt))
      : [];
    return {
      version: 1,
      latest: parsed.latest ? normalizeRecord(parsed.latest) : recent[0],
      recent,
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: InternalTaskRunSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizeRecord(record: InternalTaskRunRecord): InternalTaskRunRecord {
  return {
    processedAt: record.processedAt,
    actorType: record.actorType === 'admin' ? 'admin' : 'system',
    actorId: normalizeOptionalText(record.actorId),
    status: record.status === 'warning' ? 'warning' : 'ok',
    statusSummary: record.statusSummary,
    operationsReminders: {
      sourceKey: record.operationsReminders.sourceKey,
      status: normalizeOperationsReminderStatus(record.operationsReminders.status),
      candidateCount: normalizeCount(record.operationsReminders.candidateCount),
      checkedAt: record.operationsReminders.checkedAt,
      changedAt: normalizeOptionalText(record.operationsReminders.changedAt),
      refreshRequestedAt: normalizeOptionalText(record.operationsReminders.refreshRequestedAt),
      refreshTriggered: record.operationsReminders.refreshTriggered === true,
      message: normalizeOptionalText(record.operationsReminders.message),
    },
    contentOperationsReminders: {
      sourceKey: normalizeOptionalText(record.contentOperationsReminders?.sourceKey)
        ?? 'operations_content_rule_visibility',
      status: normalizeContentOperationsReminderStatus(record.contentOperationsReminders?.status),
      candidateCount: normalizeCount(record.contentOperationsReminders?.candidateCount ?? 0),
      checkedAt:
        normalizeOptionalText(record.contentOperationsReminders?.checkedAt) ?? record.processedAt,
      changedAt: normalizeOptionalText(record.contentOperationsReminders?.changedAt),
      refreshRequestedAt: normalizeOptionalText(record.contentOperationsReminders?.refreshRequestedAt),
      refreshTriggered: record.contentOperationsReminders?.refreshTriggered === true,
      message: normalizeOptionalText(record.contentOperationsReminders?.message),
    },
    events: {
      processed: normalizeCount(record.events.processed),
      dispatched: normalizeCount(record.events.dispatched),
      failed: normalizeCount(record.events.failed),
    },
    notifications: {
      processed: normalizeCount(record.notifications.processed),
      sent: normalizeCount(record.notifications.sent),
      failed: normalizeCount(record.notifications.failed),
      skipped: normalizeCount(record.notifications.skipped),
      deferred: normalizeCount(record.notifications.deferred),
    },
    playerLocations: {
      status: normalizePlayerLocationStatus(record.playerLocations?.status),
      checkedAt: normalizeOptionalText(record.playerLocations?.checkedAt) ?? record.processedAt,
      onlineCount: normalizeCount(record.playerLocations?.onlineCount ?? 0),
      changed: record.playerLocations?.changed === true,
      message:
        normalizeOptionalText(record.playerLocations?.message) ?? '尚无玩家位置同步结果。',
    },
    ticketing: {
      processedAt: record.ticketing.processedAt,
      expiredOrderCount: normalizeCount(record.ticketing.expiredOrderCount),
      expiredHoldCount: normalizeCount(record.ticketing.expiredHoldCount),
    },
  };
}

function normalizeOperationsReminderStatus(
  value: InternalTaskRunRecord['operationsReminders']['status'],
): InternalTaskRunRecord['operationsReminders']['status'] {
  return value === 'changed' ||
    value === 'unchanged' ||
    value === 'not_configured' ||
    value === 'unavailable'
    ? value
    : 'unavailable';
}

function normalizeContentOperationsReminderStatus(
  value: InternalTaskRunRecord['contentOperationsReminders']['status'] | undefined,
): InternalTaskRunRecord['contentOperationsReminders']['status'] {
  return value === 'changed' || value === 'unchanged' ? value : 'unchanged';
}

function normalizePlayerLocationStatus(
  value: InternalTaskRunRecord['playerLocations']['status'] | undefined,
): InternalTaskRunRecord['playerLocations']['status'] {
  return value === 'ready' || value === 'not_configured' || value === 'unavailable'
    ? value
    : 'not_configured';
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.internalTaskRunStorePath)
    ? config.internalTaskRunStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.internalTaskRunStorePath);
}
