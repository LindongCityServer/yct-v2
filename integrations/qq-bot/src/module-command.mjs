import {
  ASK_GROUP_LABEL,
  commandLabel,
  describePolicy,
  moduleLabel,
  resolveTarget,
} from './modules.mjs';

const USAGE = [
  '模块开关用法：',
  '/模块                    查看本群开关',
  '/模块 关 问一问          关闭问一问的五个可关范围',
  '/模块 关 公交            只关「公交与线路」问答',
  '/模块 开 天气            单独打开「天气」指令',
  '/模块 详情 实用工具      查看模块包含哪些指令',
  '/模块 恢复默认          清除本群自定义开关',
  '',
  '群主和群管理员可以调整；单个指令可以覆盖所属模块。',
].join('\n');

/**
 * `/模块` 的命令实现。
 *
 * 这里只处理开关的读写和文案；权限来自事件里的 member_role，
 * 数据落在 GroupModuleStore，指令分发和问一问能力位由 bot.mjs 读取同一份策略。
 */
export function handleModuleCommand({ args = '', context, store, config, limiter } = {}) {
  const groupId = context?.kind === 'group' ? context.groupId : '';
  if (!groupId) {
    return {
      handled: true,
      reply: '功能开关按群保存，只能在群里 @我 设置；单聊沿用默认开关。',
    };
  }

  const parts = String(args ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const action = parts[0] ?? '';

  if (!action) {
    return { handled: true, reply: describePolicy(store.resolve(groupId)) };
  }

  const normalizedAction = normalizeAction(action);
  if (normalizedAction === 'help') {
    return { handled: true, reply: USAGE };
  }
  if (normalizedAction === 'reset') {
    if (!thisCanEdit()) {
      return { handled: true, reply: permissionDenied(context) };
    }
    const limited = takeLimit();
    if (limited) {
      return limited;
    }
    const result = store.resetGroup(groupId, actorOf(context));
    return {
      handled: true,
      reply: result.changed
        ? '已清除本群的自定义开关，恢复默认。发送「/模块」查看当前状态。'
        : '本群没有自定义开关，已经是默认状态。',
    };
  }

  if (normalizedAction === 'toggle') {
    const enabled = normalizeToggle(parts.shift());
    const targetText = parts.join(' ');
    if (!targetText) {
      return { handled: true, reply: '请告诉我要开或关哪个模块，例如「/模块 关 天气」。' };
    }
    const target = resolveTarget(targetText);
    if (!target) {
      return {
        handled: true,
        reply: `没有「${targetText}」这个模块或指令。发送「/模块」查看可调整的项。`,
      };
    }
    if (!thisCanEdit()) {
      return { handled: true, reply: permissionDenied(context) };
    }
    const limited = takeLimit();
    if (limited) {
      return limited;
    }
    return { handled: true, reply: applyToggle({ target, enabled, groupId, context, store }) };
  }

  // 其他写法按“详情”处理：/模块 天气、/模块 详情 天气 都可以。
  const detailTarget = resolveTarget(
    normalizedAction === 'detail' ? parts.slice(1).join(' ') : parts.join(' '),
  );
  if (detailTarget) {
    return { handled: true, reply: describeTarget(detailTarget, store, groupId) };
  }

  return { handled: true, reply: USAGE };

  function thisCanEdit() {
    return canEdit(context, config, store, groupId);
  }

  function takeLimit() {
    if (!limiter) {
      return null;
    }
    const userLimit = limiter.user.take(`module-user:${groupId}:${context.userId}`);
    if (!userLimit.allowed) {
      return {
        handled: true,
        reply: `调整得有点快，请 ${userLimit.retryAfterSec} 秒后再试。`,
      };
    }
    const groupLimit = limiter.group.take(`module-group:${groupId}`);
    if (!groupLimit.allowed) {
      return {
        handled: true,
        reply: `本群调整得有点频繁，请 ${groupLimit.retryAfterSec} 秒后再试。`,
      };
    }
    return null;
  }
}

function applyToggle({ target, enabled, groupId, context, store }) {
  const actor = actorOf(context);
  if (target.type === 'always') {
    return `「${commandLabel(target.commandId)}」是常开功能，不能关闭。`;
  }
  if (target.type === 'module') {
    const result = store.setModule(groupId, target.module.id, enabled, actor);
    return describeChange(result, enabled, target.module.label);
  }
  if (target.type === 'command') {
    const result = store.setCommand(groupId, target.commandId, enabled, actor);
    if (!result.ok) {
      return describeFailure(result);
    }
    if (!result.changed) {
      return `「${result.label}」本来就是${enabled ? '开' : '关'}的。`;
    }
    const moduleId = target.moduleId;
    const policy = store.resolve(groupId);
    const moduleOff = policy.modules[moduleId] === false;
    return [
      `已${enabled ? '打开' : '关闭'}本群的「${result.label}」。`,
      moduleOff
        ? `「${moduleLabel(moduleId)}」整体仍是关闭的，其他指令不会响应。`
        : `发送「/模块 ${enabled ? '关' : '开'} ${result.label}」可恢复。`,
    ].join('');
  }
  if (target.type === 'group') {
    return applyBulk({ target, enabled, groupId, actor, store });
  }
  return '没有识别出要修改的模块。发送「/模块」查看可调整的项。';
}

function applyBulk({ target, enabled, groupId, actor, store }) {
  const changed = [];
  const unchanged = [];
  const locked = [];
  const failed = [];
  for (const moduleId of target.moduleIds) {
    const result = store.setModule(groupId, moduleId, enabled, actor);
    if (!result.ok) {
      if (result.reason === 'locked') {
        locked.push(result.label ?? moduleLabel(moduleId));
      } else if (result.reason !== 'always') {
        failed.push(result.label ?? moduleLabel(moduleId));
      }
      continue;
    }
    if (result.changed) {
      changed.push(result.label ?? moduleLabel(moduleId));
    } else {
      unchanged.push(result.label ?? moduleLabel(moduleId));
    }
  }
  const title = target.group === 'ask' ? ASK_GROUP_LABEL : '指令';
  const lines = [];
  if (changed.length > 0) {
    lines.push(`已${enabled ? '打开' : '关闭'}本群${title}：${changed.join('、')}。`);
  }
  if (locked.length > 0) {
    lines.push(`由机器人管理员锁定，未修改：${locked.join('、')}。`);
  }
  if (failed.length > 0) {
    lines.push(`未能修改：${failed.join('、')}。`);
  }
  if (changed.length === 0 && locked.length === 0 && failed.length === 0) {
    lines.push(`本群${title}本来就是${enabled ? '开' : '关'}的。`);
  } else {
    lines.push('发送「/模块」查看当前状态。');
  }
  return lines.join('\n');
}

function describeChange(result, enabled, fallbackLabel) {
  if (!result.ok) {
    return describeFailure(result);
  }
  const label = result.label ?? fallbackLabel;
  if (!result.changed) {
    return `「${label}」本来就是${enabled ? '开' : '关'}的。`;
  }
  const undo = `发送「/模块 ${enabled ? '关' : '开'} ${label}」可恢复。`;
  return `已${enabled ? '打开' : '关闭'}本群的「${label}」。${undo}`;
}

function describeFailure(result) {
  if (result.reason === 'locked') {
    return `「${result.label ?? '该项'}」由机器人管理员锁定，群里不能修改。`;
  }
  if (result.reason === 'always') {
    return `「${result.label ?? '该项'}」是常开功能，不能关闭。`;
  }
  return '没有识别出要修改的模块。发送「/模块」查看可调整的项。';
}

function describeTarget(target, store, groupId) {
  const policy = store.resolve(groupId);
  if (target.type === 'always') {
    return `「${commandLabel(target.commandId)}」是常开功能，不能关闭。`;
  }
  if (target.type === 'group') {
    return describePolicy(policy);
  }
  if (target.type === 'module') {
    const definition = target.module;
    const enabled = Boolean(policy.modules[definition.id]);
    const locked = store.isLocked(policy, definition.id);
    const lines = [
      `「${definition.label}」：${definition.id === 'ask.basics' ? '常开' : enabled ? '开' : '关'}${
        locked ? '（锁定）' : ''
      }`,
      `包含：${definition.description}`,
    ];
    if (definition.commands?.length) {
      lines.push(
        `指令：${definition.commands
          .map(
            (commandId) =>
              `${commandLabel(commandId)}${policy.commands[commandId] ? '' : '（关）'}`,
          )
          .join('、')}`,
      );
    }
    if (policy.updatedAt) {
      lines.push(`最后修改：${formatTime(policy.updatedAt)}（${policy.updatedBy || '未知'}）`);
    }
    return lines.join('\n');
  }
  if (target.type === 'command') {
    const enabled = policy.commands[target.commandId] !== false;
    const moduleEnabled = policy.modules[target.moduleId] !== false;
    const lines = [
      `「${commandLabel(target.commandId)}」：${enabled ? '开' : '关'}`,
      `所属模块：${moduleLabel(target.moduleId)}（${moduleEnabled ? '开' : '关'}）`,
    ];
    return lines.join('\n');
  }
  return '没有识别出这个模块。';
}

export function canEdit(context, config, store, groupId) {
  if (context?.kind !== 'group' || !groupId) {
    return false;
  }
  const editors = config?.modules?.editors ?? ['owner', 'admin'];
  const role = normalizeRole(context.role);
  if (role !== 'unknown' && editors.includes(role)) {
    return true;
  }
  const admins = config?.modules?.admins;
  if (admins && context.userId) {
    if (admins.has(`${groupId}:${context.userId}`)) {
      return true;
    }
    const key = store.findGroupKey(groupId);
    if (key && admins.has(`${key}:${context.userId}`)) {
      return true;
    }
    const legacy = store.aliases?.get(groupId);
    if (legacy && admins.has(`${legacy}:${context.userId}`)) {
      return true;
    }
  }
  return false;
}

function permissionDenied(context) {
  if (normalizeRole(context?.role) === 'unknown') {
    return '暂时无法确认你的群身份，请联系机器人管理员调整本群开关。';
  }
  return '只有群主或管理员可以调整本群功能开关。';
}

function normalizeRole(value) {
  const role = String(value ?? '').toLowerCase();
  return role === 'owner' || role === 'admin' || role === 'member' ? role : 'unknown';
}

function normalizeAction(value) {
  const text = String(value ?? '').toLowerCase();
  if (['开', '开启', '打开', '启用', 'on', 'enable'].includes(text)) {
    return 'toggle';
  }
  if (['关', '关闭', '停用', 'off', 'disable'].includes(text)) {
    return 'toggle';
  }
  if (['详情', '详细', 'detail', 'info', '状态'].includes(text)) {
    return 'detail';
  }
  if (['恢复默认', '默认', '重置', 'reset', 'default'].includes(text)) {
    return 'reset';
  }
  if (['帮助', 'help', '用法', '?', '？'].includes(text)) {
    return 'help';
  }
  return 'detail';
}

/** 返回 true 表示“开启”，false 表示“关闭”；只在 toggle 动作里调用。 */
function normalizeToggle(value) {
  const text = String(value ?? '').toLowerCase();
  return ['开', '开启', '打开', '启用', 'on', 'enable'].includes(text);
}

function actorOf(context) {
  return {
    role: normalizeRole(context?.role),
    name: String(context?.userName ?? '').slice(0, 40),
    openId: String(context?.userId ?? ''),
  };
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
