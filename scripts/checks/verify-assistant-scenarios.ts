/**
 * 问一问真实使用场景校验。
 *
 * 覆盖思路：把用户在实际使用中真的会问的问题按难度分层，
 * 先跑不依赖线上数据的纯函数用例，再用本地已发布读模型跑真实问题。
 * 数据缺失时标记为跳过，不把“这台机器没同步数据”误判成功能坏了。
 *
 * 运行：pnpm assistant:check
 */
import type { MapGeometry } from '../../packages/contracts/src/domain';
import {
  buildAssistantRetrieval,
  buildQueryCandidates,
} from '../../apps/web/lib/assistant/retrieval';
import { buildAssistantSystemPrompt } from '../../apps/web/lib/assistant/chat';
import { buildPlaceQueryCandidates } from '../../apps/web/lib/assistant/place-synonyms';
import {
  getMaterialWorkspaceGuide,
  resolveMaterialWorkspace,
  shouldStayInWorkspace,
} from '../../apps/web/lib/assistant/material-workspaces';
import { detectAskMode } from '../../apps/web/lib/assistant/query-intent';
import {
  findAlongChainMarkerMatches,
  findCoordinateChainProjection,
  findNearbyMarkerMatches,
  isCoordinateInsideRegionGeometry,
} from '../../apps/web/lib/map-spatial';
import {
  findTransitLineMarker,
  queryAlongLineMarkers,
  queryNearbyMarkers,
  type SpatialMarker,
  type SpatialMarkerContext,
} from '../../apps/web/lib/map-spatial-query';
import {
  assertToolSchema,
  assistantTools,
  buildMcpToolDefinitions,
  buildOpenAiToolDefinitions,
  runAssistantTool,
} from '../../apps/web/lib/assistant/tools';
import { handleMcpMessage } from '../../apps/web/lib/mcp/server';
import { createAssistantTextFilter } from '../../apps/web/lib/assistant/tool-syntax-filter';
import {
  buildPlayerLocationReferences,
  findPlayerMatch,
} from '../../apps/web/lib/assistant/player-retrieval';
import { parsePlayerListWikitext } from '../../apps/web/lib/wiki-player-aliases';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function skip(name: string, reason: string) {
  skipped += 1;
  console.log(`↷ ${name}（跳过：${reason}）`);
}

/** 数据驱动断言：前置数据不存在时跳过，而不是失败。 */
function checkWithData(name: string, available: boolean, ok: boolean, reason: string) {
  if (!available) {
    skip(name, reason);
    return;
  }
  check(name, ok);
}

const point = (x: number, z: number): MapGeometry => ({ type: 'Point', coordinates: [x, z] });
const chain = (coordinates: Array<[number, number]>): MapGeometry => ({
  type: 'MultiPoint',
  coordinates,
});

function marker(
  id: string,
  label: string,
  categoryId: string,
  geometry: MapGeometry,
): SpatialMarker {
  return { id, label, categoryId, geometry };
}

function context(markers: SpatialMarker[]): SpatialMarkerContext {
  return { markers, categoryNames: new Map(), locale: 'zh-CN' };
}

console.log('── 1. 空间计算：地图周边/沿线搜索的底层行为 ─────────────');

{
  const projection = findCoordinateChainProjection(
    [50, 40],
    [
      [0, 0],
      [100, 0],
    ],
  );
  check(
    '折线投影给出垂距与里程',
    projection?.distance === 40 && projection?.mileage === 50,
    JSON.stringify(projection),
  );
}

{
  const projection = findCoordinateChainProjection(
    [150, 0],
    [
      [0, 0],
      [100, 0],
    ],
  );
  check(
    '超出线段末端时按端点计算',
    projection?.distance === 50 && projection?.mileage === 100,
    JSON.stringify(projection),
  );
}

{
  const markers = [
    marker('near', '近处餐厅', 'dining', point(30, 40)),
    marker('far', '远处餐厅', 'dining', point(0, 120)),
  ];
  const result = findNearbyMarkerMatches(markers, { center: [0, 0], radius: 100 });
  check(
    '周边搜索按半径过滤并按距离排序',
    result.length === 1 && result[0]?.marker.id === 'near' && result[0]?.distance === 50,
    JSON.stringify(result.map((item) => [item.marker.id, item.distance])),
  );
}

