import { NextResponse, type NextRequest } from 'next/server';
import { appBasePath } from './lib/app-paths';

const staticAssetPattern =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i;

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const rewrittenPathname = resolveRewrittenPathname(pathname);
  const response = rewrittenPathname
    ? NextResponse.rewrite(createRewriteUrl(request, rewrittenPathname))
    : NextResponse.next();
  const isServiceWorker = pathname.endsWith('/sw.js') || pathname === '/sw.js';

  if (
    isServiceWorker ||
    (!pathname.includes('/_next/static/') &&
      !pathname.includes('/_next/image') &&
      !staticAssetPattern.test(pathname))
  ) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

function resolveRewrittenPathname(pathname: string): string | undefined {
  if (!appBasePath) {
    return undefined;
  }

  if (pathname === appBasePath) {
    return '/';
  }

  if (pathname.startsWith(`${appBasePath}/`)) {
    return pathname.slice(appBasePath.length) || '/';
  }

  return undefined;
}

function createRewriteUrl(request: NextRequest, rewrittenPathname: string): URL {
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = rewrittenPathname;
  return rewriteUrl;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|legacy-assets|content-assets).*)'],
};
