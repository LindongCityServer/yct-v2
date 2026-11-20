/**
 * 问一问按群范围的校验。
 *
 * 运行：pnpm assistant:scope:check（也会被 pnpm assistant:check 调用）
 *
 * 只测纯函数：意图 → 范围映射、预检拦截、工具过滤。
 * 不读数据库、不发网络请求。
 */
import {
  classifyAssistantIntent,
  type AssistantIntentResult,
} from '../../apps/web/lib/assistant/intent';
import {
  allowedScopesFor,
  buildAssistantScopePrecheck,
  buildAssistantScopePrompt,
  normalizeAssistantCapabilities,
  scopeForIntent,
} from '../../apps/web/lib/assistant/scope';
import {
  assistantTools,
  buildOpenAiToolDefinitions,
  runAssistantTool,
} from '../../apps/web/lib/assistant/tools';

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

function intent(query: string): AssistantIntentResult {
  return classifyAssistantIntent({ query, channel: 'qq-group', hasAccountContext: false });
}

console.log('── 1. capabilities 归一化 ───────────────────────');

{
  check(
    '未传 capabilities 时不做范围控制',
    normalizeAssistantCapabilities(undefined) === undefined,
  );
  check('空对象视为没传', normalizeAssistantCapabilities({}) === undefined);
  check(
    '缺省字段按开启处理',
    (() => {
      const caps = normalizeAssistantCapabilities({ transit: false });
      return Boolean(caps) && caps?.transit === false && caps?.map === true;
    })(),
  );
  check('非布尔值被忽略', normalizeAssistantCapabilities({ transit: 'off' }) === undefined);
}

console.log('── 2. 意图 → 范围 ───────────────────────────────');

{
  const cases: Array<[string, string]> = [
    ['170路首班几点', 'transit'],
    ['最近有什么公告', 'operations'],
    ['临东站附近有什么商场', 'map'],
    ['临东站的历史', 'server'],
    ['服务器在线吗', 'server'],
    ['怎么绑定临东通', 'basics'],
    ['你好', 'basics'],
    ['帮我写一首诗', 'general'],
  ];
  for (const [query, expected] of cases) {
    const result = intent(query);
    const scope = scopeForIntent(result);
    check(
      `${query} → ${expected}`,
      scope === expected,
      `${result.intent}/${result.reasonCode}/${scope ?? 'none'}`,
    );
  }
  const route = intent('从临东站到市政府怎么走');
  check('公开起终点的路线 → transit', scopeForIntent(route) === 'transit', route.reasonCode);
}

console.log('── 3. 预检拦截 ─────────────────────────────────');

{
  const caps = normalizeAssistantCapabilities({
    server: false,
    transit: false,
    operations: false,
    map: false,
    general: false,
  });
  const cases: Array<[string, string]> = [
    ['170路首班几点', 'group_scope.transit_disabled'],
    ['最近有什么公告', 'group_scope.operations_disabled'],
    ['临东站附近有什么商场', 'group_scope.map_disabled'],
    ['临东站的历史', 'group_scope.server_disabled'],
    ['帮我写一首诗', 'group_scope.general_disabled'],
  ];
  for (const [query, expected] of cases) {
    const precheck = buildAssistantScopePrecheck({ result: intent(query), capabilities: caps });
    check(`${query} 被拦截`, precheck?.reasonCode === expected, precheck?.reasonCode ?? 'null');
  }

  const greeting = buildAssistantScopePrecheck({ result: intent('你好'), capabilities: caps });
  check('基础范围永远放行', greeting === null);

  const followUp = buildAssistantScopePrecheck({
    result: intent('帮我写一首诗'),
    capabilities: caps,
    hasHistory: true,
  });
  check('有历史时通用问答不拦', followUp === null);

  const web = buildAssistantScopePrecheck({ result: intent('170路首班几点') });
  check('网页 /ask 不传能力位时不拦', web === null);

  const partial = normalizeAssistantCapabilities({ transit: true, general: false });
  const transit = buildAssistantScopePrecheck({
    result: intent('170路首班几点'),
    capabilities: partial,
  });
  check('只关通用问答时公交仍放行', transit === null);

  const blocked = buildAssistantScopePrecheck({
    result: intent('170路首班几点'),
    capabilities: caps,
  });
  check('拦截文案带模块名', blocked?.text.includes('公交与线路') === true, blocked?.text);
}

console.log('── 4. 工具过滤 ─────────────────────────────────');

{
  const all = buildOpenAiToolDefinitions(
    [],
    allowedScopesFor(
      normalizeAssistantCapabilities({
        server: true,
        transit: true,
        operations: true,
        map: true,
        general: true,
      })!,
    ),
  );
  check(
    '全部开启时工具不裁剪',
    all.length === assistantTools.length,
    `${all.length}/${assistantTools.length}`,
  );

  const noTransit = allowedScopesFor(normalizeAssistantCapabilities({ transit: false })!);
  const filtered = buildOpenAiToolDefinitions([], noTransit);
  const names = filtered.map((definition) => definition.function.name);
  check('关闭公交后不暴露 search_transit', !names.includes('search_transit'));
  check('关闭公交后不暴露 line_timetable', !names.includes('line_timetable'));
  check('基础工具仍然保留', names.includes('list_material_templates'));
  check('地图工具不受影响', names.includes('search_places'));

  const outcome = await runAssistantTool(
    'search_transit',
    { query: '170路' },
    {
      locale: 'zh-CN',
      allowedScopes: ['basics', 'map'],
    },
  );
  check('越界工具调用被拒绝', outcome.isError === true);
  check('拒绝原因可读', outcome.result.summary.includes('未开启'), outcome.result.summary);
}

console.log('── 5. 提示词与允许范围 ─────────────────────────');

{
  const caps = normalizeAssistantCapabilities({ transit: false, operations: false });
  const prompt = buildAssistantScopePrompt(caps);
  check(
    '提示词列出关闭范围',
    prompt.includes('公交与线路') && prompt.includes('公告与运营'),
    prompt,
  );
  check('提示词要求不代答', prompt.includes('不要用常识'), prompt);
  check(
    '全部开启时不追加提示',
    buildAssistantScopePrompt(
      normalizeAssistantCapabilities({
        server: true,
        transit: true,
        operations: true,
        map: true,
        general: true,
      }),
    ) === '',
  );
  check('basics 始终在允许范围里', allowedScopesFor(caps!).includes('basics'));
}

console.log('');
console.log(`通过 ${passed}，失败 ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