{
  const lineCoordinates: Array<[number, number]> = [
    [0, 0],
    [1000, 0],
  ];
  const markers = [
    marker('on-line', '沿线小馆', 'dining', point(500, 50)),
    marker('too-far', '远处小馆', 'dining', point(500, 400)),
    marker('end', '终点店', 'dining', point(1200, 0)),
  ];
  const inCorridor = findAlongChainMarkerMatches(markers, { chain: lineCoordinates });
  check(
    '沿线搜索按走廊垂距过滤',
    inCorridor.some((item) => item.marker.id === 'on-line') &&
      !inCorridor.some((item) => item.marker.id === 'too-far') &&
      inCorridor.some((item) => item.marker.id === 'end'),
    JSON.stringify(inCorridor.map((item) => item.marker.id)),
  );

  const ranged = findAlongChainMarkerMatches(markers, {
    chain: lineCoordinates,
    fromMileage: 0,
    toMileage: 600,
  });
  check(
    '沿线搜索支持里程区间',
    ranged.length === 1 && ranged[0]?.marker.id === 'on-line' && ranged[0]?.mileage === 500,
    JSON.stringify(ranged.map((item) => [item.marker.id, item.mileage])),
  );
}

{
  const contextValue = context([
    marker('dining', '中华早点', 'dining', point(10, 0)),
    marker('road', '南环路', 'road', point(20, 0)),
  ]);
  const result = queryNearbyMarkers(contextValue, {
    anchor: marker('anchor', '临东站', 'railway-station', point(0, 0)),
    radius: 100,
    categories: ['餐饮'],
  });
  check(
    '周边搜索的分类筛选生效',
    result?.items.length === 1 && result.items[0]?.label === '中华早点',
    JSON.stringify(result?.items.map((item) => item.label)),
  );
}

{
  const region: MapGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ],
  };
  check(
    '区域内判断（区域内/区域外附近）',
    isCoordinateInsideRegionGeometry([50, 50], region) &&
      !isCoordinateInsideRegionGeometry([150, 50], region),
  );
}

{
  const lineMarker = marker(
    'transit-line-170',
    '170路',
    'transit-line',
    chain([
      [0, 0],
      [500, 0],
      [1000, 0],
    ]),
  );
  const contextValue = context([
    lineMarker,
    marker('dining', '沿线小馆', 'dining', point(500, 20)),
  ]);
  const along = queryAlongLineMarkers(contextValue, { line: lineMarker, categories: ['餐饮'] });
  check(
    '线路标记可直接作为沿线锚点',
    along?.line.label === '170路' && along.items[0]?.mileage === 500,
    JSON.stringify(along?.items.map((item) => [item.label, item.mileage])),
  );

  const resolved = findTransitLineMarker(contextValue.markers, { lineId: '170' });
  check('线路 ID 能定位到沿线锚点', resolved?.id === 'transit-line-170', resolved?.id);
}

console.log('── 2. 问题拆解：口语问法能不能对上站内数据 ─────────────');

{
  const candidates = buildQueryCandidates('有哪些超市');
  check('“有哪些超市”拆出关键词“超市”', candidates.includes('超市'), JSON.stringify(candidates));
}

{
  const candidates = buildQueryCandidates('有什么地方能卖早点吗');
  check(
    '去掉“有什么/地方/吗”后保留“能卖早点”',
    candidates.includes('能卖早点') && !candidates.includes('地方'),
    JSON.stringify(candidates),
  );
}

{
  const candidates = buildQueryCandidates('中华早点？');
  check('带标点的实体名仍可整串命中', candidates.includes('中华早点'), JSON.stringify(candidates));
}

{
  const factory = buildPlaceQueryCandidates('城里有哪些工厂？');
  check('口语“工厂”映射到产业设施', factory.includes('产业设施'), JSON.stringify(factory));

  const dining = buildPlaceQueryCandidates('170路沿线有什么美食');
  check('口语“美食”映射到餐饮', dining.includes('餐饮'), JSON.stringify(dining));

  const hospital = buildPlaceQueryCandidates('附近有医院吗');
  check('口语“医院”映射到医疗', hospital.includes('医疗'), JSON.stringify(hospital));
}

