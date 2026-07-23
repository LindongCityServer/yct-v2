import { NextRequest, NextResponse } from 'next/server';
import { resolveYctAdminMembershipForLdpassUser } from '../../../../lib/admin-identity';
import { readAdminPendingReviewSummary } from '../../../../lib/admin-pending-review-summary';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { countPendingTicketOrdersForLdpassUser } from '../../../../lib/ticket-order-workflow';
import { readYctServerSession } from '../../../../lib/yct-server-session-store';
import { yctSessionCookieName } from '../../../../lib/yct-session';

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

  try {
    const serverSession = await readYctServerSession(
      request.cookies.get(yctSessionCookieName)?.value,
    );
    if (!serverSession) {
      const configured = Boolean(config.ldpassBaseUrl && config.ldpassClientId);
      return markResponseNoStore(
        NextResponse.json({
          accountStatus: configured ? 'anonymous' : 'not_configured',
          badge: configured
            ? {
                kind: 'none',
                count: 0,
                label: '未登录',
              }
            : {
                kind: 'dot',
                count: 0,
                label: '临东通登录尚未配置',
              },
          message: configured ? undefined : 'LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。',
        } satisfies AccountStatusResponse),
      );
    }
    const session = serverSession.ldpassSession;

    if (!session.user && !session.readonlyUser) {
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

    if (session.authenticated && session.user) {
      const identity = serverSession.snapshot.user;
      const membership = await resolveYctAdminMembershipForLdpassUser(session.user);
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
          username: identity?.username ?? session.user.username,
          avatarUrl: identity?.avatarUrl,
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
    const readonlyIdentity = serverSession.snapshot.readonlyUser;
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
        username: readonlyIdentity?.username ?? readonlyUser.username,
        avatarUrl: readonlyIdentity?.avatarUrl,
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
