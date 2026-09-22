import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { endYctSession } from '../../../../lib/auth-workflow';
import { markResponseNoStore } from '../../../../lib/http-cache';
import {
  isSameOriginDocumentRequest,
  isSecureNextRequest,
  resolvePublicSiteOrigin,
} from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import {
  deleteYctServerSession,
  readYctServerSession,
} from '../../../../lib/yct-server-session-store';
import {
  expiredCookieOptions,
  resolveYctSessionCookie,
  writeYctSessionCookies,
  yctAuthReturnOriginCookieName,
  yctAuthStateCookieName,
  yctEmbedSessionCookieName,
  yctSessionCookieName,
} from '../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  const publicSiteOrigin = resolvePublicSiteOrigin(request, config.siteUrl);
  const accountUrl = new URL(
    appPath('/account'),
    publicSiteOrigin.endsWith('/') ? publicSiteOrigin : `${publicSiteOrigin}/`,
  );
  accountUrl.searchParams.set('auth', 'logged_out');

  const { sessionId, fromEmbeddedCookie } = resolveYctSessionCookie({
    standardSessionId: request.cookies.get(yctSessionCookieName)?.value,
    embeddedSessionId: request.cookies.get(yctEmbedSessionCookieName)?.value,
  });

  // 嵌入会话 Cookie 是 SameSite=None，会被任何跨站页面带着发起请求，
  // 因此登出这类有副作用的入口同样要求发起方文档就是本站。
  if (fromEmbeddedCookie && !isSameOriginDocumentRequest(request, config.siteUrl)) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'cross_site_request_blocked',
          message: '嵌入会话只能由本站页面发起登出。',
        },
        { status: 403 },
      ),
    );
  }

  const serverSession = await readYctServerSession(sessionId);
  await endYctSession({
    snapshot: serverSession?.snapshot,
    reason: 'user_logout',
  });
  await deleteYctServerSession(sessionId);
  const response = NextResponse.redirect(accountUrl);
  const secure = isSecureNextRequest(request);
  response.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
  response.cookies.set(yctAuthReturnOriginCookieName, '', expiredCookieOptions(secure));
  // 两枚会话 Cookie 一起清：跨站响应写不回 Lax 那枚也无妨，
  // 服务端会话已删除，残留的 Cookie 读不到任何会话。
  writeYctSessionCookies(response, { secure, embed: true });
  return response;
}