console.log('── 3. 物料工作台：只答工作台内部操作 ─────────────────');

{
  const transitGuide = getMaterialWorkspaceGuide('transit-materials');
  check(
    '“预览图为什么带水印”留在工作台',
    shouldStayInWorkspace(transitGuide, '预览图为什么带水印？'),
  );
  check('“线路颜色在哪里改”留在工作台', shouldStayInWorkspace(transitGuide, '线路颜色在哪里改？'));
  check(
    '“这条线路经过哪些地方”放开到全站数据',
    !shouldStayInWorkspace(transitGuide, '这条线路经过哪些地方？'),
  );

  const roadGuide = getMaterialWorkspaceGuide('road-materials');
  check('路牌工作台问坐标留在工作台', shouldStayInWorkspace(roadGuide, '安装坐标怎么填写？'));
  check('路牌工作台问朝向留在工作台', shouldStayInWorkspace(roadGuide, '朝向设置反了会怎样？'));

  check(
    '路径识别两个工作台',
    resolveMaterialWorkspace('/services/transit-materials') === 'transit-materials' &&
      resolveMaterialWorkspace('/services/road-materials') === 'road-materials',
  );
}

console.log('── 4. 搜索/问一问自动切换 ─────────────────────────');

{
  check(
    '精确实体进入搜索',
    !detectAskMode({
      query: '170路',
      hasExactEntity: true,
      hasStrongResult: true,
      embedded: false,
    }),
  );
  check(
    '空间问法进入问一问',
    detectAskMode({
      query: '170路沿线有什么美食',
      hasExactEntity: false,
      hasStrongResult: false,
      embedded: false,
    }),
  );
  check(
    '有强结果的短词留在搜索',
    !detectAskMode({
      query: '超市',
      hasExactEntity: false,
      hasStrongResult: true,
      embedded: false,
    }),
  );
  check(
    '嵌入模式不切问一问',
    !detectAskMode({
      query: '170路沿线有什么美食',
      hasExactEntity: false,
      hasStrongResult: false,
      embedded: true,
    }),
  );
  check(
    '问句即使命中实体也进入问一问',
    detectAskMode({
      query: '尚瑞超市(启航店)在哪？',
      hasExactEntity: true,
      hasStrongResult: true,
      embedded: false,
    }),
  );
  check(
    '“有什么/哪些”问法进入问一问',
    detectAskMode({
      query: '临东站附近有什么美食？',
      hasExactEntity: false,
      hasStrongResult: true,
      embedded: false,
    }),
  );
  check(
    '纯实体名仍留在搜索',
    !detectAskMode({
      query: '尚瑞超市(启航店)',
      hasExactEntity: true,
      hasStrongResult: true,
      embedded: false,
    }),
  );
}

console.log('── 5. 真实场景：简单实体与分类问题 ─────────────────');

async function retrievalOf(query: string, options: { pathname?: string } = {}) {
  return buildAssistantRetrieval(query, 'zh-CN', options);
}

function hasSource(references: Array<{ source: string }>, source: string): boolean {
  return references.some((reference) => reference.source === source);
}

function textOf(references: Array<{ title: string; snippet?: string }>): string {
  return references.map((reference) => `${reference.title} ${reference.snippet ?? ''}`).join('\n');
}

{
  const result = await retrievalOf('170路');
  check('简单：线路名能召回线路并带站点顺序', hasSource(result.references, '线路'));
  checkWithData(
    '简单：线路摘要包含经过站点',
    hasSource(result.references, '线路'),
    /经过 \d+ 站/.test(textOf(result.references)),
    '当前数据没有线路站点明细',
  );
}

{
  const result = await retrievalOf('尚瑞超市(启航店)');
  checkWithData(
    '简单：完整地点名能召回地点',
    true,
    hasSource(result.references, '地点') && textOf(result.references).includes('尚瑞超市'),
    '当前数据没有该地点',
  );
}

