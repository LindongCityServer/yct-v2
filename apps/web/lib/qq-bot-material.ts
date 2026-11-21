/**
 * QQ 机器人随机物料出图核心。
 *
 * 方案见 docs/QQ_BOT_MATERIALS_PLAN.md 第 3.2 / 4.3 / 4.4 / 4.6 / 4.7 / 4.8 节：
 * - 候选池：19 个系统模板 × 当前数据可满足的条件；随机只抽真实对象，不做词库拼字；
 * - 确定性：`sha256(seed + kind)` 派生 xorshift128，同一 seed 抽到同一对象、同一牌面；
 * - server 数据源复用工作台的「套用数据」resolver；
 * - sample 数据源只用 `loadDefaultMaterialTransitNetworkSample()`（进程内缓存 1 小时），
 *   且只允许 metro_line / custom（其它族由上层返回 400 source_scope_limited）；
 * - 画布按模板 defaultCanvas 与目标长边算 pxPerMeter，路牌再裁掉上半部空白。
 *
 * 鉴权与限流辅助也放在这里，供 `POST /api/qq-bot/materials/render` 使用：
 * - HMAC 签名格式：请求头 `x-yct-bot-signature: <unix秒>.<hex签名>`，
 *   签名 = HMAC-SHA256(secret, `<unix秒>.<sha256(原始请求体) hex>`)，时间窗 ±60 秒；
 * - 进程内限流：全局 60 次/分钟、渲染并发 2。
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import type {
  MaterialCanvasConfig,
  MaterialTemplateVersion,
  MaterialTransitNetworkSnapshot,
} from '@yct/contracts';
import { parseMaterialAddress } from './material-address';
import { MATERIAL_CANVAS_MIN_PX_PER_METER } from './material-canvas-policy';
import {
  listMaterialAddressPoiLocations,
  listMaterialLocations,
  resolveMaterialLocationInput,
  resolveRoadCoordinateMaterialInput,
  type MaterialLocationOption,
} from './material-location-source';
import { renderMaterialTemplateToPng } from './material-renderer';
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
} from './material-template-ids';
import {
  listMaterialTransitLines,
  listMaterialTransitStations,
  resolveTransitLineMaterialInput,
  resolveTransitStationMaterialInput,
  type MaterialTransitDirection,
  type MaterialTransitLineOption,
  type MaterialTransitStationLineOption,
  type MaterialTransitStationOption,
  type MaterialTransitTerminalRole,
} from './material-transit-source';
import {
  loadDefaultMaterialTransitNetworkSample,
  type MaterialTransitNetworkSample,
} from './material-transit-network-sample';
import {
  buildMetroWayfindingTemplateExamples,
  type MetroWayfindingExample,
  type MetroWayfindingExampleLine,
  type MetroWayfindingExampleStation,
} from './metro-wayfinding-examples';
import { METRO_WAYFINDING_TEMPLATE_ID, serializeMetroWayfindingLayout } from './metro-wayfinding';
import {
  listMaterialTransitNetworkLines,
  listMaterialTransitNetworkLineStations,
} from './rmp-transit-network';
import { createTimedCache } from './server-cache';
import { systemMaterialTemplateRecords } from './system-material-templates';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

export const qqBotMaterialKinds = [
  'road_sign',
  'address_sign',
  'bus_stop',
  'metro_line',
  'custom',
  'random',
] as const;

/** 指令族：random 表示全族随机；其余与模板 family 一一对应。 */
export type QqBotMaterialKind = (typeof qqBotMaterialKinds)[number];

/** 抽中模板后实际的族（不含 random）。 */
export type QqBotMaterialResolvedKind = Exclude<QqBotMaterialKind, 'random'>;

/**
 * 19 个系统模板的稳定 id 列表，同时也是候选池的全集。
 * 顺序固定：候选池按这个顺序构造，保证同一 seed 的结果可复现。
 */
export const qqBotMaterialTemplateIds = [
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
  BUILDING_ADDRESS_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_DETAIL_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  METRO_WAYFINDING_TEMPLATE_ID,
] as const;

export type QqBotMaterialTemplateId = (typeof qqBotMaterialTemplateIds)[number];

/**
 * 第一层模板入口：与工作台「模板与版式」的 templateGroups 保持一致。
 * `/盲盒` 先在这些入口之间等概率抽，再在入口内按内部模板等概率抽。
 * 指定族指令（/站牌、/地铁 等）仍按内部模板等概率，不经过这一层。
 */
