import { createHash, createHmac } from 'node:crypto';
import QRCode from 'qrcode';
import { canEdit } from './module-command.mjs';
import { shanghaiDateKey } from './community.mjs';
import { maskOpenId } from './log.mjs';
import {
  MATERIAL_SOURCE_SAMPLE,
  getMaterialSource,
  materialSourceStoreFor,
} from './material-sources.mjs';

/**
 * 随机物料（M3）：`/物料`、`/盲盒`、`/路牌`、`/楼牌`、`/站牌`、`/地铁`、`/数据源`。
 *
 * 出图在网页端完成：机器人用 HMAC 调 `POST /api/qq-bot/materials/render`，
 * 拿到 PNG（base64）+ card 元数据 + shareUrl，再在本地拼一张 `signage` 卡片
 * （牌面 + 标题/属性 + 编号 + 二维码）。这样机器人不用打包字体和模板渲染器，
 * 牌面比例、裁切、示例线网许可都由网页端统一处理。
 */

/** 网页端签名头；格式见 apps/web/lib/qq-bot-material.ts 的 createQqBotMaterialSignature。 */
export const MATERIAL_SIGNATURE_HEADER = 'x-yct-bot-signature';

/**
 * 默认渲染超时；可用 QQ_BOT_MATERIAL_TIMEOUT_MS 改。
 *
 * 网页端首次出图要加载地图标记、线网数据和字体，冷启动实测 4–16 秒，
 * 8 秒的旧默认值会让「第一次 /盲盒」几乎必然超时；20 秒覆盖冷启动，
 * 失败时仍由 renderMaterial 给出可读提示。
 */
export const DEFAULT_MATERIAL_TIMEOUT_MS = 20_000;

/** 示例线网的强制许可标注（方案 4.6：卡片、文字、落地页都必须展示）。 */
export const SAMPLE_LICENSE_TEXT = '沈阳示例线网 · CC BY-NC-SA 4.0 · railmapgen.org';

/** 示例线网下本地就拦掉的非地铁族指令。 */
export const SAMPLE_SCOPE_LIMIT_TEXT = [
  '当前群使用示例线网，只支持地铁物料。',
  '发送「/地铁」或「/盲盒」可以抽地铁物料；群主或管理员可以发送「/数据源 服务器」切回全部模板。',
].join('\n');

export const SAMPLE_LICENSE_MISSING_TEXT =
  '示例线网数据缺少许可信息，暂时不能生成物料，请稍后再试。';

const MATERIAL_FOOTER = '雨城通 · 随机生成，非正式物料';
/** 卡面主题色兜底：与站内项目强调色一致。 */
const MATERIAL_PROJECT_ACCENT = '#168F78';

/** 指令 → 网页渲染 kind / 本地卡片兜底样式。 */
const renderCommandSpecs = {
  blindbox: { kind: 'random', title: '随机物料', icon: 'auto_awesome' },
  roadsign: { kind: 'road_sign', title: '随机路牌', icon: 'explore' },
  buildingsign: { kind: 'address_sign', title: '随机楼牌', icon: 'location_on' },
  stopsign: { kind: 'bus_stop', title: '随机站牌', icon: 'public' },
  metro: { kind: 'metro_line', title: '随机地铁', icon: 'assignment' },
};

/** 全部物料指令 id；commands.mjs 用它判断是否交给本模块。 */
export const signageCommands = [
  'materials',
  'blindbox',
  'roadsign',
  'buildingsign',
  'stopsign',
  'metro',
  'materialsource',
];

const iconByKind = {
  road_sign: 'explore',
  address_sign: 'location_on',
  bus_stop: 'public',
  metro_line: 'assignment',
  custom: 'edit_note',
};

/**
 * 物料指令入口：由 commands.mjs 的 switch 调用，也可在测试里直接调用。
 * 返回 { handled: true, reply, card? }，card 只在真正出图时出现。
 */