{
  const result = await retrievalOf('城里有哪些工厂？');
  checkWithData(
    '中等：工厂类问题映射到产业设施',
    true,
    hasSource(result.references, '地点') && textOf(result.references).includes('产业设施'),
    '当前数据没有产业设施类地点',
  );
}

{
  const result = await retrievalOf('附近有医院吗');
  checkWithData(
    '中等：医院类问题召回医疗地点',
    true,
    hasSource(result.references, '地点') && textOf(result.references).includes('医疗'),
    '当前数据没有医疗类地点',
  );
}

{
  const result = await retrievalOf('有哪些超市');
  checkWithData(
    '中等：口语“超市”能召回商超地点',
    true,
    textOf(result.references).includes('超市'),
    '当前数据没有超市类地点',
  );
}

console.log('── 6. 真实场景：周边与沿线 ─────────────────────────');

{
  const result = await retrievalOf('170路沿线有什么美食');
  const available = hasSource(result.references, '沿线');
  checkWithData('沿线：返回沿线聚合引用', true, available, '当前地图快照没有该线路几何');
  checkWithData(
    '沿线：条目带沿线里程',
    available,
    /沿线 \d+ 格/.test(textOf(result.references)),
    '当前数据没有沿线匹配地点',
  );
  checkWithData(
    '沿线：不再混入 B 站动态',
    true,
    !hasSource(result.references, 'B站动态'),
    '当前数据没有社交内容',
  );
}

{
  const result = await retrievalOf('临东站附近有什么美食');
  const available = hasSource(result.references, '周边');
  checkWithData('周边：返回周边聚合引用', true, available, '当前地图快照没有该锚点');
  checkWithData(
    '周边：条目带距离',
    available,
    /距临东站 \d+ 格/.test(textOf(result.references)),
    '当前数据没有周边匹配地点',
  );
}

{
  const result = await buildAssistantRetrieval('这里附近有什么美食', 'zh-CN', {
    pathname: '/map',
    highlights: [{ kind: 'marker', title: '临东站' }],
  });
  const available = hasSource(result.references, '周边');
  checkWithData('周边：没有写锚点时依赖页面上下文', true, available, '当前地图快照没有该锚点');
}

console.log('── 7. 真实场景：时刻、换乘与运营 ─────────────────');

{
  const result = await retrievalOf('170路下一班几点');
  checkWithData(
    '时刻：线路问题返回首末班/发车时刻',
    true,
    hasSource(result.references, '时刻') && /首末班|下一班/.test(textOf(result.references)),
    '当前数据没有该线路时刻表',
  );
  checkWithData(
    '时刻：带当前时间，能判断末班是否已过',
    hasSource(result.references, '时刻'),
    /当前 \d{2}:\d{2}/.test(textOf(result.references)),
    '当前数据没有该线路时刻表',
  );

  const prompt = buildAssistantSystemPrompt(result, 'zh-CN', {
    pathname: '/map',
    title: '地图探索',
    search: '',
  });
  check('提示词注入北京时间，避免“即将停运”这类过期措辞', prompt.includes('当前时间是'));
}

{
  const result = await retrievalOf('临东站到出生点怎么走');
  const routeRef = result.references.find((reference) => reference.source === '路线规划');
  checkWithData(
    '路线：起终点明确时带进地图路线规划',
    true,
    Boolean(routeRef) && (routeRef?.href ?? '').includes('r=1'),
    '当前地图快照没有这组起终点',
  );
}

{
  const result = await retrievalOf('从猴市中北到临东站汽车客运枢纽站怎么走');
  checkWithData(
    '换乘：起终点问题返回换乘方案',
    true,
    hasSource(result.references, '换乘方案'),
    '当前班次数据没有这组起终点',
  );
}

{
  const result = await retrievalOf('310路停运了吗');
  checkWithData(
    '运营：停运问题能召回相关公告',
    true,
    hasSource(result.references, '运营') || hasSource(result.references, '客运公告'),
    '当前数据没有相关运营公告',
  );
}

console.log('── 8. 真实场景：物料工作台 ─────────────────────────');