export const qqBotMaterialTemplateEntries = [
  {
    id: 'road_sign',
    templateIds: [ROAD_NAME_DIRECTION_TEMPLATE_ID],
  },
  {
    id: 'address_sign',
    templateIds: [BUILDING_ADDRESS_TEMPLATE_ID, NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID],
  },
  {
    id: 'bus_stop',
    templateIds: [
      BUS_STOP_TERMINAL_TEMPLATE_ID,
      BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
      BUS_STOP_OVERVIEW_TEMPLATE_ID,
      BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
      BUS_STOP_DETAIL_TEMPLATE_ID,
    ],
  },
  {
    id: 'bus_stop_horizontal_detail',
    templateIds: [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID],
  },
  {
    id: 'metro_line_map_vertical',
    templateIds: [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID, METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID],
  },
  {
    id: 'metro_line_map',
    templateIds: [
      METRO_LINE_MAP_NEW_TEMPLATE_ID,
      METRO_LINE_MAP_OLD_TEMPLATE_ID,
      METRO_STATION_NAME_NEW_TEMPLATE_ID,
      METRO_STATION_NAME_OLD_TEMPLATE_ID,
      METRO_DIRECTION_NEW_TEMPLATE_ID,
      METRO_DIRECTION_OLD_TEMPLATE_ID,
    ],
  },
  {
    id: 'metro_platform_sign',
    templateIds: [METRO_PLATFORM_SIGN_TEMPLATE_ID],
  },
  {
    id: 'metro_wayfinding',
    templateIds: [METRO_WAYFINDING_TEMPLATE_ID],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  templateIds: readonly QqBotMaterialTemplateId[];
}>;

const qqBotMaterialEntryIdByTemplateId = new Map<QqBotMaterialTemplateId, string>(
  qqBotMaterialTemplateEntries.flatMap((entry) =>
    entry.templateIds.map((templateId) => [templateId, entry.id] as const),
  ),
);

/** 数据源：server = 服务器真实公开数据；sample = 沈阳示例线网。 */
export type QqBotMaterialDataSource = 'server' | 'sample';

export type QqBotMaterialErrorCode =
  | 'invalid_request'
  | 'no_candidate'
  | 'source_unavailable'
  | 'sample_unavailable'
  | 'source_scope_limited'
  | 'render_failed';

const qqBotMaterialErrorStatus: Record<QqBotMaterialErrorCode, number> = {
  invalid_request: 400,
  no_candidate: 404,
  source_unavailable: 503,
  sample_unavailable: 503,
  source_scope_limited: 400,
  render_failed: 500,
};

/** 可识别的物料错误：路由据此返回 400/404/500/503。 */
export class QqBotMaterialError extends Error {
  readonly code: QqBotMaterialErrorCode;
  readonly status: number;

  constructor(code: QqBotMaterialErrorCode, message: string) {
    super(message);
    this.name = 'QqBotMaterialError';
    this.code = code;
    this.status = qqBotMaterialErrorStatus[code];
  }
}

/** 渲染请求（POST /api/qq-bot/materials/render 的 JSON 体）。 */
export interface QqBotMaterialRenderRequest {
  kind?: string;
  templateId?: string;
  dataSource?: string;
  seed?: string;
  /** 预留：群共享 RMP 项目 id（P1 不实现，传了按 invalid_request 拒绝）。 */
  projectId?: string;
  /** 群/会话哈希，只用于限流；当前实现只有全局限流，故只做格式校验。 */
  session?: string;
}

/** 物料来源：server 不带许可；sample 必须带示例线网的许可信息。 */
export interface QqBotMaterialSourceDescriptor {
  kind: 'server' | 'sample';
  name: string;
  licenseName: string;
  licenseUrl: string;
}

/** 机器人 `signage` 卡片数据（PNG 由本模块给出，卡片版式由机器人侧拼）。 */
export interface QqBotMaterialCard {
  kind: QqBotMaterialResolvedKind;
  title: string;
  eyebrow: string;
  headline: string;
  subline: string;
  meta: string[];
  footer: string;
  /** 可选主题色，供机器人卡片渲染器使用。 */
  color?: string;
}

export interface QqBotMaterialRenderResult {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  templateId: QqBotMaterialTemplateId;
  templateVersion: number;
  templateTitle: string;
  kind: QqBotMaterialResolvedKind;
  /** 二维码落地页路径用的模板短名，固定映射，不随画布变化。 */
  slug: string;
  /** 编号：类型前缀 + seed 前 4 位（LD / BL / BS / MS / ML / MW）。 */
  code: string;
  seed: string;
  card: QqBotMaterialCard;
  source: QqBotMaterialSourceDescriptor;
  /**
   * 出图用的完整画布与字段值：分享记录（方案 4.5 / 4.6）需要「模板 + 字段值 + 画布」
   * 才能在扫码后还原到工作台，这里一并给出，避免机器人再解析一遍数据。
   */
  canvas: MaterialCanvasConfig;
  input: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 固定映射
// ---------------------------------------------------------------------------

/** 模板 → 抽中后的族。 */
const qqBotMaterialKindByTemplateId: Record<QqBotMaterialTemplateId, QqBotMaterialResolvedKind> = {
  [ROAD_NAME_DIRECTION_TEMPLATE_ID]: 'road_sign',
  [BUILDING_ADDRESS_TEMPLATE_ID]: 'address_sign',
  [NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID]: 'address_sign',
  [BUS_STOP_TERMINAL_TEMPLATE_ID]: 'bus_stop',
  [BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID]: 'bus_stop',
  [BUS_STOP_OVERVIEW_TEMPLATE_ID]: 'bus_stop',
  [BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID]: 'bus_stop',
  [BUS_STOP_DETAIL_TEMPLATE_ID]: 'bus_stop',
  [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID]: 'bus_stop',
  [METRO_LINE_MAP_NEW_TEMPLATE_ID]: 'metro_line',
  [METRO_LINE_MAP_OLD_TEMPLATE_ID]: 'metro_line',
  [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID]: 'metro_line',
  [METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID]: 'metro_line',
  [METRO_STATION_NAME_NEW_TEMPLATE_ID]: 'metro_line',
  [METRO_STATION_NAME_OLD_TEMPLATE_ID]: 'metro_line',
  [METRO_DIRECTION_NEW_TEMPLATE_ID]: 'metro_line',
  [METRO_DIRECTION_OLD_TEMPLATE_ID]: 'metro_line',
  [METRO_PLATFORM_SIGN_TEMPLATE_ID]: 'metro_line',
  [METRO_WAYFINDING_TEMPLATE_ID]: 'custom',
};

/**
 * 模板 → 二维码落地页短名（固定映射，供 `/m/<slug>/<shareId>` 复用）。
 * 说明：公交「横版线路详情」是整条线路的目录式站序，因此短名用 bus-stop-directory。
 */
const qqBotMaterialSlugByTemplateId: Record<QqBotMaterialTemplateId, string> = {
  [ROAD_NAME_DIRECTION_TEMPLATE_ID]: 'road',
  [BUILDING_ADDRESS_TEMPLATE_ID]: 'building',
  [NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID]: 'building-nostalgic',
  [BUS_STOP_TERMINAL_TEMPLATE_ID]: 'bus-stop-terminal',
  [BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID]: 'bus-stop-terminal-realistic',
  [BUS_STOP_OVERVIEW_TEMPLATE_ID]: 'bus-stop-overview',
  [BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID]: 'bus-stop-overview-realistic',
  [BUS_STOP_DETAIL_TEMPLATE_ID]: 'bus-stop-detail',
  [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID]: 'bus-stop-directory',
  [METRO_LINE_MAP_NEW_TEMPLATE_ID]: 'metro-line-map',
  [METRO_LINE_MAP_OLD_TEMPLATE_ID]: 'metro-line-map-old',
  [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID]: 'metro-line-map-vertical',
  [METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID]: 'metro-line-map-vertical-old',
  [METRO_STATION_NAME_NEW_TEMPLATE_ID]: 'metro-station-name',
  [METRO_STATION_NAME_OLD_TEMPLATE_ID]: 'metro-station-name-old',
  [METRO_DIRECTION_NEW_TEMPLATE_ID]: 'metro-direction',
  [METRO_DIRECTION_OLD_TEMPLATE_ID]: 'metro-direction-old',
  [METRO_PLATFORM_SIGN_TEMPLATE_ID]: 'metro-platform',
  [METRO_WAYFINDING_TEMPLATE_ID]: 'metro-wayfinding',
};

/** 编号前缀：LD 路牌 / BL 楼牌 / BS 站牌 / MS 地铁站名类 / ML 线路图 / MW 导视牌。 */
const qqBotMaterialCodePrefixByTemplateId: Record<QqBotMaterialTemplateId, string> = {
  [ROAD_NAME_DIRECTION_TEMPLATE_ID]: 'LD',
  [BUILDING_ADDRESS_TEMPLATE_ID]: 'BL',
  [NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID]: 'BL',
  [BUS_STOP_TERMINAL_TEMPLATE_ID]: 'BS',
  [BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID]: 'BS',
  [BUS_STOP_OVERVIEW_TEMPLATE_ID]: 'BS',
  [BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID]: 'BS',
  [BUS_STOP_DETAIL_TEMPLATE_ID]: 'BS',
  [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID]: 'BS',
  [METRO_LINE_MAP_NEW_TEMPLATE_ID]: 'ML',
  [METRO_LINE_MAP_OLD_TEMPLATE_ID]: 'ML',
  [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID]: 'ML',
  [METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID]: 'ML',
  [METRO_STATION_NAME_NEW_TEMPLATE_ID]: 'MS',
  [METRO_STATION_NAME_OLD_TEMPLATE_ID]: 'MS',
  [METRO_DIRECTION_NEW_TEMPLATE_ID]: 'MS',
  [METRO_DIRECTION_OLD_TEMPLATE_ID]: 'MS',
  [METRO_PLATFORM_SIGN_TEMPLATE_ID]: 'MS',
  [METRO_WAYFINDING_TEMPLATE_ID]: 'MW',
};

const qqBotMaterialTitleByKind: Record<QqBotMaterialResolvedKind, string> = {
  road_sign: '随机路牌',
  address_sign: '随机楼牌',
  bus_stop: '随机站牌',
  metro_line: '随机地铁',
  custom: '随机导视牌',
};

const qqBotMaterialColorByKind: Record<QqBotMaterialResolvedKind, string> = {
  road_sign: '#004796',
  address_sign: '#0054C2',
  bus_stop: '#108433',
  metro_line: '#0A124D',
  custom: '#262626',
};

export const QQ_BOT_MATERIAL_FOOTER = '雨城通 · 随机生成，非正式物料';

const qqBotServerSource: QqBotMaterialSourceDescriptor = {
  kind: 'server',
  name: '临东市线网',
  licenseName: '',
  licenseUrl: '',
};

/** 画布目标长边：非方形 1024 px；1:1 方牌 640 px。 */
const qqBotMaterialTargetLongSidePx = 1024;
const qqBotMaterialSquareTargetLongSidePx = 640;

/** 随机抽样时最多重试的候选数：数据边缘情况（无门牌号 / 字形拒绝）时换一个再试。 */
const qqBotMaterialMaximumAttempts = 4;

/** 门牌候选最多逐条解析多少个地点（解析本身只做字符串处理，上限防极端数据拖慢）。 */
const qqBotMaterialMaximumAddressCandidates = 500;

// ---------------------------------------------------------------------------
// 模板注册与固定映射读取
// ---------------------------------------------------------------------------

const qqBotMaterialTemplateById = new Map<string, MaterialTemplateVersion>();
for (const record of systemMaterialTemplateRecords) {
  const version = record.versions.find((item) => item.status === 'published') ?? record.versions[0];
  if (version) {
    qqBotMaterialTemplateById.set(record.id, version);
  }
}

function isQqBotMaterialTemplateId(value: string): value is QqBotMaterialTemplateId {
  return (qqBotMaterialTemplateIds as readonly string[]).includes(value);
}

/** 读取系统模板已发布版本；未知模板 id 返回 undefined。 */
export function findQqBotMaterialTemplate(templateId: string): MaterialTemplateVersion | undefined {
  return qqBotMaterialTemplateById.get(templateId);
}

/** 读取系统模板已发布版本；未知或未注册直接抛 invalid_request。 */
export function resolveQqBotMaterialTemplate(templateId: string): MaterialTemplateVersion {
  const template = findQqBotMaterialTemplate(templateId);
  if (!template) {
    throw new QqBotMaterialError('invalid_request', `未知的物料模板：${templateId}。`);
  }
  return template;
}

/** 模板所属的指令族。 */
export function resolveQqBotMaterialKind(
  templateId: QqBotMaterialTemplateId,
): QqBotMaterialResolvedKind {
  return qqBotMaterialKindByTemplateId[templateId];
}

/** 模板的二维码短名（固定映射）。 */
export function resolveQqBotMaterialSlug(templateId: QqBotMaterialTemplateId): string {
  return qqBotMaterialSlugByTemplateId[templateId];
}

/** 模板的编号前缀（LD / BL / BS / MS / ML / MW）。 */
export function resolveQqBotMaterialCodePrefix(templateId: QqBotMaterialTemplateId): string {
  return qqBotMaterialCodePrefixByTemplateId[templateId];
}

/**
 * 按 seed 归一化：纯十六进制原样小写；其它合法字符取 sha256 前 32 位。
 * 不传 seed 时生成 6 位十六进制。
 */
export function normalizeQqBotMaterialSeed(seed?: string): string {
  if (seed === undefined) {
    return randomInt(0, 0x1000000).toString(16).padStart(6, '0');
  }
  const trimmed = seed.trim();
  if (!/^[0-9A-Za-z_-]{1,64}$/u.test(trimmed)) {
    throw new QqBotMaterialError(
      'invalid_request',
      'seed 只允许 1-64 位字母、数字、下划线或短横线。',
    );
  }
  if (/^[0-9a-fA-F]{1,64}$/u.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 32);
}

/** 编号 = 类型前缀 + seed 前 4 位（大写）。 */
export function buildQqBotMaterialCode(templateId: QqBotMaterialTemplateId, seed: string): string {
  const suffix = seed.slice(0, 4).toUpperCase().padEnd(4, '0');
  return `${resolveQqBotMaterialCodePrefix(templateId)}-${suffix}`;
}

// ---------------------------------------------------------------------------
// seed → 确定性随机（sha256 + xorshift128）
// ---------------------------------------------------------------------------

/** 物料随机数发生器：同一 seed + 族得到同一条序列。 */
export interface QqBotMaterialRandom {
  nextUint32(): number;
  /** 返回 [0, maxExclusive) 的整数；maxExclusive 必须为正整数。 */
  nextInt(maxExclusive: number): number;
}

/**
 * 用 `sha256(seed + kind)` 的 4 个 32 位字初始化 xorshift128。
 * 用拒绝采样消除取模偏差，保证候选抽样均匀。
 */
export function createQqBotMaterialRandom(seed: string, kind: string): QqBotMaterialRandom {
  const digest = createHash('sha256').update(`${seed}${kind}`, 'utf8').digest();
  let stateX = digest.readUInt32LE(0);
  let stateY = digest.readUInt32LE(4);
  let stateZ = digest.readUInt32LE(8);
  let stateW = digest.readUInt32LE(12);
  if ((stateX | stateY | stateZ | stateW) === 0) {
    stateX = 0x9e3779b9;
  }

  const nextUint32 = (): number => {
    const t = (stateX ^ (stateX << 11)) >>> 0;
    stateX = stateY;
    stateY = stateZ;
    stateZ = stateW;
    stateW = (stateW ^ (stateW >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return stateW;
  };

  return {
    nextUint32,
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('随机抽样范围必须是正整数。');
      }
      const range = 0x1_0000_0000;
      const limit = range - (range % maxExclusive);
      let value = nextUint32();
      while (value >= limit) {
        value = nextUint32();
      }
      return value % maxExclusive;
    },
  };
}

function pickSeeded<T>(rng: QqBotMaterialRandom, values: readonly T[]): T {
  if (!values.length) {
    throw new MaterialCandidateRejectedError('没有可用的候选数据。');
  }
  return values[rng.nextInt(values.length)]!;
}

// ---------------------------------------------------------------------------
// 画布、渲染与后处理
// ---------------------------------------------------------------------------

/**
 * 按模板 defaultCanvas（或导视牌示例工程画布）计算聊天图用画布：
 * - 目标长边 1024 px；1:1 方牌给 640 px（bus-stop 方块 / 站台牌）；
 * - 6:1 线路图约 170 px/m（长边 1020），1:2.5 竖版约 409 px/m，2:1 给 512 px/m；
 * - 关闭瓦片对齐，避免 128 px 取整后长边超出目标。
 */
export function resolveQqBotMaterialCanvas(
  template: MaterialTemplateVersion,
  baseCanvas: MaterialCanvasConfig = template.defaultCanvas,
): MaterialCanvasConfig {
  const longSideM = Math.max(baseCanvas.widthM, baseCanvas.heightM, 1e-6);
  const shortSideM = Math.min(baseCanvas.widthM, baseCanvas.heightM);
  // 1:1 方牌（1m×1m 公交方块、4m×4m 站台牌）单独给 640 长边，避免 4m 方牌被拉到 4096。
  const square = Math.abs(longSideM - shortSideM) / longSideM < 0.01;
  const targetLongSidePx = square
    ? qqBotMaterialSquareTargetLongSidePx
    : qqBotMaterialTargetLongSidePx;
  const pxPerMeter = Math.max(
    MATERIAL_CANVAS_MIN_PX_PER_METER,
    Math.floor(targetLongSidePx / longSideM),
  );
  return { ...baseCanvas, pxPerMeter, alignToTile: false };
}

/**
 * 牌面后处理：
 * 路牌模板 2m×1m 中牌面位于下半部，聊天图裁掉上半部空白后再交给机器人，
 * 避免出现「上半张白纸」；其它模板原样返回。
 */
export async function postProcessQqBotMaterialPng(input: {
  templateId: QqBotMaterialTemplateId;
  png: Buffer;
  widthPx: number;
  heightPx: number;
}): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  if (input.templateId !== ROAD_NAME_DIRECTION_TEMPLATE_ID) {
    return { png: input.png, widthPx: input.widthPx, heightPx: input.heightPx };
  }
  const cropTop = Math.floor(input.heightPx / 2);
  const heightPx = input.heightPx - cropTop;
  if (cropTop <= 0 || heightPx <= 0) {
    return { png: input.png, widthPx: input.widthPx, heightPx: input.heightPx };
  }
  const png = await sharp(input.png)
    .extract({ left: 0, top: cropTop, width: input.widthPx, height: heightPx })
    .png()
    .toBuffer();
  return { png, widthPx: input.widthPx, heightPx };
}

// ---------------------------------------------------------------------------
// 卡片文案
// ---------------------------------------------------------------------------

interface MaterialCardSummary {
  headline: string;
  subline: string;
  /** 模板相关的附加 meta 行（编号 / 数据来源 / 模板名由公共层拼）。 */
  meta?: string[];
  color?: string;
}

interface PreparedMaterial {
  values: Record<string, string>;
  /** 导视牌示例自带画布；其它模板用 defaultCanvas。 */
  canvasBase?: MaterialCanvasConfig;
  summary: MaterialCardSummary;
}

function describeQqBotMaterialSourceLabel(
  kind: QqBotMaterialResolvedKind,
  source: QqBotMaterialSourceDescriptor,
): string {
  if (source.kind === 'sample') {
    // 方案 4.6：示例线网的卡面必须同时展示名称、许可与来源站。
    return `${source.name} · ${source.licenseName} · railmapgen.org`;
  }
  switch (kind) {
    case 'road_sign':
      return '临东市地图道路标记';
    case 'address_sign':
      return '临东市地图地点与已发布 POI 地址';
    case 'bus_stop':
      return '临东市已发布公交线路与站点';
    default:
      return '临东市已发布地铁线路';
  }
}

const qqBotMaterialDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'numeric',
  day: 'numeric',
});

