import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { findActiveAdminByLdpassUserId } from '../../../../lib/admin-membership-store';
import { listContentRecords } from '../../../../lib/content-store';
import { listPoiSubmissions } from '../../../../lib/poi-submission-store';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { listServiceEntries } from '../../../../lib/service-entry-store';
import { listTransitDataRevisions } from '../../../../lib/transit-data-store';

interface AccountBadgeSummary {
  kind: 'none' | 'count' | 'dot';
  count: number;
  label: string;
}

interface AccountStatusResponse {
  accountStatus: 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
  username?: string;
  avatarUrl?: string | null;
  badge: AccountBadgeSummary;
  admin?: {
    role: 'admin' | 'super_admin';
    pendingReviewCount: number;
    pendingReview: {
      contents: number;
      services: number;
      transit: number;
      poi: number;
    };
  };
  message?: string;
}

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return NextResponse.json({
      accountStatus: 'not_configured',
      badge: {
        kind: 'dot',
        count: 0,
        label: '临东通登录尚未配置',
      },
      message: 'LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。',
    } satisfies AccountStatusResponse);
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

    if (!session.authenticated || (!session.user && !session.readonlyUser)) {
      return NextResponse.json({
        accountStatus: 'anonymous',
        badge: {
          kind: 'none',
          count: 0,
          label: '未登录',
        },
      } satisfies AccountStatusResponse);
    }

    if (session.user) {
      const membership = await findActiveAdminByLdpassUserId(session.user.id);
      const pendingReview = membership ? await readAdminPendingReviewSummary() : undefined;
      const pendingReviewCount = pendingReview
        ? pendingReview.contents +
          pendingReview.services +
          pendingReview.transit +
          pendingReview.poi
        : 0;

      return NextResponse.json({
        accountStatus: 'active',
        username: session.user.username,
        avatarUrl: session.user.avatarUrl ?? session.user.avatarFallbackUrl,
        badge:
          pendingReviewCount > 0
            ? {
                kind: 'count',
                count: pendingReviewCount,
                label: `${pendingReviewCount} 个管理员待办`,
              }
            : {
                kind: 'none',
                count: 0,
                label: '已登录',
              },
        admin: membership
          ? {
              role: membership.role,
              pendingReviewCount,
              pendingReview: pendingReview ?? {
                contents: 0,
                services: 0,
                transit: 0,
                poi: 0,
              },
            }
          : undefined,
      } satisfies AccountStatusResponse);
    }

    const readonlyUser = session.readonlyUser;
    if (!readonlyUser) {
      return NextResponse.json({
        accountStatus: 'anonymous',
        badge: {
          kind: 'none',
          count: 0,
          label: '未登录',
        },
      } satisfies AccountStatusResponse);
    }

    return NextResponse.json({
      accountStatus: 'readonly',
      username: readonlyUser.username,
      avatarUrl: readonlyUser.avatarUrl ?? readonlyUser.avatarFallbackUrl,
      badge: {
        kind: 'dot',
        count: 0,
        label: '只读账号',
      },
      message: `临东通账号状态为 ${readonlyUser.status}。`,
    } satisfies AccountStatusResponse);
  } catch {
    return NextResponse.json(
      {
        accountStatus: 'unavailable',
        badge: {
          kind: 'dot',
          count: 0,
          label: '账号状态暂不可用',
        },
        message: '无法读取临东通会话。',
      } satisfies AccountStatusResponse,
      { status: 502 },
    );
  }
}

async function readAdminPendingReviewSummary(): Promise<{
  contents: number;
  services: number;
  transit: number;
  poi: number;
}> {
  const [contents, services, transit, poi] = await Promise.all([
    listContentRecords(),
    listServiceEntries(),
    listTransitDataRevisions(),
    listPoiSubmissions(),
  ]);

  return {
    contents: contents.filter((record) => record.revision.status === 'pending_review').length,
    services: services.filter((entry) => entry.status === 'pending_review').length,
    transit: transit.filter((revision) => revision.status === 'pending_review').length,
    poi: poi.filter((submission) => submission.status === 'pending_review').length,
  };
}