{
  const result = await retrievalOf('有哪些模板可以选？', {
    pathname: '/services/transit-materials',
  });
  check(
    '工作台：模板问题聚焦工作台',
    hasSource(result.references, '物料工作台') && !hasSource(result.references, '地点'),
  );
  checkWithData(
    '工作台：返回后台已发布模板名',
    true,
    textOf(result.references).includes('当前可用模板'),
    '当前没有已发布模板',
  );
}

{
  const result = await retrievalOf('这条线路经过哪些地方？', {
    pathname: '/services/transit-materials',
  });
  check(
    '工作台：明确问外部线路时放开全站数据',
    !result.references.every((reference) => reference.source === '物料工作台'),
  );
}

console.log('── 9. 边界与异常 ─────────────────────────');

{
  const result = await retrievalOf('   ');
  check(
    '空查询不返回引用',
    result.references.length === 0 && result.sourceStatus === 'not_configured',
    `${result.references.length}/${result.sourceStatus}`,
  );
}

{
  const result = await retrievalOf('怎么坐环游？');
  check(
    '无资料的问题不编造实体',
    !result.references.some((reference) => reference.title.includes('环游')),
    JSON.stringify(result.references.map((reference) => reference.title)),
  );
}

{
  const longQuery =
    '我明天下午想从临东市区出发，先去趟超市买点东西，然后再找一个能坐一会儿的餐厅，最好离地铁站近一点，你帮我安排一下路线';
  const result = await retrievalOf(longQuery);
  check(
    '超长复合问句不报错且有结果',
    result.references.length > 0,
    `${result.references.length} 条引用`,
  );
}

{
  const result = await retrievalOf('从临东站到临东港怎么走');
  check(
    '起终点不在班次数据里时不给出假方案',
    !hasSource(result.references, '换乘方案'),
    JSON.stringify(result.references.map((reference) => reference.source)),
  );
}

console.log('── 10. 工具注册表与 MCP 一致性 ─────────────────────');

{
  check('工具数量覆盖问一问的核心能力', assistantTools.length >= 10, `${assistantTools.length} 个`);
  check(
    '工具名唯一',
    new Set(assistantTools.map((tool) => tool.name)).size === assistantTools.length,
  );

  const schemaIssues = assistantTools.flatMap((tool) =>
    assertToolSchema(tool.inputSchema).map((issue) => `${tool.name}: ${issue}`),
  );
  check('工具 JSON Schema 完整', schemaIssues.length === 0, schemaIssues.join('；'));
  check(
    '工具描述与标题齐全',
    assistantTools.every((tool) => tool.description.length > 10 && tool.title.length > 0),
  );

  const openAiTools = buildOpenAiToolDefinitions();
  const mcpTools = buildMcpToolDefinitions();
  check(
    'function calling 与 MCP 暴露同一批工具',
    openAiTools.length === mcpTools.length &&
      openAiTools.every((tool, index) => tool.function.name === mcpTools[index]?.name),
  );
  check(
    'MCP 工具全部标记为只读',
    mcpTools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint),
  );
}

{
  const unknown = await runAssistantTool('drop_database', {}, { locale: 'zh-CN' });
  check('未知工具被拒绝', unknown.isError && unknown.result.summary.includes('没有名为'));

  const missingArgument = await runAssistantTool('search_places', {}, { locale: 'zh-CN' });
  check(
    '缺少必填参数时报错而不是抛异常',
    missingArgument.isError && missingArgument.result.summary.includes('缺少必填参数'),
  );

  const health = await runAssistantTool('network_health', {}, { locale: 'zh-CN' });
  checkWithData(
    '工具能执行并返回结构化引用',
    !health.isError,
    health.result.references.length > 0 && health.result.summary.length > 0,
    health.result.summary,
  );
}

