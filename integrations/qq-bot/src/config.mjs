import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 机器人目录下的 .env，既可以用编辑器填写，也可以由进程管理器注入同名环境变量。 */
export const botRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultEnvPath = join(botRoot, '.env');

export const knownProviders = ['deepseek', 'glm', 'mimo'];
export const knownLocales = ['zh-CN', 'zh-Hant', 'en'];

const defaults = {
  QQ_BOT_API_BASE: 'https://api.bot.qq.com',
  QQ_BOT_INTENTS: '33554432',
  QQ_BOT_USER_QPM: '6',
  QQ_BOT_GROUP_QPM: '20',
  QQ_BOT_MAX_QUESTION_CHARS: '1000',
  QQ_BOT_SEGMENT_CHARS: '900',
  QQ_BOT_ACK: '1',
  QQ_BOT_STYLE: 'chat',
  QQ_BOT_CHAT_MAX_CHARS: '360',
  QQ_BOT_CONDENSE: '1',
  QQ_BOT_CONDENSE_CHARS: '180',
  QQ_BOT_FOLLOWUPS: '0',
  QQ_BOT_ANSWER_TIMEOUT_MS: '120000',
  QQ_BOT_WEATHER_CITY: '',
  QQ_BOT_AMAP_KEY: '',
  QQ_BOT_STATE_PATH: 'state/qq-bot-state.json',
  QQ_BOT_IMAGES: '1',
  QQ_BOT_IMAGE_HOSTS: '',
  QQ_BOT_CARDS: '1',
  QQ_BOT_LOG_LEVEL: 'info',
  YCT_BASE_URL: 'http://127.0.0.1:3300',
  YCT_PUBLIC_BASE_URL: '',
  YCT_ASSISTANT_PROVIDER: 'deepseek',
  YCT_ASSISTANT_MODEL: 'deepseek-v4-flash',
  YCT_ASSISTANT_LOCALE: 'zh-CN',
};

/**
 * 解析简单的 KEY=VALUE 文件。故意不实现变量展开和命令替换：
 * 这些配置会以服务进程身份读取，越简单越不容易出意外。
 */
export function parseEnvFile(text) {
  const values = {};
  const source = text.replace(/^\uFEFF/, '');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    values[key] = unquote(rawValue);
  }
  return values;
}

function unquote(rawValue) {
  const value = rawValue.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  // 未加引号时允许行尾注释：`900 # 每段字数`。
  const commentIndex = value.search(/\s#/);
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
}

function readEnvFile(path) {
  if (!path || !existsSync(path)) {
    return { values: {}, source: null };
  }
  try {
    return { values: parseEnvFile(readFileSync(path, 'utf8')), source: path };
  } catch {
    return { values: {}, source: null };
  }
}

function createReader(env, fileValues) {
  return (key) => {
    const fromEnv = env[key];
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
      return fromEnv.trim();
    }
    const fromFile = fileValues[key];
    if (typeof fromFile === 'string' && fromFile.trim() !== '') {
      return fromFile.trim();
    }
    return defaults[key] ?? '';
  };
}

