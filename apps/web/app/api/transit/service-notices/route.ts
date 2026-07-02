import { NextResponse } from 'next/server';
import { readTransitServiceNotices } from '../../../../lib/transit-service-notices';

export const dynamic = 'force-dynamic';

export async function GET() {
  const notices = await readTransitServiceNotices();
  return NextResponse.json(notices);
}