{
  const initialized = await handleMcpMessage(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check' } },
    },
    { locale: 'zh-CN' },
  );
  check(
    'MCP initialize 返回协议版本与工具能力',
    Boolean(initialized && 'result' in initialized) &&
      (initialized as { result: { protocolVersion?: string; capabilities?: { tools?: unknown } } })
        .result?.protocolVersion === '2025-06-18' &&
      Boolean(
        (initialized as { result: { capabilities?: { tools?: unknown } } }).result?.capabilities
          ?.tools,
      ),
  );

  const notification = await handleMcpMessage(
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { locale: 'zh-CN' },
  );
  check('MCP 通知不返回响应体', notification === undefined);

  const listed = await handleMcpMessage(
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { locale: 'zh-CN' },
  );
  const listedTools =
    listed && 'result' in listed
      ? (listed.result as { tools?: Array<{ name: string }> }).tools
      : [];
  check(
    'MCP tools/list 与注册表一致',
    Array.isArray(listedTools) &&
      listedTools.length === assistantTools.length &&
      listedTools.every((tool) => assistantTools.some((entry) => entry.name === tool.name)),
  );

  const called = await handleMcpMessage(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'network_health', arguments: {} },
    },
    { locale: 'zh-CN' },
  );
  const callContent =
    called && 'result' in called
      ? (called.result as { content?: Array<{ type: string; text: string }> }).content
      : undefined;
  check(
    'MCP tools/call 返回文本内容',
    Array.isArray(callContent) &&
      callContent.length > 0 &&
      callContent[0]?.type === 'text' &&
      callContent[0].text.length > 0,
  );

  const unknownMethod = await handleMcpMessage(
    { jsonrpc: '2.0', id: 4, method: 'resources/list' },
    { locale: 'zh-CN' },
  );
  check(
    'MCP 未知方法返回 -32601',
    Boolean(unknownMethod && 'error' in unknownMethod) &&
      (unknownMethod as { error: { code: number } }).error.code === -32601,
  );
}

console.log('── 11. 回答文本清洗与玩家位置 ─────────────────────');

{
  const filter = createAssistantTextFilter();
  const chunks = [
    '先说结论：<|DSML',
    '| | calls>\n<|DSML| | invoke name="plan_journey">',
    '正文正常',
    '</|DSML| | invoke>',
  ];
  const output = chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
  check(
    '跨 chunk 的伪工具标记被清理',
    !output.includes('DSML') && !output.includes('invoke'),
    output,
  );
  check('伪工具标记能被识别', filter.sawToolSyntax);
  check(
    '正常文本保留',
    output.includes('先说结论') && output.includes('正文正常'),
    JSON.stringify(output),
  );

  const plain = createAssistantTextFilter();
  const plainOutput = plain.push('170 路下一班是 18:30') + plain.flush();
  check(
    '普通文本原样输出',
    plainOutput === '170 路下一班是 18:30' && !plain.sawToolSyntax,
    plainOutput,
  );

  const empty = createAssistantTextFilter();
  check('整段都是伪工具标记时输出为空', !(empty.push('<|DSML| | calls>') + empty.flush()).trim());

  const spaced = createAssistantTextFilter();
  const spacedOutput = spaced.push('看这里 </ | | DSML | | invoke>') + spaced.flush();
  check('带空格的伪工具标记被清理', spacedOutput.trim() === '看这里', JSON.stringify(spacedOutput));

  const residual = createAssistantTextFilter();
  const residualOutput =
    residual.push('parameter > </ | | DSML | | invoke>\n正常内容\n') + residual.flush();
  check('伪工具残片整行丢弃', residualOutput.trim() === '正常内容', JSON.stringify(residualOutput));
  check('残片也会触发工具语法告警', residual.sawToolSyntax);
}

{
  const players = await buildPlayerLocationReferences('今天天气怎么样');
  check('玩家检索不误命中普通问题', players.length === 0, JSON.stringify(players));
}

console.log('── 12. 界面语料与路线规划入口 ─────────────────────');

{
  const result = await retrievalOf('地图道路颜色分别代表什么');
  check(
    '界面图例问题能召回站内说明',
    hasSource(result.references, '站内说明'),
    JSON.stringify(result.references.map((reference) => reference.source)),
  );
  check(
    '图例说明覆盖出行方式配色',
    textOf(result.references).includes('出行方式') && textOf(result.references).includes('线路'),
    textOf(result.references).slice(0, 120),
  );
}

{
  const result = await retrievalOf('帮我规划从云峰街站到新四季餐厅的路线');
  const routeRef = result.references.find((reference) => reference.source === '路线规划');
  check('路线问题提供地图入口', Boolean(routeRef), JSON.stringify(routeRef));
  check('路线入口是可点击的地图链接', Boolean(routeRef?.href?.startsWith('/map')), routeRef?.href);
}

