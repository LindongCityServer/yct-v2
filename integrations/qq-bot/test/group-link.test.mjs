import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCommand } from '../src/commands.mjs';
import {
  extractTokenFromUrl,
  GroupLinkTokenStore,
  isConfirmCode,
  normalizeConfirmCode,
} from '../src/group-link.mjs';
import { QqLinkClient, QqLinkError } from '../src/ldpass-link.mjs';

const FUTURE = '2099-01-01T00:00:00.000Z';

function createConfig(link = {}) {
  return {
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
      groupEnabled: true,
      groupTokenTtlMs: 300_000,
      groupTokenCacheMax: 10_000,
      ...link,
    },
  };
}

function group(overrides = {}) {
  return {
    kind: 'group',
    groupId: 'group-1',
    memberOpenId: 'member-1',
    userId: 'member-1',
    userName: '测试',
    ...overrides,
  };
}

const c2c = { kind: 'c2c', userId: 'c2c-openid', userName: '测试' };

function createLogger() {
  const lines = [];
  const push = (...args) => lines.push(args.map((item) => String(item)).join(' '));
  return {
    lines,
    debug: push,
    info: push,
    warn: push,
    error: push,
  };
}

function createFakeClient(overrides = {}) {
  return {
    enabled: true,
    createGroupToken: async () => ({
      url: 'https://ldpass.example.com/account/link/qq?token=cached-token',
      expiresAt: FUTURE,
    }),
    confirmGroup: async () => ({ id: 'link-1', username: '小明', scope: 'group' }),
    resolveGroup: async () => null,
    unlinkGroup: async () => true,
    ...overrides,
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function seedToken(store, token = 'cached-token') {
  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-1',
    token,
    expiresAt: FUTURE,
  });
}

test('从绑定链接里用 URL 解析器取 token', () => {
  assert.equal(
    extractTokenFromUrl('https://ldpass.example.com/link?token=abc%20123&next=1'),
    'abc 123',
  );
  assert.equal(
    extractTokenFromUrl('https://ldpass.example.com/link?next=token%3Dfake&token=real'),
    'real',
  );
  assert.equal(extractTokenFromUrl('https://ldpass.example.com/link'), '');
  assert.equal(extractTokenFromUrl('not a url'), '');
  assert.equal(extractTokenFromUrl('ftp://ldpass.example.com/link?token=abc'), '');
});

test('确认码只接受 6 位数字，并兼容全角/零宽字符', () => {
  assert.equal(normalizeConfirmCode(' ４８２９１３ '), '482913');
  assert.equal(normalizeConfirmCode('48\u200b2913'), '482913');
  assert.equal(normalizeConfirmCode('\u3000482913\u3000'), '482913');
  assert.equal(isConfirmCode('482913'), true);
  assert.equal(isConfirmCode('48291'), false);
  assert.equal(isConfirmCode('4829137'), false);
  assert.equal(isConfirmCode('482 913'), false);
  assert.equal(isConfirmCode('abcdef'), false);
});

test('群 token 缓存按群和成员隔离，同一成员重新绑定覆盖旧 token', () => {
  let now = 0;
  const store = new GroupLinkTokenStore({ ttlMs: 300_000, maxEntries: 10, now: () => now });
  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-1',
    token: 'token-a',
    expiresAt: now + 600_000,
  });
  assert.equal(store.get('group-1', 'member-1').token, 'token-a');
  assert.equal(store.get('group-2', 'member-1'), null);
  assert.equal(store.get('group-1', 'member-2'), null);

  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-1',
    token: 'token-b',
    expiresAt: now + 600_000,
  });
  assert.equal(store.get('group-1', 'member-1').token, 'token-b');
  assert.equal(store.size, 1);
});

test('群 token 缓存以服务端 expiresAt 和本地 TTL 中更早者为准', () => {
  let now = 0;
  const store = new GroupLinkTokenStore({ ttlMs: 300_000, now: () => now });
  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-1',
    token: 'token-a',
    expiresAt: now + 3_600_000,
  });
  now = 299_999;
  assert.equal(store.get('group-1', 'member-1').token, 'token-a');
  now = 300_000;
  assert.equal(store.get('group-1', 'member-1'), null);

  now = 0;
  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-2',
    token: 'token-b',
    expiresAt: now + 1_000,
  });
  now = 1_000;
  assert.equal(store.get('group-1', 'member-2'), null);

  now = 0;
  assert.equal(
    store.set({
      groupOpenId: 'group-1',
      memberOpenId: 'member-3',
      token: 'token-c',
      expiresAt: now - 1,
    }),
    false,
  );
});

