import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateExpression } from './calc.mjs';
import { aboutText, helpText } from './answer.mjs';
import { makeCouplet } from './couplet.mjs';
import { shanghaiDateKey } from './community.mjs';
import { fetchTodayHistory } from './history.mjs';
import { lookupIp } from './ip.mjs';
import { randomInteger, rollDice } from './random.mjs';
import { fetchWeather } from './weather.mjs';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dataCache = new Map();

function loadMap(name) {
  if (!dataCache.has(name)) {
    dataCache.set(name, JSON.parse(readFileSync(join(dataDir, name), 'utf8')));
  }
  return dataCache.get(name);
}

const commandAliases = new Map([
  ['随机', 'random'],
  ['random', 'random'],
  ['骰子', 'dice'],
  ['dice', 'dice'],
  ['掷骰子', 'dice'],
  ['摇骰子', 'dice'],
  ['扔骰子', 'dice'],
  ['掷骰', 'dice'],
  ['摇骰', 'dice'],
  ['算', 'calc'],
  ['计算', 'calc'],
  ['calc', 'calc'],
  ['电码', 'ccc'],
  ['中文电码', 'ccc'],
  ['ccc', 'ccc'],
  ['gb2312', 'gb2312'],
  ['gb', 'gb2312'],
  ['国标', 'gb2312'],
  ['天气', 'weather'],
  ['weather', 'weather'],
  ['ip', 'ip'],
  ['归属地', 'ip'],
  ['属地', 'ip'],
  ['查ip', 'ip'],
  ['查询ip', 'ip'],
  ['ip属地', 'ip'],
  ['历史', 'history'],
  ['历史上的今天', 'history'],
  ['历史今天', 'history'],
  ['today', 'history'],
  ['对联', 'couplet'],
  ['对对联', 'couplet'],
  ['couplet', 'couplet'],
  ['汉字编码', 'gb2312'],
  ['帮助', 'help'],
  ['help', 'help'],
  ['菜单', 'help'],
  ['功能', 'help'],
  ['关于', 'about'],
  ['关于机器人', 'about'],
  ['about', 'about'],
  ['签到', 'signin'],
  ['打卡', 'signin'],
  ['签到榜', 'signinboard'],
  ['签到排行', 'signinboard'],
  ['签到排行榜', 'signinboard'],
  ['发言统计', 'stats'],
  ['群统计', 'stats'],
  ['活跃统计', 'stats'],
  ['人数', 'serverplayers'],
  ['在线人数', 'serverplayers'],
  ['服务器人数', 'serverplayers'],
  ['服务器状态', 'serverplayers'],
  ['随机地点', 'randomplace'],
  ['随机poi', 'randomplace'],
  ['手气不错', 'randomplace'],
  ['随便逛逛', 'randomplace'],
  ['逛一逛', 'randomplace'],
  ['发言榜', 'board'],
  ['活跃榜', 'board'],
  ['水群榜', 'board'],
  ['运势', 'fortune'],
  ['今日运势', 'fortune'],
  ['抽签', 'fortune'],
  ['重置运势', 'fortunereset'],
  ['重抽运势', 'fortunereset'],
  ['重抽', 'fortunereset'],
]);

/**
 * 本地快捷指令：在调用问一问之前处理，不消耗站内检索和主问答的模型调用。
 * 同时支持 /指令 和“计算 …”“上海天气”“历史上的今天”这类自然触发词。
 * 返回 { handled:false } 时交给正常的问一问流程。
 */
