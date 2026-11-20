/**
 * 物料分享基础层校验：短链存储、指纹去重、过期 stub、停用 / 恢复、扫码计数合并、
 * 扫码分流纯函数与分享图水印判定。
 *
 * 运行：pnpm exec tsx --test scripts/checks/verify-material-share-links.ts
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import type {
  MaterialDraft,
  MaterialShareLink,
  MaterialShareLinkRecord,
  MaterialTemplateField,
} from '@yct/contracts';
import {
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from '../../apps/web/lib/material-template-ids';
import {
  compactExpiredMaterialShareLinks,
  compactMaterialShareLinkRecords,
  createMaterialShareLink,
  createMaterialShareLinkFingerprint,
  decideMaterialShareImageWatermark,
  findMaterialShareLinkById,
  isMaterialShareLinkStub,
  listMaterialShareLinks,
  parseMaterialShareLinkServerSource,
  resolveMaterialShareLinkRouteDecision,
  resolveMaterialShareLinkSlug,
  restoreMaterialShareLink,
  revokeMaterialShareLink,
  touchMaterialShareLinkOpen,
  type CreateMaterialShareLinkInput,
} from '../../apps/web/lib/material-share-link-workflow';
import {
  findMaterialShareLinkByFingerprint,
  listMaterialShareLinks as listStoredMaterialShareLinks,
  saveMaterialShareLink,
} from '../../apps/web/lib/material-share-link-store';

const dayMs = 24 * 60 * 60 * 1000;
const tempDir = path.join(tmpdir(), `yct-material-share-links-${process.pid}-${Date.now()}`);
const storePath = path.join(tempDir, 'material-share-links.json');
const outboxPath = path.join(tempDir, 'event-outbox.json');
process.env.YCT_MATERIAL_SHARE_LINK_STORE_PATH = storePath;
process.env.YCT_EVENT_OUTBOX_STORE_PATH = outboxPath;

before(async () => {
  await mkdir(tempDir, { recursive: true });
});

after(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

beforeEach(async () => {
  await rm(storePath, { force: true });
  await rm(outboxPath, { force: true });
});

const defaultCanvas = {
  widthM: 2,
  heightM: 1,
  pxPerMeter: 128,
  alignToTile: false,
  tileSizePx: 128,
};

function makeCreateInput(
  overrides: Partial<CreateMaterialShareLinkInput> = {},
): CreateMaterialShareLinkInput {
  return {
    kind: 'road_sign',
    code: 'LD-7F3A',
    seed: '7f3a2b',
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    templateVersion: 1,
    templateTitle: '路牌',
    values: { roadName: '临东大道', directionMode: 'east_west' },
    canvas: { ...defaultCanvas },
    dataSource: 'server',
    origin: 'bot',
    shareImageWatermark: false,
    ...overrides,
  };
}

function makeFullLink(
  overrides: Partial<MaterialShareLink> & Pick<MaterialShareLink, 'id' | 'createdAt'>,
): MaterialShareLink {
  return {
    slug: 'road',
    kind: 'road_sign',
    code: 'LD-7F3A',
    seed: '7f3a2b',
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    templateVersion: 1,
    templateTitle: '路牌',
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

test('内容指纹去重：同内容复用短 ID，不同字段生成新记录', async () => {
  const first = await createMaterialShareLink(makeCreateInput());
  const second = await createMaterialShareLink(makeCreateInput());
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.link.id, first.link.id);
  assert.equal((await listStoredMaterialShareLinks()).length, 1);

  const changed = await createMaterialShareLink(
    makeCreateInput({ values: { roadName: '临东西路', directionMode: 'north_south' } }),
  );
  assert.equal(changed.created, true);
  assert.notEqual(changed.link.id, first.link.id);
  assert.equal((await listStoredMaterialShareLinks()).length, 2);

  // 指纹只认内容，不认对象键顺序。
  const fingerprintA = createMaterialShareLinkFingerprint({
    templateId: 'tpl',
    templateVersion: 1,
    canvas: { ...defaultCanvas },
    values: { roadName: '临东大道', directionMode: 'east_west' },
  });
  const fingerprintB = createMaterialShareLinkFingerprint({
    templateId: 'tpl',
    templateVersion: 1,
    canvas: { ...defaultCanvas },
    values: { directionMode: 'east_west', roadName: '临东大道' },
  });
  assert.equal(fingerprintA, fingerprintB);
  assert.equal(fingerprintA.length, 64);
});

test('过期压缩成 stub：清空 values / canvas / 指纹，stub 再留 1 年后清理', async () => {
  const now = new Date();
  const active = await createMaterialShareLink(makeCreateInput());
  const oldLink = makeFullLink({
    id: 'OldLink1234',
    createdAt: new Date(now.getTime() - 31 * dayMs).toISOString(),
    values: { roadName: '旧东西大道' },
  });
  const oldFingerprint = createMaterialShareLinkFingerprint(oldLink);
  assert.equal((await saveMaterialShareLink(oldLink, oldFingerprint)).created, true);

  const compacted = await compactExpiredMaterialShareLinks(now);
  assert.equal(compacted.compactedCount, 1);
  assert.equal(compacted.removedCount, 0);

  const stub = await findMaterialShareLinkById('OldLink1234');
  assert.ok(stub);
  assert.equal(isMaterialShareLinkStub(stub), true);
  if (!isMaterialShareLinkStub(stub)) {
    throw new Error('过期记录应压缩成 stub');
  }
  assert.equal(stub.values, undefined);
  assert.equal(stub.canvas, undefined);
  assert.equal(stub.seed, undefined);
  assert.equal(stub.templateTitle, '路牌');
  assert.equal(stub.templateId, ROAD_NAME_DIRECTION_TEMPLATE_ID);
  assert.equal(stub.code, 'LD-7F3A');
  assert.equal(stub.openCount, 0);
  assert.equal(stub.sourceKind, undefined);
  // 指纹已清：同内容再分享不会复用已失效短 ID。
  assert.equal(await findMaterialShareLinkByFingerprint(oldFingerprint), undefined);
  const reshared = await createMaterialShareLink(
    makeCreateInput({ values: { roadName: '旧东西大道' } }),
  );
  assert.notEqual(reshared.link.id, 'OldLink1234');

  // 有效记录不受影响。
  const activeRecord = await findMaterialShareLinkById(active.link.id);
  assert.ok(activeRecord);
  assert.equal(isMaterialShareLinkStub(activeRecord), false);

  // stub 从创建起超过 30 天 + 1 年 → 清理。
  const expiredStub: MaterialShareLinkRecord = {
    id: 'Stub0000001',
    slug: 'road',
    createdAt: new Date(now.getTime() - 400 * dayMs).toISOString(),
    kind: 'road_sign',
    code: 'SH-0000',
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    templateVersion: 1,
    templateTitle: '路牌',
    status: 'active',
    dataSource: 'server',
    origin: 'bot',
    shareImageWatermark: false,
    openCount: 0,
    stub: true,
  };
  const removed = compactMaterialShareLinkRecords([expiredStub], now);
  assert.equal(removed.removedCount, 1);
  assert.equal(removed.records.length, 0);
});

test('停用 / 恢复：记录状态与操作人，重复操作幂等，停用后不再复用短 ID', async () => {
  const created = await createMaterialShareLink(makeCreateInput());
  const revoked = await revokeMaterialShareLink({
    shareId: created.link.id,
    revokedBy: 'admin_1',
  });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) {
    throw new Error(revoked.message);
  }
  assert.equal(revoked.changed, true);
  assert.equal(revoked.link.status, 'revoked');
  assert.equal(revoked.link.revokedBy, 'admin_1');
  assert.ok(revoked.link.revokedAt);

  const revokedAgain = await revokeMaterialShareLink({
    shareId: created.link.id,
    revokedBy: 'admin_2',
  });
  assert.equal(revokedAgain.ok, true);
  if (!revokedAgain.ok) {
    throw new Error(revokedAgain.message);
  }
  assert.equal(revokedAgain.changed, false);
  assert.equal(revokedAgain.link.revokedBy, 'admin_1');

  const restored = await restoreMaterialShareLink({
    shareId: created.link.id,
    restoredBy: 'admin_1',
  });
  assert.equal(restored.ok, true);
  if (!restored.ok) {
    throw new Error(restored.message);
  }
  assert.equal(restored.changed, true);
  assert.equal(restored.link.status, 'active');
  assert.equal(restored.link.revokedAt, undefined);
  assert.equal(restored.link.revokedBy, undefined);

  const restoredAgain = await restoreMaterialShareLink({
    shareId: created.link.id,
    restoredBy: 'admin_1',
  });
  assert.equal(restoredAgain.ok, true);
  if (!restoredAgain.ok) {
    throw new Error(restoredAgain.message);
  }
  assert.equal(restoredAgain.changed, false);

  // 停用的记录不能因为「再分享同样内容」而复活，必须拿新的短 ID。
  await revokeMaterialShareLink({ shareId: created.link.id, revokedBy: 'admin_1' });
  const reshared = await createMaterialShareLink(makeCreateInput());
  assert.equal(reshared.created, true);
  assert.notEqual(reshared.link.id, created.link.id);
  assert.equal(reshared.link.status, 'active');

  const missing = await revokeMaterialShareLink({
    shareId: 'Missing000',
    revokedBy: 'admin_1',
  });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error('不存在的分享记录不能停用');
  }
  assert.equal(missing.status, 404);
});

test('扫码计数合并写入：并发自增不丢更新，停用 / 过期不计数且保留其它字段', async () => {
  const created = await createMaterialShareLink(
    makeCreateInput({ origin: 'workbench', createdBy: 'user_1', shareImageWatermark: true }),
  );
  const shareId = created.link.id;
  await Promise.all([
    touchMaterialShareLinkOpen(shareId),
    touchMaterialShareLinkOpen(shareId),
    touchMaterialShareLinkOpen(shareId),
    touchMaterialShareLinkOpen(shareId),
    touchMaterialShareLinkOpen(shareId),
  ]);
  const touched = await findMaterialShareLinkById(shareId);
  assert.ok(touched);
  assert.equal(touched.openCount, 5);
  assert.ok(touched.lastOpenedAt);
  // 计数更新不能覆盖其它字段。
  assert.equal(touched.kind, 'road_sign');
  assert.equal(touched.templateTitle, '路牌');
  assert.equal(touched.origin, 'workbench');
  assert.equal(touched.createdBy, 'user_1');
  assert.equal(touched.shareImageWatermark, true);
  assert.deepEqual(touched.values, created.link.values);

  // 停用后扫码不计数。
  await revokeMaterialShareLink({ shareId, revokedBy: 'admin_1' });
  const revokedTouch = await touchMaterialShareLinkOpen(shareId);
  assert.ok(revokedTouch);
  assert.equal(revokedTouch.openCount, 5);

  // 过期记录（超过 30 天）也不计数。
  const oldLink = makeFullLink({
    id: 'Expired001',
    createdAt: new Date(Date.now() - 31 * dayMs).toISOString(),
  });
  await saveMaterialShareLink(oldLink, createMaterialShareLinkFingerprint(oldLink));
  const expiredTouch = await touchMaterialShareLinkOpen('Expired001');
  assert.ok(expiredTouch);
  assert.equal(expiredTouch.openCount, 0);
  assert.equal(expiredTouch.lastOpenedAt, undefined);

  // 有效扫码会写 MaterialShareLinkOpened 事件（只记分享 ID，不记扫码者身份）。
  const outbox = JSON.parse(await readFile(outboxPath, 'utf8')) as {
    records: Array<{ type: string }>;
  };
  const openedEvents = outbox.records.filter((record) => record.type === 'MaterialShareLinkOpened');
  assert.ok(openedEvents.length >= 1);
});

test('分享记录列表：关键词 / 状态 / 来源筛选与分页', async () => {
  const now = new Date();
  const botLink = await createMaterialShareLink(
    makeCreateInput({
      origin: 'bot',
      templateTitle: '临东大道',
      values: { roadName: '临东大道' },
    }),
  );
  const workbench = await createMaterialShareLink(
    makeCreateInput({
      origin: 'workbench',
      createdBy: 'user_1',
      values: { roadName: '雨城路' },
    }),
  );
  await revokeMaterialShareLink({ shareId: workbench.link.id, revokedBy: 'admin_1' });

  const all = await listMaterialShareLinks({ now });
  assert.equal(all.total, 2);

  // 后台检索按编号 / 短链 ID / 模板名（与计划一致），不含字段值。
  const keyword = await listMaterialShareLinks({ q: '临东大道', now });
  assert.equal(keyword.total, 1);
  assert.equal(keyword.items[0]?.link.id, botLink.link.id);

  const revokedList = await listMaterialShareLinks({ status: 'revoked', now });
  assert.equal(revokedList.total, 1);
  assert.equal(revokedList.items[0]?.effectiveStatus, 'revoked');

  const botList = await listMaterialShareLinks({ origin: 'bot', now });
  assert.equal(botList.total, 1);

  const page = await listMaterialShareLinks({ page: 2, pageSize: 1, now });
  assert.equal(page.total, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items.length, 1);
});

test('扫码分流：有效 / 过期 / stub / 停用 / 记录不存在 / 链接非法', () => {
  const now = new Date('2026-11-19T12:00:00.000Z');
  const fresh = new Date(now.getTime() - dayMs).toISOString();
  const old = new Date(now.getTime() - 31 * dayMs).toISOString();
  const base = makeFullLink({ id: 'Ab3dE9xQ2k', createdAt: fresh });

  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({ slug: 'road', shareId: base.id, link: base, now }),
    { type: 'material', path: `/services/road-materials?material=${base.id}` },
  );

  const transitLink = makeFullLink({
    id: 'Cd4eF0yR3m',
    createdAt: fresh,
    slug: 'bus-stop-overview',
    kind: 'bus_stop',
    templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID,
  });
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({
      slug: transitLink.slug,
      shareId: transitLink.id,
      link: transitLink,
      now,
    }),
    { type: 'material', path: `/services/transit-materials?material=${transitLink.id}` },
  );

  const expiredLink = makeFullLink({ id: 'Ef5gH1zS4n', createdAt: old });
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({
      slug: 'road',
      shareId: expiredLink.id,
      link: expiredLink,
      now,
    }),
    {
      type: 'template',
      path: `/services/road-materials?template=${ROAD_NAME_DIRECTION_TEMPLATE_ID}&expired=1`,
    },
  );

  const stubLink: MaterialShareLinkRecord = {
    id: 'Gh6jK2aT5p',
    slug: 'road',
    createdAt: old,
    kind: 'road_sign',
    code: 'SH-0000',
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    templateVersion: 1,
    templateTitle: '路牌',
    status: 'active',
    dataSource: 'server',
    origin: 'bot',
    shareImageWatermark: false,
    openCount: 3,
    stub: true,
  };
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({
      slug: 'road',
      shareId: stubLink.id,
      link: stubLink,
      now,
    }),
    {
      type: 'template',
      path: `/services/road-materials?template=${ROAD_NAME_DIRECTION_TEMPLATE_ID}&expired=1`,
    },
  );

  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({
      slug: 'road',
      shareId: base.id,
      link: { ...base, status: 'revoked', revokedAt: fresh, revokedBy: 'admin_1' },
      now,
    }),
    { type: 'revoked' },
  );

  // 记录完全不存在：按 slug 打开同族模板。
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({
      slug: 'metro-station',
      shareId: 'Ij7kL3bU6q',
      now,
    }),
    {
      type: 'template',
      path: `/services/transit-materials?template=${METRO_STATION_NAME_NEW_TEMPLATE_ID}&expired=1`,
    },
  );

  // slug 不认识：回工作台首页。
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({ slug: 'unknown', shareId: 'Ij7kL3bU6q', now }),
    { type: 'invalid', path: '/services/road-materials' },
  );

  // 10 位 ID 非法：按 slug 回到对应工作台首页。
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({ slug: 'road', shareId: 'bad-id', now }),
    { type: 'invalid', path: '/services/road-materials' },
  );
  assert.deepEqual(
    resolveMaterialShareLinkRouteDecision({ slug: 'metro-line', shareId: 'bad', now }),
    { type: 'invalid', path: '/services/transit-materials' },
  );

  // 模板 → slug 的固定映射。
  assert.equal(
    resolveMaterialShareLinkSlug(BUS_STOP_OVERVIEW_TEMPLATE_ID, 'bus_stop'),
    'bus-stop-overview',
  );
  assert.equal(
    resolveMaterialShareLinkSlug('system_material_bus_stop_terminal_realistic', 'bus_stop'),
    'bus-stop-terminal',
  );
  assert.equal(resolveMaterialShareLinkSlug('unknown_template', 'address_sign'), 'building');
});

test('分享图水印：服务端复核一致或已审核草稿才免水印', () => {
  const fields: MaterialTemplateField[] = [
    { key: 'roadName', label: '道路名称', kind: 'text', required: true },
    { key: 'direction', label: '方向', kind: 'text' },
  ];
  const templateId = ROAD_NAME_DIRECTION_TEMPLATE_ID;
  const values = { roadName: '临东大道', direction: '西—东' };
  const base = {
    templateFields: fields,
    templateId,
    templateVersion: 1,
    values,
    dataSource: 'server' as const,
    sourceKind: 'road_coordinate' as const,
  };

  // 服务器来源 + 重新解析一致 → 免水印。
  assert.equal(
    decideMaterialShareImageWatermark({ ...base, serverResolvedValues: { ...values } }),
    false,
  );
  // 重新解析不一致 → 带水印。
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      serverResolvedValues: { ...values, direction: '东—西' },
    }),
    true,
  );
  // 示例线网 / 导入项目即使一致也带水印（只有服务器来源可免）。
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      dataSource: 'sample',
      serverResolvedValues: { ...values },
    }),
    true,
  );
  // 手动内容一律带水印。
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      sourceKind: 'manual',
      serverResolvedValues: { ...values },
    }),
    true,
  );
  // 已审核草稿且字段一致 → 免水印。
  const approvedDraft: Pick<MaterialDraft, 'status' | 'templateId' | 'templateVersion' | 'input'> =
    { status: 'approved', templateId, templateVersion: 1, input: { ...values } };
  assert.equal(
    decideMaterialShareImageWatermark({ ...base, dataSource: 'server', draft: approvedDraft }),
    false,
  );
  // 草稿未审核 / 字段不一致 / 模板版本不一致都带水印。
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      draft: { ...approvedDraft, status: 'pending_review' },
    }),
    true,
  );
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      draft: { ...approvedDraft, input: { ...values, roadName: '临东西路' } },
    }),
    true,
  );
  assert.equal(
    decideMaterialShareImageWatermark({
      ...base,
      draft: { ...approvedDraft, templateVersion: 2 },
    }),
    true,
  );
});

test('sourceRef 反解服务端来源：供「重新解析字段」复核水印', () => {
  assert.deepEqual(parseMaterialShareLinkServerSource({ sourceRef: 'map_location:poi_123' }), {
    kind: 'map_location',
    locationId: 'poi_123',
  });
  assert.deepEqual(
    parseMaterialShareLinkServerSource({
      sourceRef: 'road_coordinate:road_1;source=10.5,-3;install=10,-3',
    }),
    { kind: 'road_coordinate', x: 10.5, z: -3 },
  );
  assert.deepEqual(
    parseMaterialShareLinkServerSource({ sourceRef: 'transit_line:line_1:station_2' }),
    { kind: 'transit_line', lineId: 'line_1', stationSourceId: 'station_2' },
  );
  assert.deepEqual(
    parseMaterialShareLinkServerSource({
      sourceRef: 'transit_station:marker=m1;direction=east;lines=l1,l2;terminal=origin',
    }),
    {
      kind: 'transit_station',
      stationMarkerId: 'm1',
      direction: 'east',
      lineIds: ['l1', 'l2'],
      terminalRole: 'origin',
    },
  );
  // 导入项目需要线网几何，反解不了就按带水印处理。
  assert.equal(
    parseMaterialShareLinkServerSource({
      sourceRef: 'transit_network_project_line:v2;line=line_1;station=node_1',
    }),
    undefined,
  );
  assert.equal(parseMaterialShareLinkServerSource({}), undefined);
});
