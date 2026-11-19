import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCommand } from '../src/commands.mjs';
import { GroupLinkTokenStore } from '../src/group-link.mjs';

const config = {
  weather: { city: '上海' },
  yct: {
    baseUrl: 'http://127.0.0.1:3300',
    providerId: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-test',
  },
  link: {
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
  },
};
const logger = { warn() {} };
const c2c = { kind: 'c2c', userId: 'qq-open-id', userName: '测试' };
const group = {
  kind: 'group',
  groupId: 'group-1',
  userId: 'member-open-id',
  memberOpenId: 'member-open-id',
  userName: '测试',
};

test('私聊 /绑定 生成一次性网页链接', async () => {
  let request;
  const result = await handleCommand({
    text: '/绑定',
    config,
    logger,
    context: c2c,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            url: 'https://ldpass.example.com/account/link/qq?token=abc',
            expiresAt: '2026-11-19T10:05:00.000Z',
          };
        },
      };
    },
  });

  assert.equal(request.url, 'https://ldpass.example.com/api/internal/qq-link/token');
  assert.equal(request.options.headers.Authorization, 'Bearer link-secret');
  assert.deepEqual(JSON.parse(request.options.body), {
    openId: 'qq-open-id',
    scope: 'c2c',
    groupOpenId: null,
  });
  assert.match(result.reply, /account\/link\/qq\?token=abc/);
});

test('群聊 /绑定 使用 member_openid 和 group_openid 生成链接', async () => {
  let request;
  const result = await handleCommand({
    text: '/绑定',
    config,
    logger,
    context: group,
    groupTokens: new GroupLinkTokenStore(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            url: 'https://ldpass.example.com/account/link/qq?token=group-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          };
        },
      };
    },
  });

  assert.equal(request.url, 'https://ldpass.example.com/api/internal/qq-link/token');
  assert.equal(request.options.headers.Authorization, 'Bearer link-secret');
  assert.deepEqual(JSON.parse(request.options.body), {
    openId: 'member-open-id',
    scope: 'group',
    groupOpenId: 'group-1',
  });
  assert.match(result.reply, /account\/link\/qq\?token=group-token/);
});

test('私聊 /绑定 绑定码', async () => {
  const result = await handleCommand({
    text: '/绑定 K7M2-9QXF',
    config,
    logger,
    context: c2c,
    fetchImpl: async (url) => {
      assert.match(url, /\/api\/internal\/qq-link\/consume$/);
      return {
        ok: true,
        async json() {
          return { ok: true, link: { id: 'link-1', username: '小明', scope: 'c2c' } };
        },
      };
    },
  });
  assert.match(result.reply, /已绑定到临东通账号：@小明/);
});

test('/我的绑定 和 /解绑 确认', async () => {
  const bound = await handleCommand({
    text: '/我的绑定',
    config,
    logger,
    context: c2c,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { ok: true, link: { id: 'link-1', username: '小明', scope: 'c2c' } };
      },
    }),
  });
  assert.match(bound.reply, /@小明/);

  const prompt = await handleCommand({ text: '/解绑', config, logger, context: c2c });
  assert.match(prompt.reply, /\/解绑 确认/);

  const unlinked = await handleCommand({
    text: '/解绑 确认',
    config,
    logger,
    context: c2c,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });
  assert.match(unlinked.reply, /已解除/);
});

test('绑定接口失败时返回临东通提示', async () => {
  const result = await handleCommand({
    text: '/绑定 K7M2-9QXF',
    config,
    logger,
    context: c2c,
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async json() {
        return { ok: false, error: 'code_expired', message: '绑定码已过期，请重新生成。' };
      },
    }),
  });
  assert.match(result.reply, /绑定码已过期/);
});
