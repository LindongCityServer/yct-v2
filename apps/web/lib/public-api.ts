import type {
  ApiMeta,
  DataSourceStatus,
  LocaleCode,
  PublicApiErrorCode,
  PublicApiErrorResponse,
  PublicApiMeta,
  PublicApiVersion,
} from '@yct/contracts';
import { NextResponse } from 'next/server';
import { appPath } from './app-paths';
import { readRuntimeConfig } from './runtime-config';

export const publicApiVersion: PublicApiVersion = 'v1';

export function createPublicApiMeta(
  request: Request,
  sourceMeta: ApiMeta,
  options: {
    canonicalPath: string;
    asOf?: string;
  },
): PublicApiMeta {
  return {
    ...sourceMeta,
    apiVersion: publicApiVersion,
    locale: resolvePublicLocale(request),
    timezone: 'Asia/Shanghai',
    asOf: options.asOf,
    canonicalUrl: publicSiteUrl(options.canonicalPath),
  };
}

export function createPublicApiMetaFromStatus(
  request: Request,
  sourceStatus: DataSourceStatus,
  options: {
    canonicalPath: string;
    asOf?: string;
    message?: string;
  },
): PublicApiMeta {
  return createPublicApiMeta(
    request,
    {
      generatedAt: new Date().toISOString(),
      sourceStatus,
      message: options.message,
    },
    options,
  );
}

export function createPublicJsonResponse<T>(
  payload: T,
  options: {
    cacheSeconds?: number;
    status?: number;
  } = {},
): NextResponse<T> {
  const response = NextResponse.json(payload, { status: options.status });
  const cacheSeconds = options.cacheSeconds ?? 30;
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
  response.headers.set('X-Robots-Tag', 'noindex');
  response.headers.set(
    'Cache-Control',
    `public, max-age=${cacheSeconds}, stale-while-revalidate=120`,
  );
  response.headers.set('Vary', 'Accept, Accept-Language');
  return response;
}

export function createPublicErrorResponse(input: {
  code: PublicApiErrorCode;
  message: string;
  meta: PublicApiMeta;
  status: number;
  cacheSeconds?: number;
}): NextResponse<PublicApiErrorResponse> {
  return createPublicJsonResponse<PublicApiErrorResponse>(
    {
      error: {
        code: input.code,
        message: input.message,
      },
      meta: input.meta,
    },
    {
      status: input.status,
      cacheSeconds: input.cacheSeconds,
    },
  );
}

export function publicSiteUrl(path: string): string {
  const configuredSiteUrl = readRuntimeConfig().siteUrl;
  const origin = new URL(configuredSiteUrl).origin;
  return new URL(appPath(path), `${origin}/`).toString();
}

export function publicApiPath(path = ''): string {
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';
  return appPath(`/api/${publicApiVersion}/public${suffix}`);
}

export function latestIsoDate(values: Array<string | undefined>): string | undefined {
  const validValues = values.filter((value): value is string => {
    if (!value) {
      return false;
    }
    return !Number.isNaN(new Date(value).getTime());
  });

  return validValues.sort((left, right) => right.localeCompare(left))[0];
}

export function resolvePublicLocale(request: Request): LocaleCode {
  const url = new URL(request.url);
  const queryLocale = normalizeLocale(url.searchParams.get('locale'));
  if (queryLocale) {
    return queryLocale;
  }

  const acceptedLocale = request.headers.get('accept-language')?.split(',')[0];
  return normalizeLocale(acceptedLocale) ?? 'zh-CN';
}

function normalizeLocale(value: string | null | undefined): LocaleCode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }
  if (
    normalized === 'zh-hant' ||
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN';
  }
  return undefined;
}
