import assert from 'node:assert/strict';
import test from 'node:test';
import { commandHelpText } from '../src/commands.mjs';
import { QQBot } from '../src/bot.mjs';
import { shanghaiDateKey } from '../src/community.mjs';
import { GroupModuleStore } from '../src/group-modules.mjs';

function createConfig(overrides = {}) {
  return {
    qq: {
      userQpm: 6,
      groupQpm: 20,
      groupAllowlist: new Set(),
      groupAliases: new Map(),
      ...overrides.qq,
    },
    reply: {
      ack: true,
      style: 'chat',
      chatMaxChars: 600,
      condense: false,
      condenseChars: 120,
      condenseThreshold: 180,
      appendSources: true,
      links: false,
      images: false,
      cards: false,
      imageHosts: new Set(),
      followups: false,
      segmentChars: 200,
      maxQuestionChars: 1000,
      answerTimeoutMs: 5000,
      ...overrides.reply,
    },
    yct: {
      baseUrl: 'http://127.0.0.1:1',
      publicBaseUrl: '',
      apiKey: 'sk-test',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      locale: 'zh-CN',
      ...overrides.yct,
    },
    events: {
      port: 0,
      bind: '127.0.0.1',
      token: '',
      groupMap: new Map(),
      ...overrides.events,
    },
    link: {
      baseUrl: '',
      secret: '',
      contextSecret: '',
      groupEnabled: true,
      groupTokenTtlMs: 300_000,
      groupTokenCacheMax: 10_000,
      timeoutMs: 20_000,
      ...overrides.link,
    },
  };
}

function createSetup({
  config = createConfig(),
  assistantImpl,
  condenseImpl,
  cardRenderer,
  moduleStore,
} = {}) {
  const sends = [];
  const uploads = [];
  const imageData = [];
  const renderedCards = [];
  const api = {
    async sendGroupMessage(openid, payload) {
      sends.push({ kind: 'group', openid, payload });
    },
    async sendC2CMessage(openid, payload) {
      sends.push({ kind: 'c2c', openid, payload });
    },
    async sendC2CTyping(openid, payload) {
      sends.push({ kind: 'typing', openid, payload });
    },
    async uploadGroupImage(openid, url) {
      uploads.push({ kind: 'group', openid, url });
      return 'file-info-group';
    },
    async uploadC2CImage(openid, url) {
      uploads.push({ kind: 'c2c', openid, url });
      return 'file-info-c2c';
    },
    async uploadGroupImageData(openid, buffer) {
      imageData.push({ kind: 'group', openid, buffer });
      return 'file-data-group';
    },
    async uploadC2CImageData(openid, buffer) {
      imageData.push({ kind: 'c2c', openid, buffer });
      return 'file-data-c2c';
    },
    async sendGroupImage(openid, payload) {
      sends.push({ kind: 'image', openid, payload });
    },
    async sendC2CImage(openid, payload) {
      sends.push({ kind: 'image', openid, payload });
    },
  };
  let pending = null;
  const queue = {
    submit(key, task) {
      pending = task();
      return true;
    },
    async settle() {
      await pending;
    },
  };
  let calls = 0;
  let lastOptions = null;
  const assistant = async (options) => {
    calls += 1;
    lastOptions = options;
    if (assistantImpl) {
      return assistantImpl(options);
    }
    return {
      text: '**答案** 在这里。',
      references: [{ title: '中华路站' }],
      followups: [],
      error: '',
    };
  };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const renderer =
    cardRenderer ??
    (async (card) => {
      renderedCards.push(card);
      return Buffer.from(`card:${card.type}`);
    });
  const bot = new QQBot({
    api,
    config,
    logger,
    assistant,
    condense: condenseImpl,
    queue,
    cardRenderer: renderer,
    moduleStore,
  });
  return {
    bot,
    sends,
    uploads,
    imageData,
    renderedCards,
    queue,
    getCalls: () => calls,
    getLastOptions: () => lastOptions,
  };
}

