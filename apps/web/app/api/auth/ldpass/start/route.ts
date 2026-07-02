import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { appPath } from '../../../../../lib/app-paths';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';
import {
  authStateCookieOptions,
  createLdpassState,
  isSecureRequest,
  yctAuthStateCookieName,
} from '../../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  const accountUrl = new URL(appPath('/account'), request.url);

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    accountUrl.searchParams.set('auth', 'ldpass_not_configured');
    return NextResponse.redirect(accountUrl);
  }

  const state = createLdpassState();
  const redirectUri = new URL(appPath('/auth/ldpass/callback'), request.nextUrl.origin).toString();
  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });

  const loginUrl = await provider.buildLoginUrl({
    redirectUri,
    state,
  });
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(
    yctAuthStateCookieName,
    state,
    authStateCookieOptions(isSecureRequest(request.nextUrl)),
  );
  return response;
}
