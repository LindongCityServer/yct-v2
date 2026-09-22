import type { NextRequest } from 'next/server';
import { appBasePath } from './app-paths';

export function resolvePublicSiteOrigin(request: NextRequest, configuredSiteUrl?: string): string {
  const configuredUrl = tryParseUrl(configuredSiteUrl);
  const forwardedUrl = resolveForwardedUrl(request);
  const sameSiteNavigationUrl = resolveSameSiteNavigationUrl(request);
  const hostHeaderUrl = resolveHostHeaderUrl(request, configuredUrl, sameSiteNavigationUrl);
  const requestUrl = tryParseUrl(request.nextUrl.origin);

  const publicCandidate = [
    forwardedUrl,
    sameSiteNavigationUrl,
    hostHeaderUrl,
    configuredUrl,
    requestUrl,
  ].find((candidate) => candidate && !isInternalHostname(candidate.hostname));
  if (publicCandidate) {
    return publicCandidate.origin;
  }

  return (
    forwardedUrl?.origin ??
    sameSiteNavigationUrl?.origin ??
    hostHeaderUrl?.origin ??
    requestUrl?.origin ??
    configuredUrl?.origin ??
    request.nextUrl.origin
  );
}

export function isSecureNextRequest(request: NextRequest): boolean {
  const forwardedProto =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
    parseForwardedHeader(request.headers.get('forwarded')).proto;
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https';
  }

  return request.nextUrl.protocol === 'https:';
}

/**
 * 判断请求是否由本站自己的页面发起。
 *
 * 嵌入专用会话 Cookie 是 `SameSite=None`，会随任何跨站请求发送，
 * 因此使用它的写接口必须额外确认「发起方文档就是本站」：
 * iframe 拿到 `allow-same-origin` 后其文档源即本站源，`Origin` / `Referer` 指向本站；
 * 恶意站点的 iframe 则指向自身。
 *
 * 注意这里刻意不复用 `resolvePublicSiteOrigin`：它会用请求自带的 `Origin` 参与推导，
 * 把攻击者来源误判成站点来源。
 */
export function isSameOriginDocumentRequest(
  request: NextRequest,
  configuredSiteUrl?: string,
): boolean {
  if (request.headers.get('sec-fetch-site')?.trim().toLowerCase() === 'same-origin') {
    return true;
  }

  const candidate = request.headers.get('origin') ?? request.headers.get('referer');
  if (!candidate || candidate === 'null') {
    // 缺少可用于判定的头时按不可信处理；现代浏览器对本请求都会带上其中之一。
    return false;
  }

  const candidateUrl = tryParseUrl(candidate);
  if (!candidateUrl) {
    return false;
  }

  const allowedOrigins = new Set<string>([request.nextUrl.origin]);
  const configuredUrl = tryParseUrl(configuredSiteUrl);
  if (configuredUrl) {
    allowedOrigins.add(configuredUrl.origin);
  }
  const forwardedUrl = resolveForwardedUrl(request);
  if (forwardedUrl) {
    allowedOrigins.add(forwardedUrl.origin);
  }
  const hostHeaderUrl = resolveHostHeaderUrl(request, configuredUrl);
  if (hostHeaderUrl) {
    allowedOrigins.add(hostHeaderUrl.origin);
  }

  return allowedOrigins.has(candidateUrl.origin);
}

function resolveForwardedUrl(request: NextRequest): URL | undefined {
  const parsedForwarded = parseForwardedHeader(request.headers.get('forwarded'));
  const forwardedHost =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ?? parsedForwarded.host;
  if (!forwardedHost) {
    return undefined;
  }

  const forwardedProto =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
    parsedForwarded.proto ??
    request.nextUrl.protocol.replace(/:$/, '');
  const forwardedPort =
    firstHeaderValue(request.headers.get('x-forwarded-port')) ?? parsedForwarded.port;
  const hostWithPort = appendPortIfNeeded(forwardedHost, forwardedPort, forwardedProto);

  return tryParseUrl(`${forwardedProto}://${hostWithPort}`);
}

