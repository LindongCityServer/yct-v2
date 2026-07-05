import { NextResponse, type NextRequest } from 'next/server';

const staticAssetPattern =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  if (
    !pathname.includes('/_next/static/') &&
    !pathname.includes('/_next/image') &&
    !staticAssetPattern.test(pathname)
  ) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|legacy-assets|content-assets).*)'],
};
