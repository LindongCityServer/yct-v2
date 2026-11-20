/**
 * 物料后台「分享记录」校验：查询参数解析（q / kind / status / source / origin / page）、
 * 后台列表行的扁平化结构与 sharePath。
 *
 * 运行：pnpm exec tsx --test scripts/checks/verify-admin-material-share-links.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MaterialShareLink, MaterialShareLinkRecord } from '@yct/contracts';
import {
  adminMaterialShareLinkDataSourceValues,
  adminMaterialShareLinkKindValues,
  adminMaterialShareLinkOriginValues,
  adminMaterialShareLinkStatusValues,
  parseAdminMaterialShareLinksQuery,
  toAdminMaterialShareLinkItem,
} from '../../apps/web/app/api/admin/materials/share-links/share-link-view';

const dayMs = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-19T12:00:00.000Z');
const fresh = new Date(now.getTime() - dayMs).toISOString();
const old = new Date(now.getTime() - 31 * dayMs).toISOString();

const defaultCanvas = {
  widthM: 2,
  heightM: 1,
  pxPerMeter: 128,
  alignToTile: false,
  tileSizePx: 128,
};

function makeLink(
  overrides: Partial<MaterialShareLink> & Pick<MaterialShareLink, 'id'>,
): MaterialShareLink {
  return {
    slug: 'road',
    createdAt: fresh,
    kind: 'road_sign',
    code: 'LD-7F3A',
    seed: '7f3a2b',
    templateId: 'system_material_road_name_direction',
    templateVersion: 1,
    templateTitle: '道路路名方向牌',
    values: { roadName: '临东大道' },
    canvas: { ...defaultCanvas },
    status: 'active',
    dataSource: 'server',
    origin: 'bot',
    shareImageWatermark: false,
    openCount: 0,
    ...overrides,
  };
}

test('分享记录查询参数：完整筛选、空值与默认页', () => {
  const full = parseAdminMaterialShareLinksQuery(
    new URLSearchParams(
      'q=LD-7F3A&kind=road_sign&status=expired&source=sample&origin=workbench&page=3',
    ),
  );
  assert.equal(full.ok, true);
  if (!full.ok) {
    throw new Error(full.message);
  }
  assert.deepEqual(full.query, {
    q: 'LD-7F3A',
    kind: 'road_sign',
    status: 'expired',
    source: 'sample',
    origin: 'workbench',
    page: 3,
  });

  // 空字符串参数（前端清空筛选时常发）按未传处理，不能报 400。
  const blank = parseAdminMaterialShareLinksQuery(
    new URLSearchParams('q=%20%20&kind=&status=&source=&origin=&page='),
  );
  assert.equal(blank.ok, true);
  if (!blank.ok) {
    throw new Error(blank.message);
  }
  assert.deepEqual(blank.query, { page: 1 });

  const none = parseAdminMaterialShareLinksQuery(new URLSearchParams(''));
  assert.equal(none.ok, true);
  if (!none.ok) {
    throw new Error(none.message);
  }
  assert.deepEqual(none.query, { page: 1 });

  // 搜索关键词会 trim，首尾空格不影响检索。
  const trimmed = parseAdminMaterialShareLinksQuery(new URLSearchParams('q=%20LD-7F3A%20'));
  assert.equal(trimmed.ok, true);
  if (!trimmed.ok) {
    throw new Error(trimmed.message);
  }
  assert.deepEqual(trimmed.query, { q: 'LD-7F3A', page: 1 });
});

test('分享记录查询参数：非法枚举与页码返回可读 400 文案', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['kind=banana', 'invalid_material_share_link_query', /类型筛选值无效/],
    ['status=active2', 'invalid_material_share_link_query', /状态筛选值无效/],
    ['source=ftp', 'invalid_material_share_link_query', /数据源筛选值无效/],
    ['origin=qq', 'invalid_material_share_link_query', /来源筛选值无效/],
    ['page=0', 'invalid_material_share_link_query', /页码必须是/],
    ['page=1.5', 'invalid_material_share_link_query', /页码必须是/],
    ['page=abc', 'invalid_material_share_link_query', /页码必须是/],
  ];
  for (const [search, error, messagePattern] of cases) {
    const parsed = parseAdminMaterialShareLinksQuery(new URLSearchParams(search));
    assert.equal(parsed.ok, false, `${search} 应该被拒绝`);
    if (parsed.ok) {
      throw new Error(`${search} 应该被拒绝`);
    }
    assert.equal(parsed.error, error);
    assert.match(parsed.message, messagePattern);
  }

  // 枚举白名单与前端筛选选项保持一致。
  assert.deepEqual(adminMaterialShareLinkKindValues, [
    'road_sign',
    'address_sign',
    'bus_stop',
    'metro_line',
    'custom',
  ]);
  assert.deepEqual(adminMaterialShareLinkStatusValues, ['active', 'expired', 'revoked']);
  assert.deepEqual(adminMaterialShareLinkDataSourceValues, ['server', 'sample', 'project']);
  assert.deepEqual(adminMaterialShareLinkOriginValues, ['bot', 'workbench']);
});

test('后台列表行：合并记录与派生状态，生成 sharePath 与工作台创建者字段', () => {
  const link = makeLink({
    id: 'Ab3dE9xQ2k',
    origin: 'workbench',
    createdBy: 'user_1',
    dataSource: 'sample',
    networkName: '沈阳示例线网',
    licenseName: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://railmapgen.org',
    openCount: 7,
    lastOpenedAt: fresh,
    shareImageWatermark: true,
  });
  const item = toAdminMaterialShareLinkItem({
    link,
    effectiveStatus: 'active',
    expired: false,
  });
  assert.equal(item.id, 'Ab3dE9xQ2k');
  assert.equal(item.slug, 'road');
  assert.equal(item.code, 'LD-7F3A');
  assert.equal(item.kind, 'road_sign');
  assert.equal(item.dataSource, 'sample');
  assert.equal(item.origin, 'workbench');
  assert.equal(item.createdBy, 'user_1');
  assert.equal(item.templateId, 'system_material_road_name_direction');
  assert.equal(item.templateVersion, 1);
  assert.equal(item.templateTitle, '道路路名方向牌');
  assert.equal(item.createdAt, fresh);
  assert.equal(item.openCount, 7);
  assert.equal(item.lastOpenedAt, fresh);
  assert.equal(item.status, 'active');
  assert.equal(item.effectiveStatus, 'active');
  assert.equal(item.shareImageWatermark, true);
  assert.equal(item.networkName, '沈阳示例线网');
  assert.equal(item.licenseName, 'CC BY-NC-SA 4.0');
  assert.equal(item.stub, false);
  assert.equal(item.sharePath, '/m/road/Ab3dE9xQ2k');

  // 机器人分享没有创建者；过期状态的记录仍然展示。
  const expiredItem = toAdminMaterialShareLinkItem({
    link: makeLink({ id: 'Cd4eF0yR3m', createdAt: old }),
    effectiveStatus: 'expired',
    expired: true,
  });
  assert.equal(expiredItem.createdBy, undefined);
  assert.equal(expiredItem.origin, 'bot');
  assert.equal(expiredItem.effectiveStatus, 'expired');
  assert.equal(expiredItem.sharePath, '/m/road/Cd4eF0yR3m');
});

test('后台列表行：停用记录保留操作人与时间，stub 标记为已压缩', () => {
  const revokedAt = new Date(now.getTime() - 2 * dayMs).toISOString();
  const revoked = toAdminMaterialShareLinkItem({
    link: makeLink({
      id: 'Ef5gH1zS4n',
      status: 'revoked',
      revokedAt,
      revokedBy: 'admin_1',
    }),
    effectiveStatus: 'revoked',
    expired: false,
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.effectiveStatus, 'revoked');
  assert.equal(revoked.revokedAt, revokedAt);
  assert.equal(revoked.revokedBy, 'admin_1');

  // 过期压缩后的 stub 没有 lastOpenedAt / values / canvas，但展示字段与短链仍在。
  const stub: MaterialShareLinkRecord = {
    id: 'Gh6jK2aT5p',
    slug: 'building',
    createdAt: old,
    kind: 'address_sign',
    code: 'BL-1A2B',
    templateId: 'system_material_building_address',
    templateVersion: 2,
    templateTitle: '楼栋地名标志',
    status: 'active',
    dataSource: 'server',
    origin: 'bot',
    shareImageWatermark: false,
    openCount: 3,
    stub: true,
  };
  const stubItem = toAdminMaterialShareLinkItem({
    link: stub,
    effectiveStatus: 'expired',
    expired: true,
  });
  assert.equal(stubItem.stub, true);
  assert.equal(stubItem.lastOpenedAt, undefined);
  assert.equal(stubItem.kind, 'address_sign');
  assert.equal(stubItem.templateVersion, 2);
  assert.equal(stubItem.effectiveStatus, 'expired');
  assert.equal(stubItem.sharePath, '/m/building/Gh6jK2aT5p');
});
