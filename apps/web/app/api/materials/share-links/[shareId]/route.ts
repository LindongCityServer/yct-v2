import { NextRequest, NextResponse } from 'next/server';
import {
  findMaterialShareLinkById,
  isValidMaterialShareLinkId,
  toMaterialShareLinkPublicView,
} from '../../../../../lib/material-share-link-workflow';

export const runtime = 'nodejs';

/** 公开只读的分享记录（脱敏）：落地页 / 分享图接口按它载入物料。 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!isValidMaterialShareLinkId(shareId)) {
    return NextResponse.json(
      { error: 'material_share_link_not_found', message: '物料分享链接格式不正确。' },
      { status: 404, headers },
    );
  }
  const link = await findMaterialShareLinkById(shareId);
  if (!link) {
    return NextResponse.json(
      { error: 'material_share_link_not_found', message: '物料分享记录不存在或已被清理。' },
      { status: 404, headers },
    );
  }
  // 停用是主动处置，优先于过期兜底：不返回内容，落地页也不进编辑器。
  if (link.status === 'revoked') {
    return NextResponse.json(
      { error: 'material_share_link_revoked', message: '这份物料链接已被管理员停用。' },
      { status: 410, headers },
    );
  }
  return NextResponse.json(toMaterialShareLinkPublicView(link), { headers });
}
