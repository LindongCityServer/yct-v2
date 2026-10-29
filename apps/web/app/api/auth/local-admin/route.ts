import type { LdpassClientSessionResponse } from '@yct/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { initializeSuperAdminMembership } from '../../../../lib/admin-membership-workflow';
import { startYctSessionFromLdpass } from '../../../../lib/auth-workflow';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { createYctServerSession } from '../../../../lib/yct-server-session-store';
import { sessionCookieOptions, yctSessionCookieName } from '../../../../lib/yct-session';

export async function POST(request: NextRequest) {
  const config = readRuntimeConfig();
  if (!config.localAdminAuthEnabled || !isLoopbackHostname(request.nextUrl.hostname)) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'local_admin_auth_disabled',
          message: '本地管理员登录仅在显式启用的本机开发环境可用。',
        },
        { status: 404 },
      ),
    );
  }

  const origin = request.headers.get('origin');
  if (origin && !isLoopbackOrigin(origin, request.nextUrl)) {
    return markResponseNoStore(
      NextResponse.json(
        { error: 'invalid_origin', message: '本地管理员登录请求来源无效。' },
        { status: 403 },
      ),
    );
  }

  const session: LdpassClientSessionResponse = {
    authenticated: true,
    clientApplication: {
      clientId: 'yuchengtong-local-development',
      name: 'Yuchengtong Local Development',
    },
    user: {
      id: config.localAdminUserId,
      username: config.localAdminUsername,
      email: `${config.localAdminUserId}@local.invalid`,
      role: 'super_admin',
      status: 'Active',
      serverAccountName: config.localAdminUsername,
      serverAccountVerified: true,
    },
  };
  const { snapshot, userLink } = await startYctSessionFromLdpass({ session });
  if (!snapshot) {
    return markResponseNoStore(
      NextResponse.json(
        { error: 'local_session_unavailable', message: '无法创建本地管理员会话。' },
        { status: 500 },
      ),
    );
  }

  await initializeSuperAdminMembership({
    ldpassUserId: config.localAdminUserId,
    yctUserId: userLink?.id,
  });
  const serverSession = await createYctServerSession({ ldpassSession: session, snapshot });
  // 开发服务器可能把 nextUrl 解析成 0.0.0.0；优先按浏览器实际来源回跳，避免跳到不可访问的地址。
  const accountUrl = new URL(appPath('/account'), resolveRedirectOrigin(request, origin));
  accountUrl.searchParams.set('auth', 'login_success');
  const response = NextResponse.redirect(accountUrl, 303);
  response.cookies.set(yctSessionCookieName, serverSession.id, sessionCookieOptions(false));
  return markResponseNoStore(response);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  );
}

/**
 * 本地开发里浏览器可能用 localhost 打开页面、而服务端把自己解析成 127.0.0.1（或反向），
 * 直接比较完整 origin 会误判。这里只要求两端都是回环地址且端口一致。
 */
function isLoopbackOrigin(origin: string, requestUrl: URL): boolean {
  try {
    const parsed = new URL(origin);
    return isLoopbackHostname(parsed.hostname) && parsed.port === requestUrl.port;
  } catch {
    return false;
  }
}

function resolveRedirectOrigin(request: NextRequest, origin: string | null): string {
  if (origin) {
    return origin;
  }

  const host = request.headers.get('host');
  if (host) {
    try {
      return new URL(`${request.nextUrl.protocol}//${host}`).origin;
    } catch {
      // 回退到 nextUrl.origin。
    }
  }

  return request.nextUrl.origin;
}