function formatQqBotMaterialMonthDay(date: Date): string {
  const parts = Object.fromEntries(
    qqBotMaterialDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month ?? '1'}月${parts.day ?? '1'}日`;
}

function buildQqBotMaterialCard(input: {
  template: MaterialTemplateVersion;
  kind: QqBotMaterialResolvedKind;
  code: string;
  source: QqBotMaterialSourceDescriptor;
  summary: MaterialCardSummary;
}): QqBotMaterialCard {
  const meta = [
    `编号 ${input.code} · 数据来自${describeQqBotMaterialSourceLabel(input.kind, input.source)}`,
    ...(input.summary.meta ?? []),
    `模板：${input.template.title}（v${input.template.version}）`,
  ].slice(0, 4);
  return {
    kind: input.kind,
    title: qqBotMaterialTitleByKind[input.kind],
    eyebrow: `城市物料盲盒 · ${formatQqBotMaterialMonthDay(new Date())}`,
    headline: input.summary.headline,
    subline: input.summary.subline,
    meta,
    footer: QQ_BOT_MATERIAL_FOOTER,
    color: input.summary.color ?? qqBotMaterialColorByKind[input.kind],
  };
}

function resolveTemplateFieldOptionLabel(
  template: MaterialTemplateVersion,
  fieldKey: string,
  value: string,
): string {
  const field = template.fields.find((item) => item.key === fieldKey);
  return field?.options?.find((option) => option.value === value)?.label ?? value;
}

const qqBotTransitDirectionLabel: Record<MaterialTransitDirection, string> = {
  east: '东',
  west: '西',
  north: '北',
  south: '南',
};

function formatBusStopDirectionLabel(direction: MaterialTransitDirection): string {
  return `${qqBotTransitDirectionLabel[direction]}向`;
}

// ---------------------------------------------------------------------------
// 候选池内部结构
// ---------------------------------------------------------------------------

interface MaterialCandidate {
  templateId: QqBotMaterialTemplateId;
  template: MaterialTemplateVersion;
  prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial>;
}

/** 候选项在数据层面被排除（例如没有门牌号 / 导视牌示例为空）：换一个候选重试。 */
class MaterialCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialCandidateRejectedError';
  }
}

interface QqBotMaterialCandidatePool {
  candidates: MaterialCandidate[];
  /** 数据源级失败信息：都为空说明数据本身可用，只是不满足模板条件。 */
  loadErrors: string[];
  /** 每个模板因数据条件无法进入候选池的原因（用于 404 文案）。 */
  unavailableReasons: string[];
  source: QqBotMaterialSourceDescriptor;
}

/** 服务器数据上下文：按需加载，避免 /路牌 也去拉整张线网。 */
interface ServerMaterialDataSet {
  locations?: MaterialLocationOption[];
  locationsError?: string;
  addressEntries?: AddressMaterialEntry[];
  addressError?: string;
  transitLines?: MaterialTransitLineOption[];
  transitLinesError?: string;
  transitStations?: MaterialTransitStationOption[];
  transitStationsError?: string;
}

interface AddressMaterialEntry {
  locationId: string;
  buildingNumber: string;
  buildingSuffix: string;
}

interface BusStopDirectionGroup {
  station: MaterialTransitStationOption;
  direction: MaterialTransitDirection;
  /** 已按线路 id 去重（同一条线路可能同时有上下行两条站序记录）。 */
  lines: MaterialTransitStationLineOption[];
}

interface SampleMaterialLine {
  lineKey: string;
  label: string;
  secondaryLabel?: string;
  color: string;
  stations: Array<{ id: string; name: string }>;
}

/** 构造导视牌示例时 lines 需要可增量 push；对外的示例类型是 readonly。 */
interface MutableWayfindingStation {
  name: string;
  secondaryName?: string;
  lines: MetroWayfindingExampleLine[];
}

interface SampleMaterialDataSet {
  sample: MaterialTransitNetworkSample;
  lines: SampleMaterialLine[];
  wayfindingStations: MetroWayfindingExampleStation[];
}

const qqBotTransitDirections: readonly MaterialTransitDirection[] = [
  'east',
  'west',
  'north',
  'south',
];

// ---------------------------------------------------------------------------
// 服务器数据加载
// ---------------------------------------------------------------------------

async function loadServerMaterialDataSet(needs: {
  locations: boolean;
  address: boolean;
  transitLines: boolean;
  transitStations: boolean;
}): Promise<ServerMaterialDataSet> {
  const data: ServerMaterialDataSet = {};
  const tasks: Array<Promise<void>> = [];
  if (needs.locations || needs.address) {
    tasks.push(
      listMaterialLocations().then(
        (value) => {
          data.locations = value;
        },
        (error: unknown) => {
          data.locationsError = describeError(error);
        },
      ),
    );
  }
  if (needs.transitLines) {
    tasks.push(
      listMaterialTransitLines().then(
        (value) => {
          data.transitLines = value;
        },
        (error: unknown) => {
          data.transitLinesError = describeError(error);
        },
      ),
    );
  }
  if (needs.transitStations) {
    tasks.push(
      listMaterialTransitStations().then(
        (value) => {
          data.transitStations = value;
        },
        (error: unknown) => {
          data.transitStationsError = describeError(error);
        },
      ),
    );
  }
  await Promise.all(tasks);

  if (needs.address) {
    try {
      data.addressEntries = await listAddressMaterialEntries();
    } catch (error) {
      data.addressError = describeError(error);
    }
  }
  return data;
}

const qqBotServerMaterialDataSetCacheTtlMs = 5 * 60 * 1000;
const qqBotServerMaterialDataSetCache = new Map<
  string,
  { value: ServerMaterialDataSet; expiresAt: number }
>();

/**
 * /盲盒 会同时要道路、楼牌、公交和地铁数据，冷读要拉地图标记、读线网库，
 * 实测一次要几秒；机器人出图不需要秒级新鲜度，成功加载后复用 5 分钟，
 * 把每次请求的等待时间留给渲染本身。
 */
async function loadServerMaterialDataSetCached(needs: {
  locations: boolean;
  address: boolean;
  transitLines: boolean;
  transitStations: boolean;
}): Promise<ServerMaterialDataSet> {
  const cacheKey = [
    needs.locations ? 'L' : '',
    needs.address ? 'A' : '',
    needs.transitLines ? 'T' : '',
    needs.transitStations ? 'S' : '',
  ].join('');
  const cached = qqBotServerMaterialDataSetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = await loadServerMaterialDataSet(needs);
  // 加载失败（例如地图服务临时超时）就不缓存，下一次请求还能重试；
  // 地图标记静默降级成“只有 POI、没有道路”时也不能缓存，否则会锁住 5 分钟。
  if (canCacheServerMaterialDataSet(value, needs)) {
    qqBotServerMaterialDataSetCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + qqBotServerMaterialDataSetCacheTtlMs,
    });
  }
  return value;
}

function canCacheServerMaterialDataSet(
  data: ServerMaterialDataSet,
  needs: { locations: boolean },
): boolean {
  if (
    data.locationsError ||
    data.addressError ||
    data.transitLinesError ||
    data.transitStationsError
  ) {
    return false;
  }
  if (
    needs.locations &&
    !data.locations?.some((location) => location.categoryId === 'road' && location.coordinate)
  ) {
    return false;
  }
  return true;
}

/**
 * 楼牌候选：只保留能用 resolveMaterialLocationInput 解析出门牌号的地点。
 * 方案 4.4 要求排除没有门牌号的候选；门牌号在数据来源模式下由地址解析派生，
 * 因此这里直接按同一 resolver 的结果过滤，避免抽中后渲染失败。
 */
async function listAddressMaterialEntries(): Promise<AddressMaterialEntry[]> {
  const locations = await listMaterialAddressPoiLocations();
  const template = qqBotMaterialTemplateById.get(BUILDING_ADDRESS_TEMPLATE_ID);
  if (!template) {
    return [];
  }
  const entries: AddressMaterialEntry[] = [];
  for (const location of locations.slice(0, qqBotMaterialMaximumAddressCandidates)) {
    try {
      const resolved = await resolveMaterialLocationInput({
        locationId: location.id,
        fields: template.fields,
      });
      const buildingNumber = (resolved.values.buildingNumber ?? '').trim();
      if (!buildingNumber) {
        continue;
      }
      entries.push({
        locationId: location.id,
        buildingNumber,
        buildingSuffix: (resolved.values.buildingSuffix ?? '').trim(),
      });
    } catch {
      // 单个地点解析失败不影响其它候选。
    }
  }
  return entries;
}

/** 怀旧楼牌的门牌字形只接受阿拉伯数字、连接符与甲乙丙丁；其它候选直接排除。 */
function isNostalgicBuildingNumberSupported(
  buildingNumber: string,
  buildingSuffix: string,
): boolean {
  if (!/^\d+$/u.test(buildingNumber)) {
    return false;
  }
  const suffix = buildingSuffix.replace(/[－—–]/gu, '-');
  return Array.from(suffix).every(
    (character) => /^\d$/u.test(character) || character === '-' || '甲乙丙丁'.includes(character),
  );
}

// ---------------------------------------------------------------------------
// 服务器候选池
// ---------------------------------------------------------------------------

function createServerCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  const kind = resolveQqBotMaterialKind(templateId);
  switch (kind) {
    case 'road_sign':
      return createServerRoadSignCandidates(templateId, template, data);
    case 'address_sign':
      return createServerAddressCandidates(templateId, template, data);
    case 'bus_stop':
      return createServerBusStopCandidates(templateId, template, data);
    case 'metro_line':
      return createServerMetroCandidates(templateId, template, data);
    case 'custom':
      return createServerWayfindingCandidates(templateId, template, data);
  }
}

function createServerRoadSignCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  if (data.locationsError) {
    return { candidates: [], reason: `地图道路数据不可用：${data.locationsError}` };
  }
  const roads = (data.locations ?? []).filter(
    (location) => location.categoryId === 'road' && location.coordinate,
  );
  if (!roads.length) {
    return { candidates: [], reason: '服务器地图数据里没有带几何的道路标记' };
  }
  const candidates = roads.map((road) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      const coordinate = road.coordinate!;
      const resolved = await resolveRoadCoordinateMaterialInput({
        coordinate,
        fields: template.fields,
      });
      const values = resolved.values;
      return {
        values,
        summary: {
          headline: values.roadName ?? road.label,
          subline: [
            resolveTemplateFieldOptionLabel(template, 'directionMode', values.directionMode ?? ''),
            resolveTemplateFieldOptionLabel(template, 'signColor', values.signColor ?? ''),
            resolveTemplateFieldOptionLabel(template, 'arrowMode', values.arrowMode ?? ''),
          ]
            .filter(Boolean)
            .join(' · '),
          meta: [`道路 ${values.roadName ?? road.label}`],
          color: values.signColor,
        },
      };
    },
  }));
  return { candidates };
}

function createServerAddressCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  const entries = data.addressEntries ?? [];
  const filtered =
    templateId === NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID
      ? entries.filter((entry) =>
          isNostalgicBuildingNumberSupported(entry.buildingNumber, entry.buildingSuffix),
        )
      : entries;
  if (!filtered.length) {
    return {
      candidates: [],
      reason: data.addressError
        ? `地图地点地址数据不可用：${data.addressError}`
        : '服务器数据里没有可解析出门牌号的地址',
    };
  }
  const nostalgic = templateId === NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID;
  const candidates = filtered.map((entry) => ({
    templateId,
    template,
    async prepare(): Promise<PreparedMaterial> {
      const resolved = await resolveMaterialLocationInput({
        locationId: entry.locationId,
        fields: template.fields,
      });
      const values = resolved.values;
      if (!(values.buildingNumber ?? '').trim()) {
        throw new MaterialCandidateRejectedError('该地点解析不出门牌号。');
      }
      const buildingNumber = values.buildingNumber ?? entry.buildingNumber;
      const buildingSuffix = values.buildingSuffix ?? entry.buildingSuffix;
      return {
        values,
        summary: {
          headline: [values.roadName, `${buildingNumber}${buildingSuffix}`]
            .filter(Boolean)
            .join(' '),
          subline: nostalgic
            ? `怀旧楼牌 · 门牌 ${buildingNumber}${buildingSuffix}`
            : `邮政编码 ${values.postalCode ?? ''} · 门牌 ${buildingNumber}${buildingSuffix}`,
          meta: [`门牌 ${buildingNumber}${buildingSuffix}`],
          color: qqBotMaterialColorByKind.address_sign,
        },
      };
    },
  }));
  return { candidates };
}

function buildBusStopDirectionGroups(
  stations: readonly MaterialTransitStationOption[],
): BusStopDirectionGroup[] {
  const groups: BusStopDirectionGroup[] = [];
  for (const station of stations) {
    for (const direction of qqBotTransitDirections) {
      const seenLineIds = new Set<string>();
      const lines = station.lines.filter((line) => {
        if (line.direction !== direction || seenLineIds.has(line.id)) {
          return false;
        }
        seenLineIds.add(line.id);
        return true;
      });
      if (lines.length) {
        groups.push({ station, direction, lines });
      }
    }
  }
  return groups;
}

function createServerBusStopCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  if (data.transitStationsError) {
    return { candidates: [], reason: `公交线路与站点数据不可用：${data.transitStationsError}` };
  }
  const stations = data.transitStations ?? [];
  if (!stations.length) {
    return { candidates: [], reason: '没有已发布的公交线路与站点' };
  }
  const groups = buildBusStopDirectionGroups(stations);
  const terminalGroups = groups.filter((group) =>
    group.lines.some((line) => line.isOriginAtStation || line.isTerminalAtStation),
  );
  const isTerminalTemplate =
    templateId === BUS_STOP_TERMINAL_TEMPLATE_ID ||
    templateId === BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID;
  const isOverviewTemplate =
    templateId === BUS_STOP_OVERVIEW_TEMPLATE_ID ||
    templateId === BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID;
  if (isTerminalTemplate) {
    if (!terminalGroups.length) {
      return { candidates: [], reason: '没有带始发 / 终到线路的公交站' };
    }
    const candidates = terminalGroups.map((group) => ({
      templateId,
      template,
      async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
        const eligible = group.lines.filter(
          (line) => line.isOriginAtStation || line.isTerminalAtStation,
        );
        const line = pickSeeded(rng, eligible);
        const terminalRole: MaterialTransitTerminalRole = line.isOriginAtStation
          ? 'origin'
          : 'terminal';
        const resolved = await resolveTransitStationMaterialInput({
          stationMarkerId: group.station.markerId,
          direction: group.direction,
          lineIds: [line.id],
          terminalRole,
          fields: template.fields,
        });
        return {
          values: resolved.values,
          summary: {
            headline: group.station.stationName,
            subline: `${line.name} · ${resolved.values.terminalRole ?? '始发站'}`,
            meta: [
              `线路 ${line.name} · ${formatBusStopDirectionLabel(group.direction)}`,
              resolved.values.routeNumber ? `线路编号 ${resolved.values.routeNumber}` : '',
            ].filter(Boolean),
            color: qqBotMaterialColorByKind.bus_stop,
          },
        };
      },
    }));
    return { candidates };
  }
  if (isOverviewTemplate) {
    const overviewGroups = groups.filter(
      (group) => group.lines.length >= 2 && group.lines.length <= 6,
    );
    if (!overviewGroups.length) {
      return { candidates: [], reason: '没有同向停靠 2-6 条线路的公交站' };
    }
    const candidates = overviewGroups.map((group) => ({
      templateId,
      template,
      async prepare(): Promise<PreparedMaterial> {
        const selectedLines = group.lines.slice(0, 6);
        const resolved = await resolveTransitStationMaterialInput({
          stationMarkerId: group.station.markerId,
          direction: group.direction,
          lineIds: selectedLines.map((line) => line.id),
          fields: template.fields,
        });
        const routeNumbers = selectedLines
          .map((_line, index) => resolved.values[`route${index + 1}Number`] ?? '')
          .filter(Boolean);
        return {
          values: resolved.values,
          summary: {
            headline: group.station.stationName,
            subline: `同向停靠 ${selectedLines.length} 条线路${routeNumbers.length ? ` · ${routeNumbers.join(' / ')}` : ''}`,
            meta: [`线路 ${routeNumbers.join(' / ')}`],
            color: qqBotMaterialColorByKind.bus_stop,
          },
        };
      },
    }));
    return { candidates };
  }
  // 线路详情（竖版 / 横版）：单线路版式，同向任取一条线路。
  if (!groups.length) {
    return { candidates: [], reason: '没有方向可判定的公交站线路' };
  }
  const candidates = groups.map((group) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      const line = pickSeeded(rng, group.lines);
      const resolved = await resolveTransitStationMaterialInput({
        stationMarkerId: group.station.markerId,
        direction: group.direction,
        lineIds: [line.id],
        fields: template.fields,
      });
      return {
        values: resolved.values,
        summary: {
          headline: group.station.stationName,
          subline: [line.name, resolved.values.routeOrigin, resolved.values.routeTerminal]
            .filter(Boolean)
            .join(' · '),
          meta: [
            `线路 ${line.name} · ${formatBusStopDirectionLabel(group.direction)}`,
            resolved.values.nextStation ? `下一站 ${resolved.values.nextStation}` : '',
          ].filter(Boolean),
          color: qqBotMaterialColorByKind.bus_stop,
        },
      };
    },
  }));
  return { candidates };
}

function createServerMetroCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  if (data.transitLinesError) {
    return { candidates: [], reason: `地铁线路数据不可用：${data.transitLinesError}` };
  }
  const metroLines = (data.transitLines ?? []).filter(
    (line) => line.mode === 'metro' && line.stations.length >= 2,
  );
  if (!metroLines.length) {
    return { candidates: [], reason: '没有站点数 ≥2 的已发布地铁线路' };
  }
  const candidates = metroLines.map((line) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      // 站名 / 方向 / 站台版式需要「下一站」，尽量避开线路终点站，避免牌面出现「下一站 终点站」。
      const stationCandidates =
        templateUsesNextStation(template) && line.stations.length > 1
          ? line.stations.slice(0, -1)
          : line.stations;
      const station = pickSeeded(rng, stationCandidates);
      const resolved = await resolveTransitLineMaterialInput({
        lineId: line.id,
        stationSourceId: station.stationSourceId,
        fields: template.fields,
      });
      const values = resolved.values;
      return {
        values,
        summary: buildMetroCardSummary({
          templateId,
          template,
          line,
          stationName: station.stationName,
          values,
        }),
      };
    },
  }));
  return { candidates };
}

/** 方向牌 / 站台牌需要下一站站名，选站时避开线路终点。 */
function templateUsesNextStation(template: MaterialTemplateVersion): boolean {
  return template.fields.some((field) => field.key === 'nextStationName');
}

function buildMetroCardSummary(input: {
  templateId: QqBotMaterialTemplateId;
  template: MaterialTemplateVersion;
  line: Pick<MaterialTransitLineOption, 'name' | 'stationCount'>;
  stationName: string;
  values: Record<string, string>;
}): MaterialCardSummary {
  const { templateId, template, line, stationName, values } = input;
  const color = values.accentColor || qqBotMaterialColorByKind.metro_line;
  const lineName = line.name || values.lineLabel || '地铁';
  const vertical =
    templateId === METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID ||
    templateId === METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID;
  switch (templateId) {
    case METRO_LINE_MAP_NEW_TEMPLATE_ID:
    case METRO_LINE_MAP_OLD_TEMPLATE_ID:
    case METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID:
    case METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID:
      return {
        headline: lineName,
        subline: `${line.stationCount} 站 · ${vertical ? '竖版' : '横版'}线路图 · 当前站 ${stationName}`,
        meta: [`线路图 · 当前站 ${stationName}`, `${line.stationCount} 站`],
        color,
      };
    case METRO_STATION_NAME_NEW_TEMPLATE_ID:
    case METRO_STATION_NAME_OLD_TEMPLATE_ID:
      return {
        headline: values.stationName || stationName,
        subline: `${lineName} · 站名灯箱`,
        meta: [
          `线路 ${lineName}`,
          values.stationNamePinyin ? `拼音 ${values.stationNamePinyin}` : '',
        ].filter(Boolean),
        color,
      };
    case METRO_DIRECTION_NEW_TEMPLATE_ID:
    case METRO_DIRECTION_OLD_TEMPLATE_ID:
      return {
        headline: values.terminalName ? `开往 ${values.terminalName}` : `开往 ${lineName} 末站`,
        subline: [values.nextStationName ? `下一站 ${values.nextStationName}` : '', lineName]
          .filter(Boolean)
          .join(' · '),
        meta: [
          `线路 ${lineName}`,
          values.travelDirection === 'first' ? '开往首站方向' : '开往末站方向',
        ],
        color,
      };
    default:
      return {
        headline: values.stationName || stationName,
        subline: [
          `${lineName} 站台`,
          values.nextStationName
            ? values.nextStationName === '终点站'
              ? '本站为终点站'
              : `下一站 ${values.nextStationName}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        meta: [
          `线路 ${lineName}`,
          values.stationNamePinyin ? `拼音 ${values.stationNamePinyin}` : '',
        ].filter(Boolean),
        color,
      };
  }
}

