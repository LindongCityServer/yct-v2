import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { appPath } from '../../../../lib/app-paths';
import { startYctSessionFromLdpass } from '../../../../lib/auth-workflow';
import { renderEmbedAuthCompletePage } from '../../../../lib/embed-auth-complete-page';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { isSecureNextRequest, resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { createYctServerSession } from '../../../../lib/yct-server-session-store';
import {
  expiredCookieOptions,
  normalizeStoredReturnOrigin,
  writeYctSessionCookies,
  yctAuthReturnOriginCookieName,
  yctAuthStateCookieName,
  yctEmbedCookieName,
} from '../../../../lib/yct-session';

const ldpassSessionCookieName = 'ldpass_session';

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  const publicSiteOrigin =
    normalizeStoredReturnOrigin(request.cookies.get(yctAuthReturnOriginCookieName)?.value) ??
    resolvePublicSiteOrigin(request, config.siteUrl);
  const accountUrl = new URL(
    appPath('/account'),
    publicSiteOrigin.endsWith('/') ? publicSiteOrigin : `${publicSiteOrigin}/`,
  );
  const returnedState = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get(yctAuthStateCookieName)?.value;
  const secure = isSecureNextRequest(request);
  const embed = request.cookies.get(yctEmbedCookieName)?.value === '1';

  /**
   * 统一的收尾出口。
   *
   * 普通网页端：302 回账号页并带 `?auth=<status>`，行为与改动前逐字段一致。
   * 嵌入模式：登录是在顶层弹窗里跑的，302 会把用户困在弹窗里，
   * 因此改为渲染极简完成页，由它 postMessage 回 iframe 后自行关闭。
   */
  const finish = (status: string, sessionId?: string): NextResponse => {
    const response = embed
      ? new NextResponse(renderEmbedAuthCompletePage({ status }), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      : NextResponse.redirect(withAuthStatus(accountUrl, status));

    clearTransientCookies(response, secure);
    // 嵌入登录额外写一枚 SameSite=None 的会话 Cookie：
    // iframe 内的请求是跨站子资源请求，Lax 那枚不会被携带。
    writeYctSessionCookies(response, { secure, sessionId, embed });
    return markResponseNoStore(response);
  };

  if (!returnedState || !storedState || returnedState !== storedState) {
    return finish('state_invalid');
  }

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return finish('ldpass_not_configured');
  }

  try {
    const provider = new LdpassIdentityProvider({
      baseUrl: config.ldpassBaseUrl,
      clientId: config.ldpassClientId,
    });
    const cookieHeader = request.headers.get('cookie') ?? undefined;
    const session = await provider.readClientSession({
      clientId: config.ldpassClientId,
      cookieHeader,
    });
    const { snapshot } = await startYctSessionFromLdpass({ session });

    if (!snapshot) {
      return finish(resolveUnavailableSessionStatus(publicSiteOrigin, cookieHeader));
    }

    const yctSession = await createYctServerSession({
      ldpassSession: session,
      snapshot,
    });
    return finish(snapshot.authenticated ? 'login_success' : 'readonly', yctSession.id);
  } catch {
    return finish('session_error');
  }
}

/** 复制一份再挂 `auth` 参数，避免把可变 URL 传出去。 */
function withAuthStatus(accountUrl: URL, status: string): URL {
  const next = new URL(accountUrl.toString());
  next.searchParams.set('auth', status);
  return next;
}

/** 清掉只在登录往返期间有效的三枚 Cookie（含嵌入标记）。 */
function clearTransientCookies(response: NextResponse, secure: boolean): void {
  response.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
  response.cookies.set(yctAuthReturnOriginCookieName, '', expiredCookieOptions(secure));
  response.cookies.set(yctEmbedCookieName, '', expiredCookieOptions(secure));
}

function resolveUnavailableSessionStatus(
  publicSiteOrigin: string,
  cookieHeader: string | undefined,
): string {
  if (isLoopbackPublicOrigin(publicSiteOrigin)) {
    return 'session_unavailable_localhost';
  }

  if (!hasCookie(cookieHeader, ldpassSessionCookieName)) {
    return 'session_cookie_missing';
  }

  return 'session_unavailable';
}

function hasCookie(cookieHeader: string | undefined, name: string): boolean {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((cookie) => cookie.startsWith(`${name}=`));
}

function isLoopbackPublicOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.trim().toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}
