import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import {
  findMaterialShareLinkById,
  isValidMaterialShareLinkId,
  resolveMaterialShareLinkRouteDecision,
  touchMaterialShareLinkOpen,
} from '../../../../lib/material-share-link-workflow';
import { resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export const runtime = 'nodejs';

/**
 * 物料分享短链落地：`/m/<slug>/<10 位短 ID>`。
 *
 * - 有效记录 → 302 到工作台并用 ?material=<id> 载入字段与画布；
 * - 过期 / stub / 记录不存在 → 302 到 ?template=<templateId>&expired=1，按 slug 打开同族模板；
 * - 已停用 → 410 页面，不进入编辑器；
 * - 链接非法 → 回工作台首页。
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; shareId: string }> },
) {
  const { slug, shareId } = await context.params;
  const publicSiteOrigin = resolvePublicSiteOrigin(request, readRuntimeConfig().siteUrl);
  const link = isValidMaterialShareLinkId(shareId)
    ? await findMaterialShareLinkById(shareId)
    : undefined;
  const decision = resolveMaterialShareLinkRouteDecision({ slug, shareId, link });

  if (decision.type === 'revoked') {
    return revokedMaterialShareLinkResponse(appPath('/services/road-materials'));
  }
  if (decision.type === 'material') {
    // 命中有效记录才计扫码次数；停用 / 过期 / stub 不计数。
    await touchMaterialShareLinkOpen(shareId);
  }
  return NextResponse.redirect(new URL(appPath(decision.path), publicSiteOrigin), 302);
}

function revokedMaterialShareLinkResponse(workbenchPath: string): NextResponse {
  const body = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>物料分享链接已停用 · 雨城通</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f8;color:#1f2937;font-family:'HarmonyOS Sans SC','PingFang SC','Microsoft YaHei',sans-serif;">
<main style="max-width:32rem;padding:2rem;text-align:center;">
<p style="font-size:2rem;margin:0 0 1rem;">🚫</p>
<h1 style="font-size:1.25rem;margin:0 0 .75rem;">这份物料链接已被管理员停用</h1>
<p style="margin:0 0 1.5rem;color:#4b5563;line-height:1.7;">停用是主动处置，链接不会自动打开编辑器。如需继续，请联系管理员恢复，或重新生成一份物料。</p>
<p style="margin:0;"><a href="${workbenchPath}" style="color:#0f766e;">前往物料工作台</a></p>
</main>
</body>
</html>`;
  return new NextResponse(body, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
