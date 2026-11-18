import { readFileSync } from 'node:fs';

/**
 * 按群配置的入群、被踢、主动退群文案。
 * 官方 QQ 机器人不保证下发普通成员进退群事件；这份配置供事件桥接或后续接入使用。
 */

export function loadGroupNotices(path) {
  try {
    const payload = JSON.parse(readFileSync(path, 'utf8'));
    return normalizeGroupNotices(payload);
  } catch {
    return { groups: {} };
  }
}

export function normalizeGroupNotices(input) {
  const groups = {};
  if (!input || typeof input !== 'object' || !input.groups || typeof input.groups !== 'object') {
    return { groups };
  }
  for (const [groupId, value] of Object.entries(input.groups)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const notice = {};
    for (const kind of ['welcome', 'kick', 'leave']) {
      const text = typeof value[kind] === 'string' ? value[kind].trim() : '';
      if (text) {
        notice[kind] = text;
      }
    }
    if (Object.keys(notice).length > 0) {
      groups[groupId] = {
        name: typeof value.name === 'string' ? value.name.trim() : '',
        ...notice,
      };
    }
  }
  return { groups };
}

export function renderGroupNotice(template, { name = '', id = '', group = '' } = {}) {
  return String(template ?? '')
    .replaceAll('{name}', name || '新成员')
    .replaceAll('{id}', id || '未知')
    .replaceAll('{group}', group)
    .replaceAll('【发送者名片】', name || '新成员')
    .replaceAll('【发送者昵称】', name || '新成员')
    .replaceAll('【发送者QQ】', id || '未知')
    .replaceAll('【艾特】', name || '新成员')
    .replaceAll('【换行】', '\n');
}

export function resolveGroupNotice(notices, groupId, kind, vars) {
  const template = notices?.groups?.[groupId]?.[kind];
  return template ? renderGroupNotice(template, vars) : '';
}
