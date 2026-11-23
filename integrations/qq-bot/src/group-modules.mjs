import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  alwaysOnCommands,
  commandLabels,
  commandModuleById,
  defaultModuleEnabled,
  isEditableModule,
  moduleById,
} from './modules.mjs';
import { maskOpenId } from './log.mjs';

/**
 * 按群功能开关的存储层。
 *
 * - 文件默认 state/group-modules.json，不随部署更新被覆盖；
 * - 默认值写在 modules.mjs 的注册表里，文件只存覆盖项；
 * - 没有文件、没有群配置时，resolve() 返回注册表默认值，行为与升级前一致；
 * - 机器人是唯一写入者，写入用临时文件 + rename，读取按 mtime 热加载。
 */
export class GroupModuleStore {
  constructor({ path = '', auditPath = '', aliases, logger, checkIntervalMs = 1000 } = {}) {
    this.path = path;
    this.auditPath = auditPath || (path ? join(dirname(path), 'module-audit.jsonl') : '');
    this.aliases = aliases ?? new Map();
    this.logger = logger;
    this.checkIntervalMs = checkIntervalMs;
    this.data = emptyConfig();
    this.mtimeMs = 0;
    this.lastCheckAt = 0;
    this.load();
  }

  load() {
    if (!this.path || !existsSync(this.path)) {
      this.data = emptyConfig();
      this.mtimeMs = 0;
      return this.data;
    }
    try {
      this.data = normalizeConfig(JSON.parse(readFileSync(this.path, 'utf8')), this.logger);
      this.mtimeMs = statSync(this.path).mtimeMs;
    } catch (error) {
      this.logger?.warn(`读取群功能配置失败，先使用默认值：${error.message}`);
      this.data = emptyConfig();
      this.mtimeMs = 0;
    }
    return this.data;
  }

  /** 每条群消息调用一次；最多每秒 stat 一次，避免热路径频繁碰磁盘。 */
  reloadIfChanged() {
    if (!this.path) {
      return this.data;
    }
    const now = Date.now();
    if (now - this.lastCheckAt < this.checkIntervalMs) {
      return this.data;
    }
    this.lastCheckAt = now;

    let nextMtime = 0;
    try {
      nextMtime = statSync(this.path).mtimeMs;
    } catch {
      // 文件被删除等价于恢复默认；只处理一次，避免每秒重复清空。
      if (this.mtimeMs !== 0) {
        this.logger?.warn('群功能配置已被删除，恢复默认开关。');
        this.data = emptyConfig();
        this.mtimeMs = 0;
      }
      return this.data;
    }
    if (nextMtime === this.mtimeMs) {
      return this.data;
    }

    try {
      this.data = normalizeConfig(JSON.parse(readFileSync(this.path, 'utf8')), this.logger);
      this.mtimeMs = nextMtime;
      this.logger?.info('群功能配置已重新加载。');
    } catch (error) {
      // 写坏了也不要把正在生效的配置清空，保留上一份可用的数据。
      this.mtimeMs = nextMtime;
      this.logger?.warn(`群功能配置解析失败，继续使用上一份：${error.message}`);
    }
    return this.data;
  }

  findGroupKey(groupId) {
    const id = String(groupId ?? '').trim();
    if (!id) {
      return '';
    }
    if (this.data.groups[id]) {
      return id;
    }
    const legacy = this.aliases.get(id);
    if (legacy && this.data.groups[legacy]) {
      return legacy;
    }
    for (const [openid, alias] of this.aliases) {
      if (alias === id && this.data.groups[openid]) {
        return openid;
      }
    }
    return '';
  }

  entryForWrite(groupId) {
    const existing = this.findGroupKey(groupId);
    if (existing) {
      return { key: existing, entry: this.data.groups[existing] };
    }
    const key = this.aliases.get(groupId) ?? String(groupId ?? '').trim();
    if (!key) {
      return null;
    }
    const entry = { modules: {}, commands: {}, locked: [], updatedAt: '', updatedBy: '' };
    this.data.groups[key] = entry;
    return { key, entry };
  }

