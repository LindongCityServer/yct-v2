import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import {
  expiredCookieOptions,
  yctAuthStateCookieName,
  yctSessionCookieName,
} from '../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const accountUrl = new URL(appPath('/account'), request.url);
  accountUrl.searchParams.set('auth', 'logged_out');
  const response = NextResponse.redirect(accountUrl);
  response.cookies.set(yctAuthStateCookieName, '', expiredCookieOptions());
  response.cookies.set(yctSessionCookieName, '', expiredCookieOptions());
  return response;
}
