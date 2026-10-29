import { randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';
import type { LdpassClientSessionResponse, YctAccountSessionSnapshot } from '@yct/contracts';
import { isLocalAdminUser } from './local-admin';

export const yctAuthStateCookieName = 'yct.ldpass_state';
export const yctAuthReturnOriginCookieName = 'yct.ldpass_return_origin';
export const yctSessionCookieName = 'yct.account_snapshot';
/**
 * 嵌入模式专用会话 Cookie。
 *
 * iframe 内的请求虽然是**同源请求**（`Sec-Fetch-Site: same-origin`），但 Cookie 的
 * `SameSite` 判定看的是**顶层站点**：当嵌入宿主与本站跨站时，`SameSite=Lax`
 * 的会话 Cookie 不会随 iframe 内发出的任何请求，表现为「弹窗登录成功但读不到登录态」。
 * 因此嵌入登录额外下发一枚 `SameSite=None` 的会话 Cookie。
 *
 * 刻意不加 `Partitioned`（CHIPS）：分区键取顶层站点，弹窗写入时是本站站点、
 * iframe 读取时是宿主站点，分区不匹配反而永远读不到。
 */
export const yctEmbedSessionCookieName = 'yct.account_snapshot_embed';

/**
 * 标记本次登录由嵌入模式的**顶层弹窗**发起。
 * 回调页据此改走「postMessage 完成页」，而不是 302 回账号页——
 * 因为 302 落在 iframe 里会丢失 state Cookie 的语义。
 */
export const yctEmbedCookieName = 'yct.ldpass_embed';

const authStateMaxAgeSeconds = 10 * 60;
export const yctSessionMaxAgeSeconds = 7 * 24 * 60 * 60;

export function createLdpassState(): string {
  return randomUUID();
}

export function createYctSessionSnapshot(
  session: LdpassClientSessionResponse,
  linkedAt = new Date().toISOString(),
): YctAccountSessionSnapshot | undefined {
  if (session.authenticated && session.user) {
    // 本地管理员没有临东通头像，也不存在可用的 Minotar 皮肤；显式留空，前端回退到 Material Symbol。
    const localAdmin = isLocalAdminUser(session.user);
    const avatarFallbackUrl = localAdmin
      ? undefined
      : buildMinotarAvatarUrl(session.user.serverAccountName ?? session.user.username);
    const avatarUrl = localAdmin
      ? undefined
      : resolveYctAvatarUrl({
          avatarFallbackUrl: session.user.avatarFallbackUrl,
          avatarUrl: session.user.avatarUrl,
          minotarUrl: avatarFallbackUrl,
        });

    return {
      authenticated: true,
      linkedAt,
      user: {
        ldpassUserId: session.user.id,
        username: session.user.username,
        status: session.user.status,
        serverAccountName: session.user.serverAccountName,
        serverAccountVerified: session.user.serverAccountVerified,
        avatarUrl,
        avatarFallbackUrl: localAdmin
          ? undefined
          : (avatarFallbackUrl ?? session.user.avatarFallbackUrl),
      },
    };
  }

  if (session.readonlyUser) {
    const avatarFallbackUrl = buildMinotarAvatarUrl(session.readonlyUser.username);
    const avatarUrl = resolveYctAvatarUrl({
      avatarFallbackUrl: session.readonlyUser.avatarFallbackUrl,
      avatarUrl: session.readonlyUser.avatarUrl,
      minotarUrl: avatarFallbackUrl,
    });

    return {
      authenticated: false,
      linkedAt,
      readonlyUser: {
        ldpassUserId: session.readonlyUser.id,
        username: session.readonlyUser.username,
        status: session.readonlyUser.status,
        avatarUrl,
        avatarFallbackUrl: avatarFallbackUrl ?? session.readonlyUser.avatarFallbackUrl,
      },
    };
  }

  return undefined;
}

export function encodeYctSessionSnapshot(snapshot: YctAccountSessionSnapshot): string {
  return Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64url');
}

export function parseYctSessionSnapshot(
  value: string | undefined,
): YctAccountSessionSnapshot | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as YctAccountSessionSnapshot;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.authenticated !== 'boolean'
    ) {
      return undefined;
    }

    return withAvatarFallback(parsed);
  } catch {
    return undefined;
  }
}