  /**
   * 解析一个群的有效开关。
   * 优先级：群指令覆盖 > 群模块覆盖 > 全局 defaults > 注册表默认值。
   */
  resolve(groupId) {
    const key = this.findGroupKey(groupId);
    const entry = key ? this.data.groups[key] : null;
    const modules = {};
    for (const [moduleId] of moduleById) {
      modules[moduleId] = resolveModuleValue(moduleId, entry, this.data.defaults);
    }
    modules['ask.basics'] = true;

    const commands = {};
    for (const [commandId, moduleId] of commandModuleById) {
      const explicit = entry?.commands?.[commandId];
      const fallback = this.data.defaults.commands?.[commandId];
      commands[commandId] = explicit ?? fallback ?? modules[moduleId] ?? true;
    }

    return {
      groupId: String(groupId ?? ''),
      key,
      name: entry?.name ?? '',
      modules,
      commands,
      locked: new Set(Array.isArray(entry?.locked) ? entry.locked : []),
      updatedAt: entry?.updatedAt ?? '',
      updatedBy: entry?.updatedBy ?? '',
    };
  }

  isEnabled(policy, moduleId) {
    return Boolean(policy?.modules?.[moduleId]);
  }

  isCommandEnabled(policy, commandId) {
    if (alwaysOnCommands[commandId]) {
      return true;
    }
    return policy?.commands?.[commandId] !== false;
  }

  isLocked(policy, targetId) {
    if (!policy?.locked?.has) {
      return false;
    }
    if (policy.locked.has(targetId)) {
      return true;
    }
    const moduleId = commandModuleById.get(targetId);
    return Boolean(moduleId) && policy.locked.has(moduleId);
  }

  /**
   * 修改一个模块或指令。返回 { ok, changed, locked }，由调用方拼回复。
   * 常驻项和未注册的 id 一律拒绝。
   */
  setValue(groupId, target, enabled, actor = {}) {
    if (target?.type === 'always') {
      return { ok: false, reason: 'always', label: commandLabels[target.commandId] };
    }
    if (target?.type === 'module') {
      return this.setModule(groupId, target.module.id, enabled, actor);
    }
    if (target?.type === 'command') {
      return this.setCommand(groupId, target.commandId, enabled, actor);
    }
    return { ok: false, reason: 'unknown' };
  }

  setModule(groupId, moduleId, enabled, actor = {}) {
    if (!moduleById.has(moduleId)) {
      return { ok: false, reason: 'unknown' };
    }
    if (!isEditableModule(moduleId)) {
      return { ok: false, reason: 'always', label: moduleById.get(moduleId)?.label ?? moduleId };
    }
    const policy = this.resolve(groupId);
    if (this.isLocked(policy, moduleId)) {
      return { ok: false, reason: 'locked', label: moduleById.get(moduleId)?.label ?? moduleId };
    }
    const explicit = this.explicitModuleValue(groupId, moduleId);
    if (explicit === enabled) {
      return { ok: true, changed: false, moduleId, label: moduleById.get(moduleId)?.label };
    }
    // 默认开启且当前已经生效的模块再“开”一次不需要写配置；默认关闭的模块“关”要显式落盘，
    // 否则环境变量种子群会把这次关闭覆盖掉。
    if (explicit === undefined && enabled && policy.modules[moduleId] === true) {
      return { ok: true, changed: false, moduleId, label: moduleById.get(moduleId)?.label };
    }
    const found = this.entryForWrite(groupId);
    if (!found) {
      return { ok: false, reason: 'unknown' };
    }
    const previous = policy.modules[moduleId];
    found.entry.modules[moduleId] = enabled;
    this.touch(found.entry, actor);
    this.persist();
    this.logger?.info(
      `群 ${maskOpenId(found.key)} ${enabled ? '打开' : '关闭'}模块「${
        moduleById.get(moduleId)?.label ?? moduleId
      }」（${actor.role ?? 'unknown'}）。`,
    );
    this.audit({
      group: found.key,
      target: moduleId,
      from: previous,
      to: enabled,
      actor,
    });
    return { ok: true, changed: true, moduleId, label: moduleById.get(moduleId)?.label };
  }

