import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeGroupNotices,
  renderGroupNotice,
  resolveGroupNotice,
} from '../src/notices.mjs';

test('按群选择入群、被踢和退群文案', () => {
  const notices = normalizeGroupNotices({
    groups: {
      '1062878744': {
        name: '临东茶话会',
        welcome: '欢迎 {name}（{id}）',
        kick: '{name} 被踢出',
        leave: '{name} 离开了',
      },
    },
  });
  assert.equal(
    resolveGroupNotice(notices, '1062878744', 'welcome', { name: '小明', id: '10001' }),
    '欢迎 小明（10001）',
  );
  assert.equal(
    resolveGroupNotice(notices, '1062878744', 'kick', { name: '小明', id: '10001' }),
    '小明 被踢出',
  );
  assert.equal(resolveGroupNotice(notices, 'other', 'welcome', { name: '小明' }), '');
});

test('兼容旧文案占位符', () => {
  assert.equal(
    renderGroupNotice('【发送者名片】（【发送者QQ】）离开了本群', { name: '小明', id: '10001' }),
    '小明（10001）离开了本群',
  );
  assert.equal(renderGroupNotice('欢迎【艾特】【换行】hhh', { name: '小明' }), '欢迎小明\nhhh');
});
