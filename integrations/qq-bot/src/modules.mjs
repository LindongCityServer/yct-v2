/**
 * 按群功能模块的注册表。
 *
 * 这里是“哪些功能可以被开关”的唯一来源：命令分发、/模块、帮助菜单和配置校验都读它，
 * 不要在别的文件里再维护第二份模块清单。
 *
 * 模块分三类：
 * - always：基本信息，永远开启（帮助、关于、版本、新对话、模块管理本身）；
 * - ask：问一问的内容范围，按 ask.xxx 命名，其中 ask.basics 常开；
 * - commands：本地指令或机器人能力（B 站解析），可以整块关闭，也可以单独覆盖指令。
 */

export const ASK_GROUP_ID = 'ask';
export const ASK_GROUP_LABEL = '问一问';

/** 常驻指令：不在任何可关模块里，关闭会导致群管理失去恢复入口或排障信息。 */
export const alwaysOnCommands = {
  help: { label: '菜单/帮助' },
  about: { label: '关于' },
  version: { label: '版本' },
  modules: { label: '模块管理' },
};

/** 指令 id → 中文名；用于日志、提示和 /模块 详情。 */
export const commandLabels = {
  random: '随机数',
  dice: '掷骰子',
  calc: '计算',
  ccc: '中文电码',
  gb2312: '汉字编码',
  weather: '天气',
  ip: 'IP 属地',
  history: '历史上的今天',
  couplet: '对对联',
  signin: '签到',
  signinboard: '签到榜',
  stats: '发言统计',
  board: '发言榜',
  fortune: '今日运势',
  fortunereset: '重置运势',
  randomplace: '随机地点',
  serverplayers: '在线人数',
  bind: '绑定',
  confirm: '确认绑定',
  mylink: '我的绑定',
  unlink: '解绑',
  help: '帮助',
  about: '关于',
  version: '版本',
  reset: '新对话',
  modules: '模块管理',
  materials: '物料',
  blindbox: '盲盒',
  roadsign: '路牌',
  buildingsign: '楼牌',
  stopsign: '站牌',
  metro: '地铁',
  materialsource: '数据源',
};

const askScopeDefinitions = [
  {
    id: 'ask.basics',
    label: '使用说明',
    editable: false,
    defaultEnabled: true,
    description: '机器人怎么用、怎么绑定、站内服务和 FAQ',
    aliases: ['使用说明', '基础', '说明', 'basics', 'usage'],
  },
  {
    id: 'ask.server',
    label: '临东服资料',
    editable: true,
    defaultEnabled: true,
    description: 'Wiki、服务器在线状态、进服和规则',
    aliases: ['临东服', '临东服资料', '服务器', '服资料', 'wiki', 'server'],
  },
  {
    id: 'ask.transit',
    label: '公交与线路',
    editable: true,
    defaultEnabled: true,
    description: '线路、站点、班次、换乘、票价和路线规划',
    aliases: ['公交', '公交与线路', '线路', '交通', '班次', 'transit', 'bus'],
  },
  {
    id: 'ask.operations',
    label: '公告与运营',
    editable: true,
    defaultEnabled: true,
    description: '运营公告、停运、调整和活动',
    aliases: ['公告', '公告与运营', '运营', '通知', 'operations'],
  },
  {
    id: 'ask.map',
    label: '地图与地点',
    editable: true,
    defaultEnabled: true,
    description: '地点、地址、附近和地图路线',
    aliases: ['地图', '地图与地点', '地点', '附近', 'map'],
  },
  {
    id: 'ask.general',
    label: '通用问答',
    editable: true,
    defaultEnabled: true,
    description: '没有上下文时的通用知识和闲聊',
    aliases: ['通用', '通用问答', '闲聊', '问答', 'general'],
  },
];

