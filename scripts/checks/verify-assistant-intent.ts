/**
 * 问一问第 0 轮意图分类校验。
 *
 * 运行：pnpm assistant:intent:check（也会被 pnpm assistant:check 调用）
 *
 * 这里只测纯函数，不读数据库、不发网络请求；需要真实数据的检索场景在
 * verify-assistant-scenarios.ts 里覆盖。
 */
import {
  buildAssistantIntentPrecheck,
  classifyAssistantIntent,
  shouldEnableTools,
  shouldInjectCurrentLocation,
  shouldInjectPageContext,
  shouldInjectViewerProfile,
  shouldRunAssistantRetrieval,
  type AssistantIntentInput,
  type AssistantIntentResult,
} from '../../apps/web/lib/assistant/intent';
import { assistantTools, buildOpenAiToolDefinitions } from '../../apps/web/lib/assistant/tools';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function intent(
  query: string,
  overrides: Partial<AssistantIntentInput> = {},
): AssistantIntentResult {
  return classifyAssistantIntent({
    query,
    channel: 'qq-c2c',
    hasAccountContext: true,
    ...overrides,
  });
}

function precheck(
  result: AssistantIntentResult,
  overrides: Partial<Parameters<typeof buildAssistantIntentPrecheck>[0]> = {},
) {
  return buildAssistantIntentPrecheck({
    result,
    channel: 'qq-c2c',
    hasAccountContext: true,
    hasVerifiedAccount: true,
    hasLocation: true,
    ...overrides,
  });
}

console.log('── 1. 任务要求的 10 个场景 ─────────────────────────');

{
  const result = intent('离我最近的公交站有哪些');
  check(
    '“离我最近”= nearby，需要账号位置',
    result.intent === 'nearby' &&
      result.needsAccount &&
      result.needsLocation &&
      result.privateOnly &&
      result.confidence === 'high',
    JSON.stringify(result),
  );
  check(
    '私聊里允许注入当前位置',
    shouldInjectCurrentLocation(result, 'qq-c2c') &&
      shouldRunAssistantRetrieval(result) &&
      shouldInjectViewerProfile(result) &&
      shouldEnableTools(result),
  );
  check('群聊里不注入当前位置', !shouldInjectCurrentLocation(result, 'qq-group'));
}

{
  const result = intent('我现在在哪里');
  check(
    '“我现在在哪里”= self_location',
    result.intent === 'self_location' && result.needsLocation && result.needsAccount,
    JSON.stringify(result),
  );
}

{
  const result = intent('我是谁');
  check(
    '“我是谁”= identity，需要身份资料',
    result.intent === 'identity' && result.needsProfile && result.needsAccount,
    JSON.stringify(result),
  );
}

{
  const result = intent('我的票');
  check(
    '“我的票”= account_data，且没有可用工具',
    result.intent === 'account_data' &&
      result.accountDataKind === 'tickets' &&
      result.toolHints.length === 0,
    JSON.stringify(result),
  );
}

{
  const result = intent('临东站有哪些线路');
  check(
    '“临东站有哪些线路”= public_info，不需要位置',
    result.intent === 'public_info' &&
      !result.needsLocation &&
      !result.needsAccount &&
      !shouldInjectCurrentLocation(result, 'qq-c2c'),
    JSON.stringify(result),
  );
}

{
  const result = intent('从我这去临东站');
  check(
    '“从我这去临东站”= route，需要账号位置',
    result.intent === 'route' &&
      result.needsLocation &&
      result.needsAccount &&
      result.privateOnly &&
      result.toolHints.includes('plan_route'),
    JSON.stringify(result),
  );
}