export async function handleCommand({
  text,
  config,
  logger,
  context,
  community,
  fetchImpl = fetch,
  weather = fetchWeather,
  couplet = makeCouplet,
  ipLookup = lookupIp,
  history = fetchTodayHistory,
}) {
  const raw = String(text ?? '').trim();
  const parsed = raw.startsWith('/') ? parseSlashCommand(raw) : parseNaturalCommand(raw);
  if (!parsed) {
    return { handled: false };
  }
  if (parsed.unknown) {
    return {
      handled: true,
      reply: `没有 ${parsed.label} 这个指令。发送「菜单」查看可用指令。`,
    };
  }

  const { command, args, label } = parsed;
  try {
    switch (command) {
      case 'help':
        return { handled: true, reply: helpText };
      case 'about':
        return { handled: true, reply: aboutText };
      case 'random': {
        const reply = randomReply(args);
        const match = /^随机数：(\d+)（(.+)）$/u.exec(reply);
        return {
          handled: true,
          reply,
          card: {
            type: 'result',
            icon: 'casino',
            title: randomTitle(args),
            eyebrow: `随机数 · ${contextDate(context)}`,
            color: '#168F78',
            result: match?.[1] ?? reply,
            resultLabel: '随机结果',
            note: match ? `范围 ${match[2]}` : '范围 1-100',
            footer: '由本机随机生成',
          },
        };
      }
      case 'dice': {
        const dice = rollDiceCommand(args);
        return {
          handled: true,
          reply: dice.reply,
          card: {
            type: 'dice',
            count: dice.count,
            sides: dice.sides,
            bonus: dice.bonus,
            rolls: dice.rolls,
            total: dice.sum,
            date: contextDate(context),
            footer: '由本机随机生成',
          },
        };
      }
      case 'calc': {
        const reply = args ? `= ${evaluateExpression(args)}` : '用法：计算 (1+2)*3';
        return {
          handled: true,
          reply,
          card: {
            type: 'result',
            icon: 'calculate',
            title: args || '算式计算',
            eyebrow: `算式 · ${contextDate(context)}`,
            color: '#168F78',
            result: args ? reply.replace(/^=\s*/u, '') : '—',
            resultLabel: '计算结果',
            note: args ? '本机计算' : reply,
            footer: '由本机计算',
          },
        };
      }
      case 'ccc': {
        const reply = telegraphReply(args);
        return {
          handled: true,
          reply,
          card: {
            type: 'telegraph',
            date: contextDate(context),
            entries: telegraphEntries(args),
            footer: '码表来自雨城通',
          },
        };
      }
      case 'gb2312': {
        const reply = gb2312Reply(args);
        return {
          handled: true,
          reply,
          card: {
            type: 'gb2312',
            date: contextDate(context),
            entries: gb2312Entries(args),
            footer: '码表来自雨城通',
          },
        };
      }
      case 'weather': {
        const city = args || config?.weather?.city || '';
        const reply = await weather({
          city,
          amapKey: config?.weather?.amapKey,
          fetchImpl,
        });
        const [header = '', ...lines] = reply.split('\n');
        const place = header.replace(/天气.*$/u, '').trim() || city || '当地';
        const updated = /（([^）]*更新)）/u.exec(header)?.[1] ?? '';
        const currentLine = lines.find((line) => /^现在/u.test(line)) ?? '';
        const dayLines = lines.filter((line) => /^(今天|明天)/u.test(line));
        const current = parseWeatherCurrent(currentLine);
        return {
          handled: true,
          reply,
          card: {
            type: 'weather',
            place,
            date: contextDate(context),
            updated,
            current,
            days: dayLines.map(parseWeatherDay).filter(Boolean),
            footer: '数据来自公开天气服务',
          },
        };
      }
      case 'ip': {
        if (!args) {
          return {
            handled: true,
            reply:
              '请提供要查询的 IP，例如：查IP 8.8.8.8。不带地址时不会查询机器人所在服务器的出口 IP。',
          };
        }
        const reply = await ipLookup({ ip: args, fetchImpl });
        const [head, ...tail] = reply.split('：');
        const detail = tail.length > 0 ? tail.join('：') : head;
        const [location, ...org] = detail.split(' · ');
        return {
          handled: true,
          reply,
          card: {
            type: 'result',
            icon: 'public',
            title: `${args || '本机出口'} IP 属地`,
            eyebrow: `网络工具 · ${contextDate(context)}`,
            color: '#2584E8',
            result: location || reply,
            resultLabel: '归属地',
            note: org.join(' · '),
            footer: '数据来自公开 IP 服务',
          },
        };
      }
      case 'history': {
        const reply = await history({ fetchImpl });
        const [header = '', ...lines] = reply.split('\n');
        const day = /（([^）]+)）/u.exec(header)?.[1] ?? '';
        return {
          handled: true,
          reply,
          card: actionCard(context, {
            icon: 'history',
            title: '历史上的今天',
            eyebrow: '历史事件',
            color: '#F59B22',
            meta: [day].filter(Boolean),
            description: lines,
            footer: '数据来自百度百科',
          }),
        };
      }
      case 'couplet':
        return runCouplet({ couplet, args, config, fetchImpl, context });
      case 'signin': {
        const groupId = requireGroup(context);
        const result = requireCommunity(community).signIn({
          groupId,
          userId: context.userId,
          name: context.userName,
          date: contextDate(context),
        });
        return {
          handled: true,
          reply: result.already
            ? `今天已经签到过了：本群第 ${result.total} 次签到，连续 ${result.streak} 天。`
            : `签到成功：本群第 ${result.total} 次签到，连续 ${result.streak} 天。`,
        };
      }
      case 'signinboard': {
        const groupId = requireGroup(context);
        const rows = requireCommunity(community).signInBoard({ groupId, limit: 10 });
        if (rows.length === 0) {
          return {
            handled: true,
            reply: '本群还没有签到记录，发送「签到」开始。',
            card: actionCard(context, {
              icon: 'leaderboard',
              title: '本群签到榜',
              eyebrow: '群签到',
              meta: ['暂无记录'],
              description: ['本群还没有签到记录，发送「签到」开始。'],
              footer: '数据来自本群签到',
            }),
          };
        }
        return {
          handled: true,
          reply: [
            '本群签到榜：',
            ...rows.map(
              (row, index) => `${index + 1}. ${row.name} ${row.total} 次（连续 ${row.streak} 天）`,
            ),
          ].join('\n'),
          card: {
            type: 'signin-board',
            rows: rows.map((row) => ({
              name: row.name,
              total: row.total,
              streak: row.streak,
            })),
            date: contextDate(context),
            footer: '数据来自本群签到',
          },
        };
      }
      case 'stats': {
        const groupId = requireGroup(context);
        const days = parseDays(args, 1);
        const stats = requireCommunity(community).messageStats({
          groupId,
          date: contextDate(context),
          days,
        });
        const label = days === 1 ? '今天' : `最近 ${days} 天`;
        const scope = stats.fullMessages ? '群消息' : '互动消息（仅 @机器人 的消息）';
        return {
          handled: true,
          reply: `${label}：共 ${stats.total} 条，${stats.uniqueUsers} 人参与，${stats.activeDays} 天有发言。\n统计范围：${scope}。`,
          card: {
            type: 'stats',
            days,
            total: stats.total,
            uniqueUsers: stats.uniqueUsers,
            activeDays: stats.activeDays,
            fullMessages: stats.fullMessages,
            date: contextDate(context),
            footer: '数据来自本群消息',
          },
        };
      }
      case 'board': {
        const groupId = requireGroup(context);
        const days = parseDays(args, 1);
        const store = requireCommunity(community);
        const rows = store.messageBoard({
          groupId,
          date: contextDate(context),
          days,
          limit: 10,
        });
        const label = days === 1 ? '今天' : `最近 ${days} 天`;
        const fullMessages = store.messageStats({
          groupId,
          date: contextDate(context),
          days,
        }).fullMessages;
        if (rows.length === 0) {
          return {
            handled: true,
            reply: `${label}还没有发言记录。`,
            card: actionCard(context, {
              icon: 'leaderboard',
              title: '发言榜',
              eyebrow: '群活跃',
              color: '#F59B22',
              meta: [label, '暂无记录'],
              description: [`${label}还没有发言记录。`],
              footer: '数据来自本群消息',
            }),
          };
        }
        const scope = fullMessages ? '' : '\n（仅统计 @机器人 的消息）';
        return {
          handled: true,
          reply:
            [
              `${label}发言榜：`,
              ...rows.map((row, index) => `${index + 1}. ${row.name} ${row.count} 条`),
            ].join('\n') + scope,
          card: {
            type: 'board',
            days,
            rows: rows.map((row) => ({ name: row.name, count: row.count })),
            fullMessages,
            date: contextDate(context),
            footer: '数据来自本群消息',
          },
        };
      }
      case 'randomplace': {
        const baseUrl = config?.yct?.baseUrl;
        if (!baseUrl) {
          return { handled: true, reply: '随机地点接口还没有配置。' };
        }
        let payload;
        let responseOk = false;
        try {
          const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/map/random-poi`, {
            signal: AbortSignal.timeout(10_000),
          });
          responseOk = response.ok;
          payload = response.ok ? await response.json() : null;
        } catch (error) {
          logger?.warn(`${label} 查询失败：`, error);
        }
        const poi = payload?.poi;
        if (!responseOk || !poi?.label) {
          return {
            handled: true,
            reply: payload?.message || '暂时没有抽到可分享的地点，请稍后再试。',
          };
        }
        const publicBase = config?.yct?.publicBaseUrl || baseUrl;
        const shareUrl = `${publicBase.replace(/\/+$/, '')}${poi.sharePath || `/map?m=${encodeURIComponent(poi.id)}`}`;
        const imagePath = poi.imageUrls?.[0] ?? poi.imageUrl;
        let imageUrl;
        if (typeof imagePath === 'string' && imagePath.trim()) {
          try {
            imageUrl = new URL(imagePath, publicBase).toString();
          } catch {
            imageUrl = undefined;
          }
        }
        const category = randomPlaceCategoryLabel(poi.categoryId);
        return {
          handled: true,
          reply: [
            `随机地点：${poi.label}`,
            category ? `类型：${category}` : '',
            poi.address ? `地址：${poi.address}` : '',
            shareUrl,
          ]
            .filter(Boolean)
            .join('\n'),
          card: {
            type: 'poi',
            label: poi.label,
            category,
            description: poi.description,
            address: poi.address,
            openingHours: poi.openingHours,
            imageUrl,
            coordinates:
              Array.isArray(poi.coordinates) && poi.coordinates.length >= 2
                ? [Number(poi.coordinates[0]), Number(poi.coordinates[1])]
                : undefined,
            shareUrl,
            date: contextDate(context),
            footer: '在雨城通地图查看',
          },
        };
      }
      case 'serverplayers': {
        const baseUrl = config?.yct?.baseUrl;
        if (!baseUrl) {
          return { handled: true, reply: '服务器状态地址还没有配置。' };
        }
        let payload;
        try {
          const response = await fetchImpl(
            `${baseUrl.replace(/\/+$/, '')}/api/operations/server-status`,
            {
              signal: AbortSignal.timeout(10_000),
            },
          );
          payload = response.ok ? await response.json() : null;
        } catch (error) {
          logger?.warn(`${label} 查询失败：`, error);
          payload = null;
        }
        const item = payload?.item;
        const checked = formatCheckedAt(item?.checkedAt);
        if (item?.availability === 'online' && Number.isFinite(item?.onlinePlayerCount)) {
          return {
            handled: true,
            reply: `服务器在线：${item.onlinePlayerCount} 人\n检测时间：${checked}`,
            card: {
              type: 'result',
              icon: 'public',
              title: '服务器在线人数',
              eyebrow: `服务器状态 · ${checked}`,
              color: '#168F78',
              result: String(item.onlinePlayerCount),
              resultLabel: '当前在线',
              note: '只显示人数，不公开玩家名单',
              footer: '数据来自雨城通',
            },
          };
        }
        if (item?.availability === 'offline') {
          return {
            handled: true,
            reply: `服务器当前离线。\n检测时间：${checked}`,
            card: {
              type: 'result',
              icon: 'public',
              title: '服务器状态',
              eyebrow: `服务器状态 · ${checked}`,
              color: '#C64255',
              result: '离线',
              resultLabel: '外网探测',
              note: '网络波动可能导致误判，请稍后重试',
              footer: '数据来自雨城通',
            },
          };
        }
        return {
          handled: true,
          reply: [
            '服务器状态暂时无法确认。',
            payload?.meta?.message || '网页地图或外网探测暂不可用，不能据此判断在线人数。',
            checked ? `检测时间：${checked}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
      case 'fortune': {
        const userId = requireUser(context);
        const fortune = requireCommunity(community).getFortune({
          userId,
          name: context.userName,
          date: contextDate(context),
        });
        return {
          handled: true,
          reply: `今日运势：${fortune.score}/100\n${fortune.text}\n（今日结果固定，发送「重置运势」可重抽）`,
          card: {
            type: 'fortune',
            name: context.userName || '你',
            score: fortune.score,
            text: fortune.text,
            date: contextDate(context),
            reset: false,
            footer: '仅供娱乐',
          },
        };
      }
      case 'fortunereset': {
        const userId = requireUser(context);
        const fortune = requireCommunity(community).resetFortune({
          userId,
          name: context.userName,
          date: contextDate(context),
        });
        return {
          handled: true,
          reply: `运势已重置：${fortune.score}/100\n${fortune.text}`,
          card: {
            type: 'fortune',
            name: context.userName || '你',
            score: fortune.score,
            text: fortune.text,
            date: contextDate(context),
            reset: true,
            footer: '仅供娱乐',
          },
        };
      }
      default:
        return { handled: false };
    }
  } catch (error) {
    logger?.warn(`${label} 执行失败：`, error);
    return {
      handled: true,
      reply: `${label} 执行失败：${error?.message ?? '未知错误'}`,
    };
  }
}

function actionCard(
  context,
  {
    icon,
    title,
    eyebrow = '本地指令',
    color = '#168F78',
    meta = [],
    description = [],
    rows = [],
    footer = '由雨城通生成',
  },
) {
  return {
    type: 'action',
    icon,
    title,
    eyebrow: `${eyebrow} · ${contextDate(context)}`,
    color,
    meta: meta.filter(Boolean).slice(0, 4),
    description: (Array.isArray(description) ? description : [description]).filter(
      (line) => typeof line === 'string',
    ),
    rows,
    footer,
  };
}

async function runCouplet({ couplet, args, config, fetchImpl, context }) {
  const reply = await couplet({
    providerId: config?.yct?.providerId,
    model: config?.yct?.model,
    apiKey: config?.yct?.apiKey,
    upper: args,
    fetchImpl,
  });
  const lines = reply
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const readLine = (prefix) =>
    lines
      .find((line) => line.startsWith(prefix))
      ?.replace(new RegExp(`^${prefix}[:：]?\\s*`, 'u'), '')
      .trim() ?? '';
  const lower = readLine('下联') || lines.find((line) => !/^上联|横批/u.test(line)) || '—';
  return {
    handled: true,
    reply,
    card: {
      type: 'couplet',
      upper: args || readLine('上联') || '上联',
      lower,
      horizontal: readLine('横批'),
      date: contextDate(context),
      footer: '由模型生成',
    },
  };
}

function requireCommunity(community) {
  if (!community) {
    throw new Error('签到和统计功能还没有启用。');
  }
  return community;
}

function requireGroup(context) {
  if (context?.kind !== 'group' || !context.groupId || !context.userId) {
    throw new Error('这个功能需要在群里使用。');
  }
  return context.groupId;
}

function requireUser(context) {
  if (!context?.userId) {
    throw new Error('这个功能需要在 QQ 会话里使用。');
  }
  return context.userId;
}

function randomPlaceCategoryLabel(categoryId) {
  const labels = {
    food: '餐饮',
    restaurant: '餐饮',
    dining: '餐饮',
    shop: '商店',
    shopping: '商店',
    scenic: '景点',
    attraction: '景点',
    tourism: '景点',
    station: '交通',
    transit: '交通',
    transport: '交通',
    service: '公共服务',
    education: '教育',
    school: '教育',
    medical: '医疗',
    hospital: '医疗',
    hotel: '住宿',
    accommodation: '住宿',
    culture: '文化',
  };
  return labels[String(categoryId ?? '')] ?? '';
}

function formatCheckedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function contextDate(context) {
  return context?.date || shanghaiDateKey();
}

function parseDays(value, fallback = 1) {
  const match = /^(\d{1,2})\s*天?$/u.exec(String(value ?? '').trim());
  if (!match) {
    return fallback;
  }
  const days = Number(match[1]);
  return days >= 1 && days <= 90 ? days : fallback;
}

function parseSlashCommand(raw) {
  const match = /^\/([a-zA-Z0-9\u4e00-\u9fff]+)\s*([\s\S]*)$/u.exec(raw);
  if (!match) {
    return null;
  }
  const diceBody = raw.slice(1).trim();
  if (/^\d*d\d+(?:\s*[+-]\s*\d+)?$/iu.test(diceBody)) {
    return { command: 'dice', args: diceBody, label: '/骰子' };
  }
  const name = match[1].toLowerCase();
  const command = commandAliases.get(name) ?? (/^\d*d\d+$/u.test(name) ? 'dice' : undefined);
  return {
    command,
    args: match[2].trim(),
    label: `/${match[1]}`,
    unknown: !command,
  };
}

/** 自然触发词：只在明确命中句式时接管，否则返回 null 交给问一问。 */
function parseNaturalCommand(raw) {
  const input = raw
    .trim()
    .replace(/[?？!！。]+$/u, '')
    .trim();
  if (!input) {
    return null;
  }

  if (/^(?:菜单|功能|功能列表|功能一览)(?:有什么|有哪些|列表|一览)?$/u.test(input)) {
    return { command: 'help', args: '', label: '菜单' };
  }
  if (/^(?:帮助|help|怎么用|\?|？)$/u.test(input)) {
    return { command: 'help', args: '', label: '帮助' };
  }
  if (/^关于(?:机器人|问一问|这个机器人)?$/u.test(input)) {
    return { command: 'about', args: '', label: '关于机器人' };
  }
  if (/^(?:历史上的今天|历史今天|今天历史)$/u.test(input)) {
    return { command: 'history', args: '', label: '历史上的今天' };
  }
  if (/^(?:签到|打卡)$/u.test(input)) {
    return { command: 'signin', args: '', label: '签到' };
  }
  if (/^(?:签到榜|签到排行|签到排行榜)$/u.test(input)) {
    return { command: 'signinboard', args: '', label: '签到榜' };
  }
  const statsMatch = /^(?:发言统计|群统计|活跃统计)(?:\s*(\d{1,2})\s*天?)?$/u.exec(input);
  if (statsMatch) {
    return { command: 'stats', args: statsMatch[1] ?? '', label: '发言统计' };
  }
  const boardMatch = /^(?:发言榜|活跃榜|水群榜)(?:\s*(\d{1,2})\s*天?)?$/u.exec(input);
  if (boardMatch) {
    return { command: 'board', args: boardMatch[1] ?? '', label: '发言榜' };
  }
  if (/^(?:今日运势|运势|抽签)$/u.test(input)) {
    return { command: 'fortune', args: '', label: '今日运势' };
  }
  if (/^(?:服务器状态|服务器在线人数|服务器人数|在线人数|几个人在线|服务器几个人)$/u.test(input)) {
    return { command: 'serverplayers', args: '', label: '服务器人数' };
  }
  if (/^(?:随机地点|随机poi|手气不错|随便逛逛|逛一逛)$/u.test(input)) {
    return { command: 'randomplace', args: '', label: '随机地点' };
  }
  if (/^(?:重置运势|重抽运势|重抽)$/u.test(input)) {
    return { command: 'fortunereset', args: '', label: '重置运势' };
  }

  let rest = matchPrefix(input, '计算');
  if (rest !== null) {
    rest = cleanArgs(rest).replace(/^一下/u, '').trim();
    if (!rest) {
      return { command: 'calc', args: '', label: '计算' };
    }
    if (!/[0-9０-９+\-*/%^().（）]/u.test(rest)) {
      return null;
    }
    return { command: 'calc', args: rest, label: '计算' };
  }

  rest = matchPrefix(input, '随机数');
  if (rest !== null) {
    rest = cleanArgs(rest);
    if (rest && !/^\d/u.test(rest)) {
      return null;
    }
    return { command: 'random', args: rest, label: '随机数' };
  }

  rest = matchPrefix(input, '骰子');
  if (rest !== null) {
    return { command: 'dice', args: cleanArgs(rest), label: '骰子' };
  }
  for (const prefix of ['掷骰子', '摇骰子', '扔骰子', '掷骰', '摇骰']) {
    rest = matchPrefix(input, prefix);
    if (rest !== null) {
      return { command: 'dice', args: cleanArgs(rest), label: '骰子' };
    }
  }
  if (
    /^(?:掷|摇|扔)?\s*\d*[dD]\d+(?:\s*[+-]\s*\d+)?$/u.test(input) ||
    /^(?:掷|摇|扔)?\s*\d+\s*(?:个|颗)\s*\d+\s*面(?:骰|骰子)?(?:\s*[+-]\s*\d+)?$/u.test(input) ||
    /^(?:掷|摇|扔)?\s*\d+\s*面骰子?(?:\s*[+-]\s*\d+)?$/u.test(input)
  ) {
    return { command: 'dice', args: input.replace(/^(?:掷|摇|扔)\s*/u, ''), label: '骰子' };
  }

  const coupletRest = matchPrefix(input, '对对联') ?? matchPrefix(input, '对联');
  if (coupletRest !== null) {
    if (isQuestion(coupletRest)) {
      return null;
    }
    return { command: 'couplet', args: cleanArgs(coupletRest), label: '对对联' };
  }

  const ipRest =
    matchPrefixCi(input, '查ip') ?? matchPrefixCi(input, '查询ip') ?? matchPrefix(input, 'ip属地');
  if (ipRest !== null) {
    if (isQuestion(ipRest)) {
      return null;
    }
    return { command: 'ip', args: cleanArgs(ipRest), label: '查IP' };
  }

  rest = matchPrefix(input, '汉字编码') ?? matchPrefixCi(input, 'gb2312');
  if (rest !== null) {
    if (isQuestion(rest)) {
      return null;
    }
    return { command: 'gb2312', args: cleanArgs(rest), label: '汉字编码' };
  }

  rest = matchPrefix(input, '中文电码') ?? matchPrefix(input, '电码');
  if (rest !== null) {
    if (isQuestion(rest)) {
      return null;
    }
    return { command: 'ccc', args: cleanArgs(rest), label: '电码' };
  }

  return parseWeatherNatural(input);
}

function parseWeatherNatural(input) {
  const weather = (city) => ({
    command: 'weather',
    args: city,
    label: city ? `${city}天气` : '天气',
  });

  if (input === '天气') {
    return weather('');
  }
  if (input.startsWith('天气')) {
    const rest = cleanArgs(input.slice(2));
    if (!rest || isGenericWeather(rest) || isQuestion(rest)) {
      return weather('');
    }
    return weather(rest);
  }

  const suffix = /^(.+?)天气(?:怎么样|如何|情况)?$/u.exec(input);
  if (!suffix) {
    return null;
  }
  let place = suffix[1]
    .replace(/^(?:今天|明天|现在|最近|今日|明日)/u, '')
    .replace(/(?:今天|明天|现在|最近|今日|明日)$/u, '')
    .trim();
  if (!place || isGenericWeather(place)) {
    return weather('');
  }
  if (isQuestion(place) || place.length > 12) {
    return null;
  }
  return weather(place);
}

function matchPrefix(text, prefix) {
  return text.startsWith(prefix) ? text.slice(prefix.length) : null;
}

function matchPrefixCi(text, prefix) {
  return text.toLowerCase().startsWith(prefix.toLowerCase()) ? text.slice(prefix.length) : null;
}

function cleanArgs(value) {
  return String(value ?? '')
    .replace(/^[\s:：,，、]+/u, '')
    .trim();
}

function isQuestion(value) {
  return /(?:怎么|如何|什么|为什么|吗|呢|多少|几点|查询|预报)/u.test(value);
}

function isGenericWeather(value) {
  return /^(?:预报|查询|情况|怎么样|如何|多少度?)$/u.test(value);
}

function randomTitle(args) {
  const text = String(args ?? '').trim();
  if (!text) {
    return '1-100随机数';
  }
  const range = /^(\d+)\s*(?:[-~,，]|到)\s*(\d+)$/u.exec(text);
  if (range) {
    return `${range[1]}-${range[2]}随机数`;
  }
  const numbers = text.split(/\s+/u).filter(Boolean);
  if (numbers.length === 1) {
    return `1-${numbers[0]}随机数`;
  }
  if (numbers.length === 2) {
    return `${numbers[0]}-${numbers[1]}随机数`;
  }
  return `${text}随机数`;
}

function randomReply(args) {
  if (!args) {
    return `随机数：${randomInteger(1, 100)}（1-100）`;
  }
  const range = /^(\d+)\s*(?:[-~,，]|到)\s*(\d+)$/u.exec(args);
  if (range) {
    return `随机数：${randomInteger(Number(range[1]), Number(range[2]))}（${range[1]}-${range[2]}）`;
  }
  const numbers = args.split(/\s+/u).filter(Boolean);
  if (numbers.length === 1) {
    const max = Number(numbers[0]);
    return `随机数：${randomInteger(1, max)}（1-${max}）`;
  }
  if (numbers.length === 2) {
    const [min, max] = numbers.map(Number);
    return `随机数：${randomInteger(min, max)}（${min}-${max}）`;
  }
  throw new Error('用法：/随机、/随机 10、/随机 5 10 或 /随机 5-10');
}

function rollDiceCommand(rawArgs) {
  const spec = parseDiceSpec(rawArgs);
  const result = rollDice(spec.count, spec.sides, spec.bonus);
  const bonusText =
    spec.bonus === 0 ? '' : spec.bonus > 0 ? ` + ${spec.bonus}` : ` - ${Math.abs(spec.bonus)}`;
  return {
    ...spec,
    rolls: result.rolls,
    sum: result.sum,
    reply: `${spec.count}d${spec.sides}${bonusText}：${result.rolls.join(' + ')}${bonusText} = ${result.sum}`,
  };
}

function parseDiceSpec(rawArgs) {
  const text = String(rawArgs ?? '').trim();
  if (!text) {
    return { count: 1, sides: 6, bonus: 0 };
  }

  const standard = /^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/iu.exec(text);
  if (standard) {
    return {
      count: standard[1] ? Number(standard[1]) : 1,
      sides: Number(standard[2]),
      bonus: standard[4] ? (standard[3] === '-' ? -Number(standard[4]) : Number(standard[4])) : 0,
    };
  }

  const chineseCount = /^(\d+)\s*(?:个|颗)\s*(\d+)\s*面(?:骰|骰子)?(?:\s*([+-])\s*(\d+))?$/u.exec(
    text,
  );
  if (chineseCount) {
    return {
      count: Number(chineseCount[1]),
      sides: Number(chineseCount[2]),
      bonus: chineseCount[4]
        ? chineseCount[3] === '-'
          ? -Number(chineseCount[4])
          : Number(chineseCount[4])
        : 0,
    };
  }

  const chineseSides = /^(\d+)\s*面骰子?(?:\s*([+-])\s*(\d+))?$/u.exec(text);
  if (chineseSides) {
    return {
      count: 1,
      sides: Number(chineseSides[1]),
      bonus: chineseSides[3]
        ? chineseSides[2] === '-'
          ? -Number(chineseSides[3])
          : Number(chineseSides[3])
        : 0,
    };
  }

  throw new Error('用法：/掷骰子、/掷骰子 2d6、/掷骰子 2个6面骰 或 /掷骰子 3d6+2');
}

function parseWeatherCurrent(line) {
  return {
    temp: /现在\s*([\d.]+)℃/u.exec(line)?.[1] ?? '--',
    condition: /现在\s*[\d.]+℃、([^、。]+)/u.exec(line)?.[1] ?? '天气未知',
    feels: /体感\s*([\d.]+)℃/u.exec(line)?.[1] ?? '',
    humidity: /湿度\s*([\d.]+)%/u.exec(line)?.[1] ?? '',
    wind: /、([^、。]*风[^、。]*)/u.exec(line)?.[1] ?? '',
  };
}

function parseWeatherDay(line) {
  const match =
    /^(今天|明天)\s*([\d.]+)\s*[~～/]\s*([\d.]+)\s*(?:℃|°C|C)?\s*[、,，]?\s*(.+?)[。.]?$/u.exec(
      line,
    );
  if (!match) {
    return null;
  }
  return {
    label: match[1],
    low: match[2],
    high: match[3],
    condition: match[4].replace(/^白天/u, '').trim(),
  };
}

function telegraphEntries(text) {
  const map = loadMap('ccc.json');
  return cleanChars(text)
    .map((char) => ({ char, code: map[char] }))
    .filter((entry) => entry.code)
    .slice(0, 40);
}

function gb2312Entries(text) {
  const map = loadMap('gb2312.json');
  return cleanChars(text)
    .filter((char) => (char.codePointAt(0) ?? 0) >= 0x80)
    .map((char) => {
      const hex = map[char];
      if (!hex) {
        return null;
      }
      return {
        char,
        area: Number.parseInt(hex.slice(0, 2), 16) - 0xa0,
        position: Number.parseInt(hex.slice(2), 16) - 0xa0,
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function telegraphReply(text) {
  const chars = cleanChars(text);
  if (chars.length === 0) {
    throw new Error('用法：/电码 临东');
  }
  if (chars.length > 40) {
    throw new Error('一次最多转换 40 个字。');
  }
  const map = loadMap('ccc.json');
  const parts = [];
  const unknown = [];
  for (const char of chars) {
    const code = map[char];
    if (code) {
      parts.push(`${char} ${code}`);
    } else {
      unknown.push(char);
    }
  }
  const lines = [`中文电码：${parts.join('，') || '（没有可转换的字）'}`];
  if (unknown.length > 0) {
    lines.push(`没有电码：${unknown.join('')}`);
  }
  return lines.join('\n');
}

function gb2312Reply(text) {
  const chars = cleanChars(text);
  if (chars.length === 0) {
    throw new Error('用法：/gb2312 临东');
  }
  if (chars.length > 40) {
    throw new Error('一次最多转换 40 个字。');
  }
  const map = loadMap('gb2312.json');
  const parts = [];
  const unknown = [];
  for (const char of chars) {
    const codePoint = char.codePointAt(0);
    if (codePoint < 0x80) {
      parts.push(`${char} ${codePoint.toString(16).toUpperCase().padStart(2, '0')}`);
      continue;
    }
    const hex = map[char];
    if (!hex) {
      unknown.push(char);
      continue;
    }
    const area = Number.parseInt(hex.slice(0, 2), 16) - 0xa0;
    const position = Number.parseInt(hex.slice(2), 16) - 0xa0;
    parts.push(chars.length <= 6 ? `${char} ${hex}（${area}-${position}）` : `${char} ${hex}`);
  }
  const lines = [`GB2312：${parts.join('，') || '（没有可转换的字）'}`];
  if (unknown.length > 0) {
    lines.push(`不在 GB2312：${unknown.join('')}`);
  }
  return lines.join('\n');
}

function cleanChars(text) {
  return [...String(text ?? '').replace(/\s+/gu, '')];
}