/** 服务器地铁站名合并（与物料面板的导视牌示例候选同口径）。 */
function buildServerWayfindingStations(
  metroLines: readonly MaterialTransitLineOption[],
): MetroWayfindingExampleStation[] {
  const stationByName = new Map<string, MutableWayfindingStation>();
  for (const line of metroLines) {
    const terminalStations = [line.stations[0], line.stations.at(-1)].flatMap((station) =>
      station ? [{ name: station.stationName }] : [],
    );
    for (const station of line.stations) {
      const name = station.stationName.trim();
      if (!name) {
        continue;
      }
      const current = stationByName.get(name) ?? { name, lines: [] };
      if (!current.lines.some((item) => item.id === line.id)) {
        current.lines.push({
          id: line.id,
          name: line.name,
          color: line.color ?? qqBotMaterialColorByKind.metro_line,
          terminalStations,
        });
      }
      stationByName.set(name, current);
    }
  }
  return Array.from(stationByName.values());
}

function createServerWayfindingCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: ServerMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  if (data.transitLinesError) {
    return { candidates: [], reason: `地铁线路数据不可用：${data.transitLinesError}` };
  }
  const metroLines = (data.transitLines ?? []).filter((line) => line.mode === 'metro');
  const stations = buildServerWayfindingStations(metroLines);
  if (!stations.length) {
    return { candidates: [], reason: '没有可用于导视牌示例的地铁站点' };
  }
  const candidates = stations.map((station) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      const line = pickSeeded(rng, station.lines);
      const examples = buildMetroWayfindingTemplateExamples(station, line.id);
      if (!examples.length) {
        throw new MaterialCandidateRejectedError('导视牌模板库没有可用示例。');
      }
      const example = pickSeeded(rng, examples);
      return buildWayfindingPreparedMaterial({
        station,
        lineName: line.name,
        example,
        template,
      });
    },
  }));
  return { candidates };
}