export async function handleSignageCommand({
  command,
  args = '',
  config,
  context,
  fetchImpl = fetch,
  logger,
  moduleStore,
  materialSourceStore,
} = {}) {
  const action = String(command ?? '').trim();
  const store = materialSourceStore ?? materialSourceStoreFor(config);

  if (action === 'materials') {
    return materialMenu({ config, context, store });
  }

  // 过渡开关和缺 secret 时，除帮助菜单外的物料指令都只给提示，不发请求。
  if (config?.materials?.enabled === false) {
    return { handled: true, reply: '物料盲盒功能暂时关闭了，请联系管理员。' };
  }
  if (!materialSecret(config)) {
    return { handled: true, reply: '物料功能还没有配置完成，请联系管理员。' };
  }

  if (action === 'materialsource') {
    return handleMaterialSource({ args, config, context, logger, moduleStore, store });
  }

  const spec = renderCommandSpecs[action];
  if (!spec) {
    return { handled: false };
  }
  return renderMaterial({
    command: action,
    spec,
    config,
    context,
    fetchImpl,
    logger,
    store,
  });
}

function materialMenu({ config, context, store }) {
  const groupId = context?.kind === 'group' ? String(context.groupId ?? '') : '';
  const source = getMaterialSource(groupId, config, store);
  const lines = [
    '城市物料盲盒：从站内真实数据里随机抽一张牌面，随机生成、非正式物料。',
    '/盲盒   从 19 个系统模板里随机一张',
    '/路牌   道路路名方向牌',
    '/楼牌   楼栋地名标志（默认 / 怀旧随机）',
    '/站牌   公交站牌（6 种版式随机）',
    '/地铁   地铁线路图 / 站名 / 方向 / 站台牌 / 导视牌',
    '/数据源 查看或切换本群线网来源（默认服务器线网）',
    '每张物料带编号（如 LD-7F3A）和二维码，30 天内可扫码在雨城通工作台继续编辑。',
  ];
  if (config?.materials?.enabled === false) {
    lines.push('物料盲盒现在未开启，请联系管理员。');
  } else if (!materialSecret(config)) {
    lines.push('物料功能还没有配置完成，请联系管理员。');
  } else if (groupId) {
    lines.push(
      `本群数据源：${source === MATERIAL_SOURCE_SAMPLE ? '沈阳示例线网（只开放地铁物料）' : '服务器线网'}`,
    );
  }
  return { handled: true, reply: lines.join('\n') };
}

async function handleMaterialSource({ args, config, context, logger, moduleStore, store }) {
  if (context?.kind !== 'group' || !context.groupId) {
    return {
      handled: true,
      reply: '物料数据源按群保存，只能在群里 @我 查看或切换；单聊沿用服务器线网。',
    };
  }
  const groupId = String(context.groupId);
  const current = getMaterialSource(groupId, config, store);
  const requested = parseMaterialSourceArgs(args);

  if (requested.error) {
    return { handled: true, reply: materialSourceUsage(current) };
  }
  if (!requested.source) {
    return { handled: true, reply: describeMaterialSource(current) };
  }
  if (requested.source === current) {
    return {
      handled: true,
      reply: `本群物料数据源已经是「${sourceLabel(current)}」了。`,
    };
  }

  if (!canEditMaterialSource({ context, config, moduleStore, groupId })) {
    return { handled: true, reply: materialSourcePermissionDenied(context) };
  }

  const result = store.setSource(groupId, requested.source, {
    role: context.role,
    name: context.userName,
  });
  if (!result.ok) {
    logger?.warn(`物料数据源保存失败：${result.reason ?? 'unknown'}`);
    return { handled: true, reply: '数据源切换没有保存成功，请稍后再试。' };
  }

  const record = {
    event: 'material.source_change',
    group: maskOpenId(groupId),
    groupHash: createHash('sha256').update(groupId, 'utf8').digest('hex').slice(0, 16),
    role: normalizeRole(context.role),
    before: result.before,
    after: result.source,
  };
  logger?.info(`物料数据源已切换：${JSON.stringify(record)}`);

  return {
    handled: true,
    reply:
      result.source === MATERIAL_SOURCE_SAMPLE
        ? [
            '已把本群物料数据源切到「沈阳示例线网」：只开放地铁物料，路牌 / 楼牌 / 站牌暂不可用。',
            '/盲盒 只在地铁模板里抽，示例线网物料必须标注：',
            SAMPLE_LICENSE_TEXT,
          ].join('\n')
        : '已把本群物料数据源切到「服务器线网」：路牌、楼牌、公交站牌和地铁物料都恢复可用。',
  };
}