test('群 token 缓存超限时按最早过期时间淘汰，并先清理过期项', () => {
  let now = 0;
  const store = new GroupLinkTokenStore({ ttlMs: 300_000, maxEntries: 2, now: () => now });
  store.set({ groupOpenId: 'g', memberOpenId: 'a', token: 'a', expiresAt: 3_000 });
  store.set({ groupOpenId: 'g', memberOpenId: 'b', token: 'b', expiresAt: 5_000 });
  store.set({ groupOpenId: 'g', memberOpenId: 'c', token: 'c', expiresAt: 4_000 });
  assert.equal(store.get('g', 'a'), null);
  assert.equal(store.get('g', 'b').token, 'b');
  assert.equal(store.get('g', 'c').token, 'c');

  const pruned = new GroupLinkTokenStore({ ttlMs: 300_000, maxEntries: 2, now: () => now });
  pruned.set({ groupOpenId: 'g', memberOpenId: 'a', token: 'a', expiresAt: 100 });
  pruned.set({ groupOpenId: 'g', memberOpenId: 'b', token: 'b', expiresAt: 5_000 });
  now = 200;
  pruned.set({ groupOpenId: 'g', memberOpenId: 'c', token: 'c', expiresAt: 6_000 });
  assert.equal(pruned.get('g', 'a'), null);
  assert.equal(pruned.get('g', 'b').token, 'b');
  assert.equal(pruned.get('g', 'c').token, 'c');
});

test('群聊 /绑定 使用事件里的 member_openid 和 group_openid 生成链接并缓存 token', async () => {
  const store = new GroupLinkTokenStore();
  let captured;
  const result = await handleCommand({
    text: '/绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient: createFakeClient({
      createGroupToken: async (args) => {
        captured = args;
        return {
          url: 'https://ldpass.example.com/account/link/qq?token=group-token',
          expiresAt: FUTURE,
        };
      },
    }),
  });

  assert.deepEqual(captured, { openId: 'member-1', groupOpenId: 'group-1' });
  assert.equal(result.handled, true);
  assert.match(result.reply, /请打开这个一次性链接登录临东通/);
  assert.match(
    result.reply,
    /https:\/\/ldpass\.example\.com\/account\/link\/qq\?token=group-token/,
  );
  assert.match(result.reply, /网页会显示 6 位确认码/);
  assert.equal(store.get('group-1', 'member-1').token, 'group-token');
});

test('群聊 /绑定 兼容 @机器人 前缀、前后空白、全角斜杠和零宽字符', async () => {
  const variants = [
    '  @机器人 /绑定  ',
    '\u200b@机器人\u3000／绑定\u200b',
    '<@!bot-openid> /绑定',
    '＠机器人／绑定',
  ];
  for (const text of variants) {
    let called = 0;
    const result = await handleCommand({
      text,
      config: createConfig(),
      logger: createLogger(),
      context: group(),
      groupTokens: new GroupLinkTokenStore(),
      linkClient: createFakeClient({
        createGroupToken: async () => {
          called += 1;
          return {
            url: 'https://ldpass.example.com/account/link/qq?token=group-token',
            expiresAt: FUTURE,
          };
        },
      }),
    });
    assert.equal(called, 1, text);
    assert.match(result.reply, /一次性链接/, text);
  }
});

test('群聊 /绑定 不消费绑定码，也不会把参数当 openid', async () => {
  let called = false;
  const result = await handleCommand({
    text: '/绑定 123456',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: new GroupLinkTokenStore(),
    linkClient: createFakeClient({
      createGroupToken: async () => {
        called = true;
        return { url: 'https://ldpass.example.com/link?token=t', expiresAt: FUTURE };
      },
    }),
  });
  assert.equal(called, false);
  assert.match(result.reply, /不需要绑定码/);
});