{
  const result = intent('离我最近的公交站有哪些', {
    channel: 'qq-group',
    hasAccountContext: false,
  });
  const reply = precheck(result, {
    channel: 'qq-group',
    hasAccountContext: false,
    hasVerifiedAccount: false,
    hasLocation: false,
  });
  check(
    '群聊 nearby = privateOnly，预检不调用模型',
    result.privateOnly &&
      !shouldInjectCurrentLocation(result, 'qq-group') &&
      Boolean(reply?.text.includes('私聊')) &&
      !reply?.text.includes('坐标'),
    reply?.text,
  );
}

{
  const result = intent('你好');
  const reply = precheck(result);
  check(
    '“你好”= smalltalk，不检索、不注入位置/身份、不开工具',
    result.intent === 'smalltalk' &&
      !shouldRunAssistantRetrieval(result) &&
      !shouldInjectCurrentLocation(result, 'qq-c2c') &&
      !shouldInjectViewerProfile(result) &&
      !shouldInjectPageContext(result) &&
      !shouldEnableTools(result) &&
      reply === undefined,
    JSON.stringify(result),
  );
}

{
  const result = intent('我的世界是什么');
  check(
    '“我的世界是什么”不误判成账号数据或身份',
    result.intent !== 'account_data' &&
      result.intent !== 'identity' &&
      result.accountDataKind === undefined &&
      result.toolHints.length === 0,
    JSON.stringify(result),
  );
}

{
  const result = intent('我是谁', {
    hasAccountContext: false,
  });
  const reply = precheck(result, {
    hasAccountContext: false,
    hasVerifiedAccount: false,
    hasLocation: false,
  });
  check(
    '无账号 + “我是谁”提示绑定/登录，不伪造身份',
    result.intent === 'identity' &&
      result.needsAccount &&
      Boolean(reply?.text.includes('绑定') || reply?.text.includes('登录')) &&
      Boolean(reply?.text.includes('验证')),
    reply?.text,
  );
}

console.log('── 2. 关键区分 ───────────────────────────────────');

{
  const whereIsStation = intent('临东站在哪');
  check(
    '“临东站在哪”是 public_info，不是 self_location',
    whereIsStation.intent === 'public_info' &&
      whereIsStation.intent !== 'self_location' &&
      !whereIsStation.needsLocation,
    JSON.stringify(whereIsStation),
  );

  const nearestToStation = intent('离临东站最近');
  check(
    '“离临东站最近”是 public_info，不需要账号位置',
    nearestToStation.intent === 'public_info' &&
      nearestToStation.reasonCode === 'public_info.place_nearby' &&
      !nearestToStation.needsAccount &&
      !nearestToStation.needsLocation &&
      !nearestToStation.privateOnly,
    JSON.stringify(nearestToStation),
  );

  const routeWithPlaces = intent('从临东站到市政府');
  check(
    '“从临东站到市政府”是 route，但不需要账号',
    routeWithPlaces.intent === 'route' &&
      !routeWithPlaces.needsAccount &&
      !routeWithPlaces.needsLocation &&
      !routeWithPlaces.privateOnly,
    JSON.stringify(routeWithPlaces),
  );

  const pageNearby = intent('这里附近有什么', {
    highlights: [{ kind: 'marker', title: '临东站' }],
  });
  check(
    '页面正在查看地点时，“这里附近”用页面锚点，不用账号位置',
    pageNearby.intent === 'public_info' &&
      pageNearby.reasonCode === 'public_info.page_anchor' &&
      !pageNearby.needsAccount &&
      !pageNearby.needsLocation,
    JSON.stringify(pageNearby),
  );
}

console.log('── 3. 账号数据预检 ───────────────────────────────');

{
  const result = intent('我的乘车码');
  const reply = precheck(result);
  check(
    '“我的乘车码”= ride_code，且明确回答暂未接入',
    result.accountDataKind === 'ride_code' &&
      result.toolHints.length === 0 &&
      Boolean(reply?.text.includes('暂未接入')) &&
      Boolean(reply?.text.includes('乘车码')),
    reply?.text,
  );
}

