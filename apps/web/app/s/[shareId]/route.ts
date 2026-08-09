import { NextResponse } from 'next/server';
import { appPath } from '../../../lib/app-paths';
import { findMapShareLinkById } from '../../../lib/map-share-link-workflow';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  if (!/^[A-Za-z0-9_-]{10}$/.test(shareId)) {
    return NextResponse.redirect(new URL(appPath('/map'), request.url), 302);
  }
  const link = await findMapShareLinkById(shareId);
  if (!link) {
    return NextResponse.redirect(new URL(appPath('/map'), request.url), 302);
  }

  const url = new URL(appPath('/map'), request.url);
  if (link.target.kind === 'marker') {
    url.searchParams.set('ms', encodeBase64UrlText(link.target.markerId));
  } else {
    url.searchParams.set('rs', encodeBase64UrlText(JSON.stringify(link.target.state)));
  }
  return NextResponse.redirect(url, 302);
}

function encodeBase64UrlText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
