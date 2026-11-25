import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  MaterialCanvasConfig,
  MaterialDraft,
  MaterialShareLink,
  MaterialShareLinkDataSource,
  MaterialShareLinkEffectiveStatus,
  MaterialShareLinkKind,
  MaterialShareLinkOrigin,
  MaterialShareLinkRecord,
  MaterialShareLinkStatus,
  MaterialShareLinkStub,
  MaterialSourceKind,
  MaterialTemplateField,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import type { MaterialServerSourceInput } from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
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
  METRO_LINE_MAP_VERTICAL_TRANSITION_TEMPLATE_ID,
  METRO_TERMINUS_NEW_TEMPLATE_ID,
  METRO_TERMINUS_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from './material-template-ids';
import { METRO_WAYFINDING_TEMPLATE_ID } from './metro-wayfinding';
import {
  findMaterialShareLinkByFingerprint,
  findMaterialShareLinkById as findStoredMaterialShareLinkById,
  listMaterialShareLinks as listStoredMaterialShareLinks,
  saveMaterialShareLink,
  updateMaterialShareLink,
  updateMaterialShareLinkRecords,
  type StoredMaterialShareLink,
} from './material-share-link-store';

const shortMaterialShareLinkIdLength = 10;
const shortMaterialShareLinkIdPattern = /^[A-Za-z0-9_-]{10}$/;

/** 完整记录保留 30 天，之后压缩成 stub。 */
export const materialShareLinkFullRetentionMs = 30 * 24 * 60 * 60 * 1000;
/** stub 从创建起再保留 1 年（即创建后约 395 天清理）。 */
export const materialShareLinkStubRetentionMs = 365 * 24 * 60 * 60 * 1000;
/** 完整记录上限：超出按最早创建淘汰。 */
export const materialShareLinkMaximumFullRecords = 20_000;

export const materialShareLinkRoadPagePath = '/services/road-materials';
export const materialShareLinkTransitPagePath = '/services/transit-materials';
/** 链接非法且 slug 不认识时回落的工作台首页（默认路牌工作台）。 */
export const materialShareLinkWorkbenchHomePath = materialShareLinkRoadPagePath;

export interface MaterialShareLinkSlugRoute {
  slug: string;
  kind: MaterialShareLinkKind;
  /** 记录丢失 / 过期后按 slug 打开的同族模板。 */
  templateId: string;
  pagePath: string;
}

/**
 * slug → 模板的固定映射表。
 *
 * 二维码里带 slug，分享记录被清理或损坏时仍能打开正确模板族，
 * 所以这张表不能依赖存储内容。
 */