  setCommand(groupId, commandId, enabled, actor = {}) {
    const moduleId = commandModuleById.get(commandId);
    if (!moduleId || !commandLabels[commandId]) {
      return { ok: false, reason: 'unknown' };
    }
    const policy = this.resolve(groupId);
    if (this.isLocked(policy, commandId) || this.isLocked(policy, moduleId)) {
      return {
        ok: false,
        reason: 'locked',
        label: commandLabels[commandId],
      };
    }
    const found = this.entryForWrite(groupId);
    if (!found) {
      return { ok: false, reason: 'unknown' };
    }
    const previous = policy.commands[commandId];
    if (previous === enabled) {
      return { ok: true, changed: false, commandId, label: commandLabels[commandId] };
    }
    found.entry.commands[commandId] = enabled;
    this.touch(found.entry, actor);
    this.persist();
    this.logger?.info(
      `群 ${maskOpenId(found.key)} ${enabled ? '打开' : '关闭'}指令「${commandLabels[commandId]}」（${
        actor.role ?? 'unknown'
      }）。`,
    );
    this.audit({
      group: found.key,
      target: commandId,
      from: previous,
      to: enabled,
      actor,
    });
    return { ok: true, changed: true, commandId, label: commandLabels[commandId] };
  }

  resetGroup(groupId, actor = {}) {
    const key = this.findGroupKey(groupId);
    if (!key) {
      return { ok: true, changed: false };
    }
    delete this.data.groups[key];
    this.persist();
    this.logger?.info(`群 ${maskOpenId(key)} 清除自定义开关，恢复默认。`);
    this.audit({ group: key, target: '*', from: 'custom', to: 'default', actor });
    return { ok: true, changed: true, key };
  }

  touch(entry, actor) {
    entry.updatedAt = new Date().toISOString();
    entry.updatedBy = actor.role ? `role:${actor.role}` : 'unknown';
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
      this.mtimeMs = statSync(this.path).mtimeMs;
    } catch (error) {
      this.logger?.warn(`保存群功能配置失败：${error.message}`);
    }
  }

  audit({ group, target, from, to, actor = {} }) {
    if (!this.auditPath) {
      return;
    }
    const line = JSON.stringify({
      at: new Date().toISOString(),
      group: maskOpenId(String(group ?? '')),
      target,
      from,
      to,
      actorRole: actor.role ?? '',
      actorName: actor.name ?? '',
      actorOpenId: maskOpenId(String(actor.openId ?? '')),
    });
    try {
      mkdirSync(dirname(this.auditPath), { recursive: true });
      rotateIfNeeded(this.auditPath);
      writeFileSync(this.auditPath, `${line}\n`, { encoding: 'utf8', flag: 'a' });
    } catch (error) {
      this.logger?.warn(`写入群功能审计失败：${error.message}`);
    }
  }

  /**
   * 列出真正开启了某个模块的群，并统一换成可发送的 group_openid。
   *
   * 配置文件可能按旧群号（QQ_BOT_GROUP_ALIASES 的值）作 key，这里会反查回 openid；
   * 没有别名映射的 key 按原值返回，发送失败时由调用方记录日志。
   */
  listEnabledGroups(moduleId) {
    this.reloadIfChanged();
    const openids = new Set();
    for (const key of Object.keys(this.data.groups)) {
      const policy = this.resolve(key);
      if (policy.modules?.[moduleId] !== true) {
        continue;
      }
      const openid = this.openIdForGroupKey(key);
      if (openid) {
        openids.add(openid);
      }
    }
    return [...openids];
  }

  hasEnabledGroups(moduleId) {
    return this.listEnabledGroups(moduleId).length > 0;
  }

  /** 只返回显式写入的模块值；没有配置时返回 undefined，不会把默认值当成显式开关。 */
  explicitModuleValue(groupId, moduleId) {
    const key = this.findGroupKey(groupId);
    if (key) {
      return this.data.groups[key]?.modules?.[moduleId];
    }
    const direct = String(groupId ?? '').trim();
    return this.data.groups[direct]?.modules?.[moduleId];
  }

  /** 把配置里的群 key（可能是旧群号）换回 group_openid。 */
  resolveGroupOpenId(groupId) {
    const key = this.findGroupKey(groupId);
    return this.openIdForGroupKey(key || groupId);
  }

  openIdForGroupKey(key) {
    const text = String(key ?? '').trim();
    if (!text) {
      return '';
    }
    for (const [openid, legacy] of this.aliases) {
      if (legacy === text && openid) {
        return openid;
      }
    }
    return text;
  }

  /** 只读摘要，给 --check 和排障用。 */
  describeGroups() {
    return Object.entries(this.data.groups).map(([key, entry]) => ({
      key,
      name: entry.name ?? '',
      modules: entry.modules ?? {},
      commands: entry.commands ?? {},
      locked: entry.locked ?? [],
      updatedAt: entry.updatedAt ?? '',
    }));
  }
}

