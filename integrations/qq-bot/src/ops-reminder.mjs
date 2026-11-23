import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { maskOpenId } from './log.mjs';

/**
 * 运维提醒：雨城通、临东通、QQ 机器人更新开始/结束时，
 * 向开启了 opsReminder 模块的群发一条纯文本通知。
 *
 * 这里不直接连 QQ 网关，只负责校验、生成文案、幂等和按群发送；
 * 入口是事件桥的 POST /ops，由部署脚本或 notify-ops.ps1 调用。
 */

export const OPS_SYSTEMS = {
  yct: '雨城通',
  ldpass: '临东通',
  qqbot: 'QQ 机器人',
};

export const OPS_PHASES = {
  start: '开始',
  end: '完成',
  failed: '异常',
  rolled_back: '已回滚',
  cancelled: '已取消',
};

export const OPS_SYSTEM_IDS = Object.keys(OPS_SYSTEMS);
export const OPS_PHASE_IDS = Object.keys(OPS_PHASES);

const DEFAULT_IMPACT = {
  yct: '网页、登录、地图和机器人问一问可能短暂不可用',
  ldpass: '临东通登录、账号资料和乘车码可能不可用；雨城通登录状态可能短暂失效',
  qqbot: '期间 @机器人、单聊和群指令可能无响应；网页不受影响',
};

const MAX_TEXT = 120;
const MAX_UPDATES = 100;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class OpsReminderError extends Error {
  constructor(message, { code = 'invalid_ops_event' } = {}) {
    super(message);
    this.name = 'OpsReminderError';
    this.code = code;
  }
}

/** 校验并归一化 /ops 请求体；错误信息可以直接返回给调用方。 */
export function normalizeOpsEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OpsReminderError('请求体必须是 JSON 对象。');
  }

  const system = String(input.system ?? '')
    .trim()
    .toLowerCase();
  if (!OPS_SYSTEMS[system]) {
    throw new OpsReminderError(`system 只能是 ${OPS_SYSTEM_IDS.join('、')}。`);
  }

  const phase = String(input.phase ?? '')
    .trim()
    .toLowerCase();
  if (!OPS_PHASES[phase]) {
    throw new OpsReminderError(`phase 只能是 ${OPS_PHASE_IDS.join('、')}。`);
  }

  const updateId = String(input.updateId ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(updateId)) {
    throw new OpsReminderError(
      'updateId 必填，1-80 位，只能包含字母、数字和 . _ : -；同一次更新的开始和结束要用同一个 id。',
    );
  }

  return {
    system,
    phase,
    updateId,
    version: optionalText(input.version, 40),
    buildId: optionalText(input.buildId, 40),
    summary: optionalText(input.summary, MAX_TEXT),
    impact: optionalText(input.impact, MAX_TEXT),
    reason: optionalText(input.reason, MAX_TEXT),
    expectedMinutes: optionalInteger(input.expectedMinutes, 1, 180),
    startedAt: optionalIso(input.startedAt),
  };
}

/** 生成 QQ 群纯文本；没有的字段整行省略，不显示“未知”。 */
export function formatOpsReminder(event, { now = new Date(), startedAt = '' } = {}) {
  const system = OPS_SYSTEMS[event.system] ?? event.system;
  const impact = event.impact || DEFAULT_IMPACT[event.system] || '';
  const time = formatTime(event.startedAt || now);
  const versionLine = event.version
    ? `版本：${event.version}${event.buildId ? `（构建 ${event.buildId}）` : ''}`
    : '';
  const summaryLine = event.summary ? `说明：${event.summary}` : '';

  if (event.phase === 'start') {
    return compact([
      `【运维提醒·开始】${system}`,
      event.expectedMinutes
        ? `${time} 开始，预计 ${event.expectedMinutes} 分钟`
        : `${time} 开始更新`,
      versionLine,
      impact ? `影响：${impact}` : '',
      summaryLine,
      '完成后会再发一条恢复通知。',
    ]).join('\n');
  }

  if (event.phase === 'end') {
    const duration = formatDuration(startedAt || event.startedAt, now);
    return compact([
      `【运维提醒·完成】${system}已恢复`,
      versionLine,
      duration ? `用时：${duration}` : '',
      summaryLine,
      '如仍无法使用，请稍后重试或联系管理员。',
    ]).join('\n');
  }

  if (event.phase === 'failed') {
    return compact([
      `【运维提醒·异常】${system}更新未完成`,
      `原因：${event.reason || '正在排查'}`,
      '服务可能暂时不可用，请稍后再试。',
    ]).join('\n');
  }

  if (event.phase === 'rolled_back') {
    return compact([
      `【运维提醒·已回滚】${system}`,
      event.version
        ? `已回滚到 ${event.version}，服务已恢复。`
        : '已回滚到上一个版本，服务已恢复。',
      event.reason ? `原因：${event.reason}` : '',
    ]).join('\n');
  }

  return compact([
    `【运维提醒·已取消】${system}`,
    `原定 ${time} 的更新已取消，服务不受影响。`,
  ]).join('\n');
}

/** 运维提醒的幂等状态；默认放在 state/ops-reminders.json，机器人更新时保留。 */
export class OpsReminderStore {
  constructor({ path = '', logger, now = () => new Date() } = {}) {
    this.path = path;
    this.logger = logger;
    this.now = now;
    this.data = { version: 1, updates: {} };
    this.load();
  }