function withAvatarFallback(snapshot: YctAccountSessionSnapshot): YctAccountSessionSnapshot {
  if (snapshot.user) {
    // 旧快照可能已经写入过 Minotar 头像；本地管理员统一清空，避免继续请求必然失败的头像。
    if (
      isLocalAdminUser({
        id: snapshot.user.ldpassUserId,
        username: snapshot.user.username,
      })
    ) {
      return {
        ...snapshot,
        user: {
          ...snapshot.user,
          avatarUrl: undefined,
          avatarFallbackUrl: undefined,
        },
      };
    }

    const fallbackUrl = buildMinotarAvatarUrl(
      snapshot.user.serverAccountName ?? snapshot.user.username,
    );
    return {
      ...snapshot,
      user: {
        ...snapshot.user,
        avatarUrl: resolveYctAvatarUrl({
          avatarFallbackUrl: snapshot.user.avatarFallbackUrl,
          avatarUrl: snapshot.user.avatarUrl,
          minotarUrl: fallbackUrl,
        }),
        avatarFallbackUrl: fallbackUrl ?? snapshot.user.avatarFallbackUrl,
      },
    };
  }

  if (snapshot.readonlyUser) {
    const fallbackUrl = buildMinotarAvatarUrl(snapshot.readonlyUser.username);
    return {
      ...snapshot,
      readonlyUser: {
        ...snapshot.readonlyUser,
        avatarUrl: resolveYctAvatarUrl({
          avatarFallbackUrl: snapshot.readonlyUser.avatarFallbackUrl,
          avatarUrl: snapshot.readonlyUser.avatarUrl,
          minotarUrl: fallbackUrl,
        }),
        avatarFallbackUrl: fallbackUrl ?? snapshot.readonlyUser.avatarFallbackUrl,
      },
    };
  }

  return snapshot;
}

export function authStateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: authStateMaxAgeSeconds,
  };
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: yctSessionMaxAgeSeconds,
  };
}

export function expiredCookieOptions(secure = false) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: 0,
  };
}

/**
 * 嵌入专用会话 Cookie 选项。
 *
 * `SameSite=None` 必须配 `Secure`，否则浏览器直接丢弃，因此只在 HTTPS 请求里下发。
 */
export function embeddedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'none' as const,
    secure: true,
    path: '/',
    maxAge: yctSessionMaxAgeSeconds,
  };
}

export function expiredEmbeddedCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'none' as const,
    secure: true,
    path: '/',
    maxAge: 0,
  };
}

/**
 * 统一写入会话 Cookie。
 *
 * 普通网页端只写 `yct.account_snapshot`（`SameSite=Lax`）；
 * 嵌入登录额外写一枚 `SameSite=None` 的同值 Cookie，
 * 让跨站 iframe 内发出的请求也能带上会话。
 */
export function writeYctSessionCookies(
  response: NextResponse,
  input: { secure: boolean; sessionId?: string; embed?: boolean },
): void {
  const hasSession = Boolean(input.sessionId);
  response.cookies.set(
    yctSessionCookieName,
    input.sessionId ?? '',
    hasSession ? sessionCookieOptions(input.secure) : expiredCookieOptions(input.secure),
  );

  if (!input.embed) {
    return;
  }

  if (!hasSession) {
    // 清除不受 `Secure` 约束：Cookie 匹配只看名字 / 域 / 路径，
    // 因此即使当前请求不是安全上下文，也要把残留的嵌入会话一并清掉。
    response.cookies.set(yctEmbedSessionCookieName, '', expiredEmbeddedCookieOptions());
    return;
  }

  // 下发有效值则必须 `Secure`：`SameSite=None` 少了它会被浏览器直接丢弃。
  if (input.secure) {
    response.cookies.set(
      yctEmbedSessionCookieName,
      input.sessionId ?? '',
      embeddedSessionCookieOptions(),
    );
  }
}

export interface ResolvedYctSessionCookie {
  sessionId?: string;
  /**
   * 会话只来自嵌入专用 Cookie，说明本次请求处于跨站上下文。
   * 写接口必须据此追加同源校验，避免 `SameSite=None` 带来跨站伪造写入。
   */
  fromEmbeddedCookie: boolean;
}

/** 按「普通 → 嵌入」的顺序取第一枚可用会话 ID。 */
export function resolveYctSessionCookie(input: {
  standardSessionId?: string;
  embeddedSessionId?: string;
}): ResolvedYctSessionCookie {
  const standard = input.standardSessionId?.trim();
  if (standard) {
    return { sessionId: standard, fromEmbeddedCookie: false };
  }

  const embedded = input.embeddedSessionId?.trim();
  if (embedded) {
    return { sessionId: embedded, fromEmbeddedCookie: true };
  }

  return { fromEmbeddedCookie: false };
}

export function isSecureRequest(url: URL): boolean {
  return url.protocol === 'https:';
}

export function buildMinotarAvatarUrl(username: string | null | undefined): string | undefined {
  const normalized = username?.trim();
  if (!normalized) {
    return undefined;
  }

  return `https://minotar.net/helm/${encodeURIComponent(normalized)}`;
}

export function resolveYctAvatarUrl(input: {
  avatarFallbackUrl?: string | null;
  avatarUrl?: string | null;
  minotarUrl?: string;
}): string | undefined {
  if (input.avatarUrl && !isLegacyMinecraftAvatarUrl(input.avatarUrl)) {
    return input.avatarUrl;
  }

  if (input.minotarUrl) {
    return input.minotarUrl;
  }

  if (input.avatarFallbackUrl && !isLegacyMinecraftAvatarUrl(input.avatarFallbackUrl)) {
    return input.avatarFallbackUrl;
  }

  return input.avatarUrl ?? input.avatarFallbackUrl ?? undefined;
}

function isLegacyMinecraftAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'mc-heads.net' || url.hostname.endsWith('.mc-heads.net');
  } catch {
    return value.includes('mc-heads.net');
  }
}

export function normalizeStoredReturnOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return undefined;
  }
}
