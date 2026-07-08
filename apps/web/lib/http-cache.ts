import type { NextResponse } from 'next/server';

export function markResponseNoStore<TResponse extends NextResponse>(response: TResponse): TResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