const commandModuleDefinitions = [
  // optIn 模块默认关闭，只作为按群可选项：不在帮助里列成“未开启”，由群管理员用 /模块 开启。
  {
    id: 'tools',
    label: '实用工具',
    defaultEnabled: true,
    description: '随机数、骰子、计算、电码、GB2312、天气、IP、历史、对联',
    aliases: ['工具', '实用工具', 'tools'],
    commands: ['random', 'dice', 'calc', 'ccc', 'gb2312', 'weather', 'ip', 'history', 'couplet'],
  },
  {
    id: 'community',
    label: '群互动',
    defaultEnabled: true,
    description: '签到、签到榜、发言统计、发言榜、运势和重抽',
    aliases: ['群互动', '互动', 'community'],
    commands: ['signin', 'signinboard', 'stats', 'board', 'fortune', 'fortunereset'],
  },
  {
    id: 'query',
    label: '查询指令',
    defaultEnabled: true,
    description: '随机地点、在线人数',
    aliases: ['查询', '查询指令', 'query'],
    commands: ['randomplace', 'serverplayers'],
  },
  {
    id: 'link',
    label: '账号绑定',
    defaultEnabled: true,
    description: '群绑定、确认、查看和解绑',
    aliases: ['账号绑定', 'link'],
    commands: ['bind', 'confirm', 'mylink', 'unlink'],
  },
  {
    id: 'bilibili',
    label: '视频解析',
    defaultEnabled: true,
    description: '消息里的 B 站链接自动回复标题、UP 主和封面',
    aliases: ['b站', 'bilibili', '视频解析'],
    commands: [],
  },
  {
    id: 'materials',
    label: '物料盲盒',
    defaultEnabled: true,
    description: '随机生成道路路牌、楼牌、公交站牌和地铁物料，可扫码到工作台继续编辑',
    aliases: ['物料', '物料盲盒', '盲盒', '路牌', '楼牌', '站牌', '地铁', '数据源', 'materials'],
    commands: [
      'materials',
      'blindbox',
      'roadsign',
      'buildingsign',
      'stopsign',
      'metro',
      'materialsource',
    ],
  },
  {
    id: 'notices',
    label: '进退群提示',
    defaultEnabled: true,
    description: '入群欢迎、被踢和退群文案',
    aliases: ['进退群', '进退群提示', '欢迎', 'notices'],
    commands: [],
  },
  {
    id: 'playerEvents',
    label: '玩家进出播报',
    defaultEnabled: false,
    optIn: true,
    description: '玩家进服、退服消息广播到本群（机器人侧需开启同步）',
    aliases: ['玩家播报', '玩家进出', '进服退服', 'player-events', 'playerevents'],
    commands: [],
  },
  {
    id: 'serverMessages',
    label: '服务器消息',
    defaultEnabled: false,
    optIn: true,
    description: '游戏服务器聊天消息广播到本群（机器人侧需开启同步）',
    aliases: ['服务器消息', '服务聊天', '聊天同步', 'serverchat', 'servermessages'],
    commands: [],
  },
];

export const askScopes = askScopeDefinitions.map((scope) => ({ ...scope, group: ASK_GROUP_ID }));

export const moduleDefinitions = [
  ...askScopes,
  ...commandModuleDefinitions.map((definition) => ({ ...definition, group: 'commands' })),
];

/** 可关模块：不含常驻的 ask.basics。 */
export const editableModuleIds = moduleDefinitions
  .filter((definition) => definition.editable !== false)
  .map((definition) => definition.id);

export const moduleById = new Map(
  moduleDefinitions.map((definition) => [definition.id, definition]),
);

export const commandModuleById = new Map();
for (const definition of commandModuleDefinitions) {
  for (const commandId of definition.commands) {
    commandModuleById.set(commandId, definition.id);
  }
}

const moduleAliasIndex = new Map();
for (const definition of moduleDefinitions) {
  moduleAliasIndex.set(defKey(definition.id), definition);
  for (const alias of definition.aliases ?? []) {
    moduleAliasIndex.set(defKey(alias), definition);
  }
}

const commandAliasIndex = new Map();
for (const [commandId, label] of Object.entries(commandLabels)) {
  commandAliasIndex.set(defKey(commandId), commandId);
  commandAliasIndex.set(defKey(label), commandId);
}

/** 常驻指令的自然叫法，避免 /模块 关 菜单 被当成未知项。 */
const alwaysOnAliases = new Map([
  ['菜单', 'help'],
  ['功能', 'help'],
  ['功能列表', 'help'],
  ['关于机器人', 'about'],
  ['新对话', 'reset'],
  ['重置', 'reset'],
  ['模块', 'modules'],
  ['群模块', 'modules'],
]);

function defKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 读取一个模块/指令/问一问整体的当前状态。 */
export function resolveTarget(raw) {
  const key = defKey(raw);
  if (!key) {
    return null;
  }
  if (key === 'ask' || key === '问一问' || key === 'qa') {
    return { type: 'group', group: ASK_GROUP_ID, moduleIds: editableAskScopeIds() };
  }
  if (key === '指令' || key === 'commands' || key === 'command') {
    return {
      type: 'group',
      group: 'commands',
      moduleIds: moduleDefinitions
        .filter((definition) => definition.group === 'commands')
        .map((definition) => definition.id),
    };
  }

  const module = moduleAliasIndex.get(key);
  if (module) {
    return { type: 'module', module };
  }

  const alwaysId = alwaysOnAliases.get(key);
  if (alwaysId) {
    return { type: 'always', commandId: alwaysId };
  }

  const commandId = commandAliasIndex.get(key);
  if (commandId) {
    if (alwaysOnCommands[commandId]) {
      return { type: 'always', commandId };
    }
    const moduleId = commandModuleById.get(commandId);
    if (moduleId) {
      return { type: 'command', commandId, moduleId };
    }
  }

  return null;
}