function buildWayfindingPreparedMaterial(input: {
  station: MetroWayfindingExampleStation;
  lineName: string;
  example: MetroWayfindingExample;
  template: MaterialTemplateVersion;
}): PreparedMaterial {
  const { station, lineName, example, template } = input;
  return {
    values: { layout: serializeMetroWayfindingLayout(example.project.layout) },
    canvasBase: example.project.canvas,
    summary: {
      headline: station.name,
      subline: `${example.source.remark} · ${lineName} · ${template.title}`,
      meta: [
        `版式 ${formatCanvasRatio(example.project.canvas)}`,
        example.source.category === 'transfer'
          ? '换乘'
          : example.source.category === 'entry'
            ? '进站'
            : '出站',
      ],
      color: qqBotMaterialColorByKind.custom,
    },
  };
}

function formatCanvasRatio(canvas: MaterialCanvasConfig): string {
  return `${Math.round(canvas.widthM * 100) / 100}m × ${Math.round(canvas.heightM * 100) / 100}m`;
}

// ---------------------------------------------------------------------------
// 示例线网（sample）数据与候选池
// ---------------------------------------------------------------------------

const qqBotMaterialSampleCache = createTimedCache<MaterialTransitNetworkSample>(60 * 60 * 1000);

/** 清空示例线网缓存（校验脚本 / 排查用）。 */
export function clearQqBotMaterialSampleCache(): void {
  qqBotMaterialSampleCache.clear();
}

