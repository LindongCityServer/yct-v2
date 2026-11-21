/**
 * 校验 QQ 机器人随机物料出图核心（M1）。
 *
 * 运行：`pnpm exec tsx --test scripts/checks/verify-qq-bot-materials.ts`
 *
 * 覆盖：
 * 1. 19 个系统模板的固定映射（slug / 编号前缀 / 族）与画布尺寸策略；
 * 2. seed 确定性（同 seed + kind 得到同一序列、同模板同编号同像素）；
 * 3. HMAC 签名格式与 ±60 秒时间窗；
 * 4. 进程内限流（全局 60 次/分钟、并发 2）；
 * 5. 错误码口径（invalid_request / source_scope_limited 等）；
 * 6. 逐个模板渲染（server 数据不可用时改 sample；仍不可用则用字段示例验证模板可渲染）；
 * 7. 随机抽样 3 次；
 * 8. 示例线网分支（networkLineKey + networkGeometry / networkNodeId）与许可署名；
 * 9. 每个牌面 PNG 非空、长边 ≤1280、尺寸 / 比例与画布一致、≤300 KB。
 *
 * 数据口径：地图服务 / 线网为空或拉取失败只记 SKIP / FIXTURE 并继续，
 * 不把环境问题算成代码失败；invalid_request / render_failed 等代码错误一定失败。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { MaterialCanvasConfig, MaterialTemplateVersion } from '@yct/contracts';
import {
  QQ_BOT_MATERIAL_FOOTER,
  QqBotMaterialError,
  buildQqBotMaterialCode,
  clearQqBotMaterialSampleCache,
  consumeQqBotMaterialRateLimit,
  createQqBotMaterialRandom,
  createQqBotMaterialSignature,
  normalizeQqBotMaterialSeed,
  postProcessQqBotMaterialPng,
  qqBotMaterialTemplateEntries,
  qqBotMaterialTemplateIds,
  renderQqBotMaterial,
  resetQqBotMaterialRateLimit,
  resetQqBotMaterialRenderSlots,
  resolveQqBotMaterialCanvas,
  resolveQqBotMaterialKind,
  resolveQqBotMaterialSlug,
  resolveQqBotMaterialTemplate,
  tryAcquireQqBotMaterialRenderSlot,
  verifyQqBotMaterialSignature,
  type QqBotMaterialKind,
  type QqBotMaterialRenderResult,
  type QqBotMaterialResolvedKind,
  type QqBotMaterialTemplateId,
} from '../../apps/web/lib/qq-bot-material';
import {
  BUS_STOP_DETAIL_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  BUILDING_ADDRESS_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from '../../apps/web/lib/material-template-ids';
import { renderMaterialTemplateToPng } from '../../apps/web/lib/material-renderer';
import {
  METRO_WAYFINDING_TEMPLATE_ID,
  serializeMetroWayfindingLayout,
  type MetroWayfindingLayout,
} from '../../apps/web/lib/metro-wayfinding';

type CoverageStatus = 'PASS' | 'SKIP' | 'FIXTURE' | 'FAIL';

interface CoverageRow {
  templateId: QqBotMaterialTemplateId;
  kind: QqBotMaterialResolvedKind;
  status: CoverageStatus;
  via: 'server' | 'sample' | 'fixture' | '-';
  detail: string;
}

const maximumPngBytes = 300 * 1024;
const maximumLongSidePx = 1280;
const coverageRows: CoverageRow[] = [];
const failures: string[] = [];
const renderTimings: Array<{ templateId: string; via: string; ms: number }> = [];
const scriptStartedAt = Date.now();

const environmentUnavailableCodes = new Set([
  'no_candidate',
  'source_unavailable',
  'sample_unavailable',
]);

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

function isEnvironmentUnavailable(error: unknown): boolean {
  return error instanceof QqBotMaterialError && environmentUnavailableCodes.has(error.code);
}

// ---------------------------------------------------------------------------
// 字段示例：只在真实数据不可用时验证模板本体可渲染，不代表真实业务数据。
// ---------------------------------------------------------------------------

function createBusStopOverviewFixture(): Record<string, string> {
  const values: Record<string, string> = {
    stationName: '临东火车站',
    stationNamePinyin: 'LINDONGHUOCHEZHAN',
  };
  for (let slot = 1; slot <= 6; slot += 1) {
    values[`route${slot}Number`] = String(slot);
    values[`route${slot}TemporaryStop`] = 'no';
  }
  return values;
}

function createBusStopDetailFixture(): Record<string, string> {
  return {
    routeNumber: '1',
    nextStation: '人民广场',
    routeStationState: 'next_station',
    travelDirection: 'last',
    routeOrigin: '临东火车站',
    routeTerminal: '临东机场',
    routeFirstLast: '06:00-22:30',
    operator: '临东公交',
    routeStations: '临东火车站\n人民广场\n临东机场',
    currentStationIndex: '1',
  };
}

function createMetroLineMapFixture(): Record<string, string> {
  return {
    accentColor: '#F29DB4',
    routeStations: '甲站\n乙站\n丙站',
    currentStationIndex: '1',
    travelDirection: 'last',
    doorDirection: 'left',
    transferLines: '',
  };
}

function createMetroVerticalLineMapFixture(): Record<string, string> {
  return {
    accentColor: '#F29DB4',
    lineLabel: '2',
    routeStations: '甲站\n乙站\n丙站',
    currentStationIndex: '1',
    trackPosition: 'left',
    travelDirection: 'last',
    travelDirectionSecondary: 'first',
    transferLines: '',
  };
}

function createMetroStationNameFixture(): Record<string, string> {
  return {
    accentColor: '#57D33E',
    stationName: '人民广场',
    stationNamePinyin: 'RENMINGUANGCHANG',
  };
}

function createMetroDirectionFixture(): Record<string, string> {
  return {
    accentColor: '#57D33E',
    nextStationName: '人民广场',
    nextStationPinyin: 'RENMINGUANGCHANG',
    terminalName: '临东机场',
    terminalNamePinyin: 'LINDONGJICHANG',
    lineLabel: '2',
    lineEnglishLabel: 'Line 2',
    travelDirection: 'last',
    doorDirection: 'left',
  };
}

/** 导视牌字段示例：一个最小的单行版式（背景 + 一行文字）。 */
function createWayfindingFixture(): Record<string, string> {
  const layout: MetroWayfindingLayout = {
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'fixture-text',
          type: 'text',
          align: 'left',
          writingMode: 'horizontal',
          rows: [
            {
              id: 'fixture-main',
              kind: 'main',
              segments: [{ kind: 'text', value: '人民广场' }],
            },
            {
              id: 'fixture-secondary',
              kind: 'secondary',
              value: 'RENMINGUANGCHANG',
              bold: false,
            },
          ],
        },
      ],
    ],
  };
  return { layout: serializeMetroWayfindingLayout(layout) };
}

