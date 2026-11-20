import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listMaterialShareLinks } from '../../../../../lib/material-share-link-workflow';
import { parseAdminMaterialShareLinksQuery, toAdminMaterialShareLinkItem } from './share-link-view';

export const runtime = 'nodejs';

/**
 * 物料后台「分享记录」列表。
 *
 * 查询参数：`q`（编号 / 短链 ID / 模板名）、`kind`、`status`、`source`、`origin`、`page`；
 * 默认按创建时间倒序、每页 50 条。返回已合并派生状态的扁平结构，前端不用自己算过期。
 */
export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = parseAdminMaterialShareLinksQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, message: parsed.message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    const result = await listMaterialShareLinks(parsed.query);
    return NextResponse.json(
      {
        items: result.items.map(toAdminMaterialShareLinkItem),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        error: 'material_share_link_list_unavailable',
        message: '分享记录暂时不可用，请稍后重试。',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
