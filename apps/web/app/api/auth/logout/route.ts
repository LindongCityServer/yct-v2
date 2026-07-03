import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { endYctSession } from '../../../../lib/auth-workflow';
import {
  expiredCookieOptions,
  parseYctSessionSnapshot,
  yctAuthStateCookieName,
  yctSessionCookieName,
} from '../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const accountUrl = new URL(appPath('/account'), request.url);
  accountUrl.searchParams.set('auth', 'logged_out');
  await endYctSession({
    snapshot: parseYctSessionSnapshot(request.cookies.get(yctSessionCookieName)?.value),
    reason: 'user_logout',
  });
  const response = NextResponse.redirect(accountUrl);
  response.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
  response.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
  return response;
}
