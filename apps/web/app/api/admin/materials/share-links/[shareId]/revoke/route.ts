import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import {
  getMaterialShareLinkEffectiveStatus,
  isMaterialShareLinkExpired,
  isValidMaterialShareLinkId,
  revokeMaterialShareLink,
} from '../../../../../../../lib/material-share-link-workflow';
import { toAdminMaterialShareLinkItem } from '../../share-link-view';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    shareId: string;
  }>;
}

/** 停用一条物料分享链接：扫码不再进入编辑器，返回更新后的记录。 */
export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const { shareId } = await context.params;
  if (!isValidMaterialShareLinkId(shareId)) {
    return NextResponse.json(
      { error: 'material_share_link_not_found', message: '分享记录不存在。' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    const result = await revokeMaterialShareLink({
      shareId,
      revokedBy: admin.ldpassUserId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.status ?? 400 });
    }
    const now = new Date();
    return NextResponse.json(
      {
        ok: true,
        changed: result.changed,
        message: result.changed
          ? `已停用分享链接 ${result.link.code || result.link.id}。`
          : '该分享链接已经是停用状态。',
        item: toAdminMaterialShareLinkItem({
          link: result.link,
          effectiveStatus: getMaterialShareLinkEffectiveStatus(result.link, now),
          expired: isMaterialShareLinkExpired(result.link, now),
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'material_share_link_revoke_failed', message: '停用分享链接失败，请稍后重试。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
