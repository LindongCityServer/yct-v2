import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateExpression } from './calc.mjs';
import { aboutText, helpText } from './answer.mjs';
import { makeCouplet } from './couplet.mjs';
import { shanghaiDateKey } from './community.mjs';
import { fetchTodayHistory, parseHistoryDateText } from './history.mjs';
import { lookupIp } from './ip.mjs';
import { randomInteger, rollDice } from './random.mjs';
import { fetchWeatherReport } from './weather.mjs';
import { getBotVersion } from './version.mjs';
import { QqLinkClient } from './ldpass-link.mjs';
import { handleSignageCommand, signageCommands } from './signage.mjs';
import {
  extractTokenFromUrl,
  GroupLinkTokenStore,
  isConfirmCode,
  normalizeConfirmCode,
} from './group-link.mjs';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dataCache = new Map();
const groupTokenStores = new WeakMap();
let fallbackGroupTokenStore = null;

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
  ['版本', 'version'],
  ['机器人版本', 'version'],
  ['version', 'version'],
  ['绑定', 'bind'],
  ['绑定qq', 'bind'],
  ['我的绑定', 'mylink'],
  ['确认', 'confirm'],
  ['解绑', 'unlink'],
  ['解除绑定', 'unlink'],
  ['关于', 'about'],
  ['关于机器人', 'about'],
  ['about', 'about'],
  ['模块', 'modules'],
  ['群模块', 'modules'],
  ['功能模块', 'modules'],
  ['modules', 'modules'],
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
  ['在线玩家', 'serverplayers'],
  ['谁在线', 'serverplayers'],
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
  ['物料', 'materials'],
  ['物料盲盒说明', 'materials'],
  ['materials', 'materials'],
  ['盲盒', 'blindbox'],
  ['随机物料', 'blindbox'],
  ['物料盲盒', 'blindbox'],
  ['随机盲盒', 'blindbox'],
  ['blindbox', 'blindbox'],
  ['路牌', 'roadsign'],
  ['roadsign', 'roadsign'],
  ['楼牌', 'buildingsign'],
  ['buildingsign', 'buildingsign'],
  ['站牌', 'stopsign'],
  ['stopsign', 'stopsign'],
  ['地铁', 'metro'],
  ['地铁物料', 'metro'],
  ['地铁盲盒', 'metro'],
  ['metro', 'metro'],
  ['数据源', 'materialsource'],
  ['物料数据源', 'materialsource'],
  ['materialsource', 'materialsource'],
]);

/**
 * 帮助菜单：在 answer.mjs 的通用帮助末尾说明段前补一行物料指令。
 * （answer.mjs 由问一问方向维护，物料相关文案集中放在本文件，避免两边同时改。）
 */
export const materialHelpLine =
  '物料盲盒：/物料 查看玩法；/盲盒、/路牌、/楼牌、/站牌、/地铁 抽一张；/数据源 查看或切换本群线网';

