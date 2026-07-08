import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { markResponseNoStore } from '../../../../../lib/http-cache';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';
import { yctSessionCookieName } from '../../../../../lib/yct-session';

const ldpassSessionCookieName = 'ldpass_session';

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'ldpass_not_configured',
          message: 'LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。',
        },
        { status: 503 },
      ),
    );
  }

  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });
  const cookieHeader = request.headers.get('cookie') ?? undefined;
  const diagnostics = buildCookieDiagnostics(cookieHeader);

  try {
    const session = await provider.readClientSession({
      clientId: config.ldpassClientId,
      cookieHeader,
    });

    return markResponseNoStore(
      NextResponse.json({
        ...session,
        yctDiagnostics: {
          ...diagnostics,
          note: session.authenticated
            ? 'YCT 已通过当前请求 Cookie 读取到临东通有效会话。'
            : diagnostics.ldpassSessionCookiePresent
              ? 'YCT 已收到 ldpass_session，但临东通未返回有效 Active 用户；请检查账号状态、client_id 或会话是否过期。'
              : 'YCT 当前请求没有收到 ldpass_session；如果浏览器已登录临东通，请优先检查临东通生产环境 Cookie 是否共享到 .shangxiaoguan.top。',
        },
      }),
    );
  } catch {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'ldpass_session_unavailable',
          message: '无法读取 ldpass 会话。',
          yctDiagnostics: diagnostics,
        },
        { status: 502 },
      ),
    );
  }
}

function buildCookieDiagnostics(cookieHeader: string | undefined): {
  requestHadCookieHeader: boolean;
  receivedCookieCount: number;
  ldpassSessionCookiePresent: boolean;
  yctSessionCookiePresent: boolean;
} {
  const cookieNames = parseCookieNames(cookieHeader);
  return {
    requestHadCookieHeader: Boolean(cookieHeader),
    receivedCookieCount: cookieNames.length,
    ldpassSessionCookiePresent: cookieNames.includes(ldpassSessionCookieName),
    yctSessionCookiePresent: cookieNames.includes(yctSessionCookieName),
  };
}

function parseCookieNames(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name));
}
