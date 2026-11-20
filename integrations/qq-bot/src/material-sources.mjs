import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 按群保存的物料数据源。
 *
 * - `server`：服务器真实线网（默认），19 个系统模板都可用；
 * - `sample`：Rail Map Painter 沈阳示例线网，只开放地铁物料，必须带许可标注。
 *
 * 单独一个 JSON 文件（默认 `state/material-sources.json`），不跟模块开关混在一起：
 * 模块开关由 `/模块` 维护、这个值由 `/数据源` 维护，写坏一个不影响另一个。
 * 写入使用临时文件 + rename，读取在构造时完成；机器人是唯一写入者。
 */

export const MATERIAL_SOURCE_SERVER = 'server';
export const MATERIAL_SOURCE_SAMPLE = 'sample';

export const materialSourceValues = [MATERIAL_SOURCE_SERVER, MATERIAL_SOURCE_SAMPLE];

export const materialSourceLabels = {
  [MATERIAL_SOURCE_SERVER]: '服务器线网',
  [MATERIAL_SOURCE_SAMPLE]: '沈阳示例线网',
};

/** 把外部输入（配置 / 文件 / 命令参数）收敛成合法的数据源；非法值返回 ''。 */
export function normalizeMaterialSource(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    text === MATERIAL_SOURCE_SERVER ||
    text === '真实' ||
    text === '服务器' ||
    text === '服务器线网'
  ) {
    return MATERIAL_SOURCE_SERVER;
  }
  if (
    text === MATERIAL_SOURCE_SAMPLE ||
    text === '示例' ||
    text === '示例线网' ||
    text === '沈阳' ||
    text === '沈阳示例线网'
  ) {
    return MATERIAL_SOURCE_SAMPLE;
  }
  return '';
}

export function materialSourceLabel(value) {
  return materialSourceLabels[normalizeMaterialSource(value)] ?? materialSourceLabels.server;
}

/** 是否是需要许可标注的示例线网。 */
export function isSampleMaterialSource(value) {
  return normalizeMaterialSource(value) === MATERIAL_SOURCE_SAMPLE;
}

export class MaterialSourceStore {
  constructor({ path = '', logger } = {}) {
    this.path = path;
    this.logger = logger;
    this.data = emptyConfig();
    this.load();
  }

  load() {
    if (!this.path || !existsSync(this.path)) {
      this.data = emptyConfig();
      return this.data;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch (error) {
      // 文件损坏时回退默认（server），但不要删除文件：留给人工排查，下一次写入会覆盖。
      this.logger?.warn(`读取物料数据源配置失败，先按默认服务器线网处理：${error.message}`);
      this.data = emptyConfig();
      return this.data;
    }
    this.data = normalizeConfig(parsed, this.logger);
    return this.data;
  }

  getSource(groupId) {
    const entry = this.data.groups[String(groupId ?? '').trim()];
    return normalizeMaterialSource(entry?.source) || MATERIAL_SOURCE_SERVER;
  }

  getEntry(groupId) {
    const entry = this.data.groups[String(groupId ?? '').trim()];
    return entry ? { ...entry } : null;
  }

  /**
   * 写入一个群的数据源。返回 { ok, changed, before, source, entry }，
   * 由调用方负责权限校验和回复文案。
   */
  setSource(groupId, source, actor = {}) {
    const key = String(groupId ?? '').trim();
    if (!key) {
      return { ok: false, reason: 'missing_group' };
    }
    const next = normalizeMaterialSource(source);
    if (!next) {
      return { ok: false, reason: 'invalid_source' };
    }
    const before = this.getSource(key);
    if (before === next) {
      return { ok: true, changed: false, before, source: next, entry: this.getEntry(key) };
    }
    const entry = {
      source: next,
      updatedAt: new Date().toISOString(),
      updatedByRole: normalizeRole(actor.role),
      updatedByName: String(actor.name ?? '').slice(0, 40),
    };
    this.data.groups[key] = entry;
    this.persist();
    return { ok: true, changed: true, before, source: next, entry: { ...entry } };
  }

  /** 只读摘要，给 `--check` 和排障用；群号在这里保持原样，日志里再打码。 */
  describeGroups() {
    return Object.entries(this.data.groups).map(([key, entry]) => ({
      key,
      source: normalizeMaterialSource(entry.source) || MATERIAL_SOURCE_SERVER,
      updatedAt: entry.updatedAt ?? '',
      updatedByRole: entry.updatedByRole ?? '',
      updatedByName: entry.updatedByName ?? '',
    }));
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
      this.logger?.warn(`保存物料数据源配置失败：${error.message}`);
    }
  }
}

function emptyConfig() {
  return { version: 1, groups: {} };
}

/** 只接受已知字段和合法数据源；未知字段直接丢弃，避免手写 JSON 影响读取。 */
export function normalizeConfig(input, logger) {
  const data = emptyConfig();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    logger?.warn('物料数据源配置不是 JSON 对象，已按默认服务器线网处理。');
    return data;
  }
  data.version = Number.isInteger(input.version) ? input.version : 1;
  const groups = input.groups;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    return data;
  }
  for (const [groupId, raw] of Object.entries(groups)) {
    const key = String(groupId ?? '').trim();
    if (!key || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const source = normalizeMaterialSource(raw.source);
    if (!source) {
      logger?.warn(`物料数据源配置里群 ${key} 的 source 不合法，已忽略该群。`);
      continue;
    }
    data.groups[key] = {
      source,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      updatedByRole: typeof raw.updatedByRole === 'string' ? raw.updatedByRole : '',
      updatedByName: typeof raw.updatedByName === 'string' ? raw.updatedByName : '',
    };
  }
  return data;
}

function normalizeRole(value) {
  const role = String(value ?? '').toLowerCase();
  return role === 'owner' || role === 'admin' || role === 'member' ? role : 'unknown';
}

// ---------------------------------------------------------------------------
// 进程内实例：bot 会显式构造并传入 store；直接调用指令时按 config 复用。
// ---------------------------------------------------------------------------

const storesByConfig = new WeakMap();
let fallbackStore = null;

export function materialSourceStoreFor(config) {
  if (config && typeof config === 'object') {
    let store = storesByConfig.get(config);
    if (!store) {
      store = new MaterialSourceStore({
        path: config.materials?.sourcePath ?? '',
        logger: config.materials?.logger,
      });
      storesByConfig.set(config, store);
    }
    return store;
  }
  fallbackStore ??= new MaterialSourceStore({ path: '' });
  return fallbackStore;
}

/**
 * 读取一个群的数据源；不传 store 时按 config.materials.sourcePath 复用实例。
 * 默认值固定为 `server`。
 */
export function getMaterialSource(groupId, config, store) {
  return (store ?? materialSourceStoreFor(config)).getSource(groupId);
}

export function setMaterialSource(groupId, source, { config, store, actor } = {}) {
  return (store ?? materialSourceStoreFor(config)).setSource(groupId, source, actor);
}

/** 默认 state 路径下的文件位置；给测试和文档用。 */
export function defaultMaterialSourcePath(botRoot) {
  return join(botRoot, 'state', 'material-sources.json');
}
