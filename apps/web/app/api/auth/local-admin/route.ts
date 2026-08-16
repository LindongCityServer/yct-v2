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
  if (origin && origin !== request.nextUrl.origin) {
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
  const accountUrl = new URL(appPath('/account'), request.nextUrl.origin);
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