async function loadQqBotMaterialSample(): Promise<MaterialTransitNetworkSample> {
  try {
    return await qqBotMaterialSampleCache.read('default', () =>
      loadDefaultMaterialTransitNetworkSample(),
    );
  } catch (error) {
    throw new QqBotMaterialError(
      'sample_unavailable',
      `示例线网暂时不可用：${describeError(error)}`,
    );
  }
}

function assertSampleLicense(sample: MaterialTransitNetworkSample): void {
  // 方案 4.6：缺许可信息的示例线网物料不生成。
  if (!sample.licenseName.trim() || !sample.licenseUrl.trim()) {
    throw new QqBotMaterialError(
      'sample_unavailable',
      '示例线网缺少许可信息，暂不生成示例线网物料。',
    );
  }
}

function buildSampleMaterialDataSet(sample: MaterialTransitNetworkSample): SampleMaterialDataSet {
  const options = listMaterialTransitNetworkLines(sample.snapshot);
  const lines: SampleMaterialLine[] = [];
  for (const option of options) {
    const stations = listMaterialTransitNetworkLineStations(sample.snapshot, option.lineKey);
    if (stations.length < 2) {
      continue;
    }
    lines.push({
      lineKey: option.lineKey,
      label: option.label,
      secondaryLabel: option.secondaryLabel,
      color: option.color,
      stations,
    });
  }
  const nodeById = new Map(sample.snapshot.nodes.map((node) => [node.id, node] as const));
  const stationByName = new Map<string, MutableWayfindingStation>();
  for (const line of lines) {
    const terminalStations = [line.stations[0], line.stations.at(-1)].flatMap((station) =>
      station ? [{ name: station.name }] : [],
    );
    for (const station of line.stations) {
      const name = station.name.trim();
      if (!name) {
        continue;
      }
      const current = stationByName.get(name) ?? {
        name,
        secondaryName: nodeById.get(station.id)?.names[1],
        lines: [],
      };
      if (!current.lines.some((item) => item.id === line.lineKey)) {
        current.lines.push({
          id: line.lineKey,
          name: line.label,
          secondaryName: line.secondaryLabel,
          color: line.color,
          terminalStations,
        });
      }
      stationByName.set(name, current);
    }
  }
  return { sample, lines, wayfindingStations: Array.from(stationByName.values()) };
}

function buildSampleMetroCandidate(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: SampleMaterialDataSet,
): MaterialCandidate[] {
  return data.lines.map((line) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      const stationCandidates =
        templateUsesNextStation(template) && line.stations.length > 1
          ? line.stations.slice(0, -1)
          : line.stations;
      const station = pickSeeded(rng, stationCandidates);
      const resolved = await resolveTransitLineMaterialInput({
        lineId: '',
        networkLineKey: line.lineKey,
        networkNodeId: station.id,
        fields: template.fields,
        networkGeometry: data.sample.snapshot,
      });
      return {
        values: resolved.values,
        summary: buildMetroCardSummary({
          templateId,
          template,
          line: { name: line.label, stationCount: line.stations.length },
          stationName: station.name,
          values: resolved.values,
        }),
      };
    },
  }));
}

function buildSampleWayfindingCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: SampleMaterialDataSet,
): MaterialCandidate[] {
  return data.wayfindingStations.map((station) => ({
    templateId,
    template,
    async prepare(rng: QqBotMaterialRandom): Promise<PreparedMaterial> {
      const line = pickSeeded(rng, station.lines);
      const examples = buildMetroWayfindingTemplateExamples(station, line.id);
      if (!examples.length) {
        throw new MaterialCandidateRejectedError('导视牌模板库没有可用示例。');
      }
      const example = pickSeeded(rng, examples);
      return buildWayfindingPreparedMaterial({
        station,
        lineName: line.name,
        example,
        template,
      });
    },
  }));
}

function createSampleCandidates(
  templateId: QqBotMaterialTemplateId,
  template: MaterialTemplateVersion,
  data: SampleMaterialDataSet,
): { candidates: MaterialCandidate[]; reason?: string } {
  const kind = resolveQqBotMaterialKind(templateId);
  if (kind === 'custom') {
    if (!data.wayfindingStations.length) {
      return { candidates: [], reason: '示例线网里没有可用于导视牌示例的站点' };
    }
    return { candidates: buildSampleWayfindingCandidates(templateId, template, data) };
  }
  if (kind !== 'metro_line') {
    // normalize 阶段已按 source_scope_limited 拦截，这里只做兜底。
    return { candidates: [], reason: '示例线网只支持地铁线路图 / 导视牌' };
  }
  if (!data.lines.length) {
    return { candidates: [], reason: '示例线网里没有站点数 ≥2 的地铁线路' };
  }
  return { candidates: buildSampleMetroCandidate(templateId, template, data) };
}

