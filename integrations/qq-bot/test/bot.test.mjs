import assert from 'node:assert/strict';
import test from 'node:test';
import { helpText } from '../src/answer.mjs';
import { QQBot } from '../src/bot.mjs';
import { shanghaiDateKey } from '../src/community.mjs';

function createConfig(overrides = {}) {
  return {
    qq: { userQpm: 6, groupQpm: 20, groupAllowlist: new Set(), ...overrides.qq },
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
      imageCaptionChars: 120,
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
      groups: new Set(),
      ...overrides.events,
    },
  };
}

function createSetup({ config = createConfig(), assistantImpl, condenseImpl } = {}) {
  const sends = [];
  const uploads = [];
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
    async sendGroupMarkdown(openid, { content, msgId, msgSeq }) {
      sends.push({
        kind: 'markdown',
        openid,
        payload: { content, msg_id: msgId, msg_seq: msgSeq },
      });
    },
    async sendC2CMarkdown(openid, { content, msgId, msgSeq }) {
      sends.push({
        kind: 'markdown',
        openid,
        payload: { content, msg_id: msgId, msg_seq: msgSeq },
      });
    },
    async uploadGroupImage(openid, url) {
      uploads.push({ kind: 'group', openid, url });
      return 'file-info-group';
    },
    async uploadC2CImage(openid, url) {
      uploads.push({ kind: 'c2c', openid, url });
      return 'file-info-c2c';
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
  const bot = new QQBot({ api, config, logger, assistant, condense: condenseImpl, queue });
  return {
    bot,
    sends,
    uploads,
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
  assert.equal(sends[0].payload.content, helpText);
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

test('回答引用有配图时合并为一条图文消息', async () => {
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
  assert.equal(sends.length, 1);
  assert.equal(sends[0].kind, 'markdown');
  assert.match(
    sends[0].payload.content,
    /!\[封面\]\(https:\/\/yct\.example\.com\/content-assets\/cover\.png\)/,
  );
  assert.match(sends[0].payload.content, /站台临时调整，请留意公告。/);
  assert.equal(sends[0].payload.msg_seq, 1);
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
      groups: new Set(['group-1']),
    },
  });
  const { bot, sends } = createSetup({ config });
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

test('指令结果会生成卡片图片', async () => {
  const config = createConfig({
    reply: { ack: false, cards: true, appendSources: false },
    yct: { publicBaseUrl: 'https://yct.example.com' },
  });
  const { bot, sends, uploads } = createSetup({ config });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', {
    ...groupEvent,
    id: 'msg-card',
    content: '随机数 1-10',
  });

  assert.equal(sends.length, 2);
  assert.equal(sends[0].payload.msg_type, 0);
  assert.equal(sends[1].kind, 'image');
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].url, /^https:\/\/yct\.example\.com\/api\/qq-bot\/card\?d=/);
  const payload = new URL(uploads[0].url).searchParams.get('d');
  const card = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(card.type, 'result');
  assert.match(card.title, /随机数/);
  assert.match(card.footer, /群成员｜\d{2}-\d{2} \d{2}:\d{2}/);
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
