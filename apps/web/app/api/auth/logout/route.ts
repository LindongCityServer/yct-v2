import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { endYctSession } from '../../../../lib/auth-workflow';
import { isSecureNextRequest, resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import {
  expiredCookieOptions,
  parseYctSessionSnapshot,
  yctAuthReturnOriginCookieName,
  yctAuthStateCookieName,
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
  await endYctSession({
    snapshot: parseYctSessionSnapshot(request.cookies.get(yctSessionCookieName)?.value),
    reason: 'user_logout',
  });
  const response = NextResponse.redirect(accountUrl);
  const secure = isSecureNextRequest(request);
  response.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions(secure));
  response.cookies.set(yctAuthReturnOriginCookieName, '', expiredCookieOptions(secure));
  response.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
  return response;
}
