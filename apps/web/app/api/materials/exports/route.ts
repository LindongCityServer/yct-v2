import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { materialExportRequestSchema } from '@yct/schemas';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { prepareMaterialExport } from '../../../../lib/material-workflow';
import { consumeMaterialExportRateLimit } from '../../../../lib/material-export-rate-limit';
import { resolveClientIp } from '../../../../lib/request-client-ip';
import { resolveClientIpLocation } from '../../../../lib/client-ip-location';
import { yctEmbedSessionCookieName, yctSessionCookieName } from '../../../../lib/yct-session';

export async function POST(request: NextRequest) {
  // 先解析请求体：匿名通道需要在鉴权前判断模式，非法 JSON 也必须回 400 而不是 500。
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_material_export', message: '物料导出参数不符合要求。' },
      { status: 400 },
    );
  }
  const parsed = materialExportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_export',
        message: '物料导出参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const user = await requireActiveLdpassUser(request);
  const ipAddress = resolveClientIp(request.headers);
  // 带会话却被拒（过期、嵌入跨域等）时按原错误返回，不能降级成匿名通道。
  const hasSessionCookie = Boolean(
    request.cookies.get(yctSessionCookieName)?.value ||
    request.cookies.get(yctEmbedSessionCookieName)?.value,
  );
  // 未登录只放行「文本未修改的地铁导视」这一种手动物料；其余模式仍按原逻辑要求登录。
  if (!user.ok && (hasSessionCookie || parsed.data.mode !== 'manual')) {
    return user.response;
  }
  // 标准清晰度通道：未登录或未验证服务器账号。允许导出未修改文本的导视，但压到 128 px/m 以内。
  const standardTier = !user.ok || !user.serverAccountVerified;
  if (standardTier && parsed.data.mode === 'manual') {
    // 登录用户按账号限流，避免同一出口 IP 下的其他玩家被连坐。
    const limitKey = user.ok ? `user:${user.ldpassUserId}` : `ip:${ipAddress || 'unknown'}`;
    const limit = consumeMaterialExportRateLimit(limitKey);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'material_export_rate_limited',
          message: `未登录下载过于频繁，请 ${limit.retryAfterSeconds} 秒后再试。`,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }
  }
  const actorId = user.ok
    ? user.ldpassUserId
    : // 匿名审计按 IP 哈希记录，既能追溯来源又不直接落明文地址。
      `anonymous:${createHash('sha256')
        .update(ipAddress || 'unknown')
        .digest('hex')
        .slice(0, 16)}`;
  const actorName = user.ok ? user.username : '未登录用户';
  const ipLocation = await resolveClientIpLocation(ipAddress);
  const result = await prepareMaterialExport({
    request: parsed.data,
    actorId,
    actorName,
    ipAddress,
    ipLocation,
    serverAccountVerified: user.ok ? user.serverAccountVerified : false,
    standardTier,
    actorType: user.ok ? 'user' : 'anonymous',
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  if (!result.png || !result.fileName) {
    return NextResponse.json(
      { error: 'material_export_unavailable', message: '物料导出结果不可用。' },
      { status: 500 },
    );
  }
  return new NextResponse(new Uint8Array(result.png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      'Cache-Control': 'no-store',
      'X-Yct-Material-Export-Id': result.audit?.id ?? '',
    },
  });
}
