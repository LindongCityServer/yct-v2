import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { appPath } from '../../../../lib/app-paths';
import { startYctSessionFromLdpass } from '../../../../lib/auth-workflow';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { isSecureNextRequest, resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import {
  encodeYctSessionSnapshot,
  expiredCookieOptions,
  normalizeStoredReturnOrigin,
  sessionCookieOptions,
  yctAuthReturnOriginCookieName,
  yctAuthStateCookieName,
  yctSessionCookieName,
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

  if (!returnedState || !storedState || returnedState !== storedState) {
    accountUrl.searchParams.set('auth', 'state_invalid');
    const invalidStateResponse = NextResponse.redirect(accountUrl);
    invalidStateResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
    invalidStateResponse.cookies.set(
      yctAuthReturnOriginCookieName,
      '',
      expiredCookieOptions(secure),
    );
    invalidStateResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
    return markResponseNoStore(invalidStateResponse);
  }

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    accountUrl.searchParams.set('auth', 'ldpass_not_configured');
    const notConfiguredResponse = NextResponse.redirect(accountUrl);
    notConfiguredResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
    notConfiguredResponse.cookies.set(
      yctAuthReturnOriginCookieName,
      '',
      expiredCookieOptions(secure),
    );
    notConfiguredResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
    return markResponseNoStore(notConfiguredResponse);
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
      accountUrl.searchParams.set(
        'auth',
        resolveUnavailableSessionStatus(publicSiteOrigin, cookieHeader),
      );
      const unavailableResponse = NextResponse.redirect(accountUrl);
      unavailableResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
      unavailableResponse.cookies.set(
        yctAuthReturnOriginCookieName,
        '',
        expiredCookieOptions(secure),
      );
      unavailableResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
      return markResponseNoStore(unavailableResponse);
    }

    accountUrl.searchParams.set('auth', snapshot.authenticated ? 'login_success' : 'readonly');
    const successResponse = NextResponse.redirect(accountUrl);
    successResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
    successResponse.cookies.set(
      yctAuthReturnOriginCookieName,
      '',
      expiredCookieOptions(secure),
    );
    successResponse.cookies.set(
      yctSessionCookieName,
      encodeYctSessionSnapshot(snapshot),
      sessionCookieOptions(secure),
    );
    return markResponseNoStore(successResponse);
  } catch {
    accountUrl.searchParams.set('auth', 'session_error');
    const errorResponse = NextResponse.redirect(accountUrl);
    errorResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
    errorResponse.cookies.set(
      yctAuthReturnOriginCookieName,
      '',
      expiredCookieOptions(secure),
    );
    errorResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
    return markResponseNoStore(errorResponse);
  }
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