  load() {
    if (!this.path) {
      return this.data;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.updates &&
        typeof parsed.updates === 'object'
      ) {
        this.data = { version: 1, updates: parsed.updates };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn(`读取运维提醒状态失败，先按空状态处理：${error.message}`);
      }
    }
    return this.data;
  }

  get(updateId) {
    return this.data.updates[updateId] ?? null;
  }

  hasNotified(updateId, phase) {
    return Boolean(this.get(updateId)?.[`${phase}NotifiedAt`]);
  }

  record(event, { sent = 0, at = this.now() } = {}) {
    const nowIso = at.toISOString();
    const entry = this.data.updates[event.updateId] ?? {
      updateId: event.updateId,
      system: event.system,
    };
    entry.system = event.system;
    entry.version = event.version || entry.version || '';
    entry.buildId = event.buildId || entry.buildId || '';
    entry.summary = event.summary || entry.summary || '';
    entry.impact = event.impact || entry.impact || '';
    entry.expectedMinutes = event.expectedMinutes || entry.expectedMinutes || 0;
    entry.updatedAt = nowIso;
    if (event.phase === 'start') {
      entry.startedAt = entry.startedAt || event.startedAt || nowIso;
      entry.startNotifiedAt = nowIso;
      entry.lastPhase = 'start';
    } else {
      entry.startedAt = entry.startedAt || event.startedAt || '';
      entry.finishedAt = nowIso;
      entry[`${event.phase}NotifiedAt`] = nowIso;
      entry.lastPhase = event.phase;
    }
    entry.sent = Math.max(Number(entry.sent) || 0, sent);
    this.data.updates[event.updateId] = entry;
    this.prune(at);
    this.persist();
    return entry;
  }

  prune(now = this.now()) {
    const entries = Object.values(this.data.updates);
    const cutoff = now.getTime() - RETENTION_MS;
    const kept = entries
      .filter((entry) => {
        const timestamp = Date.parse(entry.updatedAt || entry.finishedAt || entry.startedAt || '');
        return !Number.isFinite(timestamp) || timestamp >= cutoff;
      })
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, MAX_UPDATES);
    this.data.updates = Object.fromEntries(kept.map((entry) => [entry.updateId, entry]));
  }

  persist() {
    if (!this.path) {
      return;
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
      renameSync(temporary, this.path);
    } catch (error) {
      this.logger?.warn(`保存运维提醒状态失败：${error.message}`);
    }
  }
}

export class OpsReminder {
  constructor({ store, groupStore, api, logger, now = () => new Date() } = {}) {
    this.store = store;
    this.groupStore = groupStore;
    this.api = api;
    this.logger = logger;
    this.now = now;
  }

  /** 处理一次 /ops 请求；重复的 updateId + phase 不会重复发群消息。 */
  async handle(payload) {
    const event = normalizeOpsEvent(payload);
    if (this.store.hasNotified(event.updateId, event.phase)) {
      return {
        duplicate: true,
        system: event.system,
        phase: event.phase,
        updateId: event.updateId,
        sent: 0,
      };
    }

    const groups = this.groupStore.listEnabledGroups('opsReminder');
    if (groups.length === 0) {
      return {
        duplicate: false,
        system: event.system,
        phase: event.phase,
        updateId: event.updateId,
        sent: 0,
        failed: 0,
        reason: 'no_groups',
      };
    }

    const existing = this.store.get(event.updateId);
    const merged = {
      ...event,
      version: event.version || existing?.version || '',
      buildId: event.buildId || existing?.buildId || '',
      summary: event.summary || existing?.summary || '',
      impact: event.impact || existing?.impact || '',
      expectedMinutes: event.expectedMinutes || existing?.expectedMinutes || 0,
      startedAt: event.startedAt || existing?.startedAt || '',
    };
    const content = formatOpsReminder(merged, {
      now: this.now(),
      startedAt: existing?.startedAt || event.startedAt || '',
    });

    let sent = 0;
    const failed = [];
    for (const groupId of groups) {
      try {
        await this.api.sendGroupMessage(groupId, { content, msg_type: 0 });
        sent += 1;
        this.logger?.info(
          `运维提醒已发送到群 ${maskOpenId(groupId)}（${event.system}/${event.phase}）。`,
        );
      } catch (error) {
        failed.push(maskOpenId(groupId));
        // QQApiError 的 message 里可能带完整群 openid；这里只记错误码/状态。
        const reason = error?.code
          ? `code ${error.code}`
          : error?.status
            ? `HTTP ${error.status}`
            : '发送失败';
        this.logger?.warn(`运维提醒发送失败（群 ${maskOpenId(groupId)}）：${reason}`);
      }
    }

    if (sent > 0) {
      this.store.record(event, { sent, at: this.now() });
    }
    return {
      duplicate: false,
      system: event.system,
      phase: event.phase,
      updateId: event.updateId,
      sent,
      failed,
      groups: groups.length,
    };
  }
}

function optionalText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function optionalInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  const rounded = Math.round(number);
  return rounded < min || rounded > max ? 0 : rounded;
}

function optionalIso(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

function formatDuration(startedAt, now) {
  const start = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt ?? '');
  const end = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return '';
  }
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function compact(lines) {
  return lines.filter((line) => Boolean(line));
}
