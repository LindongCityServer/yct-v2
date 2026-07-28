import { NextResponse } from 'next/server';
import { readTransitNetworkHealthReport } from '../../../../lib/transit-network-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await readTransitNetworkHealthReport());
}
