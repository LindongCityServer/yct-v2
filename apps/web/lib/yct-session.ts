import { randomUUID } from 'node:crypto';
import type { LdpassClientSessionResponse, YctAccountSessionSnapshot } from '@yct/contracts';

export const yctAuthStateCookieName = 'yct.ldpass_state';
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
    return {
      authenticated: true,
      linkedAt,
      user: {
        ldpassUserId: session.user.id,
        username: session.user.username,
        status: session.user.status,
        serverAccountName: session.user.serverAccountName,
        serverAccountVerified: session.user.serverAccountVerified,
        avatarUrl: session.user.avatarUrl,
        avatarFallbackUrl: session.user.avatarFallbackUrl,
      },
    };
  }

  if (session.readonlyUser) {
    return {
      authenticated: false,
      linkedAt,
      readonlyUser: {
        ldpassUserId: session.readonlyUser.id,
        username: session.readonlyUser.username,
        status: session.readonlyUser.status,
        avatarUrl: session.readonlyUser.avatarUrl,
        avatarFallbackUrl: session.readonlyUser.avatarFallbackUrl,
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

    return parsed;
  } catch {
    return undefined;
  }
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

export function expiredCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
    path: '/',
    maxAge: 0,
  };
}

export function isSecureRequest(url: URL): boolean {
  return url.protocol === 'https:';
}
