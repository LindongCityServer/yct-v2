import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { appPath } from '../../../../lib/app-paths';
import { startYctSessionFromLdpass } from '../../../../lib/auth-workflow';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import {
  encodeYctSessionSnapshot,
  expiredCookieOptions,
  isSecureRequest,
  sessionCookieOptions,
  yctAuthStateCookieName,
  yctSessionCookieName,
} from '../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const accountUrl = new URL(appPath('/account'), request.url);
  const returnedState = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get(yctAuthStateCookieName)?.value;

  if (!returnedState || !storedState || returnedState !== storedState) {
    accountUrl.searchParams.set('auth', 'state_invalid');
    const invalidStateResponse = NextResponse.redirect(accountUrl);
    invalidStateResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
    invalidStateResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
    return invalidStateResponse;
  }

  const config = readRuntimeConfig();
  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    accountUrl.searchParams.set('auth', 'ldpass_not_configured');
    const notConfiguredResponse = NextResponse.redirect(accountUrl);
    notConfiguredResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
    notConfiguredResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
    return notConfiguredResponse;
  }

  try {
    const provider = new LdpassIdentityProvider({
      baseUrl: config.ldpassBaseUrl,
      clientId: config.ldpassClientId,
    });
    const session = await provider.readClientSession({
      clientId: config.ldpassClientId,
      cookieHeader: request.headers.get('cookie') ?? undefined,
    });
    const { snapshot } = await startYctSessionFromLdpass({ session });

    if (!snapshot) {
      accountUrl.searchParams.set('auth', 'session_unavailable');
      const unavailableResponse = NextResponse.redirect(accountUrl);
      unavailableResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
      unavailableResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
      return unavailableResponse;
    }

    accountUrl.searchParams.set('auth', snapshot.authenticated ? 'login_success' : 'readonly');
    const successResponse = NextResponse.redirect(accountUrl);
    successResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
    successResponse.cookies.set(
      yctSessionCookieName,
      encodeYctSessionSnapshot(snapshot),
      sessionCookieOptions(isSecureRequest(request.nextUrl)),
    );
    return successResponse;
  } catch {
    accountUrl.searchParams.set('auth', 'session_error');
    const errorResponse = NextResponse.redirect(accountUrl);
    errorResponse.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
    errorResponse.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
    return errorResponse;
  }
}