const fixtureValuesByTemplateId: Record<QqBotMaterialTemplateId, Record<string, string>> = {
  [ROAD_NAME_DIRECTION_TEMPLATE_ID]: {
    signColor: '#004796',
    roadName: '临东大道',
    roadNamePinyin: 'LINDONG DADAO',
    directionMode: 'west_east',
    arrowMode: 'dual_arrow',
  },
  [BUILDING_ADDRESS_TEMPLATE_ID]: {
    roadName: '人民路',
    roadNamePinyin: 'RENMIN LU',
    postalCode: '120000',
    buildingNumber: '66',
    buildingSuffix: '',
  },
  [NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID]: {
    roadName: '人民路',
    buildingNumber: '66',
    buildingSuffix: '',
  },
  [BUS_STOP_TERMINAL_TEMPLATE_ID]: {
    stationName: '临东火车站',
    stationNamePinyin: 'LINDONGHUOCHEZHAN',
    routeNumber: '1',
    routeTemporaryStop: 'no',
    terminalRole: '始发站',
  },
  [BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID]: {
    stationName: '临东火车站',
    stationNamePinyin: 'LINDONGHUOCHEZHAN',
    routeNumber: '1',
    routeTemporaryStop: 'no',
    terminalRole: '终点站',
  },
  [BUS_STOP_OVERVIEW_TEMPLATE_ID]: createBusStopOverviewFixture(),
  [BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID]: createBusStopOverviewFixture(),
  [BUS_STOP_DETAIL_TEMPLATE_ID]: createBusStopDetailFixture(),
  [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID]: {
    ...createBusStopDetailFixture(),
    accentColor: '#26CABA',
    routeSuffix: '路',
    routeServiceTime: '06:00-22:30',
    footerText: '开往 临东机场',
    footerMode: 'destination',
    routeMapData: '',
  },
  [METRO_LINE_MAP_NEW_TEMPLATE_ID]: createMetroLineMapFixture(),
  [METRO_LINE_MAP_OLD_TEMPLATE_ID]: createMetroLineMapFixture(),
  [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID]: createMetroVerticalLineMapFixture(),
  [METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID]: createMetroVerticalLineMapFixture(),
  [METRO_STATION_NAME_NEW_TEMPLATE_ID]: createMetroStationNameFixture(),
  [METRO_STATION_NAME_OLD_TEMPLATE_ID]: createMetroStationNameFixture(),
  [METRO_DIRECTION_NEW_TEMPLATE_ID]: createMetroDirectionFixture(),
  [METRO_DIRECTION_OLD_TEMPLATE_ID]: createMetroDirectionFixture(),
  [METRO_PLATFORM_SIGN_TEMPLATE_ID]: {
    accentColor: '#EC6941',
    stationName: '人民广场',
    stationNamePinyin: 'RENMINGUANGCHANG',
    nextStationName: '临东机场',
    nextStationPinyin: 'LINDONGJICHANG',
    travelDirection: 'last',
  },
  [METRO_WAYFINDING_TEMPLATE_ID]: createWayfindingFixture(),
};

function filterTemplateFixture(
  template: MaterialTemplateVersion,
  rawFixture: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    template.fields.map((field) => [field.key, rawFixture[field.key] ?? field.defaultValue ?? '']),
  );
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