{
  const result = await retrievalOf('中华路沿线有哪些公交站');
  const alongReferences = result.references.filter((reference) => reference.source === '沿线');
  check(
    '道路沿线问法会走沿线检索',
    alongReferences.length >= 2,
    JSON.stringify(alongReferences.map((reference) => reference.title)),
  );
  check(
    '道路沿线支持公交站分类筛选',
    alongReferences.some(
      (reference) =>
        reference.title.startsWith('中华路') && (reference.snippet ?? '').includes('公交站'),
    ),
    JSON.stringify(alongReferences.map((reference) => reference.snippet)),
  );
}

{
  const result = await retrievalOf('从火星基地到月球怎么走');
  const routeRef = result.references.find((reference) => reference.source === '路线规划');
  check(
    '地点解析失败时仍给路线规划入口',
    Boolean(routeRef) && routeRef?.href === '/map',
    JSON.stringify(routeRef),
  );
}

console.log('── 13. Wiki 玩家别名解析 ─────────────────────────');

{
  const wikitext = [
    '{|class="wikitable sortable"',
    '|-',
    '!玩家!!Xbox ID!!备注',
    '|-',
    '|[[上小官]]||{{xbox_ID|LDTV2020340248}}||临东市服务器服主',
    '|-',
    '| rowspan="3" |[[何旸]]||{{xbox_ID|CNYoung514}}',
    '|-',
    '|{{Xbox ID|CNYoungCNR}}',
    '|-',
    '| rowspan="2" |[[段冰峰]]||{{Xbox_ID|WT3Co2004}}',
    '|-',
    '|{{Xbox ID|WT3Co2004Alt}}',
    '|}',
  ].join('\n');
  const records = parsePlayerListWikitext(wikitext);
  check(
    'Wiki 玩家列表解析玩家名与 Xbox ID',
    records.some((record) => record.name === '上小官' && record.xboxIds.includes('LDTV2020340248')),
    JSON.stringify(records),
  );
  check(
    'rowspan 的多个 Xbox ID 归到同一玩家',
    Boolean(records.find((record) => record.name === '何旸')?.xboxIds.includes('CNYoungCNR')),
  );
  check(
    '段冰峰与 WT3Co2004 建立对应',
    Boolean(records.find((record) => record.name === '段冰峰')?.xboxIds.includes('WT3Co2004')),
  );
}

console.log('── 14. 玩家别名匹配 ───────────────────────────────');

{
  const baseLocation = {
    playerKey: 'duckduckcs',
    playerName: 'DUCKDUCKCS',
    x: 0,
    z: 0,
    presence: 'offline' as const,
    firstSeenAt: '',
    observedAt: '',
    lastSeenAt: '',
  };
  check(
    'Wiki 多字别名能命中玩家',
    findPlayerMatch(
      'shopvb在哪',
      baseLocation,
      new Map(),
      new Map([['duckduckcs', ['shopvb']]]),
    ) === 'shopvb',
  );

  const twoChar = { ...baseLocation, playerKey: 'xingan', playerName: '兴安玩家' };
  check(
    'Wiki 两字名能命中玩家',
    findPlayerMatch('兴安在哪', twoChar, new Map(), new Map([['xingan', ['兴安']]])) === '兴安',
  );

  const kiLocation = { ...baseLocation, playerKey: 'ki', playerName: 'Ki' };
  const kiWiki = new Map([['ki', ['Ki']]]);
  check(
    '单字名在整句匹配时命中',
    findPlayerMatch('ki在哪', kiLocation, new Map(), kiWiki) === 'Ki',
  );
  check(
    '单字名不会误命中英文单词',
    findPlayerMatch('skiiing怎么走', kiLocation, new Map(), kiWiki) === undefined,
  );

  check(
    '普通问题不误命中玩家',
    findPlayerMatch('今天天气怎么样', baseLocation, new Map(), new Map()) === undefined,
  );
}

console.log('');
console.log(`通过 ${passed}，失败 ${failed}，跳过 ${skipped}`);
if (failed > 0) {
  process.exitCode = 1;
}
