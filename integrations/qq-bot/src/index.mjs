import { resolve } from 'node:path';
import { askAssistant } from './assistant-client.mjs';
import { QQBot } from './bot.mjs';
import { defaultEnvPath, describeConfig, loadConfig } from './config.mjs';
import { QQGateway } from './gateway.mjs';
import { createLogger } from './log.mjs';
import { QQApi } from './qq-api.mjs';
import { getBotVersion } from './version.mjs';

const USAGE = `雨城通问一问 QQ 机器人

用法：
  node src/index.mjs                启动机器人（常驻，自动重连）
  node src/index.mjs --check        检查配置、QQ 凭证、网关地址和网页服务
  node src/index.mjs --probe        连接网关并等待 READY，成功后立即退出
  node src/index.mjs --ask "问题"    不连 QQ，直接调用问一问测试回答
  node src/index.mjs --env <路径>    指定配置文件，默认 integrations/qq-bot/.env

配置见同目录 .env.example，必填：QQ_BOT_APP_ID、QQ_BOT_APP_SECRET、YCT_ASSISTANT_KEY。`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const envPath = options.envPath ? resolve(process.cwd(), options.envPath) : defaultEnvPath;
  const { config, problems, warnings } = loadConfig({ envPath });
  const logger = createLogger(options.mode === 'run' ? config.logLevel : 'info');

  if (options.mode === 'ask') {
    return runAsk({ config, problems, warnings, question: options.question, logger });
  }

  if (problems.length > 0) {
    console.error('配置还有问题，先补齐再启动：');
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    console.error(`\n配置文件：${config.envPath ?? envPath}`);
    console.error('可以从 .env.example 复制一份 .env 再填写。');
    return 1;
  }

  console.log(describeConfig(config));
  if (warnings.length > 0) {
    for (const warning of warnings) {
      logger.warn(warning);
    }
  }

  if (options.mode === 'check') {
    return runCheck({ config, logger });
  }
  if (options.mode === 'probe') {
    return runProbe({ config, logger });
  }
  return runBot({ config, logger });
}

