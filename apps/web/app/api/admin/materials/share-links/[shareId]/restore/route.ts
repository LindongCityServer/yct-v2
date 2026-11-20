import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import {
  getMaterialShareLinkEffectiveStatus,
  isMaterialShareLinkExpired,
  isValidMaterialShareLinkId,
  restoreMaterialShareLink,
} from '../../../../../../../lib/material-share-link-workflow';
import { toAdminMaterialShareLinkItem } from '../../share-link-view';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    shareId: string;
  }>;
}

/** 恢复一条被停用的物料分享链接：恢复后若仍超过 30 天有效期，状态是已过期。 */
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
    const result = await restoreMaterialShareLink({
      shareId,
      restoredBy: admin.ldpassUserId,
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
          ? `已恢复分享链接 ${result.link.code || result.link.id}。`
          : '该分享链接当前未被停用。',
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
      { error: 'material_share_link_restore_failed', message: '恢复分享链接失败，请稍后重试。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