// ---------------------------------------------------------------------------
// 候选池装配
// ---------------------------------------------------------------------------

async function buildQqBotMaterialCandidatePool(input: {
  templateIds: readonly QqBotMaterialTemplateId[];
  dataSource: QqBotMaterialDataSource;
}): Promise<QqBotMaterialCandidatePool> {
  if (input.dataSource === 'sample') {
    const sample = await loadQqBotMaterialSample();
    assertSampleLicense(sample);
    const data = buildSampleMaterialDataSet(sample);
    const candidates: MaterialCandidate[] = [];
    const unavailableReasons: string[] = [];
    for (const templateId of input.templateIds) {
      const template = resolveQqBotMaterialTemplate(templateId);
      const result = createSampleCandidates(templateId, template, data);
      if (result.candidates.length) {
        candidates.push(...result.candidates);
      } else {
        unavailableReasons.push(`${template.title}：${result.reason ?? '没有可用数据'}`);
      }
    }
    return {
      candidates,
      loadErrors: [],
      unavailableReasons,
      source: {
        kind: 'sample',
        name: sample.name,
        licenseName: sample.licenseName,
        licenseUrl: sample.licenseUrl,
      },
    };
  }

  const kinds = new Set(
    input.templateIds.map((templateId) => resolveQqBotMaterialKind(templateId)),
  );
  const data = await loadServerMaterialDataSetCached({
    locations: kinds.has('road_sign'),
    address: kinds.has('address_sign'),
    transitLines: kinds.has('metro_line') || kinds.has('custom'),
    transitStations: kinds.has('bus_stop'),
  });
  const candidates: MaterialCandidate[] = [];
  const unavailableReasons: string[] = [];
  for (const templateId of input.templateIds) {
    const template = resolveQqBotMaterialTemplate(templateId);
    const result = createServerCandidates(templateId, template, data);
    if (result.candidates.length) {
      candidates.push(...result.candidates);
    } else {
      unavailableReasons.push(`${template.title}：${result.reason ?? '没有可用数据'}`);
    }
  }
  return {
    candidates,
    loadErrors: [
      data.locationsError,
      data.addressError,
      data.transitLinesError,
      data.transitStationsError,
    ].filter((message): message is string => Boolean(message)),
    unavailableReasons,
    source: qqBotServerSource,
  };
}

// ---------------------------------------------------------------------------
// 请求校验
// ---------------------------------------------------------------------------

interface NormalizedQqBotMaterialRequest {
  kind: QqBotMaterialKind;
  dataSource: QqBotMaterialDataSource;
  templateIds: QqBotMaterialTemplateId[];
  seed?: string;
}

function normalizeQqBotMaterialRequest(
  request: QqBotMaterialRenderRequest,
): NormalizedQqBotMaterialRequest {
  if (!request || typeof request !== 'object') {
    throw new QqBotMaterialError('invalid_request', '请求体必须是 JSON 对象。');
  }
  const rawKind = request.kind ?? 'random';
  if (!qqBotMaterialKinds.includes(rawKind as QqBotMaterialKind)) {
    throw new QqBotMaterialError(
      'invalid_request',
      `kind 必须是 ${qqBotMaterialKinds.join(' / ')} 之一。`,
    );
  }
  const kind = rawKind as QqBotMaterialKind;
  const rawDataSource = request.dataSource ?? 'server';
  if (rawDataSource !== 'server' && rawDataSource !== 'sample') {
    throw new QqBotMaterialError('invalid_request', 'dataSource 必须是 server 或 sample。');
  }
  const dataSource = rawDataSource;
  if (typeof request.templateId !== 'undefined' && typeof request.templateId !== 'string') {
    throw new QqBotMaterialError('invalid_request', 'templateId 必须是字符串。');
  }
  if (typeof request.seed !== 'undefined' && typeof request.seed !== 'string') {
    throw new QqBotMaterialError('invalid_request', 'seed 必须是字符串。');
  }
  if (typeof request.projectId !== 'undefined') {
    // P1 只预留字段：project / projectId 分支留待后续任务实现。
    throw new QqBotMaterialError('invalid_request', 'project 数据源尚未实现，暂不支持 projectId。');
  }
  if (typeof request.session !== 'undefined' && typeof request.session !== 'string') {
    throw new QqBotMaterialError('invalid_request', 'session 必须是字符串。');
  }

  let templateIds: QqBotMaterialTemplateId[];
  if (request.templateId !== undefined) {
    const templateId = request.templateId.trim();
    if (!isQqBotMaterialTemplateId(templateId)) {
      throw new QqBotMaterialError('invalid_request', `未知的物料模板：${templateId}。`);
    }
    if (kind !== 'random' && resolveQqBotMaterialKind(templateId) !== kind) {
      throw new QqBotMaterialError(
        'invalid_request',
        `模板 ${templateId} 不属于 ${kind} 族，请检查 kind 与 templateId 的对应关系。`,
      );
    }
    templateIds = [templateId];
  } else {
    templateIds =
      kind === 'random'
        ? [...qqBotMaterialTemplateIds]
        : qqBotMaterialTemplateIds.filter(
            (templateId) => resolveQqBotMaterialKind(templateId) === kind,
          );
  }

  if (dataSource === 'sample') {
    const sampleKinds = new Set<QqBotMaterialResolvedKind>(['metro_line', 'custom']);
    if (kind !== 'random' && !sampleKinds.has(kind)) {
      throw new QqBotMaterialError(
        'source_scope_limited',
        '示例线网只支持地铁线路图与地铁导视牌，其它物料请切回服务器数据源。',
      );
    }
    templateIds = templateIds.filter((templateId) =>
      sampleKinds.has(resolveQqBotMaterialKind(templateId)),
    );
    if (!templateIds.length) {
      throw new QqBotMaterialError(
        'source_scope_limited',
        '示例线网只支持地铁线路图与地铁导视牌，其它物料请切回服务器数据源。',
      );
    }
  }

  const seed = request.seed === undefined ? undefined : normalizeQqBotMaterialSeed(request.seed);

  return { kind, dataSource, templateIds, seed };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 抽取并渲染一张随机物料。
 *
 * 失败时抛 `QqBotMaterialError`（可识别错误码；sample 拉取失败抛 sample_unavailable），
 * 其余异常说明渲染链路本身出错，由路由按 500 render_failed 处理。
 */
/**
 * 抽样顺序分两层：
 * 1. 先按工作台模板入口等概率（路牌、门牌、公交站牌、公交横版、地铁竖版、地铁横版、站台牌、导视牌）；
 * 2. 入口内直接按候选等概率，因此内部模板按可用候选数量加权，
 *    不再把始发终到 / 同向概览 / 线路详情强行等分。
 * 指定族指令（/站牌、/地铁 等）也走入口层，只是入口集合被 kind 过滤后变小。
 */
function orderCandidateIndicesByTemplateEntry(
  candidates: readonly MaterialCandidate[],
  rng: QqBotMaterialRandom,
): number[] {
  const entries = new Map<string, number[]>();
  candidates.forEach((candidate, index) => {
    const entryId =
      qqBotMaterialEntryIdByTemplateId.get(candidate.templateId) ?? candidate.templateId;
    const list = entries.get(entryId);
    if (list) {
      list.push(index);
    } else {
      entries.set(entryId, [index]);
    }
  });
  const entryIds = shuffleWithRandom([...entries.keys()], rng);
  return entryIds.flatMap((entryId) => shuffleWithRandom(entries.get(entryId) ?? [], rng));
}

function shuffleWithRandom<T>(values: readonly T[], rng: QqBotMaterialRandom): T[] {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex]!, list[index]!];
  }
  return list;
}