export function editableAskScopeIds() {
  return askScopes.filter((scope) => scope.editable !== false).map((scope) => scope.id);
}

export function moduleLabel(moduleId) {
  return moduleById.get(moduleId)?.label ?? moduleId;
}

export function commandLabel(commandId) {
  return commandLabels[commandId] ?? commandId;
}

export function defaultModuleEnabled(moduleId) {
  const definition = moduleById.get(moduleId);
  if (!definition) {
    return true;
  }
  return definition.defaultEnabled !== false;
}

/** 配置里只允许出现注册表认识的 id，避免手写 JSON 时拼错后静默失效。 */
export function isKnownModuleOrCommand(id) {
  return moduleById.has(id) || Boolean(commandLabels[id]);
}

export function isEditableModule(moduleId) {
  const definition = moduleById.get(moduleId);
  return Boolean(definition) && definition.editable !== false;
}

/**
 * 按群策略生成 /模块 的展示文本；
 * policy 由 GroupModuleStore.resolve() 返回。
 */
export function describePolicy(policy) {
  const lines = ['本群功能', ASK_GROUP_LABEL];
  for (const scope of askScopes) {
    lines.push(`  · ${scope.label} ${stateText(policy, scope.id, policy.locked)}`);
  }
  lines.push('指令');
  for (const definition of moduleDefinitions.filter((item) => item.group === 'commands')) {
    const partiallyClosed = (definition.commands ?? []).some(
      (commandId) => policy.commands?.[commandId] === false,
    );
    lines.push(
      `  · ${definition.label} ${stateText(policy, definition.id, policy.locked)}${
        partiallyClosed ? '（部分）' : ''
      }`,
    );
  }
  lines.push('群主或管理员可发送「/模块 关 天气」「/模块 开 公交」调整。');
  return lines.join('\n');
}

function stateText(policy, moduleId, locked) {
  if (moduleId === 'ask.basics') {
    return '常开';
  }
  const enabled = Boolean(policy.modules?.[moduleId]);
  const optInHint = !enabled && moduleById.get(moduleId)?.optIn ? '（可选）' : '';
  const lockSuffix = locked?.has?.(moduleId) ? '（锁定）' : '';
  return `${enabled ? '开' : '关'}${optInHint}${lockSuffix}`;
}

/** 某个模块是否被整体锁定（模块本身或它的群组锁定都算）。 */
export function isModuleLocked(policy, moduleId) {
  if (!policy?.locked?.has) {
    return false;
  }
  if (policy.locked.has(moduleId)) {
    return true;
  }
  const definition = moduleById.get(moduleId);
  return Boolean(definition?.group) && policy.locked.has(definition.group);
}

/**
 * 帮助文本：所有功能都开着时沿用原来的完整指令说明；
 * 有功能被关闭时在末尾补一段本群开关，避免成员以为机器人坏了。
 */
export function buildHelpText(policy, baseHelpText) {
  const disabled = [];
  for (const scope of askScopes) {
    if (scope.id !== 'ask.basics' && !policy.modules?.[scope.id]) {
      disabled.push(scope.label);
    }
  }
  for (const definition of moduleDefinitions.filter((item) => item.group === 'commands')) {
    // 可选模块默认关，不在帮助里当作“功能被关闭”刷一长串；群管理员用 /模块 查看和开启。
    if (definition.optIn) {
      continue;
    }
    if (!policy.modules?.[definition.id]) {
      disabled.push(definition.label);
      continue;
    }
    const disabledCommands = (definition.commands ?? []).filter(
      (commandId) => policy.commands?.[commandId] === false,
    );
    for (const commandId of disabledCommands) {
      disabled.push(commandLabel(commandId));
    }
  }
  if (disabled.length === 0) {
    return baseHelpText;
  }
  return [
    baseHelpText,
    '',
    `本群未开启：${disabled.join('、')}。`,
    '发送「/模块」查看开关，群主或管理员可以调整。',
  ].join('\n');
}