function toInteger(read, key, fallback, problems, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = read(key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${key} 需要是 ${min} 到 ${max} 之间的整数，当前是「${raw}」。`);
    return fallback;
  }
  return value;
}

function toBoolean(read, key, fallback) {
  const raw = read(key).toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }
  return fallback;
}

function normalizeUrl(read, key, problems) {
  return normalizeOptionalUrl(read(key), key, problems);
}

function normalizeOptionalUrl(raw, key, problems) {
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    problems.push(`${key} 需要是 http(s) 地址，当前是「${raw || '空'}」。`);
    return raw;
  }
}

function normalizeModelName(read, problems) {
  const model = read('YCT_ASSISTANT_MODEL');
  if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)) {
    problems.push('YCT_ASSISTANT_MODEL 只能包含字母、数字和 . _ : / -，长度不超过 120。');
  }
  return model;
}

/**
 * 读取并校验配置。返回 problems/warnings 而不是直接抛错，
 * 方便 `--check` 一次把所有配置问题列全。
 */
export function loadConfig({ env = process.env, envPath = defaultEnvPath } = {}) {
  const file = readEnvFile(envPath);
  const read = createReader(env, file.values);
  const problems = [];
  const warnings = [];

  const appId = read('QQ_BOT_APP_ID');
  const appSecret = read('QQ_BOT_APP_SECRET');
  const apiKey = read('YCT_ASSISTANT_KEY');

  if (!appId) {
    problems.push('缺少 QQ_BOT_APP_ID（QQ 开放平台机器人 AppID）。');
  }
  if (!appSecret) {
    problems.push('缺少 QQ_BOT_APP_SECRET（QQ 开放平台机器人 AppSecret）。');
  }
  if (!apiKey) {
    problems.push('缺少 YCT_ASSISTANT_KEY（问一问使用的模型 API Key）。');
  }

  const providerId = read('YCT_ASSISTANT_PROVIDER');
  if (!knownProviders.includes(providerId)) {
    problems.push(
      `YCT_ASSISTANT_PROVIDER 只支持 ${knownProviders.join('、')}，当前是「${providerId}」。`,
    );
  }

  const locale = read('YCT_ASSISTANT_LOCALE');
  if (!knownLocales.includes(locale)) {
    problems.push(`YCT_ASSISTANT_LOCALE 只支持 ${knownLocales.join('、')}，当前是「${locale}」。`);
  }

  const segmentChars = toInteger(read, 'QQ_BOT_SEGMENT_CHARS', 900, problems, {
    min: 100,
    max: 2000,
  });
  const answerTimeoutMs = toInteger(read, 'QQ_BOT_ANSWER_TIMEOUT_MS', 120000, problems, {
    min: 5000,
    max: 180000,
  });

  const style = read('QQ_BOT_STYLE');
  if (style !== 'chat' && style !== 'full') {
    problems.push(`QQ_BOT_STYLE 只支持 chat 或 full，当前是「${style}」。`);
  }
  const chatStyle = style !== 'full';
  const condenseChars = toInteger(read, 'QQ_BOT_CONDENSE_CHARS', 180, problems, {
    min: 40,
    max: 400,
  });

  const baseUrl = normalizeUrl(read, 'YCT_BASE_URL', problems);
  const publicBaseRaw = read('YCT_PUBLIC_BASE_URL') || read('YCT_PUBLIC_SITE_URL');
  const publicBaseUrl = publicBaseRaw
    ? normalizeOptionalUrl(publicBaseRaw, 'YCT_PUBLIC_BASE_URL', problems)
    : baseUrl.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(baseUrl)
      ? baseUrl
      : '';

  const config = {
    envPath: file.source,
    statePath: resolve(botRoot, read('QQ_BOT_STATE_PATH') || 'state/qq-bot-state.json'),
    fortuneTextsPath: resolve(
      botRoot,
      read('QQ_BOT_FORTUNE_TEXTS_PATH') || 'data/fortune-texts.txt',
    ),
    groupNoticesPath: resolve(
      botRoot,
      read('QQ_BOT_GROUP_NOTICES_PATH') || 'data/group-notices.json',
    ),
    qq: {
      appId,
      appSecret,
      apiBase: normalizeUrl(read, 'QQ_BOT_API_BASE', problems),
      intents: toInteger(read, 'QQ_BOT_INTENTS', 33554432, problems, {
        min: 1,
        max: 2 ** 31 - 1,
      }),
      groupAllowlist: splitList(read('QQ_BOT_GROUP_ALLOWLIST')),
      groupAliases: splitPairs(read('QQ_BOT_GROUP_ALIASES')),
      userQpm: toInteger(read, 'QQ_BOT_USER_QPM', 6, problems, { min: 1, max: 120 }),
      groupQpm: toInteger(read, 'QQ_BOT_GROUP_QPM', 20, problems, { min: 1, max: 120 }),
    },
    yct: {
      baseUrl,
      publicBaseUrl,
      apiKey,
      providerId,
      model: normalizeModelName(read, problems),
      locale,
    },
    weather: {
      city: read('QQ_BOT_WEATHER_CITY'),
      amapKey: read('QQ_BOT_AMAP_KEY'),
    },
    reply: {
      ack: toBoolean(read, 'QQ_BOT_ACK', true),
      style,
      chatMaxChars: toInteger(read, 'QQ_BOT_CHAT_MAX_CHARS', 360, problems, {
        min: 80,
        max: 2000,
      }),
      condense: toBoolean(read, 'QQ_BOT_CONDENSE', true),
      condenseChars,
      // 超过这个长度才额外调用一次模型做改写，短回答不增加延迟。
      condenseThreshold: Math.max(160, condenseChars + 60),
      // 聊天风格默认不附参考标题，避免一条短回答后面跟一段像报告的小字。
      appendSources: toBoolean(read, 'QQ_BOT_APPEND_SOURCES', !chatStyle),
      links: toBoolean(read, 'QQ_BOT_LINKS', false),
      images: toBoolean(read, 'QQ_BOT_IMAGES', true),
      imageCaptionChars: toInteger(read, 'QQ_BOT_IMAGE_CAPTION_CHARS', 120, problems, {
        min: 40,
        max: 500,
      }),
      cards: toBoolean(read, 'QQ_BOT_CARDS', true),
      bilibili: toBoolean(read, 'QQ_BOT_BILIBILI', true),
      playerEvents: toBoolean(read, 'QQ_BOT_PLAYER_EVENTS', false),
      playerEventGroups: splitList(read('QQ_BOT_PLAYER_EVENT_GROUPS')),
      playerPollMs: toInteger(read, 'QQ_BOT_PLAYER_POLL_MS', 30_000, problems, {
        min: 10_000,
        max: 300_000,
      }),
      playerJoinText: read('QQ_BOT_PLAYER_JOIN_TEXT') || '🟢 {name} 进入了服务器',
      playerLeaveText: read('QQ_BOT_PLAYER_LEAVE_TEXT') || '🔴 {name} 离开了服务器',
      imageHosts: splitList(read('QQ_BOT_IMAGE_HOSTS')),
      followups: toBoolean(read, 'QQ_BOT_FOLLOWUPS', false),
      segmentChars,
      maxQuestionChars: toInteger(read, 'QQ_BOT_MAX_QUESTION_CHARS', 1000, problems, {
        min: 20,
        max: 2000,
      }),
      answerTimeoutMs,
    },
    logLevel: read('QQ_BOT_LOG_LEVEL') || 'info',
  };

  if (
    config.yct.baseUrl.startsWith('https://') &&
    /localhost|127\.0\.0\.1/.test(config.yct.baseUrl)
  ) {
    warnings.push('YCT_BASE_URL 指向本机却使用 https，通常直连 http://127.0.0.1:3300 即可。');
  }
  if (config.qq.groupAllowlist.size > 0) {
    warnings.push(`只响应 ${config.qq.groupAllowlist.size} 个白名单群，其他群会被忽略。`);
  }

  return { config, problems, warnings };
}

function splitList(raw) {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function splitPairs(raw) {
  const pairs = new Map();
  for (const item of raw.split(/[\s,;]+/)) {
    const [left, right] = item.split(/[=:]/u).map((part) => part.trim());
    if (left && right) {
      pairs.set(left, right);
    }
  }
  return pairs;
}

/** 日志和 --check 里只露出可核对的前后几位，不打印完整密钥。 */
export function maskSecret(value) {
  if (!value) {
    return '（未填写）';
  }
  if (value.length <= 6) {
    return `${value.slice(0, 1)}***`;
  }
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function describeConfig(config) {
  return [
    `配置文件：${config.envPath ?? '（未找到 .env，使用默认值和进程环境变量）'}`,
    `QQ AppID：${config.qq.appId || '（空）'}`,
    `QQ AppSecret：${maskSecret(config.qq.appSecret)}`,
    `QQ API：${config.qq.apiBase}`,
    `Intents：${config.qq.intents}`,
    `群白名单：${config.qq.groupAllowlist.size > 0 ? [...config.qq.groupAllowlist].join(',') : '不限制'}`,
    `问一问地址：${config.yct.baseUrl}/api/assistant/chat`,
    `模型：${config.yct.providerId} / ${config.yct.model}`,
    `模型 Key：${maskSecret(config.yct.apiKey)}`,
    `公开站点：${config.yct.publicBaseUrl || '（未配置，回答里的图片不会发送）'}`,
    `回答配图：${config.reply.images && config.yct.publicBaseUrl ? '开' : '关'}`,
    `指令结果卡片：${config.reply.cards && config.yct.publicBaseUrl ? '开' : '关'}`,
    `天气城市：${config.weather.city || '（未配置，/天气 会提示先填 QQ_BOT_WEATHER_CITY）'}`,
    `高德天气 Key：${maskSecret(config.weather.amapKey)}`,
    `签到/统计状态：${config.statePath}`,
    `运势文案：${config.fortuneTextsPath}`,
    `群进退群文案：${config.groupNoticesPath}`,
    `玩家进出同步：${config.reply.playerEvents && config.reply.playerEventGroups.length > 0 ? '开' : '关'}`,
    `回答风格：${config.reply.style}（聊天模式上限 ${config.reply.chatMaxChars} 字）`,
    `二次精炼：${config.reply.condense ? `开，目标 ${config.reply.condenseChars} 字` : '关'}`,
    `单段字数：${config.reply.segmentChars}，回答超时：${config.reply.answerTimeoutMs} ms`,
    `先发提示：${config.reply.ack ? '开' : '关'}，附参考标题：${config.reply.appendSources ? '开' : '关'}`,
  ].join('\n');
}
