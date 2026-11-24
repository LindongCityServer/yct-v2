import { NextResponse } from 'next/server';
import { resolveMapMarkerIconUrl } from '../../../../../lib/map-marker-icon-url';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

export const dynamic = 'force-dynamic';

/**
 * 把地图图源里的 POI 图标代理到站内，供 QQ 机器人卡片使用。
 * 只允许相对文件名，避免把该路由变成任意 URL 代理。
 */
export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ iconPath: string[] }> }>,
) {
  const { iconPath } = await params;
  const segments = (iconPath ?? []).map((segment) => decodeSegment(segment));
  if (!isSafeIconPath(segments)) {
    return new NextResponse('图标不存在', { status: 404 });
  }
  const fileName = segments.join('/');
  const config = readRuntimeConfig();
  const url = resolveMapMarkerIconUrl(fileName, config.unminedMapBaseUrl);
  if (!url || !isSameOrigin(url, config.unminedMapBaseUrl)) {
    return new NextResponse('图标不存在', { status: 404 });
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return new NextResponse('图标不存在', { status: 404 });
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!type.startsWith('image/')) {
      return new NextResponse('图标格式不支持', { status: 415 });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 512 * 1024) {
      return new NextResponse('图标过大', { status: 413 });
    }
    return new NextResponse(bytes, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': type,
      },
    });
  } catch {
    return new NextResponse('图标读取失败', { status: 502 });
  }
}

function isSafeIconPath(segments: string[]): boolean {
  if (segments.length === 0 || segments.length > 6) {
    return false;
  }
  return segments.every(
    (segment) =>
      Boolean(segment) &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.includes('\\') &&
      /^[A-Za-z0-9._ -]+$/u.test(segment),
  );
}

function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    return target.protocol === 'https:' && target.host === base.host;
  } catch {
    return false;
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
