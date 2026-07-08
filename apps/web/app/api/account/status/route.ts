import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { findActiveAdminByLdpassUserId } from '../../../../lib/admin-membership-store';
import { listContentAssetRecords } from '../../../../lib/content-asset-store';
import { listContentRecords } from '../../../../lib/content-store';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { listPoiSubmissions } from '../../../../lib/poi-submission-store';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { listServiceEntries } from '../../../../lib/service-entry-store';
import { countPendingTicketOrdersForLdpassUser } from '../../../../lib/ticket-order-workflow';
import { listTransitDataRevisions } from '../../../../lib/transit-data-store';
import { buildMinotarAvatarUrl, resolveYctAvatarUrl } from '../../../../lib/yct-session';

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
      contentAssets: number;
      services: number;
      transit: number;
      poi: number;
    };
  };
  ticketing?: {
    pendingOrderCount: number;
  };
  message?: string;
}

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();

  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return markResponseNoStore(
      NextResponse.json({
        accountStatus: 'not_configured',
        badge: {
          kind: 'dot',
          count: 0,
          label: '临东通登录尚未配置',
        },
        message: 'LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。',
      } satisfies AccountStatusResponse),
    );
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
      return markResponseNoStore(
        NextResponse.json({
          accountStatus: 'anonymous',
          badge: {
            kind: 'none',
            count: 0,
            label: '未登录',
          },
        } satisfies AccountStatusResponse),
      );
    }

    if (session.user) {
      const membership = await findActiveAdminByLdpassUserId(session.user.id);
      const [pendingReview, pendingTicketOrderCount] = await Promise.all([
        membership ? readAdminPendingReviewSummary() : undefined,
        countPendingTicketOrdersForLdpassUser(session.user.id),
      ]);
      const pendingReviewCount = pendingReview
        ? pendingReview.contents +
          pendingReview.contentAssets +
          pendingReview.services +
          pendingReview.transit +
          pendingReview.poi
        : 0;
      const totalBadgeCount = pendingReviewCount + pendingTicketOrderCount;
      const badgeLabels = [
        pendingReviewCount > 0 ? `${pendingReviewCount} 个管理员待办` : undefined,
        pendingTicketOrderCount > 0 ? `${pendingTicketOrderCount} 个待处理票务订单` : undefined,
      ].filter(Boolean);

      return markResponseNoStore(
        NextResponse.json({
          accountStatus: 'active',
          username: session.user.username,
          avatarUrl: resolveYctAvatarUrl({
            avatarFallbackUrl: session.user.avatarFallbackUrl,
            avatarUrl: session.user.avatarUrl,
            minotarUrl: buildMinotarAvatarUrl(
              session.user.serverAccountName ?? session.user.username,
            ),
          }),
          badge:
            totalBadgeCount > 0
              ? {
                  kind: 'count',
                  count: totalBadgeCount,
                  label: badgeLabels.join('，'),
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
                  contentAssets: 0,
                  services: 0,
                  transit: 0,
                  poi: 0,
                },
              }
            : undefined,
          ticketing: {
            pendingOrderCount: pendingTicketOrderCount,
          },
        } satisfies AccountStatusResponse),
      );
    }

    const readonlyUser = session.readonlyUser;
    if (!readonlyUser) {
      return markResponseNoStore(
        NextResponse.json({
          accountStatus: 'anonymous',
          badge: {
            kind: 'none',
            count: 0,
            label: '未登录',
          },
        } satisfies AccountStatusResponse),
      );
    }

    return markResponseNoStore(
      NextResponse.json({
        accountStatus: 'readonly',
        username: readonlyUser.username,
        avatarUrl: resolveYctAvatarUrl({
          avatarFallbackUrl: readonlyUser.avatarFallbackUrl,
          avatarUrl: readonlyUser.avatarUrl,
          minotarUrl: buildMinotarAvatarUrl(readonlyUser.username),
        }),
        badge: {
          kind: 'dot',
          count: 0,
          label: '只读账号',
        },
        message: `临东通账号状态为 ${readonlyUser.status}。`,
      } satisfies AccountStatusResponse),
    );
  } catch {
    return markResponseNoStore(
      NextResponse.json(
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
      ),
    );
  }
}

async function readAdminPendingReviewSummary(): Promise<{
  contents: number;
  contentAssets: number;
  services: number;
  transit: number;
  poi: number;
}> {
  const [contents, contentAssets, services, transit, poi] = await Promise.all([
    listContentRecords(),
    listContentAssetRecords(),
    listServiceEntries(),
    listTransitDataRevisions(),
    listPoiSubmissions(),
  ]);

  return {
    contents: contents.filter((record) => record.revision.status === 'pending_review').length,
    contentAssets: contentAssets.filter((record) => record.asset.status === 'pending_review')
      .length,
    services: services.filter((entry) => entry.status === 'pending_review').length,
    transit: transit.filter((revision) => revision.status === 'pending_review').length,
    poi: poi.filter((submission) => submission.status === 'pending_review').length,
  };
}