const groupEvent = {
  id: 'msg-1',
  group_openid: 'group-1',
  author: { member_openid: 'user-1' },
  content: ' 中华路有哪些公交站 ',
};

test('群消息先发提示，再按被动回复序号发送答案', async () => {
  const { bot, sends, queue, getLastOptions } = createSetup();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent);
  await queue.settle();

  assert.equal(getLastOptions().channel, 'qq-group');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].payload.content, '问一问正在查资料，稍等。');
  assert.equal(sends[0].payload.msg_id, 'msg-1');
  assert.equal(sends[0].payload.msg_seq, 1);
  assert.match(sends[1].payload.content, /答案 在这里/);
  assert.match(sends[1].payload.content, /参考：中华路站/);
  assert.equal(sends[1].payload.msg_seq, 2);
});

test('同一条消息重复推送时只回答一次', async () => {
  const { bot, sends, queue, getCalls } = createSetup();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent);
  await queue.settle();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent);

  assert.equal(sends.length, 2);
  assert.equal(getCalls(), 1);
});

test('帮助指令不调用模型', async () => {
  const { bot, sends, getCalls } = createSetup();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-2', content: '帮助' });

  assert.equal(getCalls(), 0);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.content, commandHelpText());
  assert.match(sends[0].payload.content, /物料盲盒/);
});

test('单聊使用输入中状态，不占用文字提示', async () => {
  const { bot, sends, queue, getLastOptions } = createSetup();
  await bot.handleEvent('C2C_MESSAGE_CREATE', {
    id: 'msg-3',
    author: { user_openid: 'user-9' },
    content: '末班车几点',
  });
  await queue.settle();

  assert.equal(getLastOptions().channel, 'qq-c2c');
  assert.equal(sends[0].kind, 'typing');
  assert.equal(sends[1].kind, 'c2c');
  assert.equal(sends[1].payload.msg_seq, 2);
});

test('不在白名单的群不响应', async () => {
  const config = createConfig({ qq: { groupAllowlist: new Set(['other-group']) } });
  const { bot, sends } = createSetup({ config });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent);
  assert.equal(sends.length, 0);
});

test('单聊绑定后自动把账号上下文带进问一问', async () => {
  const config = createConfig({
    reply: { ack: false },
    link: {
      baseUrl: 'https://ldpass.example.com',
      secret: 'link-secret',
      contextSecret: 'context-secret',
    },
  });
  const { bot, queue, getLastOptions } = createSetup({ config });
  bot.linkClient.resolve = async () => ({ ldpassUserId: 'ldpass-user-1' });

  await bot.handleEvent('C2C_MESSAGE_CREATE', {
    id: 'msg-account-context',
    author: { user_openid: 'qq-openid-1' },
    content: '我现在在哪里',
  });
  await queue.settle();

  assert.deepEqual(getLastOptions().accountContext, {
    ldpassUserId: 'ldpass-user-1',
    openId: 'qq-openid-1',
  });
  assert.equal(getLastOptions().accountContextSecret, 'context-secret');
});

test('群聊不会带入账号上下文', async () => {
  const config = createConfig({
    reply: { ack: false },
    link: {
      baseUrl: 'https://ldpass.example.com',
      secret: 'link-secret',
      contextSecret: 'context-secret',
    },
  });
  const { bot, queue, getLastOptions } = createSetup({ config });
  let called = false;
  bot.linkClient.resolve = async () => {
    called = true;
    return { ldpassUserId: 'ldpass-user-1' };
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent);
  await queue.settle();

  assert.equal(called, false);
  assert.equal(getLastOptions().accountContext, undefined);
});

