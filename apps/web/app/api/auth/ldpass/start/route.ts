import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { appPath } from '../../../../../lib/app-paths';
import { markResponseNoStore } from '../../../../../lib/http-cache';
import { isSecureNextRequest, resolvePublicSiteOrigin } from '../../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';
import {
  authStateCookieOptions,
  createLdpassState,
  yctAuthReturnOriginCookieName,
  yctAuthStateCookieName,
  yctEmbedCookieName,
} from '../../../../../lib/yct-session';

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  const publicSiteOrigin = resolvePublicSiteOrigin(request, config.siteUrl);
  const accountUrl = new URL(
    appPath('/account'),
    publicSiteOrigin.endsWith('/') ? publicSiteOrigin : `${publicSiteOrigin}/`,
  );

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    accountUrl.searchParams.set('auth', 'ldpass_not_configured');
    return markResponseNoStore(NextResponse.redirect(accountUrl));
  }

  const state = createLdpassState();
  const redirectBaseUrl = publicSiteOrigin;
  const publicSiteUrl = redirectBaseUrl.endsWith('/') ? redirectBaseUrl : `${redirectBaseUrl}/`;
  const redirectUri = new URL(appPath('/auth/ldpass/callback'), publicSiteUrl).toString();
  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });

  const loginUrl = await provider.buildLoginUrl({
    redirectUri,
    state,
  });

  const secure = isSecureNextRequest(request);
  const response = markResponseNoStore(NextResponse.redirect(loginUrl));
  response.cookies.set(yctAuthStateCookieName, state, authStateCookieOptions(secure));
  response.cookies.set(
    yctAuthReturnOriginCookieName,
    publicSiteOrigin,
    authStateCookieOptions(secure),
  );
  if (request.nextUrl.searchParams.get('embed') === '1') {
    // 嵌入模式的顶层弹窗登录：
    // 回调页看到这枚标记就改走 postMessage 完成页，而不是 302 回账号页。
    response.cookies.set(yctEmbedCookieName, '1', authStateCookieOptions(secure));
  }
  return response;
}
