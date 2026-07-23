import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { endYctSession } from '../../../../lib/auth-workflow';
import { isSecureNextRequest, resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import {
  deleteYctServerSession,
  readYctServerSession,
} from '../../../../lib/yct-server-session-store';
import {
  expiredCookieOptions,
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
  const sessionId = request.cookies.get(yctSessionCookieName)?.value;
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
  response.cookies.set(yctSessionCookieName, '', expiredCookieOptions(secure));
  return response;
}
