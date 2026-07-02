import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import type { YctAdminMembership } from '@yct/contracts';
import { findActiveAdminByLdpassUserId } from './admin-membership-store';
import { readRuntimeConfig } from './runtime-config';

export type AdminAuthResult =
  | {
      ok: true;
      ldpassUserId: string;
      username: string;
      membership: YctAdminMembership;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireYctAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const config = readRuntimeConfig();

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'ldpass_not_configured',
          message: '后台需要先配置 LDPASS_BASE_URL 与 LDPASS_CLIENT_ID。',
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

    const membership = await findActiveAdminByLdpassUserId(session.user.id);
    if (!membership) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'forbidden',
            message: '当前临东通账号不是雨城通管理员。',
          },
          { status: 403 },
        ),
      };
    }

    return {
      ok: true,
      ldpassUserId: session.user.id,
      username: session.user.username,
      membership,
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