test('回答里的 ui 卡片会还原成文字而不是 JSON', async () => {
  const { bot, sends, queue } = createSetup({
    assistantImpl: async () => ({
      text: '附近有：\n```ui\n{"type":"place_list","refs":[1]}\n```',
      references: [{ id: 1, title: '尚瑞超市(启航店)', snippet: '商业 · 启航路 12 号' }],
      followups: [],
      error: '',
    }),
  });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-5' });
  await queue.settle();

  assert.match(sends[1].payload.content, /· 尚瑞超市\(启航店\)/);
  assert.doesNotMatch(sends[1].payload.content, /\{"type"|```ui/);
});

test('网络错误不把内部地址发进群', async () => {
  const error = Object.assign(
    new Error('连不上问一问服务（http://127.0.0.1:3300/api/assistant/chat，ECONNREFUSED）。'),
    { name: 'AssistantError', code: 'network' },
  );
  const { bot, sends, queue } = createSetup({
    config: createConfig({ reply: { ack: false } }),
    assistantImpl: async () => {
      throw error;
    },
  });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-6' });
  await queue.settle();

  assert.equal(sends[0].payload.content, '连不上问一问服务，请稍后再试。');
  assert.doesNotMatch(sends[0].payload.content, /127\.0\.0\.1|https?:/);
});

test('长回答先让模型精炼，再发送精炼后的文本', async () => {
  const longText = `从临东站到出生点，最省力的是打车，最省钱的是步行。${'沿途会经过东进站口、临东大道和若干路口。'.repeat(12)}`;
  let condensedInput = '';
  let condensedQuestion = '';
  const { bot, sends, queue } = createSetup({
    config: createConfig({
      reply: {
        ack: false,
        condense: true,
        condenseChars: 80,
        condenseThreshold: 100,
        appendSources: false,
      },
    }),
    assistantImpl: async () => ({
      text: longText,
      references: [],
      followups: [],
      error: '',
    }),
    condenseImpl: async (options) => {
      condensedInput = options.text;
      condensedQuestion = options.question;
      return '打车约 10 分钟、12 元；步行约 64 分钟，最省钱。';
    },
  });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-7' });
  await queue.settle();

  assert.equal(sends[0].payload.content, '打车约 10 分钟、12 元；步行约 64 分钟，最省钱。');
  assert.match(condensedInput, /东进站口/);
  assert.equal(condensedQuestion, '中华路有哪些公交站');
});

test('精炼失败时回退到本地按句取舍，不丢整条回答', async () => {
  const longText = `打车约 10 分钟、12 元；步行约 64 分钟。${'补充说明。'.repeat(80)}`;
  const { bot, sends, queue } = createSetup({
    config: createConfig({
      reply: {
        ack: false,
        condense: true,
        condenseChars: 80,
        condenseThreshold: 100,
        chatMaxChars: 280,
        appendSources: false,
      },
    }),
    assistantImpl: async () => ({
      text: longText,
      references: [],
      followups: [],
      error: '',
    }),
    condenseImpl: async () => {
      throw new Error('服务商不可用');
    },
  });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-8' });
  await queue.settle();

  assert.match(sends[0].payload.content, /打车约 10 分钟/);
  assert.ok(sends[0].payload.content.length <= 280);
});

test('本地指令不调用模型', async () => {
  const { bot, sends, getCalls } = createSetup();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-9',
    content: '/算 1+2',
  });

  assert.equal(getCalls(), 0);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.content, '= 3');
});

test('自然触发词不调用模型', async () => {
  const { bot, sends, getCalls } = createSetup();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-10',
    content: '计算 1+2',
  });

  assert.equal(getCalls(), 0);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.content, '= 3');
});

test('群消息计入发言统计，签到与运势走本地状态', async () => {
  const { bot, sends } = createSetup();

  await bot.handleEvent('GROUP_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-all-1',
    content: '普通群消息',
  });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-stats',
    content: '发言统计',
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /共 2 条/);
  assert.match(sends[0].payload.content, /1 人参与/);
  assert.match(sends[0].payload.content, /群消息/);

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-sign-1',
    content: '签到',
  });
  assert.match(sends[1].payload.content, /签到成功/);

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-sign-2',
    content: '签到',
  });
  assert.match(sends[2].payload.content, /今天已经签到过了/);

  await bot.handleEvent('C2C_MESSAGE_CREATE', {
    id: 'msg-fortune',
    author: { user_openid: 'user-9' },
    content: '今日运势',
  });
  assert.match(sends[3].payload.content, /今日运势：\d+\/100/);
});

test('群聊回答配图改为文字加主动图片，避免重复 at', async () => {
  const config = createConfig({
    reply: { ack: false, images: true, appendSources: false },
    yct: { publicBaseUrl: 'https://yct.example.com' },
  });
  const { bot, sends, uploads, queue } = createSetup({
    config,
    assistantImpl: async () => ({
      text: '站台临时调整，请留意公告。',
      references: [
        {
          id: 1,
          title: '站台临时调整',
          source: '运营',
          imageUrl: '/content-assets/cover.png',
        },
      ],
      followups: [],
      error: '',
    }),
  });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-image' });
  await queue.settle();

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].url, 'https://yct.example.com/content-assets/cover.png');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].kind, 'group');
  assert.equal(sends[0].payload.msg_seq, 1);
  assert.equal(sends[1].kind, 'image');
  assert.equal(sends[1].payload.fileInfo, 'file-info-group');
  assert.equal(sends[1].payload.msgId, undefined);
  assert.equal(sends[1].payload.msgSeq, undefined);
});

test('配图上传失败时回退为纯文字消息', async () => {
  const config = createConfig({
    reply: { ack: false, images: true, appendSources: false },
    yct: { publicBaseUrl: 'https://yct.example.com' },
  });
  const { bot, sends, queue } = createSetup({
    config,
    assistantImpl: async () => ({
      text: '站台临时调整，请留意公告。',
      references: [
        {
          id: 1,
          title: '站台临时调整',
          source: '运营',
          imageUrl: '/content-assets/cover.png',
        },
      ],
      followups: [],
      error: '',
    }),
  });
  bot.api.uploadGroupImage = async () => {
    throw new Error('upload failed');
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-image-fail' });
  await queue.settle();

  assert.equal(sends.length, 1);
  assert.equal(sends[0].kind, 'group');
  assert.equal(sends[0].payload.content, '站台临时调整，请留意公告。');
  assert.equal(sends[0].payload.msg_seq, 1);
});

test('事件桥补全群消息统计，并发送进退群和服务聊天', async () => {
  const config = createConfig({
    events: {
      port: 0,
      bind: '127.0.0.1',
      token: '',
      groupMap: new Map([['old-group', 'group-1']]),
    },
  });
  const store = new GroupModuleStore({});
  store.setModule('group-1', 'serverMessages', true, { role: 'admin' });
  const { bot, sends } = createSetup({ config, moduleStore: store });
  bot.eventBridge = { close: async () => {} };
  bot.groupNotices = { groups: { 'old-group': { welcome: '欢迎 {name}' } } };

  await bot.handleOneBotEvent({
    post_type: 'message',
    message_type: 'group',
    group_id: 'old-group',
    user_id: 'u1',
    sender: { nickname: '小明' },
    message_id: 1001,
    raw_message: '大家好',
  });
  assert.equal(
    bot.community.messageStats({ groupId: 'group-1', date: shanghaiDateKey() }).total,
    1,
  );

  await bot.handleOneBotEvent({
    post_type: 'notice',
    notice_type: 'group_increase',
    group_id: 'old-group',
    user_id: 'u2',
    sender: { nickname: '小红' },
  });
  assert.match(sends.at(-1).payload.content, /欢迎 小红/);

  await bot.handleServerEvent({ type: 'chat', player: '小明', message: '晚上好' });
  assert.equal(sends.at(-1).payload.content, '💬 小明：晚上好');
});

test('指令结果在机器人本地渲染并上传卡片图片', async () => {
  const config = createConfig({
    reply: { ack: false, cards: true, appendSources: false },
  });
  const { bot, sends, imageData, renderedCards } = createSetup({ config });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-card',
    content: '随机数 1-10',
  });

  assert.equal(sends.length, 2);
  assert.equal(sends[0].kind, 'image');
  assert.equal(sends[0].payload.msg_id, undefined);
  assert.equal(sends[1].kind, 'group');
  assert.equal(sends[1].payload.msg_seq, 1);
  assert.match(sends[1].payload.content, /随机数/);
  assert.equal(imageData.length, 1);
  assert.equal(imageData[0].kind, 'group');
  assert.equal(imageData[0].buffer.toString(), 'card:result');
  assert.equal(renderedCards.length, 1);
  assert.equal(renderedCards[0].type, 'result');
  assert.match(renderedCards[0].title, /随机数/);
  assert.match(renderedCards[0].footer, /群成员｜\d{2}-\d{2} \d{2}:\d{2}/);
});

test('群聊主动卡片失败时改发单张被动卡片，不重复 @', async () => {
  const config = createConfig({ reply: { ack: false, cards: true } });
  const { bot, sends } = createSetup({ config });
  bot.api.sendGroupImage = async (openid, payload) => {
    if (payload.msgId === undefined) {
      throw new Error('active message not allowed');
    }
    sends.push({ kind: 'image', openid, payload });
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-card-fallback',
    content: '随机数 1-10',
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].kind, 'image');
  assert.equal(sends[0].payload.msgSeq, 1);
});

test('单聊配图保持文字加图片，不走 Markdown', async () => {
  const config = createConfig({
    reply: { ack: false, images: true, appendSources: false },
    yct: { publicBaseUrl: 'https://yct.example.com' },
  });
  const { bot, sends, uploads, queue } = createSetup({
    config,
    assistantImpl: async () => ({
      text: '站台临时调整，请留意公告。',
      references: [{ id: 1, title: '站台临时调整', imageUrl: '/content-assets/cover.png' }],
      followups: [],
      error: '',
    }),
  });

  await bot.handleEvent('C2C_MESSAGE_CREATE', {
    id: 'msg-c2c-image',
    author: { user_openid: 'user-9' },
    content: '有什么公告',
  });
  await queue.settle();

  assert.equal(uploads.length, 1);
  assert.equal(sends.length, 2);
  assert.equal(sends[0].kind, 'c2c');
  assert.equal(sends[0].payload.content, '站台临时调整，请留意公告。');
  assert.equal(sends[1].kind, 'image');
  assert.equal(sends[1].payload.msgSeq, 2);
});

test('模型报错时把可读提示发回 QQ', async () => {
  const error = Object.assign(new Error('问一问暂时不可用，请稍后再试。'), {
    name: 'AssistantError',
  });
  const config = createConfig({ reply: { ack: false } });
  const { bot, sends, queue } = createSetup({
    config,
    assistantImpl: async () => {
      throw error;
    },
  });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', { ...groupEvent, id: 'msg-4' });
  await queue.settle();

  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.content, '问一问暂时不可用，请稍后再试。');
});

test('群聊 /绑定 只用 member_openid + group_openid，并写入群缓存', async () => {
  const config = createConfig({
    link: { baseUrl: 'https://ldpass.example.com', secret: 'link-secret' },
  });
  const { bot, sends } = createSetup({ config });
  let groupArgs;
  let c2cCalled = false;
  bot.linkClient.createGroupToken = async (args) => {
    groupArgs = args;
    return {
      url: 'https://ldpass.example.com/account/link/qq?token=group-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
  };
  bot.linkClient.createToken = async () => {
    c2cCalled = true;
    return { url: 'https://ldpass.example.com/link?token=c2c-token' };
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-group-bind',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', user_openid: 'c2c-user-1' },
    content: '/绑定',
  });

  assert.deepEqual(groupArgs, { openId: 'user-1', groupOpenId: 'group-1' });
  assert.equal(c2cCalled, false);
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /token=group-token/);
  assert.equal(bot.groupLinkTokens.get('group-1', 'user-1').token, 'group-token');
});

test('单聊 /绑定 只用 user_openid，不读群缓存', async () => {
  const config = createConfig({
    link: { baseUrl: 'https://ldpass.example.com', secret: 'link-secret' },
  });
  const { bot, sends } = createSetup({ config });
  let openId;
  let groupCalled = false;
  bot.linkClient.createToken = async (id) => {
    openId = id;
    return {
      url: 'https://ldpass.example.com/account/link/qq?token=c2c-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
  };
  bot.linkClient.createGroupToken = async () => {
    groupCalled = true;
    return {
      url: 'https://ldpass.example.com/link?token=group-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
  };

  await bot.handleEvent('C2C_MESSAGE_CREATE', {
    id: 'msg-c2c-bind',
    author: { user_openid: 'user-9', member_openid: 'member-x' },
    content: '/绑定',
  });

  assert.equal(openId, 'user-9');
  assert.equal(groupCalled, false);
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /token=c2c-token/);
});

test('群聊 /确认 使用当前事件的 member_openid 和 group_openid', async () => {
  const config = createConfig({
    link: { baseUrl: 'https://ldpass.example.com', secret: 'link-secret' },
  });
  const { bot, sends } = createSetup({ config });
  bot.groupLinkTokens.set({
    groupOpenId: 'group-1',
    memberOpenId: 'user-1',
    token: 'group-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  let captured;
  bot.linkClient.confirmGroup = async (args) => {
    captured = args;
    return { id: 'link-1', username: '小明', scope: 'group' };
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-group-confirm',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', user_openid: 'someone-else' },
    content: '/确认 482913',
  });

  assert.deepEqual(captured, {
    token: 'group-token',
    openId: 'user-1',
    groupOpenId: 'group-1',
    code: '482913',
  });
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /@小明/);
  assert.equal(bot.groupLinkTokens.get('group-1', 'user-1'), null);
});

test('群聊 /确认 不会拿其他成员的缓存 token', async () => {
  const config = createConfig({
    link: { baseUrl: 'https://ldpass.example.com', secret: 'link-secret' },
  });
  const { bot, sends } = createSetup({ config });
  bot.groupLinkTokens.set({
    groupOpenId: 'group-1',
    memberOpenId: 'user-1',
    token: 'group-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  let called = false;
  bot.linkClient.confirmGroup = async () => {
    called = true;
    return { username: '小明' };
  };

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-group-confirm-other',
    group_openid: 'group-1',
    author: { member_openid: 'user-2' },
    content: '/确认 482913',
  });

  assert.equal(called, false);
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /请先 @我 发送 \/绑定/);
});

test('群聊首次消息日志只打印打码后的 openid', async () => {
  const lines = [];
  const logger = {
    debug: (...args) => lines.push(args.map(String).join(' ')),
    info: (...args) => lines.push(args.map(String).join(' ')),
    warn: (...args) => lines.push(args.map(String).join(' ')),
    error: (...args) => lines.push(args.map(String).join(' ')),
  };
  const { bot } = createSetup();
  bot.logger = logger;

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-log-mask',
    content: '帮助',
  });

  const text = lines.join('\n');
  assert.match(text, /首次收到群 grou…-1 的消息/);
  assert.equal(text.includes('group-1'), false);
});

test('群管理员关闭指令后，成员触发只提示一次', async () => {
  const store = new GroupModuleStore({});
  const { bot, sends, getCalls } = createSetup({ moduleStore: store });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-module-1',
    group_openid: 'group-1',
    author: { member_openid: 'user-admin', member_role: 'admin' },
    content: '/模块 关 天气',
  });
  assert.match(sends.at(-1).payload.content, /已关闭本群的「天气」/);

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-module-2',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', member_role: 'member' },
    content: '/天气',
  });
  assert.equal(getCalls(), 0);
  assert.match(sends.at(-1).payload.content, /「天气」在本群未开启/);

  const sent = sends.length;
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-module-3',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', member_role: 'member' },
    content: '/天气',
  });
  assert.equal(sends.length, sent);
});

test('普通成员不能修改本群开关', async () => {
  const store = new GroupModuleStore({});
  const { bot, sends } = createSetup({ moduleStore: store });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-module-member',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', member_role: 'member' },
    content: '/模块 关 天气',
  });

  assert.match(sends.at(-1).payload.content, /只有群主或管理员/);
  assert.notEqual(store.resolve('group-1').commands.weather, false);
});

test('群成员可以查看 /模块 列表', async () => {
  const { bot, sends } = createSetup();

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-module-list',
    group_openid: 'group-1',
    author: { member_openid: 'user-1', member_role: 'member' },
    content: '/模块',
  });

  assert.match(sends.at(-1).payload.content, /使用说明 常开/);
  assert.match(sends.at(-1).payload.content, /问一问/);
});

test('帮助按本群开关显示未开启项', async () => {
  const store = new GroupModuleStore({});
  store.setModule('group-1', 'tools', false, { role: 'admin' });
  const { bot, sends } = createSetup({ moduleStore: store });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-help-policy',
    content: '帮助',
  });

  const reply = sends.at(-1).payload.content;
  assert.notEqual(reply, commandHelpText());
  assert.match(reply, /本群未开启：实用工具/);
});

test('关闭问一问范围后请求带能力位，提示走本地文案并节流', async () => {
  const store = new GroupModuleStore({});
  store.setModule('group-1', 'ask.transit', false, { role: 'admin' });
  const { bot, sends, queue, getLastOptions } = createSetup({
    moduleStore: store,
    assistantImpl: async () => ({
      text: '服务端固定文案',
      references: [],
      followups: [],
      error: '',
      reasonCode: 'group_scope.transit_disabled',
    }),
  });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-scope-1',
    content: '170路首班几点',
  });
  await queue.settle();

  assert.equal(getLastOptions().capabilities.transit, false);
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /本群未开启「公交与线路」问答/);
  assert.equal(sends[0].payload.msg_seq, 1);
  assert.equal(bot.store.get('group:group-1:user-1').length, 0);

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-scope-2',
    content: '170路末班几点',
  });
  await queue.settle();
  assert.equal(sends.length, 1);
});

test('群管理员锁定项在群里只读', async () => {
  const store = new GroupModuleStore({});
  store.setModule('group-1', 'ask.transit', false, { role: 'admin' });
  store.data.groups['group-1'].locked = ['ask.transit'];
  const { bot, sends } = createSetup({ moduleStore: store });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    id: 'msg-locked',
    group_openid: 'group-1',
    author: { member_openid: 'user-admin', member_role: 'owner' },
    content: '/模块 开 公交',
  });

  assert.match(sends.at(-1).payload.content, /由机器人管理员锁定/);
  assert.equal(store.resolve('group-1').modules['ask.transit'], false);
});

test('按群关闭进退群提示后不再发送', async () => {
  const store = new GroupModuleStore({});
  store.setModule('group-1', 'notices', false, { role: 'admin' });
  const { bot, sends } = createSetup({ moduleStore: store });
  bot.groupNotices = { groups: { 'group-1': { welcome: '欢迎 {name}' } } };

  await bot.handleEvent('GROUP_MEMBER_ADD', {
    group_openid: 'group-1',
    member_openid: 'user-2',
    member_nickname: '新人',
  });
  assert.equal(sends.length, 0);

  store.setModule('group-1', 'notices', true, { role: 'admin' });
  await bot.handleEvent('GROUP_MEMBER_ADD', {
    group_openid: 'group-1',
    member_openid: 'user-3',
    member_nickname: '新人2',
  });
  assert.equal(sends.length, 1);
  assert.match(sends[0].payload.content, /欢迎 新人2/);
});

test('玩家进出和服务器消息默认关闭', async () => {
  const config = createConfig({
    reply: {
      playerJoinText: '🟢 {name} 进入了服务器',
      playerLeaveText: '🔴 {name} 离开了服务器',
    },
  });
  const store = new GroupModuleStore({});
  const { bot, sends } = createSetup({ config, moduleStore: store });

  await bot.broadcastPlayerEvent({ type: 'join', name: '小明' });
  await bot.handleServerEvent({ type: 'chat', player: '小明', message: '晚上好' });

  assert.equal(sends.length, 0);
});

test('玩家进出播报按群过滤', async () => {
  const config = createConfig({
    reply: {
      playerJoinText: '🟢 {name} 进入了服务器',
      playerLeaveText: '🔴 {name} 离开了服务器',
    },
  });
  const store = new GroupModuleStore({});
  store.setModule('group-2', 'playerEvents', true, { role: 'admin' });
  store.setModule('group-1', 'playerEvents', false, { role: 'admin' });
  const { bot, sends } = createSetup({ config, moduleStore: store });

  await bot.broadcastPlayerEvent({ type: 'join', name: '小明' });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].openid, 'group-2');
  assert.match(sends[0].payload.content, /小明 进入了服务器/);
});

test('玩家进出播报按群开启，关闭的群不发送', async () => {
  const config = createConfig({
    reply: {
      playerJoinText: '🟢 {name} 进入了服务器',
      playerLeaveText: '🔴 {name} 离开了服务器',
    },
  });
  const store = new GroupModuleStore({});
  store.setModule('group-3', 'playerEvents', true, { role: 'admin' });
  const { bot, sends } = createSetup({ config, moduleStore: store });

  await bot.broadcastPlayerEvent({ type: 'join', name: '小明' });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].openid, 'group-3');
});

test('服务器聊天默认不发，按群开启后只发到开启的群', async () => {
  const config = createConfig();
  const store = new GroupModuleStore({});
  store.setModule('group-2', 'serverMessages', true, { role: 'admin' });
  const { bot, sends } = createSetup({ config, moduleStore: store });

  await bot.handleServerEvent({ type: 'chat', player: '小明', message: '你好' });
  assert.deepEqual(
    sends.map((item) => item.openid),
    ['group-2'],
  );

  store.setModule('group-2', 'serverMessages', false, { role: 'admin' });
  sends.length = 0;
  await bot.handleServerEvent({ type: 'chat', player: '小红', message: '晚上好' });
  assert.equal(sends.length, 0);
});

test('事件桥的玩家进服按群过滤，服务聊天不受影响', async () => {
  const config = createConfig({
    reply: {
      playerJoinText: '🟢 {name} 进入了服务器',
      playerLeaveText: '🔴 {name} 离开了服务器',
    },
  });
  const store = new GroupModuleStore({});
  store.setModule('group-2', 'playerEvents', true, { role: 'admin' });
  store.setModule('group-1', 'serverMessages', true, { role: 'admin' });
  store.setModule('group-2', 'serverMessages', true, { role: 'admin' });
  const { bot, sends } = createSetup({ config, moduleStore: store });

  await bot.handleServerEvent({ type: 'join', player: '小红' });
  assert.deepEqual(
    sends.map((item) => item.openid),
    ['group-2'],
  );

  sends.length = 0;
  await bot.handleServerEvent({ type: 'chat', player: '小红', message: '晚上好' });
  assert.deepEqual(sends.map((item) => item.openid).sort(), ['group-1', 'group-2']);
});
