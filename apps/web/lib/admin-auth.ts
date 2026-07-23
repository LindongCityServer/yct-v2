import { NextRequest, NextResponse } from 'next/server';
import type { YctAdminMembership, YctUserLink } from '@yct/contracts';
import { resolveYctAdminMembershipForLdpassUser } from './admin-identity';
import { ensureYctUserLinkForLdpassSession } from './auth-workflow';
import { createTimedKeyedCache } from './server-cache';
import { readYctServerSession } from './yct-server-session-store';
import { yctSessionCookieName } from './yct-session';

const adminUserLinkCache = createTimedKeyedCache<YctUserLink | undefined>(60_000, 128);

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

    const membership = await resolveYctAdminMembershipForLdpassUser(session.user);
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

    const userLinkCacheKey = [
      session.user.id,
      session.user.username,
      session.user.email ?? '',
      session.user.serverAccountVerified ? '1' : '0',
    ].join('|');
    await adminUserLinkCache.read(userLinkCacheKey, () =>
      ensureYctUserLinkForLdpassSession(session),
    );

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