export function commandHelpText() {
  const lines = helpText.split('\n');
  const note = lines.pop() ?? '';
  while (lines.length > 0 && lines.at(-1) === '') {
    lines.pop();
  }
  lines.push('', materialHelpLine, '', note);
  return lines.join('\n');
}

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
  weather = null,
  weatherReport = fetchWeatherReport,
  couplet = makeCouplet,
  ipLookup = lookupIp,
  history = fetchTodayHistory,
  groupTokens,
  linkClient,
  moduleStore,
  materialSourceStore,
  signage = handleSignageCommand,
}) {
  const parsed = parseIncomingCommand(text);
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
    // 物料指令统一交给 signage.mjs：/物料、/盲盒、/路牌、/楼牌、/站牌、/地铁、/数据源。
    if (signageCommands.includes(command)) {
      return signage({
        text,
        args,
        command,
        config,
        context,
        fetchImpl,
        logger,
        moduleStore,
        materialSourceStore,
      });
    }
    switch (command) {
      case 'help':
        return { handled: true, reply: commandHelpText() };
      case 'about':
        return { handled: true, reply: aboutText };
      case 'version': {
        const botVersion = getBotVersion();
        let webLine = '网页：暂时无法获取版本';
        try {
          const response = await fetchImpl(
            `${String(config?.yct?.baseUrl ?? '').replace(/\/+$/, '')}/api/health`,
            { signal: AbortSignal.timeout(5_000) },
          );
          if (response.ok) {
            const data = await response.json();
            const version = data?.releaseVersion ?? '未知';
            const buildId = data?.buildId ?? '未知';
            webLine = `网页：${version}（${buildId}）`;
          }
        } catch {
          // 版本查询失败不影响机器人自身的版本回答。
        }
        return {
          handled: true,
          reply: [`雨城通机器人：${botVersion}`, '卡片渲染：机器人本地', webLine].join('\n'),
        };
      }
      case 'bind': {
        if (context?.kind === 'group') {
          return handleGroupBind({
            config,
            fetchImpl,
            logger,
            context,
            args,
            groupTokens,
            linkClient,
          });
        }
        if (context?.kind !== 'c2c') {
          return {
            handled: true,
            reply: 'QQ 绑定只能在私聊完成，请私聊机器人发送 /绑定。',
          };
        }
        const client = linkClient ?? createLinkClient(config, fetchImpl, logger);
        if (!client.enabled) {
          return {
            handled: true,
            reply: 'QQ 绑定功能还没有配置完成，请联系管理员。',
          };
        }
        const openId = context.userId;
        if (!openId) {
          return { handled: true, reply: '无法识别当前 QQ 身份，请稍后再试。' };
        }
        const code = normalizeLinkCode(args);
        if (code) {
          const link = await client.consumeCode(code, openId);
          return {
            handled: true,
            reply: `已绑定到临东通账号：@${link.username || '当前账号'}。`,
          };
        }
        const token = await client.createToken(openId);
        return {
          handled: true,
          reply: [
            '请点击下面的链接完成 QQ 绑定（5 分钟内有效）：',
            token.url,
            '如果链接无法打开，请到临东通账号设置生成绑定码，再发送 /绑定 绑定码。',
          ].join('\n'),
        };
      }
      case 'confirm': {
        if (context?.kind === 'group') {
          return handleGroupConfirm({
            config,
            fetchImpl,
            logger,
            context,
            args,
            groupTokens,
            linkClient,
          });
        }
        return {
          handled: true,
          reply: '群绑定确认需要在群里 @我 发送 /确认 6 位确认码。',
        };
      }
      case 'mylink': {
        if (context?.kind === 'group') {
          return handleGroupMyLink({
            config,
            fetchImpl,
            logger,
            context,
            groupTokens,
            linkClient,
          });
        }
        if (context?.kind !== 'c2c') {
          return {
            handled: true,
            reply: '请私聊机器人发送 /我的绑定。',
          };
        }
        const client = linkClient ?? createLinkClient(config, fetchImpl, logger);
        if (!client.enabled) {
          return { handled: true, reply: 'QQ 绑定功能还没有配置完成，请联系管理员。' };
        }
        const link = await client.resolve(context.userId);
        return {
          handled: true,
          reply: link
            ? `当前 QQ 已绑定临东通账号：@${link.username || '当前账号'}。`
            : '当前 QQ 还没有绑定临东通账号。私聊发送 /绑定 获取绑定链接。',
        };
      }
      case 'unlink': {
        if (context?.kind === 'group') {
          return handleGroupUnlink({
            config,
            fetchImpl,
            logger,
            context,
            args,
            linkClient,
          });
        }
        if (context?.kind !== 'c2c') {
          return {
            handled: true,
            reply: '请在私聊中发送 /解绑 确认。',
          };
        }
        if (String(args ?? '').trim() !== '确认') {
          return {
            handled: true,
            reply: '解绑会断开 QQ 和临东通账号的关联。确认请发送：/解绑 确认',
          };
        }
        const client = linkClient ?? createLinkClient(config, fetchImpl, logger);
        if (!client.enabled) {
          return { handled: true, reply: 'QQ 绑定功能还没有配置完成，请联系管理员。' };
        }
        await client.unlink(context.userId);
        return { handled: true, reply: '已解除当前 QQ 与临东通账号的绑定。' };
      }
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
        const date = contextDate(context);
        if (typeof weather === 'function') {
          // 兼容测试 / 旧调用：注入的函数只返回文本，卡片仍从文本解析。
          const reply = await weather({
            city,
            amapKey: config?.weather?.amapKey,
            fetchImpl,
          });
          return {
            handled: true,
            reply,
            card: buildWeatherCardFromText(reply, { city, date }),
          };
        }
        const report = await weatherReport({
          city,
          amapKey: config?.weather?.amapKey,
          fetchImpl,
        });
        return {
          handled: true,
          reply: report.text,
          card: buildWeatherCardFromReport(report, date),
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
        const reply = await history({ fetchImpl, dateText: args });
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
        let iconUrl;
        if (typeof poi.iconUrl === 'string' && poi.iconUrl.trim()) {
          try {
            iconUrl = new URL(poi.iconUrl, publicBase).toString();
          } catch {
            iconUrl = undefined;
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
            color: poi.categoryColor,
            description: poi.description,
            address: poi.address,
            openingHours: poi.openingHours,
            imageUrl,
            iconUrl,
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
        const hasPlayerList = Array.isArray(item?.onlinePlayers);
        const onlinePlayers = hasPlayerList
          ? item.onlinePlayers
              .map((player) => (typeof player?.name === 'string' ? player.name.trim() : ''))
              .filter(Boolean)
          : [];
        const playerListLine = hasPlayerList
          ? onlinePlayers.length > 0
            ? `在线玩家：${formatOnlinePlayerNames(onlinePlayers)}`
            : '在线玩家：当前没有玩家在线'
          : undefined;
        if (item?.availability === 'online' && Number.isFinite(item?.onlinePlayerCount)) {
          return {
            handled: true,
            reply: [
              `服务器在线：${item.onlinePlayerCount} 人`,
              playerListLine,
              `检测时间：${checked}`,
            ]
              .filter(Boolean)
              .join('\n'),
            card: {
              type: 'result',
              icon: 'public',
              title: '服务器在线人数',
              eyebrow: `服务器状态 · ${checked}`,
              color: '#168F78',
              result: String(item.onlinePlayerCount),
              resultLabel: '当前在线',
              note: hasPlayerList
                ? onlinePlayers.length > 0
                  ? `在线玩家：${formatOnlinePlayerNames(onlinePlayers, 6)}`
                  : '当前没有玩家在线'
                : '暂无在线玩家名单',
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

function createLinkClient(config, fetchImpl, logger) {
  return new QqLinkClient({
    baseUrl: config?.link?.baseUrl,
    secret: config?.link?.secret,
    timeoutMs: config?.link?.timeoutMs,
    fetchImpl,
    logger,
  });
}

function groupLinkClient(config, fetchImpl, logger, linkClient) {
  return linkClient ?? createLinkClient(config, fetchImpl, logger);
}

/** bot 进程只创建一个缓存；直接调用 handleCommand 时按 config 复用，避免测试互相污染。 */
function groupLinkStore(config, groupTokens) {
  if (groupTokens) {
    return groupTokens;
  }
  if (config && typeof config === 'object') {
    let store = groupTokenStores.get(config);
    if (!store) {
      store = new GroupLinkTokenStore({
        ttlMs: config?.link?.groupTokenTtlMs,
        maxEntries: config?.link?.groupTokenCacheMax,
      });
      groupTokenStores.set(config, store);
    }
    return store;
  }
  fallbackGroupTokenStore ??= new GroupLinkTokenStore();
  return fallbackGroupTokenStore;
}

function groupLinkEnabled(config) {
  return config?.link?.groupEnabled !== false;
}

/**
 * 群绑定身份只取事件里的 group_openid 和 author.member_openid。
 * 这里故意不回退 context.userId，也不解析命令文本里的任何 openid。
 */
function groupLinkIdentity(context) {
  return {
    groupOpenId: firstString(context?.groupId, context?.groupOpenId, context?.groupOpenid),
    memberOpenId: firstString(context?.memberOpenId, context?.memberOpenid, context?.member_openid),
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function groupLinkDisabledReply() {
  return { handled: true, reply: '群聊绑定功能暂未开启，请私聊机器人发送 /绑定。' };
}

function groupLinkNotConfiguredReply() {
  return { handled: true, reply: 'QQ 绑定功能还没有配置完成，请联系管理员。' };
}

function groupLinkIdentityReply() {
  return { handled: true, reply: '无法识别当前群或成员身份，请稍后再试。' };
}

function safeLinkErrorCode(error) {
  const code = String(error?.code ?? '')
    .trim()
    .toLowerCase();
  return code || 'unknown';
}

function isRetryableLinkError(error) {
  const code = safeLinkErrorCode(error);
  return (
    code === 'network_error' ||
    code === 'timeout' ||
    /^http_5\d\d$/u.test(code) ||
    Number(error?.status) >= 500
  );
}

async function handleGroupBind({
  config,
  fetchImpl,
  logger,
  context,
  args,
  groupTokens,
  linkClient,
}) {
  if (!groupLinkEnabled(config)) {
    return groupLinkDisabledReply();
  }
  if (String(args ?? '').trim()) {
    return {
      handled: true,
      reply: '群里绑定不需要绑定码。请直接 @我 发送 /绑定 获取一次性链接。',
    };
  }
  const client = groupLinkClient(config, fetchImpl, logger, linkClient);
  if (!client.enabled) {
    return groupLinkNotConfiguredReply();
  }
  const { groupOpenId, memberOpenId } = groupLinkIdentity(context);
  if (!groupOpenId || !memberOpenId) {
    return groupLinkIdentityReply();
  }

  let created;
  try {
    created = await client.createGroupToken({ openId: memberOpenId, groupOpenId });
  } catch (error) {
    logger?.warn('群聊绑定链接生成失败：', safeLinkErrorCode(error));
    return { handled: true, reply: groupBindErrorReply(error) };
  }

  const url = typeof created?.url === 'string' ? created.url : '';
  const token = extractTokenFromUrl(url);
  if (!url || !token) {
    logger?.warn('群聊绑定链接缺少 token。');
    return { handled: true, reply: '绑定链接生成失败，请稍后再试。' };
  }

  const store = groupLinkStore(config, groupTokens);
  if (!store.set({ groupOpenId, memberOpenId, token, expiresAt: created?.expiresAt })) {
    return { handled: true, reply: '绑定链接已失效，请稍后再试。' };
  }

  return {
    handled: true,
    reply: [
      `请打开这个一次性链接登录临东通：${url}`,
      '网页会显示 6 位确认码；回到本群 @我 发送 /确认 确认码。',
    ].join('\n'),
  };
}

function groupBindErrorReply(error) {
  const code = safeLinkErrorCode(error);
  if (code === 'not_configured') {
    return 'QQ 绑定功能还没有配置完成，请联系管理员。';
  }
  if (code === 'rate_limited' || code === 'http_429') {
    return '操作有点频繁，请稍后再试。';
  }
  if (isRetryableLinkError(error)) {
    return '临时无法连接临东通绑定服务，请稍后重试。';
  }
  return '生成绑定链接失败，请稍后再试。';
}

async function handleGroupConfirm({
  config,
  fetchImpl,
  logger,
  context,
  args,
  groupTokens,
  linkClient,
}) {
  if (!groupLinkEnabled(config)) {
    return groupLinkDisabledReply();
  }
  const code = normalizeConfirmCode(args);
  if (!code) {
    return { handled: true, reply: '请发送 /确认 加网页显示的 6 位确认码。' };
  }
  if (!isConfirmCode(code)) {
    return { handled: true, reply: '确认码应为 6 位数字。' };
  }
  const client = groupLinkClient(config, fetchImpl, logger, linkClient);
  if (!client.enabled) {
    return groupLinkNotConfiguredReply();
  }
  const { groupOpenId, memberOpenId } = groupLinkIdentity(context);
  if (!groupOpenId || !memberOpenId) {
    return groupLinkIdentityReply();
  }

  const store = groupLinkStore(config, groupTokens);
  const cached = store.get(groupOpenId, memberOpenId);
  if (!cached) {
    return { handled: true, reply: '请先 @我 发送 /绑定 获取新的绑定链接。' };
  }

  const startedAt = Date.now();
  let link;
  try {
    link = await client.confirmGroup({
      token: cached.token,
      openId: memberOpenId,
      groupOpenId,
      code,
    });
  } catch (error) {
    return handleGroupConfirmError(error, {
      store,
      groupOpenId,
      memberOpenId,
      logger,
      client,
      elapsedMs: Date.now() - startedAt,
    });
  }

  store.delete(groupOpenId, memberOpenId);
  return { handled: true, reply: groupConfirmSuccess(link) };
}

async function handleGroupConfirmError(
  error,
  { store, groupOpenId, memberOpenId, logger, client, elapsedMs },
) {
  const code = safeLinkErrorCode(error);
  const duration = Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : 0;
  logger?.warn(`群聊绑定确认失败：${code}（${duration}ms）`);
  if (
    ['token_used', 'token_expired', 'token_invalid', 'token_claimed', 'http_409'].includes(code)
  ) {
    store.delete(groupOpenId, memberOpenId);
  }

  // 群确认是幂等的：上一次可能已经在服务端成功，只是响应超时。
  // token_used/http_409 时回查当前群身份，能把“已绑定”准确告诉用户。
  if (code === 'token_used' || code === 'http_409') {
    let existing = null;
    try {
      existing = await client.resolveGroup({ openId: memberOpenId, groupOpenId });
    } catch (resolveError) {
      logger?.warn('群聊绑定确认后查询失败：', safeLinkErrorCode(resolveError));
    }
    if (existing) {
      return { handled: true, reply: groupConfirmAlreadyLinked(existing) };
    }
  }

  return { handled: true, reply: groupConfirmErrorReply(code, error) };
}

function groupConfirmErrorReply(code, error) {
  switch (code) {
    case 'token_used':
    case 'http_409':
      return '这个确认已经处理过了，当前群绑定可能已经完成。发送 /我的绑定 查看；如果仍未绑定，请重新 /绑定。';
    case 'token_expired':
    case 'token_invalid':
      return '绑定链接已失效，请重新 @我 发送 /绑定 获取新链接。';
    case 'token_not_claimed':
      return '网页还没有登录确认。请先打开绑定链接登录临东通并查看确认码，再回来发送 /确认 确认码。';
    case 'confirm_code_invalid':
      return '确认码不对，请回到网页查看最新的 6 位确认码后再试。';
    case 'openid_mismatch':
    case 'group_mismatch':
      return '这个绑定链接不是当前成员发起的，请由最初 @我 发送 /绑定 的成员完成确认。';
    case 'token_claimed':
      return '这个绑定链接已被其他临东通账号打开，请重新 @我 发送 /绑定 获取新链接。';
    case 'openid_already_linked':
    case 'link_conflict':
      return '当前 QQ 身份已绑定其他临东通账号或存在绑定冲突。请发送 /我的绑定 查看，或 /解绑 确认 后再申请绑定。';
    case 'account_inactive':
      return '打开链接的临东通账号不可用，请换一个临东通账号或联系管理员。';
    case 'rate_limited':
    case 'http_429':
      return '操作有点频繁，请稍后再试。';
    case 'not_configured':
      return 'QQ 绑定功能还没有配置完成，请联系管理员。';
    default:
      if (isRetryableLinkError(error) || code === 'invalid_response') {
        return '临东通暂时无法完成确认，请稍后重试；如果网页已确认，可先发送 /我的绑定 查看是否已经绑定。';
      }
      return '绑定确认没有成功，请稍后重试。';
  }
}

function groupConfirmSuccess(link) {
  const username = link?.username || '当前账号';
  return `群绑定成功：本群已绑定到临东通账号：@${username}。\n只影响本群，不影响单聊和其他群。`;
}

function groupConfirmAlreadyLinked(link) {
  const username = link?.username || '当前账号';
  return `当前群已绑定到临东通账号：@${username}。\n只影响本群，不影响单聊和其他群。`;
}

async function handleGroupMyLink({ config, fetchImpl, logger, context, linkClient }) {
  if (!groupLinkEnabled(config)) {
    return groupLinkDisabledReply();
  }
  const client = groupLinkClient(config, fetchImpl, logger, linkClient);
  if (!client.enabled) {
    return groupLinkNotConfiguredReply();
  }
  const { groupOpenId, memberOpenId } = groupLinkIdentity(context);
  if (!groupOpenId || !memberOpenId) {
    return groupLinkIdentityReply();
  }

  let link;
  try {
    link = await client.resolveGroup({ openId: memberOpenId, groupOpenId });
  } catch (error) {
    logger?.warn('群聊绑定查询失败：', safeLinkErrorCode(error));
    return { handled: true, reply: '暂时无法查询本群绑定，请稍后再试。' };
  }

  return {
    handled: true,
    reply: link
      ? `当前 QQ 在本群已绑定临东通账号：@${link.username || '当前账号'}。`
      : '当前 QQ 在本群还没有绑定临东通账号。@我 发送 /绑定 获取绑定链接。',
  };
}

async function handleGroupUnlink({ config, fetchImpl, logger, context, args, linkClient }) {
  if (!groupLinkEnabled(config)) {
    return groupLinkDisabledReply();
  }
  if (String(args ?? '').trim() !== '确认') {
    return {
      handled: true,
      reply: '解绑只会解除本群绑定，不影响单聊和其他群。确认请发送：/解绑 确认',
    };
  }
  const client = groupLinkClient(config, fetchImpl, logger, linkClient);
  if (!client.enabled) {
    return groupLinkNotConfiguredReply();
  }
  const { groupOpenId, memberOpenId } = groupLinkIdentity(context);
  if (!groupOpenId || !memberOpenId) {
    return groupLinkIdentityReply();
  }

  try {
    await client.unlinkGroup({ openId: memberOpenId, groupOpenId });
  } catch (error) {
    logger?.warn('群聊解绑失败：', safeLinkErrorCode(error));
    return { handled: true, reply: '解绑没有成功，请稍后再试。' };
  }

  return {
    handled: true,
    reply: '已解除当前 QQ 在本群的临东通绑定，不影响单聊和其他群。',
  };
}

function normalizeLinkCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
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

/** 在线玩家名单过长时保留前几位并标注总人数，避免 QQ 消息被截断。 */
function formatOnlinePlayerNames(names, limit = 20) {
  const visible = names.slice(0, limit);
  return names.length > visible.length
    ? `${visible.join('、')} 等 ${names.length} 人`
    : visible.join('、');
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

/**
 * 命令文本先做轻量归一化：兼容 @机器人 前缀、全角斜杠/数字/空格和零宽字符。
 * 只归一化命令入口，不改变普通问答的原文。
 */
function normalizeCommandText(value) {
  let text = String(value ?? '')
    .replace(/[\u200b-\u200d\ufeff\u2060]/gu, '')
    .replace(/[０-９]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/／/gu, '/')
    .replace(/＠/gu, '@')
    .replace(/\u3000/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  text = text.replace(/^(?:<@[^>]*>\s*)+/u, '');
  text = text.replace(/^(?:(?:<@[^>]*>|@[^\s/]+)\s*)+(?=\/)/u, '');
  return text.trim();
}

/** 指令解析入口：bot 先用它判断模块开关，再交给 handleCommand 执行。 */
export function parseIncomingCommand(text) {
  const raw = normalizeCommandText(text);
  return raw.startsWith('/') ? parseSlashCommand(raw) : parseNaturalCommand(raw);
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
  if (/^(?:版本|机器人版本|当前版本|你是什么版本)$/u.test(input)) {
    return { command: 'version', args: '', label: '版本' };
  }
  if (/^(?:绑定|绑定qq|绑定QQ)$/u.test(input)) {
    return { command: 'bind', args: '', label: '绑定 QQ' };
  }
  if (/^(?:我的绑定|查看绑定)$/u.test(input)) {
    return { command: 'mylink', args: '', label: '我的绑定' };
  }
  if (/^(?:解绑|解除绑定)$/u.test(input)) {
    return { command: 'unlink', args: '', label: '解绑' };
  }
  const historyRest =
    matchPrefix(input, '历史上的今天') ??
    matchPrefix(input, '历史上今天') ??
    matchPrefix(input, '历史今天') ??
    matchPrefix(input, '今天历史') ??
    matchPrefix(input, '历史');
  if (historyRest !== null) {
    const historyArgs = cleanArgs(historyRest).replace(/^的/u, '').trim();
    if (historyArgs && !parseHistoryDateText(historyArgs)) {
      return null;
    }
    return { command: 'history', args: historyArgs, label: '历史上的今天' };
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
  if (
    /^(?:服务器状态|服务器在线人数|服务器人数|在线人数|在线玩家|在线玩家有哪些|谁在线|哪些人在线|几个人在线|服务器几个人)$/u.test(
      input,
    )
  ) {
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

  const material = parseMaterialNatural(input);
  if (material) {
    return material;
  }

  return parseWeatherNatural(input);
}

/**
 * 物料自然触发词：只接管「随机路牌」「来张站牌」「抽个楼牌」「地铁盲盒」「物料盲盒」
 * 这类明确句式；带“怎么 / 是什么 / 申请”等问法时返回 null，继续交给问一问。
 */
function parseMaterialNatural(input) {
  if (isQuestion(input)) {
    return null;
  }
  // 裸词：菜单点击或用户直接打字不带 / 时也能用；只做完全匹配，避免吞掉正常问题。
  const bareCommands = {
    物料: 'materials',
    路牌: 'roadsign',
    楼牌: 'buildingsign',
    站牌: 'stopsign',
    地铁: 'metro',
  };
  if (bareCommands[input]) {
    return { command: bareCommands[input], args: '', label: input };
  }
  const source = /^数据源(?:\s+([\s\S]+))?$/u.exec(input);
  if (source) {
    return { command: 'materialsource', args: cleanArgs(source[1] ?? ''), label: '数据源' };
  }
  const modules = /^模块(?:\s+([\s\S]+))?$/u.exec(input);
  if (modules) {
    return { command: 'modules', args: cleanArgs(modules[1] ?? ''), label: '模块' };
  }
  if (/^(?:物料盲盒|盲盒|随机盲盒|随机物料|抽(?:一)?个?盲盒|来(?:一)?个?盲盒)$/u.test(input)) {
    return { command: 'blindbox', args: '', label: '盲盒' };
  }
  if (/^地铁盲盒$/u.test(input)) {
    return { command: 'metro', args: '', label: '地铁' };
  }
  const match =
    /^(?:随机|来(?:一)?张|来(?:一)?个|抽(?:一)?张|抽(?:一)?个|整(?:一)?张|发(?:一)?张)(路牌|楼牌|站牌)$/u.exec(
      input,
    );
  if (!match) {
    return null;
  }
  const command = { 路牌: 'roadsign', 楼牌: 'buildingsign', 站牌: 'stopsign' }[match[1]];
  return { command, args: '', label: match[1] };
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

// 天气服务通常返回 ASCII 负号，少数镜像会用全角或数学负号；统一成半角再拼卡片。
function normalizeSignedNumber(value) {
  return value.replace(/[−－]/gu, '-');
}

function buildWeatherCardFromText(reply, { city, date }) {
  const [header = '', ...lines] = String(reply ?? '').split('\n');
  const place = header.replace(/天气.*$/u, '').trim() || city || '当地';
  const updated = /（([^）]*更新)）/u.exec(header)?.[1] ?? '';
  const currentLine = lines.find((line) => /^现在/u.test(line)) ?? '';
  const dayLines = lines.filter((line) => /^(今天|明天)/u.test(line));
  return {
    type: 'weather',
    place,
    date,
    updated,
    current: parseWeatherCurrent(currentLine),
    days: dayLines.map(parseWeatherDay).filter(Boolean),
    footer: '数据来自公开天气服务',
  };
}

function buildWeatherCardFromReport(report, date) {
  const current = report?.current ?? {};
  return {
    type: 'weather',
    place: String(report?.cardPlace ?? report?.place ?? '当地'),
    region: String(report?.regionLabel ?? ''),
    date,
    updated: String(report?.updated ?? ''),
    current: {
      temp: String(current.temp ?? '--'),
      condition: String(current.condition ?? '天气未知'),
      feels: current.feels ? String(current.feels) : '',
      humidity: current.humidity ? String(current.humidity) : '',
      wind: current.wind ? String(current.wind) : '',
    },
    days: Array.isArray(report?.days)
      ? report.days.map((day) => ({
          label: String(day?.label ?? ''),
          low: day?.low === undefined ? '' : String(day.low),
          high: day?.high === undefined ? '' : String(day.high),
          condition: String(day?.condition ?? ''),
        }))
      : [],
    alerts: Array.isArray(report?.alerts)
      ? report.alerts.map((alert) => ({
          title: String(alert?.title ?? ''),
          level: String(alert?.level ?? ''),
          type: String(alert?.type ?? ''),
          issuedAt: String(alert?.issuedAt ?? ''),
        }))
      : [],
    sun: report?.sun
      ? {
          sunrise: String(report.sun.sunrise ?? ''),
          sunset: String(report.sun.sunset ?? ''),
          phase: String(report.sun.phase ?? ''),
          minutes:
            typeof report.sun.minutes === 'number' && Number.isFinite(report.sun.minutes)
              ? report.sun.minutes
              : undefined,
        }
      : undefined,
    footer: '数据来自公开天气服务',
  };
}

function parseWeatherCurrent(line) {
  const current = /现在\s*([-−－]?\d+(?:\.\d+)?)\s*℃(?:\s*、\s*([^、。]+))?/u.exec(line);
  const feels = /体感\s*([-−－]?\d+(?:\.\d+)?)\s*℃/u.exec(line)?.[1];
  return {
    temp: current?.[1] ? normalizeSignedNumber(current[1]) : '--',
    condition: current?.[2] ?? '天气未知',
    feels: feels ? normalizeSignedNumber(feels) : '',
    humidity: /湿度\s*([\d.]+)%/u.exec(line)?.[1] ?? '',
    wind: /、([^、。]*风[^、。]*)/u.exec(line)?.[1] ?? '',
  };
}

function parseWeatherDay(line) {
  const match =
    /^(今天|明天)\s*([-−－]?\d+(?:\.\d+)?)\s*[~～/]\s*([-−－]?\d+(?:\.\d+)?)\s*(?:℃|°C|C)?\s*[、,，]?\s*([^、。]+)(?:、[^。]*)?[。.]?$/u.exec(
      line,
    );
  if (!match) {
    return null;
  }
  return {
    label: match[1],
    low: normalizeSignedNumber(match[2]),
    high: normalizeSignedNumber(match[3]),
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
