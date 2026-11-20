import type {
  MaterialShareLinkDataSource,
  MaterialShareLinkEffectiveStatus,
  MaterialShareLinkKind,
  MaterialShareLinkOrigin,
  MaterialShareLinkRecord,
} from '@yct/contracts';
import { appPath } from '../../../../../lib/app-paths';

/** 后台「分享记录」里的一行：把记录本体与派生状态合并成前端直接可用的结构。 */
export interface AdminMaterialShareLinkItem {
  id: string;
  slug: string;
  code: string;
  kind: MaterialShareLinkKind;
  dataSource: MaterialShareLinkDataSource;
  origin: MaterialShareLinkOrigin;
  /** 工作台分享才有创建者（临东通用户 ID）；机器人分享为空。 */
  createdBy?: string;
  templateId: string;
  templateVersion: number;
  templateTitle: string;
  createdAt: string;
  openCount: number;
  lastOpenedAt?: string;
  status: 'active' | 'revoked';
  effectiveStatus: MaterialShareLinkEffectiveStatus;
  shareImageWatermark: boolean;
  networkName?: string;
  licenseName?: string;
  licenseUrl?: string;
  revokedAt?: string;
  revokedBy?: string;
  /** 已压缩成过期 stub 的记录不再带字段与画布。 */
  stub: boolean;
  /** 落地页相对路径（已含站点 basePath），前端拼 window.location.origin 得到完整短链。 */
  sharePath: string;
}

/** 工作流列表项的最小形状（与 listMaterialShareLinks 的 items 对齐）。 */
export interface AdminMaterialShareLinkSourceItem {
  link: MaterialShareLinkRecord;
  effectiveStatus: MaterialShareLinkEffectiveStatus;
  expired: boolean;
}

export function toAdminMaterialShareLinkItem(
  item: AdminMaterialShareLinkSourceItem,
): AdminMaterialShareLinkItem {
  const { link } = item;
  return {
    id: link.id,
    slug: link.slug,
    code: link.code,
    kind: link.kind,
    dataSource: link.dataSource,
    origin: link.origin,
    createdBy: link.createdBy,
    templateId: link.templateId,
    templateVersion: link.templateVersion,
    templateTitle: link.templateTitle,
    createdAt: link.createdAt,
    openCount: link.openCount,
    // stub 类型不保留 lastOpenedAt，过期压缩后按「暂无扫码时间」展示。
    lastOpenedAt: 'lastOpenedAt' in link ? link.lastOpenedAt : undefined,
    status: link.status,
    effectiveStatus: item.effectiveStatus,
    shareImageWatermark: link.shareImageWatermark,
    networkName: link.networkName,
    licenseName: link.licenseName,
    licenseUrl: link.licenseUrl,
    revokedAt: link.revokedAt,
    revokedBy: link.revokedBy,
    stub: 'stub' in link && link.stub === true,
    sharePath: appPath(`/m/${encodeURIComponent(link.slug)}/${encodeURIComponent(link.id)}`),
  };
}

export const adminMaterialShareLinkKindValues: MaterialShareLinkKind[] = [
  'road_sign',
  'address_sign',
  'bus_stop',
  'metro_line',
  'custom',
];
export const adminMaterialShareLinkStatusValues: MaterialShareLinkEffectiveStatus[] = [
  'active',
  'expired',
  'revoked',
];
export const adminMaterialShareLinkDataSourceValues: MaterialShareLinkDataSource[] = [
  'server',
  'sample',
  'project',
];
export const adminMaterialShareLinkOriginValues: MaterialShareLinkOrigin[] = ['bot', 'workbench'];

export interface AdminMaterialShareLinksQuery {
  q?: string;
  kind?: MaterialShareLinkKind;
  status?: MaterialShareLinkEffectiveStatus;
  source?: MaterialShareLinkDataSource;
  origin?: MaterialShareLinkOrigin;
  page: number;
  pageSize?: number;
}

export type AdminMaterialShareLinksQueryParseResult =
  { ok: true; query: AdminMaterialShareLinksQuery } | { ok: false; error: string; message: string };

/**
 * 解析 `/api/admin/materials/share-links` 的查询参数。
 *
 * 空字符串（`?kind=&page=`）按未传处理；非法枚举值返回可读的 400 文案，
 * 避免静默返回一份和筛选条件不符的列表。
 */
export function parseAdminMaterialShareLinksQuery(
  searchParams: URLSearchParams,
): AdminMaterialShareLinksQueryParseResult {
  const kind = parseEnumParam(
    searchParams.get('kind'),
    adminMaterialShareLinkKindValues,
    '类型',
    adminMaterialShareLinkKindValues.join(' / '),
  );
  if (!kind.ok) {
    return kind;
  }
  const status = parseEnumParam(
    searchParams.get('status'),
    adminMaterialShareLinkStatusValues,
    '状态',
    adminMaterialShareLinkStatusValues.join(' / '),
  );
  if (!status.ok) {
    return status;
  }
  const source = parseEnumParam(
    searchParams.get('source'),
    adminMaterialShareLinkDataSourceValues,
    '数据源',
    adminMaterialShareLinkDataSourceValues.join(' / '),
  );
  if (!source.ok) {
    return source;
  }
  const origin = parseEnumParam(
    searchParams.get('origin'),
    adminMaterialShareLinkOriginValues,
    '来源',
    adminMaterialShareLinkOriginValues.join(' / '),
  );
  if (!origin.ok) {
    return origin;
  }
  const page = parsePageParam(searchParams.get('page'));
  if (!page.ok) {
    return page;
  }

  const keyword = searchParams.get('q')?.trim();
  return {
    ok: true,
    query: {
      ...(keyword ? { q: keyword } : {}),
      ...(kind.value ? { kind: kind.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(source.value ? { source: source.value } : {}),
      ...(origin.value ? { origin: origin.value } : {}),
      page: page.value,
    },
  };
}

type EnumParamResult<TValue extends string> =
  { ok: true; value?: TValue } | { ok: false; error: string; message: string };

function parseEnumParam<TValue extends string>(
  rawValue: string | null,
  allowedValues: readonly TValue[],
  label: string,
  allowedLabel: string,
): EnumParamResult<TValue> {
  const value = rawValue?.trim();
  if (!value) {
    return { ok: true };
  }
  if (!(allowedValues as readonly string[]).includes(value)) {
    return {
      ok: false,
      error: 'invalid_material_share_link_query',
      message: `${label}筛选值无效，只支持 ${allowedLabel}。`,
    };
  }
  return { ok: true, value: value as TValue };
}

function parsePageParam(
  rawValue: string | null,
): { ok: true; value: number } | { ok: false; error: string; message: string } {
  const value = rawValue?.trim();
  if (!value) {
    return { ok: true, value: 1 };
  }
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    return {
      ok: false,
      error: 'invalid_material_share_link_query',
      message: '页码必须是从 1 开始的整数。',
    };
  }
  return { ok: true, value: page };
}