async function runCheck({ config, logger }) {
  const api = new QQApi({ ...config.qq, logger });
  let failed = false;

  try {
    const token = await api.getAccessToken({ force: true });
    logger.info(`QQ access_token 获取成功（${token.slice(0, 6)}…，有效期约 7200 秒）。`);
  } catch (error) {
    failed = true;
    logger.error('QQ 凭证检查失败：', error);
  }

  try {
    const url = await api.getGatewayUrl();
    logger.info(`网关地址：${url}`);
  } catch (error) {
    failed = true;
    logger.error('网关地址获取失败：', error);
  }

  try {
    const response = await fetch(`${config.yct.baseUrl}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    logger.info(
      `网页服务正常：buildId=${data.buildId ?? '未知'}，basePath=${data.basePath ?? '/'}，` +
        `siteUrl=${data.siteUrl ?? '未知'}`,
    );
    if (typeof data.siteUrl === 'string' && /localhost|127\.0\.0\.1/.test(data.siteUrl)) {
      logger.warn('网页服务返回的 siteUrl 指向本机，QQ 里的链接可能无法打开。');
    }
  } catch (error) {
    failed = true;
    logger.error(`网页服务不可用（${config.yct.baseUrl}）：`, error);
  }

  logger.info(failed ? '检查未通过。' : '检查通过，可以启动机器人。');
  return failed ? 1 : 0;
}

async function runProbe({ config, logger }) {
  const api = new QQApi({ ...config.qq, logger });
  const gateway = new QQGateway({
    api,
    intents: config.qq.intents,
    logger,
    onEvent: async () => {},
    onFatal: async (error) => logger.error(error.message),
  });

  try {
    gateway.start();
    const ready = await gateway.waitForReady(25_000);
    logger.info(`连接成功：机器人「${ready.user?.username ?? '未知'}」。`);
    return 0;
  } catch (error) {
    logger.error('连接测试失败：', error);
    return 1;
  } finally {
    await gateway.stop();
  }
}

async function runAsk({ config, problems, warnings, question, logger }) {
  const yctProblems = problems.filter(
    (problem) => problem.startsWith('YCT_') || problem.includes('YCT_ASSISTANT_KEY'),
  );
  if (yctProblems.length > 0) {
    for (const problem of yctProblems) {
      console.error(`- ${problem}`);
    }
    return 1;
  }
  if (!question.trim()) {
    console.error('用法：node src/index.mjs --ask "中华路沿线有哪些公交站"');
    return 1;
  }
  for (const warning of warnings) {
    logger.warn(warning);
  }

  const startedAt = Date.now();
  try {
    const result = await askAssistant({
      baseUrl: config.yct.baseUrl,
      apiKey: config.yct.apiKey,
      providerId: config.yct.providerId,
      model: config.yct.model,
      locale: config.yct.locale,
      messages: [{ role: 'user', content: question.trim() }],
      timeoutMs: config.reply.answerTimeoutMs,
      logger,
    });
    if (result.error) {
      console.error(`问一问返回错误：${result.error}`);
      return 1;
    }
    console.log(`\n${result.text.trim()}\n`);
    if (result.references.length > 0) {
      console.log('引用：');
      for (const reference of result.references) {
        console.log(`- [${reference.id}] ${reference.source}：${reference.title}`);
      }
    }
    if (result.followups.length > 0) {
      console.log(`\n追问建议：${result.followups.join(' / ')}`);
    }
    console.log(`\n用时 ${Date.now() - startedAt}ms。`);
    return 0;
  } catch (error) {
    console.error(`测试失败：${error.message}`);
    return 1;
  }
}

async function runBot({ config, logger }) {
  logger.info(`机器人版本：${getBotVersion()}（卡片本地渲染）`);
  const api = new QQApi({ ...config.qq, logger });
  const bot = new QQBot({ api, config, logger });
  await bot.init();
  let shuttingDown = false;

  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`正在停止（${reason}）…`);
    await gateway.stop();
    await bot.flush();
    logger.info('已停止。');
    process.exit(exitCode);
  };

  const gateway = new QQGateway({
    api,
    intents: config.qq.intents,
    logger,
    onEvent: (type, data) => bot.handleEvent(type, data),
    onFatal: async (error) => {
      logger.error(`网关进入不可恢复状态：${error.message}`);
      await shutdown('fatal', 1);
    },
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(() => process.exit(0));
  });
  process.on('unhandledRejection', (error) => {
    logger.error('未处理的 Promise 拒绝：', error);
  });
  process.on('uncaughtException', (error) => {
    logger.error('未捕获异常，进程即将退出：', error);
    process.exit(1);
  });

  logger.info(`启动雨城通问一问 QQ 机器人（Node ${process.version}，pid ${process.pid}）。`);
  gateway.start().catch((error) => {
    logger.warn('首次连接未成功，后台会继续重连：', error);
  });
  logger.info('按 Ctrl+C 停止。把机器人加入群后 @ 它即可提问，单聊可直接发消息。');

  // 常驻：连接、心跳、重连都由 QQGateway 的定时器和 WebSocket 维持。
  return new Promise(() => {});
}

function parseArgs(args) {
  const options = { mode: 'run', question: '', envPath: '', help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--check':
        options.mode = 'check';
        break;
      case '--probe':
        options.mode = 'probe';
        break;
      case '--ask':
        options.mode = 'ask';
        options.question = args[index + 1] ?? '';
        index += 1;
        break;
      case '--env':
        options.envPath = args[index + 1] ?? '';
        index += 1;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !options.question) {
          options.question = arg;
        }
        break;
    }
  }
  return options;
}

main()
  .then((code) => {
    if (typeof code === 'number') {
      process.exitCode = code;
    }
  })
  .catch((error) => {
    console.error('启动失败：', error);
    process.exitCode = 1;
  });