function resolveSameSiteNavigationUrl(request: NextRequest): URL | undefined {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (
    fetchSite &&
    fetchSite !== 'same-origin' &&
    fetchSite !== 'same-site' &&
    fetchSite !== 'none'
  ) {
    return undefined;
  }

  const originHeader = tryParseUrl(request.headers.get('origin') ?? undefined);
  if (originHeader && isSameAppBasePath(originHeader)) {
    return originHeader;
  }

  const refererHeader = tryParseUrl(request.headers.get('referer') ?? undefined);
  if (refererHeader && isSameAppBasePath(refererHeader)) {
    return refererHeader;
  }

  return undefined;
}

function resolveHostHeaderUrl(
  request: NextRequest,
  configuredUrl?: URL,
  sameSiteNavigationUrl?: URL,
): URL | undefined {
  const hostHeader = firstHeaderValue(request.headers.get('host'));
  if (!hostHeader) {
    return undefined;
  }

  const trimmedHost = hostHeader.trim();
  const hostname = trimmedHost.replace(/:\d+$/, '');
  if (!hostname) {
    return undefined;
  }

  const forwardedProto =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
    parseForwardedHeader(request.headers.get('forwarded')).proto;
  const protocol =
    normalizeProtocol(forwardedProto) ??
    normalizeProtocol(sameSiteNavigationUrl?.protocol) ??
    normalizeProtocol(configuredUrl?.protocol) ??
    normalizeProtocol(request.nextUrl.protocol) ??
    'https';

  return tryParseUrl(`${protocol}://${trimmedHost}`);
}

function appendPortIfNeeded(host: string, port: string | undefined, proto: string): string {
  if (!port || host.includes(':')) {
    return host;
  }

  const normalizedProto = proto.toLowerCase();
  if (
    (normalizedProto === 'https' && port === '443') ||
    (normalizedProto === 'http' && port === '80')
  ) {
    return host;
  }

  // Some reverse proxies pass the upstream app port here. For public hosts,
  // prefer an explicit port in X-Forwarded-Host over appending that internal port.
  if (!isInternalHostname(host)) {
    return host;
  }

  return `${host}:${port}`;
}

function parseForwardedHeader(value: string | null): {
  host?: string;
  proto?: string;
  port?: string;
} {
  if (!value) {
    return {};
  }

  const firstSegment = value.split(',')[0]?.trim() ?? '';
  const result: { host?: string; proto?: string; port?: string } = {};
  for (const part of firstSegment.split(';')) {
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey?.trim().toLowerCase();
    const valueText = rawValue?.trim().replace(/^"|"$/g, '');
    if (!key || !valueText) {
      continue;
    }

    if (key === 'host') {
      const match = /^(.*?)(?::(\d+))?$/.exec(valueText);
      if (match) {
        result.host = match[1] || valueText;
        result.port = match[2];
      }
      continue;
    }

    if (key === 'proto') {
      result.proto = valueText;
    }
  }

  return result;
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim().replace(/^"|"$/g, '');
  return first || undefined;
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0'
  ) {
    return true;
  }

  if (!normalized.includes('.') && !normalized.includes(':')) {
    return true;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split('.').map((part) => Number(part));
    const [a = 0, b = 0] = parts;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
  }

  return false;
}

function tryParseUrl(value: string | undefined): URL | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isSameAppBasePath(url: URL): boolean {
  const normalizedPath = url.pathname.replace(/\/+$/g, '') || '/';
  if (!appBasePath) {
    return normalizedPath.startsWith('/');
  }

  return normalizedPath === appBasePath || normalizedPath.startsWith(`${appBasePath}/`);
}

function normalizeProtocol(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/:$/, '').toLowerCase();
  if (normalized === 'http' || normalized === 'https') {
    return normalized;
  }

  return undefined;
}
