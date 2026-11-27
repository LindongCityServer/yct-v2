#!/usr/bin/env node
/**
 * 只读排障脚本：盯 state/qq-bot-state.json，判断群里的 @ 消息有没有真的到机器人。
 *
 * 为什么看这个文件：机器人收到 GROUP_AT_MESSAGE_CREATE 后，第一件事就是
 * recordGroupStats()，它在去重、白名单、模块开关和限流之前执行。所以
 * “某个成员 @ 之后计数没涨”基本等价于“事件没有进进程”，可以立刻把排查方向
 * 从机器人内部转到平台侧（@ 错对象、沙箱成员、事件权限、客户端、事件桥接管）。
 *
 * 注意：QQ_BOT_EVENT_GROUP_MAP 里被事件桥接管的群不会计数，见 bot.mjs 的
 * recordGroupStats；脚本启动时会提示。
 *
 * 用法：
 *   node scripts/watch-state.mjs                每 2 秒对比一次，只打印新增
 *   node scripts/watch-state.mjs --once         只打印今天的汇总后退出
 *   node scripts/watch-state.mjs --group <群openid>
 *   node scripts/watch-state.mjs --file D:\wwwroot\qq-bot\state\qq-bot-state.json
 *   node scripts/watch-state.mjs --env .env.prod --interval 1
 *
 * 不支持写操作，不改机器人配置，可以随时 Ctrl+C。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from '../src/config.mjs';
import { shanghaiDateKey } from '../src/community.mjs';
import { maskOpenId } from '../src/log.mjs';

const botRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `雨城通 QQ 机器人状态巡检（只读）

  node scripts/watch-state.mjs [选项]

选项：
  --file <路径>       直接指定 qq-bot-state.json，默认按 QQ_BOT_STATE_PATH 解析
  --env <路径>        读取哪个 .env 里的 QQ_BOT_STATE_PATH，默认 .env
  --group <openid>    只看某个群（默认全部群）
  --interval <秒>     轮询间隔，默认 2
  --once              只打印今天的汇总，不进入监视
  -h, --help          显示这段说明`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const envValues = loadEnvValues(options.envPath);
  const statePath = options.filePath
    ? resolve(options.filePath)
    : resolve(botRoot, envValues.QQ_BOT_STATE_PATH || 'state/qq-bot-state.json');

  const bridged = bridgedGroups(envValues.QQ_BOT_EVENT_GROUP_MAP);
  const allowed = splitList(envValues.QQ_BOT_GROUP_ALLOWLIST);
  const state = readState(statePath);
  if (!state) {
    return 1;
  }
  describeScope(statePath, bridged, allowed);

  const dateKey = shanghaiDateKey();
  printSummary(state, dateKey, options.group);
  if (options.once) {
    printUsers(state, dateKey, options.group);
    return 0;
  }

  const baseline = snapshot(state, dateKey);
  console.log(
    `\n开始监视（每 ${options.interval} 秒一次）。现在让那位成员 @ 机器人发一条，` +
      '这里会打印新增的一条；60 秒内没有输出就说明事件没到机器人。Ctrl+C 结束。\n',
  );
  const timer = setInterval(
    () => {
      const next = readState(statePath, { quiet: true });
      if (!next) {
        return;
      }
      const current = snapshot(next, dateKey);
      for (const [key, count] of current) {
        const before = baseline.get(key) ?? 0;
        if (count <= before) {
          continue;
        }
        const [groupId, userId] = key.split('\n');
        baseline.set(key, count);
        if (options.group && groupId !== options.group) {
          continue;
        }
        console.log(formatArrival(next, dateKey, groupId, userId, count, count - before));
      }
      for (const key of baseline.keys()) {
        if (!current.has(key)) {
          // 文件被原子替换或跨天时会出现，重置基线即可，不是错误。
          baseline.delete(key);
        }
      }
    },
    Math.max(1, options.interval) * 1000,
  );
  // 不 unref：定时器是进程活下去的唯一理由，unref 会让脚本立刻退出。

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n已停止监视。');
    process.exit(0);
  });
  return new Promise(() => {});
}

function parseArgs(args) {
  const options = {
    filePath: '',
    envPath: '.env',
    group: '',
    interval: 2,
    once: false,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--file' || arg === '--env' || arg === '--group' || arg === '--interval') {
      const value = args[index + 1] ?? '';
      index += 1;
      if (arg === '--file') {
        options.filePath = value;
      } else if (arg === '--env') {
        options.envPath = value || '.env';
      } else if (arg === '--group') {
        options.group = value;
      } else {
        options.interval = Number(value) || 2;
      }
    } else if (arg === '--once') {
      options.once = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function loadEnvValues(envPath) {
  const absolute = resolve(botRoot, envPath);
  if (!existsSync(absolute)) {
    console.log(`提示：没找到配置文件 ${absolute}，按默认路径和空配置处理。`);
    return {};
  }
  try {
    return parseEnvFile(readFileSync(absolute, 'utf8'));
  } catch (error) {
    console.log(`提示：读取 ${absolute} 失败（${error.message}），按空配置处理。`);
    return {};
  }
}

function splitList(raw) {
  return new Set(
    String(raw ?? '')
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/** QQ_BOT_EVENT_GROUP_MAP 的右侧值是官方群 openid，这些群的官方 @ 事件不会计数。 */
function bridgedGroups(raw) {
  const groups = new Set();
  for (const item of String(raw ?? '').split(/[\s,;]+/)) {
    const [, right] = item.split(/[=:]/u).map((part) => part.trim());
    if (right) {
      groups.add(right);
    }
  }
  return groups;
}