test('同一成员重新 /绑定 会覆盖旧 token', async () => {
  const store = new GroupLinkTokenStore();
  let index = 0;
  const linkClient = createFakeClient({
    createGroupToken: async () => {
      index += 1;
      return {
        url: `https://ldpass.example.com/account/link/qq?token=token-${index}`,
        expiresAt: FUTURE,
      };
    },
  });
  const base = {
    text: '/绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient,
  };
  await handleCommand(base);
  assert.equal(store.get('group-1', 'member-1').token, 'token-1');
  await handleCommand(base);
  assert.equal(store.get('group-1', 'member-1').token, 'token-2');
});

test('群聊 /绑定 接口失败时返回通用提示，不回显服务端原文也不缓存', async () => {
  const store = new GroupLinkTokenStore();
  const result = await handleCommand({
    text: '/绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient: createFakeClient({
      createGroupToken: async () => {
        throw new QqLinkError('服务端原文 493827', 'http_500', 500);
      },
    }),
  });
  assert.equal(result.handled, true);
  assert.match(result.reply, /稍后重试/);
  assert.equal(result.reply.includes('493827'), false);
  assert.equal(store.size, 0);
});

test('群聊 /确认 用当前事件身份和缓存 token 调 confirm-group', async () => {
  const store = new GroupLinkTokenStore();
  seedToken(store, 'cached-token');
  let captured;
  const result = await handleCommand({
    text: '/确认 482913',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient: createFakeClient({
      confirmGroup: async (args) => {
        captured = args;
        return { id: 'link-1', username: '小明', scope: 'group' };
      },
    }),
  });

  assert.deepEqual(captured, {
    token: 'cached-token',
    openId: 'member-1',
    groupOpenId: 'group-1',
    code: '482913',
  });
  assert.equal(result.handled, true);
  assert.match(result.reply, /群绑定成功/);
  assert.match(result.reply, /@小明/);
  assert.match(result.reply, /不影响单聊和其他群/);
  assert.equal(store.get('group-1', 'member-1'), null);
});

test('群聊 /确认 兼容空白、零宽字符和全角数字', async () => {
  for (const text of ['/确认   482913', '/确认\u3000４８２９１３', '/确认 \u200b482913']) {
    const store = new GroupLinkTokenStore();
    seedToken(store);
    let captured;
    const result = await handleCommand({
      text,
      config: createConfig(),
      logger: createLogger(),
      context: group(),
      groupTokens: store,
      linkClient: createFakeClient({
        confirmGroup: async (args) => {
          captured = args;
          return { username: '小明', scope: 'group' };
        },
      }),
    });
    assert.equal(captured.code, '482913', text);
    assert.match(result.reply, /群绑定成功/, text);
  }
});

test('群聊 /确认 缺少或非 6 位确认码时只提示格式，不查询缓存和接口', async () => {
  const cases = [
    ['/确认', /请发送 \/确认/],
    ['/确认 12345', /确认码应为 6 位数字/],
    ['/确认 1234567', /确认码应为 6 位数字/],
    ['/确认 abcdef', /确认码应为 6 位数字/],
    ['/确认 482 913', /确认码应为 6 位数字/],
  ];
  for (const [text, pattern] of cases) {
    let called = false;
    const result = await handleCommand({
      text,
      config: createConfig(),
      logger: createLogger(),
      context: group(),
      groupTokens: new GroupLinkTokenStore(),
      linkClient: createFakeClient({
        confirmGroup: async () => {
          called = true;
          return { username: '小明' };
        },
      }),
    });
    assert.match(result.reply, pattern, text);
    assert.equal(called, false, text);
  }
});

test('群聊 /确认 没有缓存或缓存过期时提示先 /绑定', async () => {
  let called = false;
  const empty = await handleCommand({
    text: '/确认 482913',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: new GroupLinkTokenStore(),
    linkClient: createFakeClient({
      confirmGroup: async () => {
        called = true;
        return { username: '小明' };
      },
    }),
  });
  assert.match(empty.reply, /请先 @我 发送 \/绑定 获取新的绑定链接/);
  assert.equal(called, false);

  let now = 0;
  const store = new GroupLinkTokenStore({ now: () => now });
  store.set({
    groupOpenId: 'group-1',
    memberOpenId: 'member-1',
    token: 'cached-token',
    expiresAt: 1_000,
  });
  now = 1_001;
  const expired = await handleCommand({
    text: '/确认 482913',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient: createFakeClient(),
  });
  assert.match(expired.reply, /请先 @我 发送 \/绑定 获取新的绑定链接/);
});

