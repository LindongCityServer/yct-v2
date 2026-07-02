import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { readRuntimeConfig } from './runtime-config';

export type WritableUserAuthResult =
  | {
      ok: true;
      ldpassUserId: string;
      username: string;
      serverAccountName?: string | null;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireVerifiedLdpassUser(
  request: NextRequest,
): Promise<WritableUserAuthResult> {
  const config = readRuntimeConfig();

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'ldpass_not_configured',
          message: '投稿需要先配置 LDPASS_BASE_URL 与 LDPASS_CLIENT_ID。',
        },
        { status: 503 },
      ),
    };
  }

  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });

  try {
    const session = await provider.readClientSession({
      clientId: config.ldpassClientId,
      cookieHeader: request.headers.get('cookie') ?? undefined,
    });

    if (!session.authenticated || !session.user) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'unauthorized',
            message: '需要先使用临东通登录。',
          },
          { status: 401 },
        ),
      };
    }

    if (!session.user.serverAccountVerified) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'server_account_not_verified',
            message: '投稿公开 POI 需要先验证服务器账号。',
          },
          { status: 403 },
        ),
      };
    }

    return {
      ok: true,
      ldpassUserId: session.user.id,
      username: session.user.username,
      serverAccountName: session.user.serverAccountName,
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'ldpass_session_unavailable',
          message: '无法读取临东通会话。',
        },
        { status: 502 },
      ),
    };
  }
}