function parseMaterialSourceArgs(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/[?？!！。]+$/u, '')
    .trim();
  if (!text) {
    return { source: '' };
  }
  if (/^(?:帮助|用法|help|\?|？)$/iu.test(text)) {
    return { error: true };
  }
  const cleaned = text
    .replace(
      /^(?:请)?(?:把本群)?(?:的)?(?:物料)?(?:数据源)?(?:切换到|切到|切换为|换成|换到|设为|设置为|改到|使用|用)/u,
      '',
    )
    .replace(/\s+/gu, '')
    .trim();
  const source = normalizeMaterialSourceArg(cleaned || text);
  return source ? { source } : { error: true };
}

function normalizeMaterialSourceArg(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['服务器', '服务器线网', '真实', '真实线网', 'server'].includes(text)) {
    return 'server';
  }
  if (['示例', '示例线网', '沈阳', '沈阳示例线网', 'sample'].includes(text)) {
    return 'sample';
  }
  return '';
}

function describeMaterialSource(current) {
  if (current === MATERIAL_SOURCE_SAMPLE) {
    return [
      '本群物料数据源：沈阳示例线网。',
      '只开放地铁物料（线路图、站名、方向、站台牌、导视牌），必须标注：',
      SAMPLE_LICENSE_TEXT,
      '群主或管理员可发送「/数据源 服务器」切回服务器线网。',
    ].join('\n');
  }
  return [
    '本群物料数据源：服务器线网。',
    '19 个系统模板都可用（路牌 / 楼牌 / 公交站牌 / 地铁）。',
    '群主或管理员可发送「/数据源 示例」切到沈阳示例线网（只开放地铁物料）。',
  ].join('\n');
}

function materialSourceUsage(current) {
  return [
    `本群物料数据源：${sourceLabel(current)}。`,
    '用法：/数据源 查看；/数据源 服务器、/数据源 示例 切换（仅群主或管理员）。',
  ].join('\n');
}

function materialSourcePermissionDenied(context) {
  if (normalizeRole(context?.role) === 'unknown') {
    return '暂时无法确认你的群身份，请联系机器人管理员切换本群物料数据源。';
  }
  return '只有群主或管理员可以切换本群物料数据源。';
}

function canEditMaterialSource({ context, config, moduleStore, groupId }) {
  if (moduleStore && typeof moduleStore.findGroupKey === 'function') {
    return canEdit(context, config, moduleStore, groupId);
  }
  // 直接调用（没有模块存储）时退回角色判断，与 canEdit 的默认值一致。
  const editors = config?.modules?.editors ?? ['owner', 'admin'];
  const role = normalizeRole(context?.role);
  return role !== 'unknown' && editors.includes(role);
}

function sourceLabel(source) {
  return source === MATERIAL_SOURCE_SAMPLE ? '沈阳示例线网' : '服务器线网';
}