function assertPng(input: {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  canvas: MaterialCanvasConfig;
  templateId: QqBotMaterialTemplateId;
  label: string;
}): void {
  const { label } = input;
  assert.ok(Buffer.isBuffer(input.png), `${label}：PNG 必须是 Buffer`);
  assert.ok(input.png.byteLength > 0, `${label}：PNG 不能为空`);
  assert.equal(
    input.png.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${label}：PNG 文件头不正确`,
  );
  assert.ok(
    input.png.byteLength <= maximumPngBytes,
    `${label}：PNG 超过 300KB（实际 ${input.png.byteLength} 字节）`,
  );
  assert.equal(input.canvas.alignToTile, false, `${label}：聊天图必须关闭瓦片对齐`);
  assert.ok(input.canvas.pxPerMeter >= 16, `${label}：pxPerMeter 过低`);

  const longSideM = Math.max(input.canvas.widthM, input.canvas.heightM);
  const shortSideM = Math.min(input.canvas.widthM, input.canvas.heightM);
  const square = Math.abs(longSideM - shortSideM) / longSideM < 0.01;
  const expectedWidthPx = Math.max(1, Math.round(input.canvas.widthM * input.canvas.pxPerMeter));
  const rawExpectedHeightPx = Math.max(
    1,
    Math.round(input.canvas.heightM * input.canvas.pxPerMeter),
  );
  // 路牌：渲染后裁掉上半部空白（牌面在画布下半部），高度减半、比例变 4:1。
  const cropped = input.templateId === ROAD_NAME_DIRECTION_TEMPLATE_ID;
  const expectedHeightPx = cropped
    ? rawExpectedHeightPx - Math.floor(rawExpectedHeightPx / 2)
    : rawExpectedHeightPx;
  assert.equal(input.widthPx, expectedWidthPx, `${label}：宽度与画布不一致`);
  assert.equal(input.heightPx, expectedHeightPx, `${label}：高度与画布不一致`);
  const actualRatio = input.widthPx / input.heightPx;
  const expectedRatio = expectedWidthPx / expectedHeightPx;
  assert.ok(
    Math.abs(actualRatio - expectedRatio) / expectedRatio < 0.01,
    `${label}：比例与预期不一致（${actualRatio.toFixed(4)} vs ${expectedRatio.toFixed(4)}）`,
  );
  const longSidePx = Math.max(input.widthPx, input.heightPx);
  assert.ok(
    longSidePx <= maximumLongSidePx,
    `${label}：长边需要 ≤${maximumLongSidePx}（实际 ${longSidePx}）`,
  );
  if (square) {
    assert.equal(longSidePx, 640, `${label}：1:1 方牌长边应为 640（实际 ${longSidePx}）`);
  } else {
    assert.ok(longSidePx >= 1000, `${label}：非方牌长边应接近 1024（实际 ${longSidePx}）`);
  }
  if (cropped) {
    assert.ok(
      Math.abs(actualRatio - 4) < 0.02,
      `${label}：路牌裁切后应为 4:1（实际 ${actualRatio.toFixed(3)}）`,
    );
    assert.ok(longSidePx === input.widthPx, `${label}：路牌裁切后长边应为宽度`);
  }
}

/** 断言核心返回结构；`via` 表示这一行数据来自 server / sample / fixture。 */
function assertMaterialContract(input: {
  label: string;
  result: QqBotMaterialRenderResult;
  templateId: QqBotMaterialTemplateId;
  via: 'server' | 'sample' | 'fixture';
}): void {
  const { label, result, templateId, via } = input;
  const kind = resolveQqBotMaterialKind(templateId);
  assert.equal(result.templateId, templateId, `${label}：templateId`);
  assert.equal(result.kind, kind, `${label}：kind`);
  assert.equal(result.slug, resolveQqBotMaterialSlug(templateId), `${label}：slug`);
  assert.match(result.seed, /^[0-9a-z]{6,64}$/u, `${label}：seed 归一化`);
  assert.equal(
    result.code,
    buildQqBotMaterialCode(templateId, result.seed),
    `${label}：编号应由前缀 + seed 前 4 位组成`,
  );
  assert.match(result.code, /^(?:LD|BL|BS|MS|ML|MW)-[0-9A-F]{4}$/u, `${label}：编号格式`);
  assert.ok(result.templateVersion >= 1, `${label}：模板版本`);
  assert.ok(result.templateTitle.length > 0, `${label}：模板标题`);
  assert.equal(result.card.kind, kind, `${label}：卡片 kind`);
  assert.ok(result.card.title.length > 0, `${label}：卡片标题`);
  assert.ok(result.card.eyebrow.includes('城市物料盲盒'), `${label}：卡片眉题`);
  assert.ok(result.card.headline.length > 0, `${label}：卡片主标题`);
  assert.ok(result.card.subline.length > 0, `${label}：卡片副标题`);
  assert.ok(result.card.meta.length >= 1 && result.card.meta.length <= 4, `${label}：卡片 meta`);
  assert.ok(result.card.meta[0].includes(result.code), `${label}：meta 首行应包含编号`);
  assert.equal(result.card.footer, QQ_BOT_MATERIAL_FOOTER, `${label}：卡片页脚`);
  assert.ok(result.input && typeof result.input === 'object', `${label}：应返回可复用的字段值`);
  assert.ok(Object.keys(result.input).length > 0, `${label}：字段值不能为空`);

  if (via === 'sample') {
    assert.equal(result.source.kind, 'sample', `${label}：示例线网来源`);
    assert.ok(result.source.name.length > 0, `${label}：示例线网名称`);
    assert.ok(result.source.licenseName.length > 0, `${label}：示例线网许可名称`);
    assert.ok(result.source.licenseUrl.length > 0, `${label}：示例线网许可链接`);
    assert.ok(
      result.card.meta[0].includes(result.source.licenseName),
      `${label}：示例线网卡片 meta 必须展示许可`,
    );
  } else if (via === 'server') {
    assert.equal(result.source.kind, 'server', `${label}：服务器数据来源`);
    assert.equal(result.source.licenseName, '', `${label}：服务器来源不带许可`);
  }

  assertPng({
    png: result.png,
    widthPx: result.widthPx,
    heightPx: result.heightPx,
    canvas: result.canvas,
    templateId,
    label,
  });
}

/** 用字段示例走同一套「画布 → 渲染 → 后处理」路径，验证模板本体可渲染。 */
async function renderTemplateFixture(templateId: QqBotMaterialTemplateId): Promise<{
  png: Buffer;
  widthPx: number;
  heightPx: number;
  canvas: MaterialCanvasConfig;
}> {
  const template = resolveQqBotMaterialTemplate(templateId);
  const canvas = resolveQqBotMaterialCanvas(template);
  const values = filterTemplateFixture(template, fixtureValuesByTemplateId[templateId] ?? {});
  const rendered = await renderMaterialTemplateToPng({
    template,
    values,
    canvas,
    validation: { allowMissingServerDerivedValues: true },
  });
  const final = await postProcessQqBotMaterialPng({
    templateId,
    png: rendered.png,
    widthPx: rendered.widthPx,
    heightPx: rendered.heightPx,
  });
  return { ...final, canvas };
}

/** 示例线网是外部拉取：失败时清缓存重试（外部站点偶发超时不应算代码失败）。 */
async function renderSampleMaterial(input: {
  kind: QqBotMaterialKind;
  templateId?: QqBotMaterialTemplateId;
  seed: string;
}): Promise<QqBotMaterialRenderResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await renderQqBotMaterial({ ...input, dataSource: 'sample' });
    } catch (error) {
      lastError = error;
      if (
        attempt < 2 &&
        error instanceof QqBotMaterialError &&
        error.code === 'sample_unavailable'
      ) {
        clearQqBotMaterialSampleCache();
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function recordCoverage(
  templateId: QqBotMaterialTemplateId,
  status: CoverageStatus,
  via: CoverageRow['via'],
  detail: string,
): void {
  coverageRows.push({
    templateId,
    kind: resolveQqBotMaterialKind(templateId),
    status,
    via,
    detail,
  });
}

function printCoverageMatrix(): void {
  console.log('\n=== 19 个系统模板覆盖矩阵 ===');
  const header = ['模板 ID', 'kind', '数据来源', '状态', '详情'];
  console.log(header.join(' | '));
  for (const row of coverageRows) {
    console.log([row.templateId, row.kind, row.via, row.status, row.detail].join(' | '));
  }
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

test('19 个系统模板与固定映射完整（slug / 编号前缀 / 族）', () => {
  assert.equal(qqBotMaterialTemplateIds.length, 19, '模板 id 数量应为 19');
  const slugs = new Set<string>();
  const prefixes = new Set(['LD', 'BL', 'BS', 'MS', 'ML', 'MW']);
  const kindCounts = new Map<QqBotMaterialResolvedKind, number>();
  for (const templateId of qqBotMaterialTemplateIds) {
    const template = resolveQqBotMaterialTemplate(templateId);
    const kind = resolveQqBotMaterialKind(templateId);
    assert.ok(template.title.length > 0, `${templateId} 缺标题`);
    assert.ok(template.fields.length > 0, `${templateId} 缺字段`);
    const slug = resolveQqBotMaterialSlug(templateId);
    assert.ok(slug.length > 0, `${templateId} 缺 slug`);
    assert.ok(!slugs.has(slug), `${templateId} 的 slug 重复：${slug}`);
    slugs.add(slug);
    const prefix = buildQqBotMaterialCode(templateId, 'abcd1234').split('-')[0]!;
    assert.ok(prefixes.has(prefix), `${templateId} 的编号前缀不合法：${prefix}`);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  assert.equal(kindCounts.get('road_sign'), 1, '路牌模板数量');
  assert.equal(kindCounts.get('address_sign'), 2, '楼牌模板数量');
  assert.equal(kindCounts.get('bus_stop'), 6, '公交站牌模板数量');
  assert.equal(kindCounts.get('metro_line'), 9, '地铁模板数量');
  assert.equal(kindCounts.get('custom'), 1, '导视牌模板数量');
});

test('第一层模板入口覆盖 19 个内部模板且不重叠', () => {
  const entryTemplateIds = qqBotMaterialTemplateEntries.flatMap((entry) => entry.templateIds);
  assert.equal(qqBotMaterialTemplateEntries.length, 8);
  assert.equal(entryTemplateIds.length, 19);
  assert.equal(new Set(entryTemplateIds).size, 19);
  assert.deepEqual(new Set(entryTemplateIds), new Set(qqBotMaterialTemplateIds));
  const busEntry = qqBotMaterialTemplateEntries.find((entry) => entry.id === 'bus_stop');
  assert.equal(busEntry?.templateIds.length, 5);
  const metroEntry = qqBotMaterialTemplateEntries.find((entry) => entry.id === 'metro_line_map');
  assert.equal(metroEntry?.templateIds.length, 6);
});

test('seed 归一化、编号前缀与画布尺寸策略', () => {
  assert.equal(normalizeQqBotMaterialSeed('7F3A2B'), '7f3a2b');
  assert.match(normalizeQqBotMaterialSeed(), /^[0-9a-f]{6}$/u);
  assert.match(normalizeQqBotMaterialSeed('hello-material'), /^[0-9a-f]{32}$/u);
  assert.throws(
    () => normalizeQqBotMaterialSeed('bad seed'),
    (error: unknown) => error instanceof QqBotMaterialError && error.code === 'invalid_request',
  );
  assert.equal(buildQqBotMaterialCode(ROAD_NAME_DIRECTION_TEMPLATE_ID, '7f3a2b'), 'LD-7F3A');
  assert.equal(buildQqBotMaterialCode(BUILDING_ADDRESS_TEMPLATE_ID, '7f3a2b'), 'BL-7F3A');
  assert.equal(buildQqBotMaterialCode(BUS_STOP_OVERVIEW_TEMPLATE_ID, '7f3a2b'), 'BS-7F3A');
  assert.equal(buildQqBotMaterialCode(METRO_STATION_NAME_NEW_TEMPLATE_ID, '7f3a2b'), 'MS-7F3A');
  assert.equal(buildQqBotMaterialCode(METRO_LINE_MAP_NEW_TEMPLATE_ID, '7f3a2b'), 'ML-7F3A');
  assert.equal(buildQqBotMaterialCode(METRO_PLATFORM_SIGN_TEMPLATE_ID, '7f3a2b'), 'MS-7F3A');
  assert.equal(buildQqBotMaterialCode(METRO_WAYFINDING_TEMPLATE_ID, '7f3a2b'), 'MW-7F3A');

  for (const templateId of qqBotMaterialTemplateIds) {
    const template = resolveQqBotMaterialTemplate(templateId);
    const canvas = resolveQqBotMaterialCanvas(template);
    assert.equal(canvas.alignToTile, false, `${templateId} 聊天图必须 alignToTile=false`);
    const longSideM = Math.max(canvas.widthM, canvas.heightM);
    const shortSideM = Math.min(canvas.widthM, canvas.heightM);
    const square = Math.abs(longSideM - shortSideM) / longSideM < 0.01;
    const longSidePx = Math.max(
      Math.round(canvas.widthM * canvas.pxPerMeter),
      Math.round(canvas.heightM * canvas.pxPerMeter),
    );
    if (square) {
      assert.equal(longSidePx, 640, `${templateId} 方牌长边应为 640（实际 ${longSidePx}）`);
    } else {
      assert.ok(
        longSidePx <= 1280 && longSidePx >= 1000,
        `${templateId} 非方牌长边应在 1000-1280（实际 ${longSidePx}）`,
      );
    }
  }
  // 6:1 横版线路图 / 方向牌：pxPerMeter 约 170-213（1024 / 6 = 170）。
  for (const templateId of [METRO_LINE_MAP_NEW_TEMPLATE_ID, METRO_DIRECTION_OLD_TEMPLATE_ID]) {
    const canvas = resolveQqBotMaterialCanvas(resolveQqBotMaterialTemplate(templateId));
    assert.ok(
      canvas.pxPerMeter >= 170 && canvas.pxPerMeter <= 213,
      `${templateId} 6:1 画布 pxPerMeter=${canvas.pxPerMeter}`,
    );
  }
  // 1:2.5 竖版线路图：约 409 px/m。
  const verticalCanvas = resolveQqBotMaterialCanvas(
    resolveQqBotMaterialTemplate(METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID),
  );
  assert.ok(
    verticalCanvas.pxPerMeter >= 400 && verticalCanvas.pxPerMeter <= 420,
    `竖版线路图 pxPerMeter=${verticalCanvas.pxPerMeter}`,
  );
  // 2:1 路牌：512 px/m，渲染后再裁掉上半部。
  const roadCanvas = resolveQqBotMaterialCanvas(
    resolveQqBotMaterialTemplate(ROAD_NAME_DIRECTION_TEMPLATE_ID),
  );
  assert.equal(roadCanvas.pxPerMeter, 512);
});

test('seed 派生 xorshift：同 seed + kind 可复现', () => {
  const first = createQqBotMaterialRandom('abc123', 'road_sign');
  const second = createQqBotMaterialRandom('abc123', 'road_sign');
  const otherKind = createQqBotMaterialRandom('abc123', 'bus_stop');
  const firstValues = Array.from({ length: 10 }, () => first.nextUint32());
  const secondValues = Array.from({ length: 10 }, () => second.nextUint32());
  assert.deepEqual(firstValues, secondValues, '同 seed + kind 必须得到同一序列');
  const otherValues = Array.from({ length: 10 }, () => otherKind.nextUint32());
  assert.notDeepEqual(firstValues, otherValues, '不同 kind 的序列应不同');
  for (const value of firstValues) {
    assert.ok(value >= 0 && value <= 0xffff_ffff);
  }
  assert.equal(first.nextInt(1), 0);
  assert.throws(() => first.nextInt(0));
});

test('HMAC 签名：格式、时间窗与篡改拒绝', () => {
  const secret = 'verify-secret';
  const body = JSON.stringify({ kind: 'random', templateId: 'x' });
  const nowSeconds = 1_900_000_000;
  const signature = createQqBotMaterialSignature({ secret, body, timestampSeconds: nowSeconds });
  assert.match(signature, /^\d+\.[0-9a-f]{64}$/u);

  assert.equal(
    verifyQqBotMaterialSignature({ secret, signature, body, nowMs: nowSeconds * 1000 }).ok,
    true,
  );
  assert.deepEqual(
    verifyQqBotMaterialSignature({ secret, signature, body: `${body} `, nowMs: nowSeconds * 1000 }),
    { ok: false, reason: 'invalid' },
  );
  assert.deepEqual(
    verifyQqBotMaterialSignature({
      secret: `${secret}-x`,
      signature,
      body,
      nowMs: nowSeconds * 1000,
    }),
    { ok: false, reason: 'invalid' },
  );
  // 时间窗 ±60 秒：61 秒外拒绝，59 秒内接受。
  assert.deepEqual(
    verifyQqBotMaterialSignature({
      secret,
      signature,
      body,
      nowMs: (nowSeconds + 61) * 1000,
    }),
    { ok: false, reason: 'expired' },
  );
  assert.equal(
    verifyQqBotMaterialSignature({
      secret,
      signature,
      body,
      nowMs: (nowSeconds + 59) * 1000,
    }).ok,
    true,
  );
  for (const malformed of ['', 'abc', '123.', '123.zz', '1.2.3', '1234.ABCDEF']) {
    assert.deepEqual(
      verifyQqBotMaterialSignature({
        secret,
        signature: malformed,
        body,
        nowMs: nowSeconds * 1000,
      }),
      { ok: false, reason: 'malformed' },
      `签名 ${JSON.stringify(malformed)} 应判为 malformed`,
    );
  }
});

test('进程内限流：全局 60 次/分钟、并发 2', () => {
  resetQqBotMaterialRateLimit();
  const windowStart = 1_900_000_000_000;
  for (let index = 0; index < 60; index += 1) {
    assert.equal(consumeQqBotMaterialRateLimit(windowStart + index).allowed, true);
  }
  const rejected = consumeQqBotMaterialRateLimit(windowStart + 1000);
  assert.equal(rejected.allowed, false);
  assert.ok(rejected.retryAfterSeconds >= 1);
  assert.equal(consumeQqBotMaterialRateLimit(windowStart + 60_000).allowed, true);
  resetQqBotMaterialRateLimit();

  resetQqBotMaterialRenderSlots();
  const releaseFirst = tryAcquireQqBotMaterialRenderSlot();
  const releaseSecond = tryAcquireQqBotMaterialRenderSlot();
  assert.ok(releaseFirst && releaseSecond, '应能占用 2 个并发槽位');
  assert.equal(tryAcquireQqBotMaterialRenderSlot(), undefined, '第 3 个并发请求应被拒绝');
  releaseFirst?.();
  const releaseThird = tryAcquireQqBotMaterialRenderSlot();
  assert.ok(releaseThird, '释放一个槽位后应能再次占用');
  releaseSecond?.();
  releaseThird?.();
  resetQqBotMaterialRenderSlots();
});

test('错误码口径：invalid_request 与 source_scope_limited', async () => {
  const expectCode = async (
    run: () => Promise<unknown>,
    code: QqBotMaterialError['code'],
    status: number,
  ): Promise<void> => {
    await assert.rejects(run, (error: unknown) => {
      assert.ok(
        error instanceof QqBotMaterialError,
        `应抛 QqBotMaterialError，实际 ${String(error)}`,
      );
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      return true;
    });
  };

  await expectCode(
    () => renderQqBotMaterial({ kind: 'road_sign', dataSource: 'sample' }),
    'source_scope_limited',
    400,
  );
  await expectCode(
    () =>
      renderQqBotMaterial({
        kind: 'random',
        templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID,
        dataSource: 'sample',
      }),
    'source_scope_limited',
    400,
  );
  await expectCode(
    () => renderQqBotMaterial({ kind: 'road_sign', templateId: 'system_material_not_exists' }),
    'invalid_request',
    400,
  );
  await expectCode(
    () => renderQqBotMaterial({ kind: 'road_sign', templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID }),
    'invalid_request',
    400,
  );
  await expectCode(() => renderQqBotMaterial({ kind: 'not_a_kind' }), 'invalid_request', 400);
  await expectCode(
    () => renderQqBotMaterial({ kind: 'random', projectId: 'material_network_1' }),
    'invalid_request',
    400,
  );
  await expectCode(
    () => renderQqBotMaterial({ kind: 'random', seed: 'has space' }),
    'invalid_request',
    400,
  );
});

/** 逐个模板渲染：server → sample → 字段示例（fixture）降级。 */
test('19 个模板逐个渲染 + 随机抽样 3 次', async () => {
  for (const [index, templateId] of qqBotMaterialTemplateIds.entries()) {
    const kind = resolveQqBotMaterialKind(templateId);
    const seed = `verify${index.toString(16).padStart(2, '0')}`;
    const skipReasons: string[] = [];
    let rendered = false;
    for (const via of ['server', 'sample'] as const) {
      if (via === 'sample' && !['metro_line', 'custom'].includes(kind)) {
        continue;
      }
      const startedAt = Date.now();
      try {
        const result =
          via === 'sample'
            ? await renderSampleMaterial({ kind, templateId, seed })
            : await renderQqBotMaterial({ kind, templateId, seed, dataSource: 'server' });
        renderTimings.push({ templateId, via, ms: Date.now() - startedAt });
        try {
          assertMaterialContract({
            label: `${templateId}（${via}）`,
            result,
            templateId,
            via,
          });
          recordCoverage(
            templateId,
            'PASS',
            via,
            `${result.widthPx}×${result.heightPx}，${result.png.byteLength}B，${Date.now() - startedAt}ms`,
          );
        } catch (error) {
          failures.push(`${templateId}：契约断言失败：${describeError(error)}`);
          recordCoverage(templateId, 'FAIL', via, describeError(error));
        }
        rendered = true;
        break;
      } catch (error) {
        if (!isEnvironmentUnavailable(error)) {
          failures.push(`${templateId}：渲染抛出了预期外的错误：${describeError(error)}`);
          recordCoverage(templateId, 'FAIL', via, describeError(error));
          rendered = true;
          break;
        }
        skipReasons.push(`${via}:${(error as QqBotMaterialError).code}`);
      }
    }
    if (rendered) {
      continue;
    }
    // 数据不可用：用字段示例验证模板本体可渲染（矩阵里明确标 FIXTURE）。
    try {
      const fixture = await renderTemplateFixture(templateId);
      assertPng({
        png: fixture.png,
        widthPx: fixture.widthPx,
        heightPx: fixture.heightPx,
        canvas: fixture.canvas,
        templateId,
        label: `${templateId}（fixture）`,
      });
      recordCoverage(
        templateId,
        'FIXTURE',
        'fixture',
        `数据不可用（${skipReasons.join(' / ')}），字段示例 ${fixture.widthPx}×${fixture.heightPx}`,
      );
    } catch (error) {
      failures.push(`${templateId}：字段示例渲染失败：${describeError(error)}`);
      recordCoverage(templateId, 'FAIL', 'fixture', describeError(error));
    }
  }

  // 随机抽样 3 次：server 不可用则改 sample；两边都不可用只记 SKIP（环境问题）。
  const randomResults: QqBotMaterialRenderResult[] = [];
  for (const seed of ['randoma1', 'randomb2', 'randomc3']) {
    const startedAt = Date.now();
    let result: QqBotMaterialRenderResult | undefined;
    for (const via of ['server', 'sample'] as const) {
      try {
        result =
          via === 'sample'
            ? await renderSampleMaterial({ kind: 'random', seed })
            : await renderQqBotMaterial({ kind: 'random', seed, dataSource: 'server' });
        renderTimings.push({ templateId: `random:${seed}`, via, ms: Date.now() - startedAt });
        break;
      } catch (error) {
        if (!isEnvironmentUnavailable(error)) {
          failures.push(`随机 ${seed}：渲染抛出了预期外的错误：${describeError(error)}`);
          break;
        }
      }
    }
    if (!result) {
      console.log(`SKIP 随机抽样 ${seed}：服务器 / 示例线网数据都不可用（环境问题，不算代码失败）`);
      continue;
    }
    try {
      assertMaterialContract({
        label: `随机抽样 ${seed}`,
        result,
        templateId: result.templateId,
        via: result.source.kind === 'sample' ? 'sample' : 'server',
      });
      randomResults.push(result);
    } catch (error) {
      failures.push(`随机抽样 ${seed}：契约断言失败：${describeError(error)}`);
    }
  }
  if (randomResults.length > 0) {
    console.log(
      `随机抽样：${randomResults
        .map((result) => `${result.seed}→${result.code}（${result.templateId}）`)
        .join('、')}`,
    );
  }

  printCoverageMatrix();
  assert.deepEqual(failures, [], `存在 ${failures.length} 项失败：\n${failures.join('\n')}`);
  const missing = qqBotMaterialTemplateIds.filter(
    (templateId) => !coverageRows.some((row) => row.templateId === templateId),
  );
  assert.deepEqual(missing, [], '覆盖矩阵缺少模板');
});

test('示例线网分支：metro_line / custom 且带许可署名', async (t) => {
  const sampleTemplates = [
    METRO_LINE_MAP_OLD_TEMPLATE_ID,
    METRO_PLATFORM_SIGN_TEMPLATE_ID,
    METRO_WAYFINDING_TEMPLATE_ID,
  ] as const;
  let renderedAny = false;
  for (const templateId of sampleTemplates) {
    const kind = resolveQqBotMaterialKind(templateId);
    const startedAt = Date.now();
    try {
      const result = await renderSampleMaterial({
        kind,
        templateId,
        seed: `sample${kind}`,
      });
      renderTimings.push({ templateId, via: 'sample', ms: Date.now() - startedAt });
      assertMaterialContract({
        label: `示例线网 ${templateId}`,
        result,
        templateId,
        via: 'sample',
      });
      renderedAny = true;
    } catch (error) {
      if (isEnvironmentUnavailable(error)) {
        console.log(
          `SKIP 示例线网 ${templateId}：${(error as QqBotMaterialError).code} ${describeError(error)}（环境问题，不算代码失败）`,
        );
        continue;
      }
      assert.fail(`示例线网 ${templateId}：${describeError(error)}`);
    }
  }
  if (!renderedAny) {
    t.skip('示例线网不可用（外部 railmapgen.org 拉取失败），跳过 sample 分支校验');
  }
});

test('同 seed 可复现：同一模板 + seed 的编号与像素一致', async (t) => {
  const templateId = METRO_PLATFORM_SIGN_TEMPLATE_ID;
  const seed = 'reproducible01';
  const renderTwice = async (
    dataSource: 'server' | 'sample',
  ): Promise<[QqBotMaterialRenderResult, QqBotMaterialRenderResult] | undefined> => {
    try {
      const render =
        dataSource === 'sample'
          ? () => renderSampleMaterial({ kind: 'metro_line', templateId, seed })
          : () =>
              renderQqBotMaterial({
                kind: 'metro_line',
                templateId,
                seed,
                dataSource: 'server',
              });
      const first = await render();
      const second = await render();
      return [first, second];
    } catch (error) {
      if (isEnvironmentUnavailable(error)) {
        return undefined;
      }
      throw error;
    }
  };
  const pair = (await renderTwice('server')) ?? (await renderTwice('sample'));
  if (!pair) {
    t.skip('服务器与示例线网数据都不可用，跳过可复现性校验');
    return;
  }
  const [first, second] = pair;
  assert.equal(first.templateId, second.templateId);
  assert.equal(first.seed, second.seed);
  assert.equal(first.code, second.code);
  assert.equal(first.widthPx, second.widthPx);
  assert.equal(first.heightPx, second.heightPx);
  assert.equal(
    createHash('sha256').update(first.png).digest('hex'),
    createHash('sha256').update(second.png).digest('hex'),
    '同一 seed 的牌面 PNG 应完全一致',
  );
});

/** 渲染接口（进程内直接调用 route handler）：验签、错误码与响应契约。 */
test('渲染接口：HMAC 验签、错误码与响应契约', async () => {
  interface RouteJson {
    ok?: boolean;
    error?: string;
    pngBase64?: string;
    card?: { meta?: string[]; footer?: string };
    source?: { kind?: string };
    template?: { id?: string; slug?: string };
    shareId?: unknown;
    shareUrl?: unknown;
  }
  const secret = 'verify-route-secret';
  const previousSecret = process.env.YCT_QQ_MATERIAL_SECRET;
  process.env.YCT_QQ_MATERIAL_SECRET = secret;
  try {
    const { POST } = await import('../../apps/web/app/api/qq-bot/materials/render/route');
    const call = async (
      body: string,
      signature?: string,
    ): Promise<{ status: number; json: RouteJson }> => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (signature !== undefined) {
        headers['x-yct-bot-signature'] = signature;
      }
      const requestUrl = 'http://localhost/api/qq-bot/materials/render';
      const request = new Request(requestUrl, {
        method: 'POST',
        headers,
        body,
      });
      // 路由已改为 NextRequest（分享 URL 需要 nextUrl.origin）；校验脚本没有 Next 运行时，
      // 这里补上 NextRequest 里用到的 nextUrl 字段，其余行为与普通 Request 一致。
      Object.defineProperty(request, 'nextUrl', { value: new URL(requestUrl) });
      const response = await POST(request as never);
      return { status: response.status, json: (await response.json()) as RouteJson };
    };
    const body = JSON.stringify({
      kind: 'metro_line',
      templateId: METRO_PLATFORM_SIGN_TEMPLATE_ID,
      seed: 'route01',
    });
    const signature = createQqBotMaterialSignature({ secret, body });

    // 1) 合法签名：成功响应；分享链路接入后应返回 shareId / shareUrl。
    const valid = await call(body, signature);
    if (valid.status === 200) {
      assert.equal(valid.json.ok, true);
      assert.equal(typeof valid.json.pngBase64, 'string');
      assert.ok(Buffer.from(valid.json.pngBase64!, 'base64').byteLength > 0, 'PNG base64 非空');
      assert.equal(valid.json.template?.id, METRO_PLATFORM_SIGN_TEMPLATE_ID);
      assert.equal(valid.json.source?.kind, 'server');
      assert.ok((valid.json.card?.meta?.length ?? 0) >= 1);
      assert.equal(valid.json.card?.footer, QQ_BOT_MATERIAL_FOOTER);
      assert.equal(typeof valid.json.shareId, 'string', '分享记录接入后应返回 shareId');
      assert.ok((valid.json.shareId as string).length > 0);
      assert.equal(typeof valid.json.shareUrl, 'string', '分享记录接入后应返回 shareUrl');
      assert.ok(
        (valid.json.shareUrl as string).includes(`/m/${valid.json.template?.slug ?? ''}/`),
        'shareUrl 应指向 /m/<slug>/<shareId>',
      );
    } else if (valid.status === 404 || valid.status === 503) {
      // 环境问题：只验证错误码口径，不把数据不可用算成失败。
      console.log(`SKIP 渲染接口成功分支：数据不可用（${valid.status} ${valid.json.error ?? ''}）`);
    } else {
      assert.fail(`渲染接口成功分支异常：${valid.status} ${JSON.stringify(valid.json)}`);
    }

    // 2) 签名错误 / 篡改 / 过期 → 403 invalid_signature。
    const wrongSecret = await call(
      body,
      createQqBotMaterialSignature({ secret: `${secret}-x`, body }),
    );
    assert.equal(wrongSecret.status, 403);
    assert.equal(wrongSecret.json.error, 'invalid_signature');
    const tampered = await call(`${body} `, signature);
    assert.equal(tampered.status, 403);
    const stale = await call(
      body,
      createQqBotMaterialSignature({
        secret,
        body,
        timestampSeconds: Math.floor(Date.now() / 1000) - 120,
      }),
    );
    assert.equal(stale.status, 403);
    const missing = await call(body);
    assert.equal(missing.status, 403);

    // 3) 合法签名 + 坏 JSON / 超大请求体 → 400 invalid_request。
    const badJsonBody = '{not json';
    const badJson = await call(
      badJsonBody,
      createQqBotMaterialSignature({ secret, body: badJsonBody }),
    );
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error, 'invalid_request');
    const largeBody = JSON.stringify({ kind: 'random', padding: 'x'.repeat(9000) });
    const large = await call(largeBody, createQqBotMaterialSignature({ secret, body: largeBody }));
    assert.equal(large.status, 400);

    // 4) 未配置 secret 时 fail-closed（403）。
    delete process.env.YCT_QQ_MATERIAL_SECRET;
    const noSecret = await call(body, signature);
    assert.equal(noSecret.status, 403);
    assert.equal(noSecret.json.error, 'invalid_signature');
  } finally {
    if (previousSecret === undefined) {
      delete process.env.YCT_QQ_MATERIAL_SECRET;
    } else {
      process.env.YCT_QQ_MATERIAL_SECRET = previousSecret;
    }
  }
});

process.on('exit', () => {
  const elapsedMs = Date.now() - scriptStartedAt;
  const countByStatus = (status: CoverageStatus): number =>
    coverageRows.filter((row) => row.status === status).length;
  const timings = renderTimings.map((timing) => timing.ms);
  const averageMs = timings.length
    ? Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length)
    : 0;
  const maximumMs = timings.length ? Math.max(...timings) : 0;
  console.log(
    `\n=== 汇总 === 覆盖 ${coverageRows.length}/19 个模板：PASS ${countByStatus('PASS')}、` +
      `FIXTURE ${countByStatus('FIXTURE')}、FAIL ${countByStatus('FAIL')}；` +
      `渲染 ${renderTimings.length} 次（平均 ${averageMs}ms，最慢 ${maximumMs}ms），` +
      `脚本耗时 ${(elapsedMs / 1000).toFixed(1)}s。`,
  );
});
