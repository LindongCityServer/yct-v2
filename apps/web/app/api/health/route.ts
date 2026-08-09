import { NextResponse } from 'next/server';
import { appBasePath } from '../../../lib/app-paths';
import { readRuntimeConfig } from '../../../lib/runtime-config';

export function GET() {
  const config = readRuntimeConfig();
  return NextResponse.json({
    ok: true,
    name: 'Yuchengtong',
    abbreviation: 'YCT',
    buildId: process.env.NEXT_PUBLIC_YCT_BUILD_ID ?? 'dev',
    releaseVersion: process.env.NEXT_PUBLIC_YCT_RELEASE_VERSION ?? '2.0.0',
    basePath: appBasePath || '/',
    siteUrl: config.siteUrl,
    ldpassConfigured: Boolean(config.ldpassBaseUrl && config.ldpassClientId),
  });
}