test('群聊 /确认 错误码映射和缓存保留策略', async () => {
  const cases = [
    ['token_used', /已经处理过/, false],
    ['token_expired', /已失效/, false],
    ['token_invalid', /已失效/, false],
    ['token_not_claimed', /还没有登录确认/, true],
    ['confirm_code_invalid', /确认码不对/, true],
    ['openid_mismatch', /不是当前成员/, true],
    ['group_mismatch', /不是当前成员/, true],
    ['token_claimed', /其他临东通账号/, false],
    ['openid_already_linked', /已绑定其他临东通账号|绑定冲突/, true],
    ['link_conflict', /已绑定其他临东通账号|绑定冲突/, true],
    ['account_inactive', /不可用/, true],
    ['rate_limited', /稍后再试/, true],
    ['network_error', /稍后重试/, true],
    ['http_500', /稍后重试/, true],
  ];
  for (const [code, pattern, keep] of cases) {
    const store = new GroupLinkTokenStore();
    seedToken(store, 'secret-token');
    const result = await handleCommand({
      text: '/确认 482913',
      config: createConfig(),
      logger: createLogger(),
      context: group(),
      groupTokens: store,
      linkClient: createFakeClient({
        confirmGroup: async () => {
          throw new QqLinkError('底层错误', code, code === 'http_500' ? 500 : 0);
        },
      }),
    });
    assert.match(result.reply, pattern, `${code}: ${result.reply}`);
    assert.equal(Boolean(store.get('group-1', 'member-1')), keep, `${code} 缓存保留策略`);
    assert.equal(result.reply.includes('secret-token'), false, code);
    assert.equal(result.reply.includes('482913'), false, code);
  }
});

test('群聊 /我的绑定 查询当前群身份', async () => {
  let captured;
  const bound = await handleCommand({
    text: '/我的绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    linkClient: createFakeClient({
      resolveGroup: async (args) => {
        captured = args;
        return { id: 'link-1', username: '小明', scope: 'group' };
      },
    }),
  });
  assert.deepEqual(captured, { openId: 'member-1', groupOpenId: 'group-1' });
  assert.match(bound.reply, /当前 QQ 在本群已绑定临东通账号：@小明/);

  const unbound = await handleCommand({
    text: '/我的绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    linkClient: createFakeClient({ resolveGroup: async () => null }),
  });
  assert.match(unbound.reply, /还没有绑定临东通账号/);
});

test('群聊 /解绑 需要二次确认，只解除当前群绑定', async () => {
  let called = 0;
  const prompt = await handleCommand({
    text: '/解绑',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    linkClient: createFakeClient({
      unlinkGroup: async () => {
        called += 1;
        return true;
      },
    }),
  });
  assert.equal(called, 0);
  assert.match(prompt.reply, /不影响单聊和其他群/);
  assert.match(prompt.reply, /\/解绑 确认/);

  let captured;
  const unlinked = await handleCommand({
    text: '/解绑 确认',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    linkClient: createFakeClient({
      unlinkGroup: async (args) => {
        captured = args;
        return true;
      },
    }),
  });
  assert.deepEqual(captured, { openId: 'member-1', groupOpenId: 'group-1' });
  assert.match(unlinked.reply, /已解除当前 QQ 在本群的临东通绑定/);
  assert.match(unlinked.reply, /不影响单聊和其他群/);
});

test('群聊绑定功能开关关闭时不请求接口', async () => {
  let called = false;
  const linkClient = createFakeClient({
    createGroupToken: async () => {
      called = true;
      return { url: 'https://ldpass.example.com/link?token=t', expiresAt: FUTURE };
    },
  });
  const result = await handleCommand({
    text: '/绑定',
    config: createConfig({ groupEnabled: false }),
    logger: createLogger(),
    context: group(),
    groupTokens: new GroupLinkTokenStore(),
    linkClient,
  });
  assert.equal(called, false);
  assert.match(result.reply, /群聊绑定功能暂未开启/);
});