export async function renderQqBotMaterial(
  request: QqBotMaterialRenderRequest,
): Promise<QqBotMaterialRenderResult> {
  const normalized = normalizeQqBotMaterialRequest(request);
  const seed = normalized.seed ?? normalizeQqBotMaterialSeed();
  const rng = createQqBotMaterialRandom(seed, normalized.kind);
  const poolStartedAt = Date.now();
  const pool = await buildQqBotMaterialCandidatePool({
    templateIds: normalized.templateIds,
    dataSource: normalized.dataSource,
  });
  const dataLoadMs = Date.now() - poolStartedAt;
  if (dataLoadMs >= 3_000) {
    // 数据源冷读是出图超时的主要来源，留给运维日志一个明确的拆分点。
    console.warn(
      '[qq-bot-material]',
      JSON.stringify({
        event: 'material.data_slow',
        dataSource: normalized.dataSource,
        kind: normalized.kind,
        ms: dataLoadMs,
      }),
    );
  }
  if (!pool.candidates.length) {
    if (pool.loadErrors.length) {
      throw new QqBotMaterialError(
        'source_unavailable',
        `物料数据源暂时不可用：${pool.loadErrors[0]}`,
      );
    }
    throw new QqBotMaterialError(
      'no_candidate',
      `暂时抽不到可用的物料：${pool.unavailableReasons[0] ?? '没有满足模板条件的数据'}。`,
    );
  }

  // 先按模板分组、再组内打乱：否则候选多的模板（如地铁导视牌示例）会
  // 在 /盲盒 里占掉大部分概率，19 个模板就不再是“均匀抽模板”。
  const orderedCandidateIndices = orderCandidateIndicesByTemplateEntry(pool.candidates, rng);
  let lastRejection: unknown;
  let renderError: unknown;
  const maximumAttempts = Math.min(qqBotMaterialMaximumAttempts, orderedCandidateIndices.length);
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const candidate = pool.candidates[orderedCandidateIndices[attempt]!]!;
    let prepared: PreparedMaterial;
    try {
      prepared = await candidate.prepare(rng);
    } catch (error) {
      if (isSourceUnavailableError(error)) {
        throw new QqBotMaterialError('source_unavailable', describeError(error));
      }
      lastRejection = error;
      continue;
    }
    try {
      const canvas = resolveQqBotMaterialCanvas(candidate.template, prepared.canvasBase);
      const rendered = await renderMaterialTemplateToPng({
        template: candidate.template,
        values: prepared.values,
        canvas,
        // 数据来源口径：用户填不了的派生字段允许为空（与工作台导出口径一致）。
        validation: { allowMissingServerDerivedValues: true },
      });
      const final = await postProcessQqBotMaterialPng({
        templateId: candidate.templateId,
        png: rendered.png,
        widthPx: rendered.widthPx,
        heightPx: rendered.heightPx,
      });
      const kind = resolveQqBotMaterialKind(candidate.templateId);
      const code = buildQqBotMaterialCode(candidate.templateId, seed);
      return {
        png: final.png,
        widthPx: final.widthPx,
        heightPx: final.heightPx,
        templateId: candidate.templateId,
        templateVersion: candidate.template.version,
        templateTitle: candidate.template.title,
        kind,
        slug: resolveQqBotMaterialSlug(candidate.templateId),
        code,
        seed,
        card: buildQqBotMaterialCard({
          template: candidate.template,
          kind,
          code,
          source: pool.source,
          summary: prepared.summary,
        }),
        source: pool.source,
        canvas,
        input: prepared.values,
      };
    } catch (error) {
      renderError = error;
    }
  }

  if (renderError) {
    throw new QqBotMaterialError('render_failed', `物料渲染失败：${describeError(renderError)}`);
  }
  throw new QqBotMaterialError(
    'no_candidate',
    `暂时抽不到可用的物料：${describeError(lastRejection) || '没有满足模板条件的数据'}。`,
  );
}

// ---------------------------------------------------------------------------
// HMAC 验签（机器人 → 网页端）
// ---------------------------------------------------------------------------

/** 机器人物料接口的签名请求头。 */
export const QQ_BOT_MATERIAL_SIGNATURE_HEADER = 'x-yct-bot-signature';
/** 签名时间窗：±60 秒。 */
export const QQ_BOT_MATERIAL_SIGNATURE_TIME_WINDOW_SECONDS = 60;

/** 读取机器人物料签名 secret；未配置返回 undefined（路由按 403 处理）。 */
export function readQqBotMaterialSecret(): string | undefined {
  const secret =
    process.env.YCT_QQ_MATERIAL_SECRET?.trim() || process.env.QQ_BOT_MATERIAL_SECRET?.trim();
  return secret || undefined;
}

function buildQqBotMaterialSigningPayload(timestampSeconds: number, body: string): string {
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  return `${timestampSeconds}.${bodyHash}`;
}

/**
 * 生成 `x-yct-bot-signature` 头：`<unix秒>.<hex(HMAC-SHA256(secret, "<unix秒>.<sha256(body)>"))>`。
 * 机器人侧与校验脚本共用这一份实现，避免格式漂移。
 */
export function createQqBotMaterialSignature(input: {
  secret: string;
  body: string;
  timestampSeconds?: number;
}): string {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', input.secret)
    .update(buildQqBotMaterialSigningPayload(timestampSeconds, input.body), 'utf8')
    .digest('hex');
  return `${timestampSeconds}.${signature}`;
}

export type QqBotMaterialSignatureFailure = 'malformed' | 'expired' | 'invalid';

/** 校验签名头：格式、时间窗（±60 秒）、HMAC 常量时间比较。 */
export function verifyQqBotMaterialSignature(input: {
  secret: string;
  signature: string | null | undefined;
  body: string;
  nowMs?: number;
}): { ok: true; timestampSeconds: number } | { ok: false; reason: QqBotMaterialSignatureFailure } {
  const header = input.signature?.trim() ?? '';
  if (!header || header.length > 256) {
    return { ok: false, reason: 'malformed' };
  }
  const separatorIndex = header.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex !== header.lastIndexOf('.')) {
    return { ok: false, reason: 'malformed' };
  }
  const timestampText = header.slice(0, separatorIndex);
  const signatureText = header.slice(separatorIndex + 1);
  if (!/^\d{1,12}$/u.test(timestampText) || !/^[0-9a-fA-F]{64}$/u.test(signatureText)) {
    return { ok: false, reason: 'malformed' };
  }
  const timestampSeconds = Number(timestampText);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > QQ_BOT_MATERIAL_SIGNATURE_TIME_WINDOW_SECONDS) {
    return { ok: false, reason: 'expired' };
  }
  const expected = createHmac('sha256', input.secret)
    .update(buildQqBotMaterialSigningPayload(timestampSeconds, input.body), 'utf8')
    .digest();
  const actual = Buffer.from(signatureText, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, timestampSeconds };
}

// ---------------------------------------------------------------------------
// 进程内限流：全局 60 次/分钟、并发 2
// ---------------------------------------------------------------------------

const qqBotMaterialRateLimitWindowMs = 60_000;
const qqBotMaterialRateLimitMaximum = 60;
const qqBotMaterialMaximumConcurrentRenders = 2;

let qqBotMaterialRateLimitWindowStart = 0;
let qqBotMaterialRateLimitCount = 0;
let qqBotMaterialInFlightRenders = 0;

/**
 * 全局滑动窗口限流：60 次/分钟。
 * 单机进程内计数够用；多实例部署前需要换成共享计数器（与方案 4.9 一致）。
 */
export function consumeQqBotMaterialRateLimit(nowMs: number = Date.now()): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  if (
    qqBotMaterialRateLimitWindowStart === 0 ||
    nowMs - qqBotMaterialRateLimitWindowStart >= qqBotMaterialRateLimitWindowMs
  ) {
    qqBotMaterialRateLimitWindowStart = nowMs;
    qqBotMaterialRateLimitCount = 0;
  }
  if (qqBotMaterialRateLimitCount >= qqBotMaterialRateLimitMaximum) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (qqBotMaterialRateLimitWindowStart + qqBotMaterialRateLimitWindowMs - nowMs) / 1000,
        ),
      ),
    };
  }
  qqBotMaterialRateLimitCount += 1;
  return {
    allowed: true,
    remaining: qqBotMaterialRateLimitMaximum - qqBotMaterialRateLimitCount,
    retryAfterSeconds: 0,
  };
}

/** 清空限流窗口（校验脚本用）。 */
export function resetQqBotMaterialRateLimit(): void {
  qqBotMaterialRateLimitWindowStart = 0;
  qqBotMaterialRateLimitCount = 0;
}

/** 占用一个渲染并发槽位；并发已满返回 undefined。 */
export function tryAcquireQqBotMaterialRenderSlot(): (() => void) | undefined {
  if (qqBotMaterialInFlightRenders >= qqBotMaterialMaximumConcurrentRenders) {
    return undefined;
  }
  qqBotMaterialInFlightRenders += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    qqBotMaterialInFlightRenders = Math.max(0, qqBotMaterialInFlightRenders - 1);
  };
}

/** 重置并发计数（校验脚本用）。 */
export function resetQqBotMaterialRenderSlots(): void {
  qqBotMaterialInFlightRenders = 0;
}

// ---------------------------------------------------------------------------
// 错误辅助
// ---------------------------------------------------------------------------

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return typeof error === 'string' ? error : '未知错误';
}

/**
 * 判断异常是否属于「数据源不可用」（网络 / 超时 / 上游 5xx），
 * 用于把地图或线网拉取失败映射成 503，而不是 404。
 */
function isSourceUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof QqBotMaterialError) {
    return error.status === 503;
  }
  const message = `${error.name} ${error.message}`;
  return /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|aborted|HTTP 5\d\d|网络|超时/iu.test(
    message,
  );
}
