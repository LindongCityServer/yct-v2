import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { readRuntimeConfig } from '../runtime-config';
import { readYctServerSession } from '../yct-server-session-store';
import {
  resolveYctSessionCookie,
  yctEmbedSessionCookieName,
  yctSessionCookieName,
} from '../yct-session';

/** 跨子域共享的匿名设备标识 Cookie，详见 docs/ANALYTICS_PLAN.md 第 5.2 节。 */
export const analyticsClientCookieName = 'shxg_cid';

const clientCookieMaxAgeSeconds = 365 * 24 * 60 * 60;
const clientIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const sessionIdPattern = /^[A-Za-z0-9_-]{8,64}$/;

export interface AnalyticsIdentity {
  clientId: string;
  sessionId: string;
  userId?: string;
  /** 本次是否为新建的匿名标识，调用方据此决定是否下发 Cookie。 */
  issuedClientId: boolean;
}

/**
 * 解析采集请求的身份三元组。
 *
 * 优先级：服务端 Cookie → 请求体携带值 → 新生成。
 * 登录态只做归并，不作为上报的前置条件。
 */
export async function resolveAnalyticsIdentity(input: {
  request: NextRequest;
  clientIdFromBody?: string;
  sessionIdFromBody?: string;
}): Promise<AnalyticsIdentity> {
  const cookieClientId = input.request.cookies.get(analyticsClientCookieName)?.value?.trim();
  const bodyClientId = input.clientIdFromBody?.trim();
  const resolvedClientId = [cookieClientId, bodyClientId].find((value): value is string =>
    Boolean(value && clientIdPattern.test(value)),
  );

  const bodySessionId = input.sessionIdFromBody?.trim();
  const sessionId =
    bodySessionId && sessionIdPattern.test(bodySessionId)
      ? bodySessionId
      : randomUUID().replace(/-/g, '');

  return {
    clientId: resolvedClientId ?? randomUUID().replace(/-/g, ''),
    sessionId,
    userId: await resolveOptionalUserId(input.request),
    issuedClientId: !resolvedClientId,
  };
}

/** 写入匿名标识 Cookie。生产环境需要跨站 iframe 与跨子域可用，因此使用 SameSite=None。 */
export function writeAnalyticsClientCookie(
  response: NextResponse,
  input: { clientId: string; secure: boolean },
): void {
  const config = readRuntimeConfig();
  response.cookies.set(analyticsClientCookieName, input.clientId, {
    httpOnly: true,
    sameSite: input.secure ? 'none' : 'lax',
    secure: input.secure,
    path: '/',
    maxAge: clientCookieMaxAgeSeconds,
    domain: resolveAnalyticsCookieDomain(config.siteUrl),
  });
}

/**
 * 从站点地址推导父域，使 yct 与 ldpass 子域共享同一个匿名标识。
 * IP 地址与单段主机名不设置 Domain。
 */
export function resolveAnalyticsCookieDomain(siteUrl: string): string | undefined {
  try {
    const hostname = new URL(siteUrl).hostname;
    if (!hostname || hostname === 'localhost') {
      return undefined;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
      return undefined;
    }

    const parts = hostname.split('.');
    return parts.length >= 3 ? `.${parts.slice(-2).join('.')}` : undefined;
  } catch {
    return undefined;
  }
}

async function resolveOptionalUserId(request: NextRequest): Promise<string | undefined> {
  const { sessionId } = resolveYctSessionCookie({
    standardSessionId: request.cookies.get(yctSessionCookieName)?.value,
    embeddedSessionId: request.cookies.get(yctEmbedSessionCookieName)?.value,
  });

  if (!sessionId) {
    return undefined;
  }

  try {
    const serverSession = await readYctServerSession(sessionId);
    return serverSession?.ldpassSession?.user?.id;
  } catch {
    // 统计归并失败不应影响上报，按匿名处理。
    return undefined;
  }
}