test('群聊缓存与单聊路径互不影响', async () => {
  const store = new GroupLinkTokenStore();
  let groupCalls = 0;
  let c2cCalls = 0;
  const linkClient = createFakeClient({
    createGroupToken: async () => {
      groupCalls += 1;
      return { url: 'https://ldpass.example.com/link?token=group', expiresAt: FUTURE };
    },
    createToken: async (openId) => {
      c2cCalls += 1;
      assert.equal(openId, 'c2c-openid');
      return { url: 'https://ldpass.example.com/link?token=c2c', expiresAt: FUTURE };
    },
  });

  const groupResult = await handleCommand({
    text: '/绑定',
    config: createConfig(),
    logger: createLogger(),
    context: group(),
    groupTokens: store,
    linkClient,
  });
  const c2cResult = await handleCommand({
    text: '/绑定',
    config: createConfig(),
    logger: createLogger(),
    context: c2c,
    groupTokens: store,
    linkClient,
  });

  assert.equal(groupCalls, 1);
  assert.equal(c2cCalls, 1);
  assert.equal(store.size, 1);
  assert.equal(store.get('group-1', 'member-1').token, 'group');
  assert.match(groupResult.reply, /token=group/);
  assert.match(c2cResult.reply, /token=c2c/);
});

test('群绑定 HTTP 客户端：路径、Bearer 头、请求体和查询参数', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/confirm-group')) {
      return jsonResponse({ ok: true, link: { id: 'link-1', username: '小明', scope: 'group' } });
    }
    if (url.includes('/token')) {
      return jsonResponse({
        ok: true,
        url: 'https://ldpass.example.com/link?token=t',
        expiresAt: FUTURE,
      });
    }
    if (url.includes('/resolve')) {
      return jsonResponse({ ok: true, link: null });
    }
    return jsonResponse({ ok: true });
  };
  const client = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl,
    logger: createLogger(),
  });

  const created = await client.createGroupToken({ openId: 'member-1', groupOpenId: 'group-1' });
  assert.deepEqual(created, {
    url: 'https://ldpass.example.com/link?token=t',
    expiresAt: FUTURE,
  });
  const confirmLink = await client.confirmGroup({
    token: 'token-1',
    openId: 'member-1',
    groupOpenId: 'group-1',
    code: '482913',
  });
  assert.equal(confirmLink.username, '小明');
  assert.equal(await client.resolveGroup({ openId: 'member-1', groupOpenId: 'group-1' }), null);
  assert.equal(await client.unlinkGroup({ openId: 'member-1', groupOpenId: 'group-1' }), true);

  assert.equal(requests[0].url, 'https://ldpass.example.com/api/internal/qq-link/token');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer link-secret');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    openId: 'member-1',
    scope: 'group',
    groupOpenId: 'group-1',
  });
  assert.ok(requests[0].options.signal instanceof AbortSignal);

  assert.equal(requests[1].url, 'https://ldpass.example.com/api/internal/qq-link/confirm-group');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer link-secret');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    token: 'token-1',
    openId: 'member-1',
    groupOpenId: 'group-1',
    code: '482913',
  });

  assert.equal(
    requests[2].url,
    'https://ldpass.example.com/api/internal/qq-link/resolve?openId=member-1&scope=group&groupOpenId=group-1',
  );
  assert.equal(requests[2].options.method, 'GET');
  assert.equal(requests[2].options.body, undefined);

  assert.equal(requests[3].url, 'https://ldpass.example.com/api/internal/qq-link/unlink');
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    openId: 'member-1',
    scope: 'group',
    groupOpenId: 'group-1',
  });
});

