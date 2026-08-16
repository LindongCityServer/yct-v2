import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../lib/app-paths';
import { findMapShareLinkById } from '../../../lib/map-share-link-workflow';
import { resolvePublicSiteOrigin } from '../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../lib/runtime-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  const publicSiteOrigin = resolvePublicSiteOrigin(request, readRuntimeConfig().siteUrl);
  const mapUrl = new URL(appPath('/map'), publicSiteOrigin);
  if (!/^[A-Za-z0-9_-]{10}$/.test(shareId)) {
    return NextResponse.redirect(mapUrl, 302);
  }
  const link = await findMapShareLinkById(shareId);
  if (!link) {
    return NextResponse.redirect(mapUrl, 302);
  }

  if (link.target.kind === 'marker') {
    mapUrl.searchParams.set('ms', encodeBase64UrlText(link.target.markerId));
  } else {
    mapUrl.searchParams.set('rs', encodeBase64UrlText(JSON.stringify(link.target.state)));
  }
  return NextResponse.redirect(mapUrl, 302);
}

function encodeBase64UrlText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