function resolveModuleValue(moduleId, entry, defaults) {
  const explicit = entry?.modules?.[moduleId];
  if (typeof explicit === 'boolean') {
    return explicit;
  }
  const fallback = defaults?.modules?.[moduleId];
  if (typeof fallback === 'boolean') {
    return fallback;
  }
  return defaultModuleEnabled(moduleId);
}

function emptyConfig() {
  return { version: 1, defaults: { modules: {}, commands: {} }, groups: {} };
}

/**
 * 只接受注册表认识的 id 和布尔值；未知字段丢掉并只告警一次，
 * 避免手写 JSON 的小错误把整份配置废掉。
 */
export function normalizeConfig(input, logger) {
  const data = emptyConfig();
  if (!input || typeof input !== 'object') {
    return data;
  }
  const warned = new Set();
  const warnOnce = (key) => {
    if (!warned.has(key)) {
      warned.add(key);
      logger?.warn(`群功能配置里的「${key}」不是可识别的模块或指令，已忽略。`);
    }
  };

  data.version = Number.isInteger(input.version) ? input.version : 1;

  const defaults = input.defaults;
  if (defaults && typeof defaults === 'object') {
    for (const [moduleId, value] of Object.entries(defaults.modules ?? {})) {
      if (!moduleById.has(moduleId) || !isEditableModule(moduleId)) {
        warnOnce(moduleId);
        continue;
      }
      if (typeof value === 'boolean') {
        data.defaults.modules[moduleId] = value;
      }
    }
    for (const [commandId, value] of Object.entries(defaults.commands ?? {})) {
      if (!commandModuleById.has(commandId)) {
        warnOnce(commandId);
        continue;
      }
      if (typeof value === 'boolean') {
        data.defaults.commands[commandId] = value;
      }
    }
  }

  const groups = input.groups;
  if (groups && typeof groups === 'object') {
    for (const [groupId, raw] of Object.entries(groups)) {
      if (!raw || typeof raw !== 'object' || !groupId.trim()) {
        continue;
      }
      const entry = { modules: {}, commands: {}, locked: [], updatedAt: '', updatedBy: '' };
      if (typeof raw.name === 'string') {
        entry.name = raw.name.trim().slice(0, 40);
      }
      for (const [moduleId, value] of Object.entries(raw.modules ?? {})) {
        if (!moduleById.has(moduleId) || !isEditableModule(moduleId)) {
          warnOnce(moduleId);
          continue;
        }
        if (typeof value === 'boolean') {
          entry.modules[moduleId] = value;
        }
      }
      for (const [commandId, value] of Object.entries(raw.commands ?? {})) {
        if (!commandModuleById.has(commandId)) {
          warnOnce(commandId);
          continue;
        }
        if (typeof value === 'boolean') {
          entry.commands[commandId] = value;
        }
      }
      if (Array.isArray(raw.locked)) {
        entry.locked = raw.locked.filter(
          (id) =>
            typeof id === 'string' &&
            (moduleById.has(id) || Boolean(commandModuleById.get(id)) || alwaysOnCommands[id]),
        );
      }
      if (typeof raw.updatedAt === 'string') {
        entry.updatedAt = raw.updatedAt;
      }
      if (typeof raw.updatedBy === 'string') {
        entry.updatedBy = raw.updatedBy;
      }
      data.groups[groupId] = entry;
    }
  }

  return data;
}

function rotateIfNeeded(path, limit = 2 * 1024 * 1024) {
  try {
    if (statSync(path).size < limit) {
      return;
    }
    renameSync(path, `${path}.1`);
  } catch {
    // 文件不存在或轮转失败都不影响本次追加。
  }
}