test('群绑定 HTTP 客户端：网络错误、5xx 和错误码映射', async () => {
  const network = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl: async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    },
    logger: createLogger(),
  });
  await assert.rejects(
    network.resolveGroup({ openId: 'member-1', groupOpenId: 'group-1' }),
    (error) => {
      assert.equal(error.code, 'network_error');
      return true;
    },
  );

  const conflict = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl: async () =>
      jsonResponse(
        { ok: false, error: 'token_used', message: '已经使用' },
        { ok: false, status: 409 },
      ),
    logger: createLogger(),
  });
  await assert.rejects(
    conflict.confirmGroup({
      token: 'token-1',
      openId: 'member-1',
      groupOpenId: 'group-1',
      code: '482913',
    }),
    (error) => {
      assert.equal(error.code, 'token_used');
      assert.equal(error.status, 409);
      return true;
    },
  );

  const unavailable = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() {
        throw new Error('not json');
      },
    }),
    logger: createLogger(),
  });
  await assert.rejects(
    unavailable.createGroupToken({ openId: 'member-1', groupOpenId: 'group-1' }),
    (error) => {
      assert.equal(error.code, 'http_503');
      assert.equal(error.status, 503);
      return true;
    },
  );

  const invalid = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl: async () => jsonResponse({ ok: true }),
    logger: createLogger(),
  });
  await assert.rejects(
    invalid.confirmGroup({
      token: 'token-1',
      openId: 'member-1',
      groupOpenId: 'group-1',
      code: '482913',
    }),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    },
  );
});

test('群绑定成功/失败日志不包含 token、url、确认码和完整 openid', async () => {
  const logger = createLogger();
  const store = new GroupLinkTokenStore();
  const linkClient = createFakeClient({
    createGroupToken: async () => ({
      url: 'https://ldpass.example.com/account/link/qq?token=super-secret-token',
      expiresAt: FUTURE,
    }),
  });
  await handleCommand({
    text: '/绑定',
    config: createConfig(),
    logger,
    context: group(),
    groupTokens: store,
    linkClient,
  });

  seedToken(store, 'super-secret-token');
  await handleCommand({
    text: '/确认 482913',
    config: createConfig(),
    logger,
    context: group(),
    groupTokens: store,
    linkClient: createFakeClient({
      confirmGroup: async () => {
        throw new QqLinkError('已经使用', 'token_used', 409);
      },
    }),
  });

  const logs = logger.lines.join('\n');
  for (const secret of [
    'super-secret-token',
    'https://ldpass.example.com/account/link/qq',
    '482913',
    'member-1',
    'group-1',
  ]) {
    assert.equal(logs.includes(secret), false, secret);
  }
});

test('群绑定 HTTP 网络错误日志只记录路由，不记录查询里的 openid', async () => {
  const logger = createLogger();
  const client = new QqLinkClient({
    baseUrl: 'https://ldpass.example.com',
    secret: 'link-secret',
    fetchImpl: async () => {
      throw new Error('boom');
    },
    logger,
  });
  await assert.rejects(
    client.resolveGroup({ openId: 'member-secret', groupOpenId: 'group-secret' }),
    (error) => {
      assert.equal(error.code, 'network_error');
      return true;
    },
  );
  const logs = logger.lines.join('\n');
  assert.equal(logs.includes('/api/internal/qq-link/resolve'), true);
  assert.equal(logs.includes('member-secret'), false);
  assert.equal(logs.includes('group-secret'), false);
  assert.equal(logs.includes('?openId='), false);
});

test('单聊绑定逻辑保持原样，不读取群绑定缓存', async () => {
  const store = new GroupLinkTokenStore();
  let consumed;
  const linkClient = createFakeClient({
    consumeCode: async (code, openId) => {
      consumed = { code, openId };
      return { username: '小明' };
    },
    resolve: async () => ({ username: '小明', scope: 'c2c' }),
    unlink: async () => true,
  });

  const bound = await handleCommand({
    text: '/绑定 K7M2-9QXF',
    config: createConfig(),
    logger: createLogger(),
    context: c2c,
    groupTokens: store,
    linkClient,
  });
  assert.deepEqual(consumed, { code: 'K7M29QXF', openId: 'c2c-openid' });
  assert.match(bound.reply, /已绑定到临东通账号：@小明/);

  const mine = await handleCommand({
    text: '/我的绑定',
    config: createConfig(),
    logger: createLogger(),
    context: c2c,
    groupTokens: store,
    linkClient,
  });
  assert.match(mine.reply, /当前 QQ 已绑定临东通账号：@小明/);

  const unlinked = await handleCommand({
    text: '/解绑 确认',
    config: createConfig(),
    logger: createLogger(),
    context: c2c,
    groupTokens: store,
    linkClient,
  });
  assert.match(unlinked.reply, /已解除当前 QQ 与临东通账号的绑定/);
  assert.equal(store.size, 0);
});
