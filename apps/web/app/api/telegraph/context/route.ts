import { NextRequest, NextResponse } from 'next/server';
import { resolveClientIpLocation } from '../../../../lib/client-ip-location';
import { resolveClientIp } from '../../../../lib/request-client-ip';

export async function GET(request: NextRequest) {
  const clientIp = resolveClientIp(request.headers);
  const clientIpLocation = await resolveClientIpLocation(clientIp);
  return NextResponse.json(
    { clientIp, clientIpLocation },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
