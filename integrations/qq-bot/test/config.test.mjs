import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig, parseEnvFile } from '../src/config.mjs';

const completeEnv = {
  QQ_BOT_APP_ID: '1020304050',
  QQ_BOT_APP_SECRET: 'secret-value',
  YCT_ASSISTANT_KEY: 'sk-test',
};

test('parseEnvFile 支持注释、引号和行尾说明', () => {
  const values = parseEnvFile(
    [
      '# 注释',
      'QQ_BOT_APP_ID=123',
      'export QQ_BOT_APP_SECRET="abc def"',
      "YCT_ASSISTANT_KEY='sk-1'",
      'QQ_BOT_SEGMENT_CHARS=700 # 每段字数',
      '',
    ].join('\n'),
  );
  assert.equal(values.QQ_BOT_APP_ID, '123');
  assert.equal(values.QQ_BOT_APP_SECRET, 'abc def');
  assert.equal(values.YCT_ASSISTANT_KEY, 'sk-1');
  assert.equal(values.QQ_BOT_SEGMENT_CHARS, '700');
});

test('缺少必填项时一次列出全部问题', () => {
  const { problems } = loadConfig({ env: {}, envPath: join(tmpdir(), 'no-such-qq-bot.env') });
  const text = problems.join('\n');
  assert.match(text, /QQ_BOT_APP_ID/);
  assert.match(text, /QQ_BOT_APP_SECRET/);
  assert.match(text, /YCT_ASSISTANT_KEY/);
});

test('进程环境变量优先于 .env 文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-qqbot-'));
  try {
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'QQ_BOT_APP_ID=from-file\nQQ_BOT_APP_SECRET=file-secret\n', 'utf8');
    const { config, problems } = loadConfig({ env: completeEnv, envPath });
    assert.deepEqual(problems, []);
    assert.equal(config.qq.appId, '1020304050');
    assert.equal(config.qq.appSecret, 'secret-value');
    assert.equal(config.yct.model, 'deepseek-v4-flash');
    assert.equal(config.reply.condense, true);
    assert.equal(config.reply.condenseChars, 180);
    assert.equal(config.reply.chatMaxChars, 360);
    assert.equal(config.weather.city, '');
    assert.equal(config.weather.amapKey, '');
    assert.ok(config.reply.condenseThreshold >= 240);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('解析白名单和数值参数', () => {
  const { config, problems } = loadConfig({
    env: {
      ...completeEnv,
      QQ_BOT_GROUP_ALLOWLIST: 'g1, g2 g3',
      QQ_BOT_USER_QPM: '3',
      QQ_BOT_SEGMENT_CHARS: '500',
      QQ_BOT_ACK: '0',
      QQ_BOT_CONDENSE: '0',
      QQ_BOT_WEATHER_CITY: '上海',
      QQ_BOT_AMAP_KEY: 'amap-key',
      YCT_ASSISTANT_PROVIDER: 'glm',
    },
    envPath: join(tmpdir(), 'no-such-qq-bot.env'),
  });
  assert.deepEqual(problems, []);
  assert.deepEqual([...config.qq.groupAllowlist].sort(), ['g1', 'g2', 'g3']);
  assert.equal(config.qq.userQpm, 3);
  assert.equal(config.reply.segmentChars, 500);
  assert.equal(config.reply.ack, false);
  assert.equal(config.reply.condense, false);
  assert.equal(config.reply.style, 'chat');
  assert.equal(config.weather.city, '上海');
  assert.equal(config.weather.amapKey, 'amap-key');
  assert.equal(config.reply.appendSources, false);
  assert.equal(config.yct.providerId, 'glm');
});

test('full 风格默认保留参考标题，聊天模式有字数上限', () => {
  const { config, problems } = loadConfig({
    env: { ...completeEnv, QQ_BOT_STYLE: 'full' },
    envPath: join(tmpdir(), 'no-such-qq-bot.env'),
  });
  assert.deepEqual(problems, []);
  assert.equal(config.reply.style, 'full');
  assert.equal(config.reply.appendSources, true);
  assert.equal(config.reply.chatMaxChars, 360);
});

test('非法回答风格会报错', () => {
  const { problems } = loadConfig({
    env: { ...completeEnv, QQ_BOT_STYLE: 'verbose' },
    envPath: join(tmpdir(), 'no-such-qq-bot.env'),
  });
  assert.match(problems.join('\n'), /QQ_BOT_STYLE/);
});

test('公开站点、配图与状态路径', () => {
  const { config, problems } = loadConfig({
    env: {
      ...completeEnv,
      YCT_PUBLIC_BASE_URL: 'https://yct.example.com/',
      QQ_BOT_IMAGE_HOSTS: 'cdn.example.com, img.example.com',
    },
    envPath: join(tmpdir(), 'no-such-qq-bot.env'),
  });
  assert.deepEqual(problems, []);
  assert.equal(config.yct.publicBaseUrl, 'https://yct.example.com');
  assert.equal(config.reply.images, true);
  assert.equal(config.reply.cards, true);
  assert.deepEqual([...config.reply.imageHosts].sort(), ['cdn.example.com', 'img.example.com']);
  assert.ok(
    config.statePath.endsWith('state\\qq-bot-state.json') ||
      config.statePath.endsWith('state/qq-bot-state.json'),
  );
});

test('非法数值和 URL 会报错', () => {
  const { problems } = loadConfig({
    env: {
      ...completeEnv,
      QQ_BOT_SEGMENT_CHARS: '5',
      YCT_BASE_URL: 'ftp://example.com',
      YCT_ASSISTANT_PROVIDER: 'unknown',
    },
    envPath: join(tmpdir(), 'no-such-qq-bot.env'),
  });
  const text = problems.join('\n');
  assert.match(text, /QQ_BOT_SEGMENT_CHARS/);
  assert.match(text, /YCT_BASE_URL/);
  assert.match(text, /YCT_ASSISTANT_PROVIDER/);
});
