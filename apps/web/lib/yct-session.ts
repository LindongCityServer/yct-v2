import { randomUUID } from 'node:crypto';
import type { LdpassClientSessionResponse, YctAccountSessionSnapshot } from '@yct/contracts';

export const yctAuthStateCookieName = 'yct.ldpass_state';
export const yctAuthReturnOriginCookieName = 'yct.ldpass_return_origin';
export const yctSessionCookieName = 'yct.account_snapshot';

const authStateMaxAgeSeconds = 10 * 60;
const sessionMaxAgeSeconds = 7 * 24 * 60 * 60;

export function createLdpassState(): string {
  return randomUUID();
}

export function createYctSessionSnapshot(
  session: LdpassClientSessionResponse,
  linkedAt = new Date().toISOString(),
): YctAccountSessionSnapshot | undefined {
  if (session.authenticated && session.user) {
    const avatarFallbackUrl = buildMinotarAvatarUrl(
      session.user.serverAccountName ?? session.user.username,
    );
    const avatarUrl = session.user.avatarUrl ?? avatarFallbackUrl ?? session.user.avatarFallbackUrl;

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
        avatarFallbackUrl: avatarFallbackUrl ?? session.user.avatarFallbackUrl,
      },
    };
  }

  if (session.readonlyUser) {
    const avatarFallbackUrl = buildMinotarAvatarUrl(session.readonlyUser.username);
    const avatarUrl =
      session.readonlyUser.avatarUrl ?? avatarFallbackUrl ?? session.readonlyUser.avatarFallbackUrl;

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
    const fallbackUrl = buildMinotarAvatarUrl(
      snapshot.user.serverAccountName ?? snapshot.user.username,
    );
    return {
      ...snapshot,
      user: {
        ...snapshot.user,
        avatarUrl: snapshot.user.avatarUrl ?? fallbackUrl ?? snapshot.user.avatarFallbackUrl,
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
        avatarUrl:
          snapshot.readonlyUser.avatarUrl ?? fallbackUrl ?? snapshot.readonlyUser.avatarFallbackUrl,
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
    maxAge: sessionMaxAgeSeconds,
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