const materialShareLinkSlugRouteList: MaterialShareLinkSlugRoute[] = [
  {
    slug: 'road',
    kind: 'road_sign',
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    pagePath: materialShareLinkRoadPagePath,
  },
  {
    slug: 'building',
    kind: 'address_sign',
    templateId: BUILDING_ADDRESS_TEMPLATE_ID,
    pagePath: materialShareLinkRoadPagePath,
  },
  {
    slug: 'bus-stop-terminal',
    kind: 'bus_stop',
    templateId: BUS_STOP_TERMINAL_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'bus-stop-overview',
    kind: 'bus_stop',
    templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'bus-stop-detail',
    kind: 'bus_stop',
    templateId: BUS_STOP_DETAIL_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'bus-stop-horizontal',
    kind: 'bus_stop',
    templateId: BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'bus-stop',
    kind: 'bus_stop',
    templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-station',
    kind: 'metro_line',
    templateId: METRO_STATION_NAME_NEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-direction',
    kind: 'metro_line',
    templateId: METRO_DIRECTION_NEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-line',
    kind: 'metro_line',
    templateId: METRO_LINE_MAP_NEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-line-vertical',
    kind: 'metro_line',
    templateId: METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-platform',
    kind: 'metro_line',
    templateId: METRO_PLATFORM_SIGN_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
  {
    slug: 'metro-wayfinding',
    kind: 'custom',
    templateId: METRO_WAYFINDING_TEMPLATE_ID,
    pagePath: materialShareLinkTransitPagePath,
  },
];

const materialShareLinkRouteBySlug = new Map(
  materialShareLinkSlugRouteList.map((route) => [route.slug, route] as const),
);
const materialShareLinkSlugByTemplateId = new Map<string, string>();
for (const route of materialShareLinkSlugRouteList) {
  if (!materialShareLinkSlugByTemplateId.has(route.templateId)) {
    materialShareLinkSlugByTemplateId.set(route.templateId, route.slug);
  }
}

/** 同一模板族的其它版本 / 样式复用主入口 slug。 */
const materialShareLinkSlugAliases: Record<string, string> = {
  [NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID]: 'building',
  [BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID]: 'bus-stop-terminal',
  [BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID]: 'bus-stop-overview',
  [METRO_STATION_NAME_OLD_TEMPLATE_ID]: 'metro-station',
  [METRO_DIRECTION_OLD_TEMPLATE_ID]: 'metro-direction',
  [METRO_LINE_MAP_OLD_TEMPLATE_ID]: 'metro-line',
  [METRO_TERMINUS_OLD_TEMPLATE_ID]: 'metro-line',
  [METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID]: 'metro-line-vertical',
  [METRO_LINE_MAP_VERTICAL_TRANSITION_TEMPLATE_ID]: 'metro-line-vertical',
};

const materialShareLinkFallbackSlugByKind: Record<MaterialShareLinkKind, string> = {
  road_sign: 'road',
  address_sign: 'building',
  bus_stop: 'bus-stop',
  metro_line: 'metro-line',
  custom: 'metro-wayfinding',
};

export function resolveMaterialShareLinkSlugRoute(
  slug: string,
): MaterialShareLinkSlugRoute | undefined {
  return materialShareLinkRouteBySlug.get(slug);
}

/** 记录 → slug：模板 ID 优先，未知模板按 kind 回落到同族默认 slug。 */
export function resolveMaterialShareLinkSlug(
  templateId: string,
  kind: MaterialShareLinkKind,
): string {
  return (
    materialShareLinkSlugByTemplateId.get(templateId) ??
    materialShareLinkSlugAliases[templateId] ??
    materialShareLinkFallbackSlugByKind[kind]
  );
}

export function resolveMaterialShareLinkPagePath(kind: MaterialShareLinkKind): string {
  return kind === 'road_sign' || kind === 'address_sign'
    ? materialShareLinkRoadPagePath
    : materialShareLinkTransitPagePath;
}

export function isValidMaterialShareLinkId(shareId: string): boolean {
  return shortMaterialShareLinkIdPattern.test(shareId);
}

export interface MaterialShareLinkFingerprintInput {
  templateId: string;
  templateVersion: number;
  canvas: MaterialCanvasConfig;
  values: Record<string, string>;
}

/** 内容指纹：模板 + 版本 + 画布 + 字段，用来让相同内容复用同一个短 ID。 */
export function createMaterialShareLinkFingerprint(
  input: MaterialShareLinkFingerprintInput,
): string {
  const canonical = JSON.stringify({
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    canvas: [
      input.canvas.widthM,
      input.canvas.heightM,
      input.canvas.pxPerMeter,
      input.canvas.alignToTile,
      input.canvas.tileSizePx,
    ],
    values: sortRecordKeys(input.values),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isMaterialShareLinkStub(
  record: MaterialShareLinkRecord,
): record is MaterialShareLinkStub {
  return 'stub' in record && record.stub === true;
}

/** 30 天后视为过期；stub 一定已过期。 */
export function isMaterialShareLinkExpired(
  record: MaterialShareLinkRecord,
  now: Date = new Date(),
): boolean {
  if (isMaterialShareLinkStub(record)) {
    return true;
  }
  return isMaterialShareLinkCreatedBefore(record.createdAt, materialShareLinkFullRetentionMs, now);
}

export function getMaterialShareLinkEffectiveStatus(
  record: MaterialShareLinkRecord,
  now: Date = new Date(),
): MaterialShareLinkEffectiveStatus {
  if (record.status === 'revoked') {
    return 'revoked';
  }
  return isMaterialShareLinkExpired(record, now) ? 'expired' : 'active';
}

export type MaterialShareLinkRouteDecision =
  /** 有效记录：跳工作台并载入这份物料。 */
  | { type: 'material'; path: string }
  /** 过期 / stub / 记录不存在：按模板打开，并带 expired=1 提示。 */
  | { type: 'template'; path: string }
  /** 已被管理员停用：不跳转，返回 410。 */
  | { type: 'revoked' }
  /** 链接非法：回工作台首页。 */
  | { type: 'invalid'; path: string };

/**
 * 扫码分流纯函数：路由只负责把 path 拼到站点域名上并返回 302 / 410。
 * 这里不读文件、不依赖 Next，方便单测。
 */
export function resolveMaterialShareLinkRouteDecision(input: {
  slug: string;
  shareId: string;
  link?: MaterialShareLinkRecord;
  now?: Date;
}): MaterialShareLinkRouteDecision {
  const slugRoute = resolveMaterialShareLinkSlugRoute(input.slug);
  if (!isValidMaterialShareLinkId(input.shareId)) {
    return { type: 'invalid', path: slugRoute?.pagePath ?? materialShareLinkWorkbenchHomePath };
  }
  const link = input.link;
  if (!link) {
    if (slugRoute) {
      return {
        type: 'template',
        path: buildMaterialShareLinkTemplatePath(slugRoute.templateId, slugRoute.pagePath),
      };
    }
    return { type: 'invalid', path: materialShareLinkWorkbenchHomePath };
  }
  if (link.status === 'revoked') {
    return { type: 'revoked' };
  }
  const pagePath =
    resolveMaterialShareLinkSlugRoute(link.slug)?.pagePath ??
    resolveMaterialShareLinkPagePath(link.kind);
  if (isMaterialShareLinkExpired(link, input.now ?? new Date())) {
    return {
      type: 'template',
      path: buildMaterialShareLinkTemplatePath(link.templateId, pagePath),
    };
  }
  return {
    type: 'material',
    path: `${pagePath}?material=${encodeURIComponent(link.id)}`,
  };
}

function buildMaterialShareLinkTemplatePath(templateId: string, pagePath: string): string {
  return `${pagePath}?template=${encodeURIComponent(templateId)}&expired=1`;
}

const materialSourceKindValues: MaterialSourceKind[] = [
  'manual',
  'transit_line',
  'transit_station',
  'map_location',
  'road_coordinate',
];

export function isMaterialSourceKindValue(value: string): value is MaterialSourceKind {
  return (materialSourceKindValues as string[]).includes(value);
}

/** 从 sourceRef 前缀反推细化来源类型（sourceRef 只用于展示与追溯）。 */
export function resolveMaterialSourceKindFromRef(
  sourceRef: string | undefined,
): MaterialSourceKind | undefined {
  const prefix = sourceRef?.trim().split(':', 1)[0];
  return prefix && isMaterialSourceKindValue(prefix) ? prefix : undefined;
}

export function isMaterialShareLinkDataSourceValue(
  value: string,
): value is MaterialShareLinkDataSource {
  return value === 'server' || value === 'sample' || value === 'project';
}

/**
 * 数据来源类别。
 *
 * 请求里既接受 `dataSource`（契约字段名），也接受 `sourceKind` 直接取
 * `server` / `sample` / `project`（兼容机器人渲染接口的 source.kind 写法）；
 * 细化来源（transit_line 等）写进记录的 sourceKind。
 */
export function resolveMaterialShareLinkDataSource(input: {
  dataSource?: string;
  sourceKind?: string;
  sourceRef?: string;
}): MaterialShareLinkDataSource {
  if (input.dataSource && isMaterialShareLinkDataSourceValue(input.dataSource)) {
    return input.dataSource;
  }
  if (input.sourceKind && isMaterialShareLinkDataSourceValue(input.sourceKind)) {
    return input.sourceKind;
  }
  if (input.sourceRef?.trim().startsWith('transit_network_project')) {
    return 'project';
  }
  return 'server';
}

/**
 * 从 sourceRef 还原服务端数据来源，供服务端「重新解析字段」复核分享图水印。
 * 解析不了（例如导入项目需要线网几何）就返回 undefined，按带水印处理。
 */
export function parseMaterialShareLinkServerSource(input: {
  sourceKind?: MaterialSourceKind;
  sourceRef?: string;
}): MaterialServerSourceInput | undefined {
  const reference = input.sourceRef?.trim();
  if (!reference) {
    return undefined;
  }
  if (reference.startsWith('map_location:')) {
    const locationId = reference.slice('map_location:'.length).split(';', 1)[0]?.trim();
    return locationId ? { kind: 'map_location', locationId } : undefined;
  }
  if (reference.startsWith('road_coordinate:')) {
    const match = /^road_coordinate:[^;]+;source=(-?[\d.]+),(-?[\d.]+)/.exec(reference);
    if (!match) {
      return undefined;
    }
    const x = Number(match[1]);
    const z = Number(match[2]);
    return Number.isFinite(x) && Number.isFinite(z) ? { kind: 'road_coordinate', x, z } : undefined;
  }
  if (reference.startsWith('transit_line:')) {
    const match = /^transit_line:([^:;]+)(?::([^:;]+))?/.exec(reference);
    if (!match?.[1]) {
      return undefined;
    }
    return {
      kind: 'transit_line',
      lineId: match[1],
      ...(match[2] ? { stationSourceId: match[2] } : {}),
    };
  }
  if (reference.startsWith('transit_station:')) {
    const match =
      /^transit_station:marker=([^;]+);direction=(east|west|north|south);lines=([^;]+)/.exec(
        reference,
      );
    if (!match?.[1] || !match[2] || !match[3]) {
      return undefined;
    }
    const lineIds = match[3]
      .split(',')
      .map((lineId) => lineId.trim())
      .filter(Boolean);
    if (!lineIds.length) {
      return undefined;
    }
    const terminalRole = /(?:^|;)terminal=(origin|terminal)(?:;|$)/.exec(reference)?.[1];
    return {
      kind: 'transit_station',
      stationMarkerId: match[1],
      direction: match[2] as 'east' | 'west' | 'north' | 'south',
      lineIds,
      ...(terminalRole === 'origin' || terminalRole === 'terminal' ? { terminalRole } : {}),
    };
  }
  return undefined;
}

export interface MaterialShareImageWatermarkInput {
  templateFields: MaterialTemplateField[];
  templateId: string;
  templateVersion: number;
  values: Record<string, string>;
  dataSource: MaterialShareLinkDataSource;
  sourceKind?: MaterialSourceKind;
  /** 服务端按数据来源重新解析出的字段值；未复核时为 undefined。 */
  serverResolvedValues?: Record<string, string>;
  draft?: Pick<MaterialDraft, 'status' | 'templateId' | 'templateVersion' | 'input'>;
}

/** 字段级比对：只看模板定义的字段，忽略表现层差异（如颜色大小写）。 */
export function compareMaterialShareLinkValues(
  fields: MaterialTemplateField[],
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  return fields.every(
    (field) =>
      normalizeMaterialShareLinkValue(left[field.key]) ===
      normalizeMaterialShareLinkValue(right[field.key]),
  );
}

/**
 * 分享图是否必须带水印。
 *
 * 只有服务端能复核的事实才能免水印：
 * 1. 服务器来源且字段与服务端重新解析结果一致；
 * 2. draftId 对应「已审核通过」且字段与草稿一致的草稿。
 * 其余（自定义改字、示例线网、导入项目、复核失败）一律带水印。
 */
export function decideMaterialShareImageWatermark(
  input: MaterialShareImageWatermarkInput,
): boolean {
  const draft = input.draft;
  if (
    draft &&
    draft.status === 'approved' &&
    draft.templateId === input.templateId &&
    draft.templateVersion === input.templateVersion &&
    compareMaterialShareLinkValues(input.templateFields, draft.input, input.values)
  ) {
    return false;
  }
  if (
    input.dataSource === 'server' &&
    input.sourceKind !== 'manual' &&
    input.serverResolvedValues &&
    compareMaterialShareLinkValues(input.templateFields, input.serverResolvedValues, input.values)
  ) {
    return false;
  }
  return true;
}

export interface CreateMaterialShareLinkInput {
  kind: MaterialShareLinkKind;
  code: string;
  seed: string;
  templateId: string;
  templateVersion: number;
  templateTitle: string;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  sourceKind?: MaterialSourceKind;
  sourceRef?: string;
  dataSource: MaterialShareLinkDataSource;
  origin: MaterialShareLinkOrigin;
  createdBy?: string;
  shareImageWatermark: boolean;
  networkName?: string;
  licenseName?: string;
  licenseUrl?: string;
}

export interface CreateMaterialShareLinkResult {
  link: MaterialShareLink;
  /** false = 命中同内容指纹，复用了已有短 ID。 */
  created: boolean;
}

export async function createMaterialShareLink(
  input: CreateMaterialShareLinkInput,
): Promise<CreateMaterialShareLinkResult> {
  const now = new Date();
  const fingerprint = createMaterialShareLinkFingerprint(input);
  const existing = await findMaterialShareLinkByFingerprint(fingerprint);
  if (
    existing &&
    !isMaterialShareLinkStub(existing) &&
    existing.status === 'active' &&
    !isMaterialShareLinkExpired(existing, now)
  ) {
    return { created: false, link: existing };
  }
  if (existing) {
    // 旧记录已停用或已过期：先压缩过期记录（清掉指纹），避免新短 ID 复用失效内容。
    await compactExpiredMaterialShareLinks(now);
  }

  const createdAt = now.toISOString();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = createShortMaterialShareLinkId();
    if (await findMaterialShareLinkById(id)) {
      continue;
    }
    const link: MaterialShareLink = {
      id,
      slug: resolveMaterialShareLinkSlug(input.templateId, input.kind),
      createdAt,
      kind: input.kind,
      code: input.code,
      seed: input.seed,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      templateTitle: input.templateTitle,
      values: input.values,
      canvas: input.canvas,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      status: 'active',
      dataSource: input.dataSource,
      origin: input.origin,
      createdBy: input.createdBy,
      shareImageWatermark: input.shareImageWatermark,
      networkName: input.networkName,
      licenseName: input.licenseName,
      licenseUrl: input.licenseUrl,
      openCount: 0,
    };
    const saved = await saveMaterialShareLink(link, fingerprint);
    if (saved.created) {
      return { created: true, link: saved.link };
    }
    // 并发创建同样内容：复用刚写入的有效记录（停用 / 过期记录不会被复用）。
    if (
      !isMaterialShareLinkStub(saved.link) &&
      saved.link.status === 'active' &&
      !isMaterialShareLinkExpired(saved.link, now)
    ) {
      return { created: false, link: saved.link };
    }
  }
  throw new Error('Unable to allocate a unique material share link id');
}

export async function findMaterialShareLinkById(
  id: string,
): Promise<MaterialShareLinkRecord | undefined> {
  return findStoredMaterialShareLinkById(id);
}

export interface MaterialShareLinkListItem {
  link: MaterialShareLinkRecord;
  effectiveStatus: MaterialShareLinkEffectiveStatus;
  expired: boolean;
}

export interface ListMaterialShareLinksQuery {
  q?: string;
  kind?: MaterialShareLinkKind;
  status?: MaterialShareLinkEffectiveStatus;
  /** 按数据来源筛选（server / sample / project）。 */
  source?: MaterialShareLinkDataSource;
  origin?: MaterialShareLinkOrigin;
  page?: number;
  pageSize?: number;
  now?: Date;
}

export interface ListMaterialShareLinksResult {
  items: MaterialShareLinkListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listMaterialShareLinks(
  query: ListMaterialShareLinksQuery = {},
): Promise<ListMaterialShareLinksResult> {
  const now = query.now ?? new Date();
  const keyword = query.q?.trim().toLowerCase();
  const records = (await listStoredMaterialShareLinks())
    .map((link) => ({
      link,
      effectiveStatus: getMaterialShareLinkEffectiveStatus(link, now),
      expired: isMaterialShareLinkExpired(link, now),
    }))
    .filter((item) => {
      if (query.kind && item.link.kind !== query.kind) {
        return false;
      }
      if (query.status && item.effectiveStatus !== query.status) {
        return false;
      }
      if (query.source && item.link.dataSource !== query.source) {
        return false;
      }
      if (query.origin && item.link.origin !== query.origin) {
        return false;
      }
      if (keyword) {
        const haystack = [
          item.link.id,
          item.link.code,
          item.link.slug,
          item.link.templateId,
          item.link.templateTitle,
        ]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    })
    .sort(
      (left, right) =>
        right.link.createdAt.localeCompare(left.link.createdAt) ||
        left.link.id.localeCompare(right.link.id),
    );
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(Math.max(Math.floor(query.pageSize ?? 50), 1), 200);
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: records.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * 扫码计数：命中有效记录时 openCount + 1、更新 lastOpenedAt。
 *
 * 写入走存储层写锁的读-改-写，多个扫码并发时不会互相覆盖；
 * 停用、过期、stub 不计数，无变化时也不重写 JSON。
 */
export async function touchMaterialShareLinkOpen(
  shareId: string,
): Promise<MaterialShareLinkRecord | undefined> {
  const openedAt = new Date().toISOString();
  const now = new Date(openedAt);
  let counted = false;
  const updated = await updateMaterialShareLink(shareId, (link) => {
    if (
      link.status !== 'active' ||
      isMaterialShareLinkStub(link) ||
      isMaterialShareLinkExpired(link, now)
    ) {
      return link;
    }
    counted = true;
    return { ...link, openCount: link.openCount + 1, lastOpenedAt: openedAt };
  });
  if (updated && counted) {
    await emitMaterialShareLinkEvent('MaterialShareLinkOpened', openedAt, {
      shareId: updated.id,
      kind: updated.kind,
      templateId: updated.templateId,
      templateVersion: updated.templateVersion,
      openedAt,
    });
  }
  return updated;
}

export type MaterialShareLinkMutationResult =
  | { ok: true; link: MaterialShareLinkRecord; changed: boolean }
  | { ok: false; status: number; error: string; message: string };

export async function revokeMaterialShareLink(input: {
  shareId: string;
  revokedBy: string;
}): Promise<MaterialShareLinkMutationResult> {
  const revokedAt = new Date().toISOString();
  let changed = false;
  const updated = await updateMaterialShareLink(input.shareId, (link) => {
    if (link.status === 'revoked') {
      return link;
    }
    changed = true;
    return { ...link, status: 'revoked', revokedAt, revokedBy: input.revokedBy };
  });
  if (!updated) {
    return materialShareLinkNotFound();
  }
  if (changed) {
    await emitMaterialShareLinkEvent('MaterialShareLinkRevoked', revokedAt, {
      shareId: updated.id,
      kind: updated.kind,
      revokedBy: input.revokedBy,
      revokedAt,
    });
  }
  return { ok: true, link: updated, changed };
}

export async function restoreMaterialShareLink(input: {
  shareId: string;
  restoredBy: string;
}): Promise<MaterialShareLinkMutationResult> {
  const restoredAt = new Date().toISOString();
  let changed = false;
  const updated = await updateMaterialShareLink(input.shareId, (link) => {
    if (link.status !== 'revoked') {
      return link;
    }
    changed = true;
    return { ...link, status: 'active', revokedAt: undefined, revokedBy: undefined };
  });
  if (!updated) {
    return materialShareLinkNotFound();
  }
  if (changed) {
    await emitMaterialShareLinkEvent('MaterialShareLinkRestored', restoredAt, {
      shareId: updated.id,
      kind: updated.kind,
      restoredBy: input.restoredBy,
      restoredAt,
    });
  }
  return { ok: true, link: updated, changed };
}

export interface MaterialShareLinkCompactionResult {
  records: MaterialShareLinkRecord[];
  compactedCount: number;
  removedCount: number;
  evictedCount: number;
}

/**
 * 过期压缩纯函数：
 * - 创建超过 30 天的完整记录 → stub（清 values / canvas / 指纹），保留展示与兜底字段；
 * - stub 创建超过约 395 天 → 清理；
 * - 完整记录超过 2 万条 → 按创建时间淘汰最早的。
 */
export function compactMaterialShareLinkRecords(
  records: MaterialShareLinkRecord[],
  now: Date = new Date(),
): MaterialShareLinkCompactionResult {
  const nowMs = now.getTime();
  const retained: MaterialShareLinkRecord[] = [];
  let compactedCount = 0;
  let removedCount = 0;

  for (const record of records) {
    const createdMs = Date.parse(record.createdAt);
    if (Number.isFinite(createdMs)) {
      if (isMaterialShareLinkStub(record)) {
        if (
          nowMs - createdMs >
          materialShareLinkFullRetentionMs + materialShareLinkStubRetentionMs
        ) {
          removedCount += 1;
          continue;
        }
      } else if (nowMs - createdMs > materialShareLinkFullRetentionMs) {
        retained.push(createMaterialShareLinkStub(record));
        compactedCount += 1;
        continue;
      }
    }
    retained.push(record);
  }

  let evictedCount = 0;
  const fullRecordIndexes = retained.flatMap((record, index): number[] =>
    isMaterialShareLinkStub(record) ? [] : [index],
  );
  if (fullRecordIndexes.length > materialShareLinkMaximumFullRecords) {
    const overflow = fullRecordIndexes.length - materialShareLinkMaximumFullRecords;
    const oldestIndexes = [...fullRecordIndexes]
      .sort((left, right) => createdAtMs(retained[left]!) - createdAtMs(retained[right]!))
      .slice(0, overflow);
    const evictedIndexes = new Set(oldestIndexes);
    retained.splice(
      0,
      retained.length,
      ...retained.filter((_record, index) => !evictedIndexes.has(index)),
    );
    evictedCount = evictedIndexes.size;
  }

  return { records: retained, compactedCount, removedCount, evictedCount };
}

export async function compactExpiredMaterialShareLinks(now: Date = new Date()): Promise<{
  compactedCount: number;
  removedCount: number;
  evictedCount: number;
  totalCount: number;
}> {
  return updateMaterialShareLinkRecords((storedRecords) => {
    const fingerprintById = new Map(
      storedRecords.map((record) => [record.id, record.fingerprint] as const),
    );
    const result = compactMaterialShareLinkRecords(
      storedRecords.map(toMaterialShareLinkRecord),
      now,
    );
    const records: StoredMaterialShareLink[] = result.records.map((record) => {
      // stub 不保留指纹：新分享不能复用已失效内容的短 ID。
      const fingerprint = isMaterialShareLinkStub(record)
        ? undefined
        : fingerprintById.get(record.id);
      return { ...record, fingerprint };
    });
    return {
      records,
      result: {
        compactedCount: result.compactedCount,
        removedCount: result.removedCount,
        evictedCount: result.evictedCount,
        totalCount: records.length,
      },
    };
  });
}

export interface MaterialShareLinkPublicView {
  shareId: string;
  slug: string;
  createdAt: string;
  kind: MaterialShareLinkKind;
  code: string;
  templateId: string;
  templateVersion: number;
  templateTitle: string;
  dataSource: MaterialShareLinkDataSource;
  origin: MaterialShareLinkOrigin;
  status: MaterialShareLinkStatus;
  expired: boolean;
  stub: boolean;
  shareImageWatermark: boolean;
  networkName?: string;
  licenseName?: string;
  licenseUrl?: string;
  values?: Record<string, string>;
  canvas?: MaterialCanvasConfig;
}

/** 公开只读脱敏视图：不返回 createdBy / revokedBy / seed / sourceRef 等内部字段。 */
export function toMaterialShareLinkPublicView(
  record: MaterialShareLinkRecord,
  now: Date = new Date(),
): MaterialShareLinkPublicView {
  const expired = isMaterialShareLinkExpired(record, now);
  const view: MaterialShareLinkPublicView = {
    shareId: record.id,
    slug: record.slug,
    createdAt: record.createdAt,
    kind: record.kind,
    code: record.code,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    templateTitle: record.templateTitle,
    dataSource: record.dataSource,
    origin: record.origin,
    status: record.status,
    expired,
    stub: isMaterialShareLinkStub(record),
    shareImageWatermark: record.shareImageWatermark,
    networkName: record.networkName,
    licenseName: record.licenseName,
    licenseUrl: record.licenseUrl,
  };
  if (!expired && !isMaterialShareLinkStub(record)) {
    view.values = record.values;
    view.canvas = record.canvas;
  }
  return view;
}

function createShortMaterialShareLinkId(): string {
  return randomBytes(8).toString('base64url').slice(0, shortMaterialShareLinkIdLength);
}

function createMaterialShareLinkStub(record: MaterialShareLink): MaterialShareLinkStub {
  const {
    values: _values,
    canvas: _canvas,
    sourceKind: _sourceKind,
    sourceRef: _sourceRef,
    seed: _seed,
    lastOpenedAt: _lastOpenedAt,
    ...retained
  } = record;
  return { ...retained, stub: true };
}

function toMaterialShareLinkRecord(record: StoredMaterialShareLink): MaterialShareLinkRecord {
  const { fingerprint: _fingerprint, ...link } = record;
  return link;
}

function isMaterialShareLinkCreatedBefore(
  createdAt: string,
  retentionMs: number,
  now: Date,
): boolean {
  const createdMs = Date.parse(createdAt);
  // 时间坏掉的记录按过期处理，不把内容当成有效分享。
  return Number.isFinite(createdMs) ? now.getTime() - createdMs > retentionMs : true;
}

function createdAtMs(record: MaterialShareLinkRecord): number {
  const createdMs = Date.parse(record.createdAt);
  return Number.isFinite(createdMs) ? createdMs : 0;
}

function normalizeMaterialShareLinkValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

function sortRecordKeys(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key] ?? '']),
  );
}

function materialShareLinkNotFound(): MaterialShareLinkMutationResult {
  return {
    ok: false,
    status: 404,
    error: 'material_share_link_not_found',
    message: '物料分享记录不存在。',
  };
}

async function emitMaterialShareLinkEvent<TType extends YctEventType>(
  type: TType,
  occurredAt: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    actor: { type: 'system', id: 'material-share-link-workflow' },
    eventId: `event_${randomUUID()}`,
    occurredAt,
    payload,
    type,
  });
}