{
  const result = intent('我的订单', {
    channel: 'qq-group',
    hasAccountContext: false,
  });
  const reply = precheck(result, {
    channel: 'qq-group',
    hasAccountContext: false,
    hasVerifiedAccount: false,
    hasLocation: false,
  });
  check(
    '群聊账号数据只提示私聊，不读取账号',
    result.accountDataKind === 'orders' &&
      result.privateOnly &&
      Boolean(reply?.text.includes('私聊')) &&
      !reply?.text.includes('订单号'),
    reply?.text,
  );
}

console.log('── 4. 其他路由分支 ───────────────────────────────');

{
  const result = intent('服务器在线吗');
  check(
    '服务器状态命中专用工具，不检索位置',
    result.intent === 'server_status' &&
      result.toolHints.includes('get_server_status') &&
      !result.needsLocation &&
      !shouldRunAssistantRetrieval(result) &&
      !shouldInjectViewerProfile(result),
    JSON.stringify(result),
  );
}

{
  const result = intent('谁在线');
  check(
    '在线玩家问法命中服务器状态工具',
    result.intent === 'server_status' &&
      result.toolHints.includes('get_server_status') &&
      !result.needsAccount,
    JSON.stringify(result),
  );
}

{
  const result = intent('怎么绑定临东通');
  check(
    '绑定指引 = site_help',
    result.intent === 'site_help' &&
      result.toolHints.includes('search_site_content') &&
      !result.needsAccount,
    JSON.stringify(result),
  );
}

{
  const result = intent('页面打不开');
  check('打不开/报错 = feedback', result.intent === 'feedback', JSON.stringify(result));
}

{
  const result = intent('我是谁', {
    hasAccountContext: true,
  });
  const reply = precheck(result, {
    hasAccountContext: true,
    hasVerifiedAccount: false,
    hasLocation: false,
  });
  check(
    '已绑定但未验证服务器账号时提示验证',
    Boolean(reply?.text.includes('验证')) && reply?.reasonCode === 'precheck.account_unverified',
    reply?.text,
  );
}

{
  const result = intent('我在哪', {
    hasAccountContext: true,
  });
  const reply = precheck(result, {
    hasAccountContext: true,
    hasVerifiedAccount: true,
    hasLocation: false,
  });
  check(
    '有账号但没有位置记录时给出地图手动定位入口',
    result.intent === 'self_location' &&
      reply?.reasonCode === 'precheck.location_missing' &&
      reply.references.some((reference) => reference.href === '/map') &&
      Boolean(reply.text.includes('没有查到你的最后记录位置')),
    reply?.text,
  );
}

{
  const result = intent('   ');
  check(
    '空问题 = unknown / low',
    result.intent === 'unknown' && result.confidence === 'low',
    JSON.stringify(result),
  );
}

console.log('── 5. toolHints 与注册工具一致 ───────────────────');

{
  const results = [
    intent('离我最近的公交站有哪些'),
    intent('离临东站最近'),
    intent('临东站有哪些线路'),
    intent('服务器在线吗'),
    intent('怎么绑定临东通'),
    intent('从临东站到市政府怎么走'),
  ];
  const knownTools = new Set(assistantTools.map((tool) => tool.name));
  const hints = results.flatMap((result) => result.toolHints);
  check(
    'toolHints 都是已注册工具',
    hints.every((name) => knownTools.has(name)),
    hints.filter((name) => !knownTools.has(name)).join('、'),
  );

  const definitions = buildOpenAiToolDefinitions(['get_server_status']);
  check(
    '意图提示的工具排在 function calling 清单前面',
    definitions[0]?.function.name === 'get_server_status',
    definitions[0]?.function.name,
  );
  check(
    '排序不裁剪工具能力',
    definitions.length === assistantTools.length,
    `${definitions.length}/${assistantTools.length}`,
  );
}

console.log('');
console.log(`通过 ${passed}，失败 ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