function readState(path, { quiet = false } = {}) {
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (!state || typeof state !== 'object' || !state.groups) {
      throw new Error('缺少 groups 字段');
    }
    return state;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.error(`找不到状态文件：${path}`);
      console.error('请确认机器人目录正确，或用 --file / QQ_BOT_STATE_PATH 指定实际路径。');
    } else if (!quiet) {
      console.error(`读取状态文件失败：${path}（${error.message}）`);
      console.error('文件可能正在被原子替换，稍后重试即可。');
    }
    return null;
  }
}

function describeScope(statePath, bridged, allowed) {
  let stamp = '未知';
  try {
    const mtime = statSync(statePath).mtimeMs;
    stamp = new Date(mtime).toLocaleString('zh-CN', { hour12: false });
  } catch {
    // 上面已经校验过存在性，这里忽略。
  }
  console.log(`状态文件：${statePath}`);
  console.log(`最后写入：${stamp}`);
  console.log(
    `群白名单：${allowed.size > 0 ? `${allowed.size} 个（不在名单的群仍会计数，但不会回答）` : '不限制'}`,
  );
  if (bridged.size > 0) {
    console.log(
      `事件桥接管：${bridged.size} 个群。这些群的官方 @ 消息不计数（改由 OneBot 的群消息计数），` +
        '问答不受影响；如果目标群在名单里，看到的计数可能来自事件桥。',
    );
  }
}

function todayGroups(state, dateKey) {
  return Object.entries(state.groups ?? {}).filter(([, group]) => group?.messages?.[dateKey]);
}

function printSummary(state, dateKey, groupFilter) {
  console.log(`\n今天 ${dateKey}（Asia/Shanghai）的 @ 消息统计：`);
  const entries = todayGroups(state, dateKey).filter(
    ([groupId]) => !groupFilter || groupId === groupFilter,
  );
  if (entries.length === 0) {
    console.log('  今天还没有任何群记录到 @ 消息。');
    return;
  }
  for (const [groupId, group] of entries) {
    const day = group.messages[dateKey];
    const names = group.names ?? {};
    const users = Object.keys(day.users ?? {});
    const named = users.filter((userId) => names[userId]).length;
    console.log(
      `  群 ${maskOpenId(groupId)}  合计 ${day.total ?? 0} 条 / ${users.length} 人  ` +
        `昵称已记录 ${named} 人  ${group.fullMessages ? '[接收所有消息]' : '[仅 @机器人]'}`,
    );
  }
}

function printUsers(state, dateKey, groupFilter) {
  const entries = todayGroups(state, dateKey).filter(
    ([groupId]) => !groupFilter || groupId === groupFilter,
  );
  for (const [groupId, group] of entries) {
    const day = group.messages[dateKey];
    const names = group.names ?? {};
    const rows = Object.entries(day.users ?? {})
      .map(([userId, count]) => ({ userId, count, name: names[userId] ?? '' }))
      .sort((left, right) => right.count - left.count);
    console.log(`\n群 ${maskOpenId(groupId)} 今天 ${rows.length} 人：`);
    rows.forEach((row, index) => {
      const name = row.name ? row.name : `用户${String(row.userId).slice(-4)}（事件未带昵称）`;
      console.log(
        `  ${String(index + 1).padStart(2)}. ${name}  ${row.count} 条  ${maskOpenId(row.userId)}`,
      );
    });
  }
}

function snapshot(state, dateKey) {
  const counts = new Map();
  for (const [groupId, group] of Object.entries(state.groups ?? {})) {
    const day = group?.messages?.[dateKey];
    for (const [userId, count] of Object.entries(day?.users ?? {})) {
      counts.set(`${groupId}\n${userId}`, count);
    }
  }
  return counts;
}

function formatArrival(state, dateKey, groupId, userId, count, delta) {
  const group = state.groups?.[groupId];
  const name = group?.names?.[userId];
  const clock = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const who = name ? name : `用户${String(userId).slice(-4)}（事件没带昵称，榜单里也显示这个名字）`;
  return (
    `[${clock}] +${delta}  群 ${maskOpenId(groupId)}  成员 ${maskOpenId(userId)}  ` +
    `${who}  今日累计 ${count} 条`
  );
}

const code = main();
if (typeof code === 'number') {
  process.exitCode = code;
} else if (code?.then) {
  code.then((value) => {
    if (typeof value === 'number') {
      process.exitCode = value;
    }
  });
}
