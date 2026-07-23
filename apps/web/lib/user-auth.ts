import { NextRequest, NextResponse } from 'next/server';
import { ensureYctUserLinkForLdpassSession } from './auth-workflow';
import { readYctServerSession } from './yct-server-session-store';
import { yctSessionCookieName } from './yct-session';

export type WritableUserAuthResult =
  | {
      ok: true;
      userId: string;
      ldpassUserId: string;
      username: string;
      serverAccountVerified: boolean;
      serverAccountName?: string | null;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireActiveLdpassUser(
  request: NextRequest,
): Promise<WritableUserAuthResult> {
  try {
    const serverSession = await readYctServerSession(
      request.cookies.get(yctSessionCookieName)?.value,
    );
    const session = serverSession?.ldpassSession;

    if (!session?.authenticated || !session.user) {
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

    const userLink = await ensureYctUserLinkForLdpassSession(session);

    return {
      ok: true,
      userId: userLink?.id ?? `yct_user_${session.user.id}`,
      ldpassUserId: session.user.id,
      username: session.user.username,
      serverAccountVerified: session.user.serverAccountVerified,
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

export async function requireVerifiedLdpassUser(
  request: NextRequest,
): Promise<WritableUserAuthResult> {
  const result = await requireActiveLdpassUser(request);
  if (!result.ok) {
    return result;
  }

  if (!result.serverAccountVerified) {
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

  return result;
}