async function renderMaterial({ command, spec, config, context, fetchImpl, logger, store }) {
  const groupId = context?.kind === 'group' ? String(context.groupId ?? '') : '';
  const dataSource = getMaterialSource(groupId, config, store);

  // 示例线网只开放地铁族：在本地拦掉，避免白跑一次网页渲染再拿 400。
  if (
    dataSource === MATERIAL_SOURCE_SAMPLE &&
    ['roadsign', 'buildingsign', 'stopsign'].includes(command)
  ) {
    return { handled: true, reply: SAMPLE_SCOPE_LIMIT_TEXT };
  }

  // 示例线网的候选池本身只包含 metro_line / custom（10 个地铁模板），
  // 所以 /盲盒 继续传 random，由网页端在池子里抽，不能在这里锁成 metro_line。
  const kind = spec.kind;
  const baseUrl = String(config?.yct?.baseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl) {
    return { handled: true, reply: '物料服务地址还没有配置，请联系管理员。' };
  }
  const timeoutMs = materialTimeoutMs(config);
  const secret = materialSecret(config);
  const body = JSON.stringify({ kind, dataSource });
  const signature = createMaterialSignature(secret, body);

  let response;
  const requestStartedAt = Date.now();
  try {
    response = await fetchImpl(`${baseUrl}/api/qq-bot/materials/render`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        [MATERIAL_SIGNATURE_HEADER]: signature,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const elapsedMs = Date.now() - requestStartedAt;
    logger?.warn(
      `${spec.title} 请求物料服务失败（耗时 ${elapsedMs}ms，超时 ${timeoutMs}ms，目标 ${baseUrl}）：`,
      error,
    );
    return {
      handled: true,
      reply: isTimeoutError(error)
        ? '物料生成超时了，请稍后再试。'
        : '暂时连不上物料服务，请稍后再试。',
    };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    logger?.warn(
      `物料服务返回 ${response.status}（${payload?.error ?? 'unknown'}）：${payload?.message ?? ''}`,
    );
    return {
      handled: true,
      reply: describeRenderFailure({ status: response.status, payload, dataSource }),
    };
  }
  if (payload?.ok !== true) {
    logger?.warn(`物料服务返回了无法识别的数据：${JSON.stringify(payload?.error ?? payload)}`);
    return {
      handled: true,
      reply: describeRenderFailure({ status: 200, payload, dataSource }),
    };
  }

  const parsed = normalizeRenderPayload(payload, dataSource);
  if (!parsed.ok) {
    logger?.warn(`物料响应缺少必要字段：${parsed.reason}`);
    return { handled: true, reply: parsed.reply };
  }

  const qrDataUrl = parsed.shareUrl ? await createQrDataUrl(parsed.shareUrl, logger) : '';
  const card = buildSignageCard({
    spec,
    context,
    payload: parsed,
    qrDataUrl,
  });
  return {
    handled: true,
    reply: buildRenderReply({ command, payload: parsed, dataSource }),
    card,
  };
}

function normalizeRenderPayload(payload, dataSource) {
  const pngBase64 = typeof payload?.pngBase64 === 'string' ? payload.pngBase64.trim() : '';
  if (!pngBase64) {
    return { ok: false, reason: '缺 pngBase64', reply: '物料服务没有返回图片，请稍后再试。' };
  }
  const widthPx = toPositiveInteger(payload.widthPx);
  const heightPx = toPositiveInteger(payload.heightPx);
  if (!widthPx || !heightPx) {
    return { ok: false, reason: '缺尺寸', reply: '物料服务返回的图片尺寸不完整，请稍后再试。' };
  }
  const card = payload.card && typeof payload.card === 'object' ? payload.card : null;
  if (!card) {
    return { ok: false, reason: '缺 card', reply: '物料服务返回的卡片信息不完整，请稍后再试。' };
  }
  const source = normalizeSourceDescriptor(payload.source, dataSource);
  if (dataSource === MATERIAL_SOURCE_SAMPLE) {
    // 缺许可就不出图：示例线网必须能标注来源与许可（方案 4.6）。
    if (
      source.kind !== MATERIAL_SOURCE_SAMPLE ||
      !String(source.licenseName ?? '').trim() ||
      !String(source.licenseUrl ?? '').trim()
    ) {
      return { ok: false, reason: '示例线网缺许可字段', reply: SAMPLE_LICENSE_MISSING_TEXT };
    }
  }
  const shareUrl = typeof payload.shareUrl === 'string' ? payload.shareUrl.trim() : '';
  const code = typeof payload.code === 'string' ? payload.code.trim() : '';
  const template =
    payload.template && typeof payload.template === 'object'
      ? {
          title: String(payload.template.title ?? '').slice(0, 40),
          version: toPositiveInteger(payload.template.version) || 1,
        }
      : { title: '', version: 1 };
  return {
    ok: true,
    pngBase64,
    widthPx,
    heightPx,
    card,
    source,
    shareUrl,
    code,
    template,
  };
}

function normalizeSourceDescriptor(source, dataSource) {
  const kind = source?.kind === MATERIAL_SOURCE_SAMPLE ? MATERIAL_SOURCE_SAMPLE : 'server';
  return {
    kind: dataSource === MATERIAL_SOURCE_SAMPLE ? kind : 'server',
    name: String(
      source?.name ?? (dataSource === MATERIAL_SOURCE_SAMPLE ? '沈阳示例线网' : '临东市线网'),
    )
      .trim()
      .slice(0, 60),
    licenseName: String(source?.licenseName ?? '').trim(),
    licenseUrl: String(source?.licenseUrl ?? '').trim(),
  };
}

function buildSignageCard({ spec, context, payload, qrDataUrl }) {
  const card = payload.card;
  const kind = normalizeKind(card.kind, spec.kind);
  const meta = buildCardMeta({ card, payload, kind });
  const shareUrl = payload.shareUrl || '';
  return {
    type: 'signage',
    title: cleanText(card.title, 24) || spec.title,
    eyebrow: cleanText(card.eyebrow, 40) || `城市物料盲盒 · ${displayDate(context)}`,
    color: normalizeColor(card.color) ?? MATERIAL_PROJECT_ACCENT,
    icon: iconByKind[kind] ?? spec.icon,
    headline: cleanText(card.headline, 40) || spec.title,
    subline: cleanText(card.subline, 60),
    meta,
    imageDataUri: `data:image/png;base64,${payload.pngBase64}`,
    imageWidthPx: payload.widthPx,
    imageHeightPx: payload.heightPx,
    qrDataUrl: qrDataUrl || undefined,
    shareUrl: shareUrl || undefined,
    date: context?.date || shanghaiDateKey(),
    footer: cleanText(card.footer, 80) || MATERIAL_FOOTER,
  };
}

/**
 * 卡片 meta：网页端已给编号 / 数据源 / 模板；示例线网再补一条许可标注，
 * 渲染器最多显示 4 条，所以把许可放在第 2 条，避免被截掉。
 */
function buildCardMeta({ card, payload, kind }) {
  const lines = Array.isArray(card.meta)
    ? card.meta.map((line) => cleanText(line, 80)).filter(Boolean)
    : [];
  const meta = [];
  const codeLine =
    lines[0] ??
    [
      payload.code ? `编号 ${payload.code}` : '',
      `数据来自${describeSourceLabel(kind, payload.source)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  if (codeLine) {
    meta.push(codeLine);
  }
  if (payload.source.kind === MATERIAL_SOURCE_SAMPLE && !lines.some(isLicenseLine)) {
    meta.push(SAMPLE_LICENSE_TEXT);
  }
  for (const line of lines.slice(1)) {
    if (meta.length >= 4) {
      break;
    }
    if (line && !meta.includes(line)) {
      meta.push(line);
    }
  }
  if (meta.length < 4 && payload.template.title) {
    const templateLine = `模板：${payload.template.title}（v${payload.template.version}）`;
    if (!meta.includes(templateLine)) {
      meta.push(templateLine);
    }
  }
  return meta.slice(0, 4);
}

function buildRenderReply({ command, payload, dataSource }) {
  const { card, source } = payload;
  const title = cleanText(card.title, 24) || renderCommandSpecs[command]?.title || '随机物料';
  const headline = cleanText(card.headline, 40);
  const lines = [headline ? `${title}：${headline}` : title];
  const subline = cleanText(card.subline, 60);
  if (subline) {
    lines.push(subline);
  }
  const codeAndTemplate = [
    payload.code ? `编号：${payload.code}` : '',
    payload.template.title ? `模板：${payload.template.title}（v${payload.template.version}）` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (codeAndTemplate) {
    lines.push(codeAndTemplate);
  }
  lines.push(`数据源：${source.name || sourceLabel(dataSource)}`);
  if (source.kind === MATERIAL_SOURCE_SAMPLE) {
    lines.push(SAMPLE_LICENSE_TEXT);
  }
  if (payload.shareUrl) {
    lines.push('扫码或打开链接，30 天内可在雨城通工作台继续编辑：');
    lines.push(payload.shareUrl);
  }
  lines.push(MATERIAL_FOOTER);
  return lines.join('\n');
}

function describeSourceLabel(kind, source) {
  if (source.kind === MATERIAL_SOURCE_SAMPLE) {
    return `${source.name} · ${source.licenseName} · railmapgen.org`;
  }
  const labels = {
    road_sign: '临东市地图道路标记',
    address_sign: '临东市地图地点与已发布 POI 地址',
    bus_stop: '临东市已发布公交线路与站点',
    metro_line: '临东市已发布地铁线路与站点',
    custom: '临东市已发布地铁线路与站点（导视牌示例）',
  };
  return labels[kind] ?? '临东市线网';
}

function describeRenderFailure({ status, payload, dataSource }) {
  const code = typeof payload?.error === 'string' ? payload.error : '';
  if (code === 'invalid_signature' || (!code && status === 403)) {
    return '物料功能还没有配置完成，请联系管理员。';
  }
  if (code === 'rate_limited' || (!code && status === 429)) {
    const seconds = Number(payload?.retryAfterSeconds);
    return Number.isFinite(seconds) && seconds > 0
      ? `物料生成得有点快，请 ${Math.ceil(seconds)} 秒后再试。`
      : '物料生成得有点快，请稍后再试。';
  }
  if (code === 'source_scope_limited') {
    return SAMPLE_SCOPE_LIMIT_TEXT;
  }
  if (code === 'no_candidate' || (!code && status === 404)) {
    return '暂时没有抽到可用的物料数据，换个指令或稍后再试。';
  }
  if (code === 'sample_unavailable') {
    return '示例线网暂时不可用，请稍后再试。群主或管理员可以发送「/数据源 服务器」切回服务器线网。';
  }
  if (code === 'source_unavailable' || (!code && status === 503)) {
    return dataSource === MATERIAL_SOURCE_SAMPLE
      ? '示例线网暂时不可用，请稍后再试。群主或管理员可以发送「/数据源 服务器」切回服务器线网。'
      : '物料数据源暂时不可用，请稍后再试。';
  }
  if (code === 'invalid_request' || (!code && status === 400)) {
    return '物料请求没有通过校验，请稍后再试。';
  }
  if (status >= 500) {
    return '出图失败，请稍后再试。';
  }
  return '物料生成没有成功，请稍后再试。';
}

/**
 * 生成 `x-yct-bot-signature` 头：`<unix秒>.<hex(HMAC-SHA256(secret, "<unix秒>.<sha256(body)>"))>`。
 * 网页端实现见 apps/web/lib/qq-bot-material.ts，两边必须保持一致。
 */
export function createMaterialSignature(secret, body, timestampSeconds) {
  const timestamp =
    Number.isInteger(timestampSeconds) && timestampSeconds > 0
      ? timestampSeconds
      : Math.floor(Date.now() / 1000);
  const bodyHash = createHash('sha256').update(String(body), 'utf8').digest('hex');
  const signature = createHmac('sha256', String(secret))
    .update(`${timestamp}.${bodyHash}`, 'utf8')
    .digest('hex');
  return `${timestamp}.${signature}`;
}

async function createQrDataUrl(text, logger) {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 104,
      color: { dark: '#263c3a', light: '#ffffff' },
    });
  } catch (error) {
    logger?.warn('生成物料二维码失败：', error);
    return '';
  }
}

function materialSecret(config) {
  return String(config?.materials?.secret ?? '').trim();
}

function materialTimeoutMs(config) {
  const value = Number(config?.materials?.timeoutMs);
  return Number.isFinite(value) && value >= 1000 ? Math.round(value) : DEFAULT_MATERIAL_TIMEOUT_MS;
}

function isTimeoutError(error) {
  return (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.code === 'ETIMEDOUT'
  );
}

function normalizeKind(value, fallback) {
  const kind = String(value ?? '').trim();
  if (['road_sign', 'address_sign', 'bus_stop', 'metro_line', 'custom'].includes(kind)) {
    return kind;
  }
  return fallback === 'random' ? 'custom' : fallback;
}

function normalizeColor(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^#[0-9a-fA-F]{6}$/u.test(text) ? text : '';
}

function isLicenseLine(line) {
  return (
    String(line ?? '').includes('CC BY-NC-SA') || String(line ?? '').includes('railmapgen.org')
  );
}

function toPositiveInteger(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function displayDate(context) {
  const date = context?.date || shanghaiDateKey();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  return match ? `${match[1]}年${match[2]}月${match[3]}日` : date;
}

function normalizeRole(value) {
  const role = String(value ?? '').toLowerCase();
  return role === 'owner' || role === 'admin' || role === 'member' ? role : 'unknown';
}
