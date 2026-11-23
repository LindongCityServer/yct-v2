import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { maskOpenId } from './log.mjs';

/**
 * 运维提醒：雨城通、临东通、QQ 机器人更新开始/结束时，
 * 向开启了 opsReminder 模块的群发一条纯文本通知。
 *
 * 这里不直接连 QQ 网关，只负责校验、生成文案、幂等和按私聊好友发送；
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
    this.data = { version: 1, updates: {}, pending: [] };
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
        this.data = {
          version: 1,
          updates: parsed.updates,
          pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        };
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

  addPending({ userOpenId, content, updateId, phase }, at = this.now()) {
    const id = `${updateId}:${phase}:${userOpenId}`;
    const entry = {
      id,
      userOpenId,
      content,
      updateId,
      phase,
      at: at.toISOString(),
    };
    this.data.pending = this.data.pending.filter((item) => item.id !== id);
    this.data.pending.push(entry);
    this.data.pending = this.data.pending.slice(-50);
    this.persist();
    return entry;
  }

  listPending(userOpenId) {
    return this.data.pending.filter((item) => item.userOpenId === userOpenId);
  }

  removePending(ids) {
    const remove = new Set(ids);
    const before = this.data.pending.length;
    this.data.pending = this.data.pending.filter((item) => !remove.has(item.id));
    if (this.data.pending.length !== before) {
      this.persist();
    }
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

/** 记录给机器人发过私聊的用户；个人认证机器人只能让核心管理员加好友。 */
export class OpsRecipientStore {
  constructor({ path = '', logger, now = () => new Date(), maxUsers = 200 } = {}) {
    this.path = path;
    this.logger = logger;
    this.now = now;
    this.maxUsers = maxUsers;
    this.data = { version: 1, users: {} };
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
        parsed.users &&
        typeof parsed.users === 'object'
      ) {
        this.data = { version: 1, users: parsed.users };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn(`读取运维提醒接收人失败，先按空列表处理：${error.message}`);
      }
    }
    return this.data;
  }

  remember(userOpenId, { source = 'message', at = this.now() } = {}) {
    const id = String(userOpenId ?? '').trim();
    if (!id || id.length > 200) {
      return false;
    }
    const existing = this.data.users[id];
    const nowIso = at.toISOString();
    const lastSeen = Date.parse(existing?.lastSeenAt ?? '');
    const shouldPersist =
      !existing || !Number.isFinite(lastSeen) || at.getTime() - lastSeen >= 60 * 60 * 1000;
    this.data.users[id] = {
      addedAt: existing?.addedAt || nowIso,
      lastSeenAt: nowIso,
      source: existing?.source || source,
    };
    if (shouldPersist) {
      this.prune(at);
      this.persist();
    }
    return true;
  }

  list() {
    return Object.keys(this.data.users);
  }

  count() {
    return this.list().length;
  }

  remove(userOpenId) {
    const id = String(userOpenId ?? '').trim();
    if (!this.data.users[id]) {
      return false;
    }
    delete this.data.users[id];
    this.persist();
    return true;
  }

  prune(now = this.now()) {
    const entries = Object.entries(this.data.users)
      .sort((left, right) =>
        String(right[1]?.lastSeenAt ?? '').localeCompare(String(left[1]?.lastSeenAt ?? '')),
      )
      .slice(0, this.maxUsers);
    this.data.users = Object.fromEntries(entries);
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
      this.logger?.warn(`保存运维提醒接收人失败：${error.message}`);
    }
  }
}

export class OpsReminder {
  constructor({ store, recipientStore, api, logger, now = () => new Date() } = {}) {
    this.store = store;
    this.recipientStore = recipientStore;
    this.api = api;
    this.logger = logger;
    this.now = now;
  }

  rememberRecipient(userOpenId, source = 'message') {
    this.recipientStore?.remember?.(userOpenId, { source });
  }

  listPending(userOpenId) {
    return this.store?.listPending?.(userOpenId) ?? [];
  }

  removePending(ids) {
    this.store?.removePending?.(ids);
  }

  /** 处理一次 /ops 请求；重复的 updateId + phase 不会重复发私聊消息。 */
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

    const recipients = this.recipientStore?.list?.() ?? [];
    if (recipients.length === 0) {
      return {
        duplicate: false,
        system: event.system,
        phase: event.phase,
        updateId: event.updateId,
        sent: 0,
        failed: 0,
        pending: 0,
        reason: 'no_recipients',
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
    const failureCodes = new Set();
    for (const userOpenId of recipients) {
      try {
        await this.api.sendC2CMessage(userOpenId, { content, msg_type: 0 });
        sent += 1;
        this.logger?.info(
          `运维提醒已发送到私聊 ${maskOpenId(userOpenId)}（${event.system}/${event.phase}）。`,
        );
      } catch (error) {
        const code = Number(error?.code) || 0;
        failed.push(maskOpenId(userOpenId));
        if (code) {
          failureCodes.add(code);
        }
        this.store.addPending({
          userOpenId,
          content,
          updateId: event.updateId,
          phase: event.phase,
        });
        // QQApiError 的 message 里可能带完整 openid；这里只记错误码/状态。
        const reason = code ? `code ${code}` : error?.status ? `HTTP ${error.status}` : '发送失败';
        this.logger?.warn(`运维提醒发送失败（私聊 ${maskOpenId(userOpenId)}）：${reason}`);
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
      failureCodes: [...failureCodes],
      pending: failed.length,
      recipients: recipients.length,
      hint: buildFailureHint([...failureCodes]),
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

function buildFailureHint(codes) {
  if (codes.includes(40034105)) {
    return 'QQ 拒绝了主动私聊消息（40034105）：请确认机器人管理员已在机器人资料页开启接收推送，或平台主动消息权限是否开放；通知已保留，私聊机器人发送 /运维 可补发。';
  }
  if (codes.includes(40054013)) {
    return '接收方关闭了机器人主动消息推送；通知已保留，私聊机器人发送 /运维 可补发。';
  }
  if (codes.includes(40034100)) {
    return '主动消息触发频控；通知已保留，稍后再试或私聊机器人发送 /运维 补发。';
  }
  return '';
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
