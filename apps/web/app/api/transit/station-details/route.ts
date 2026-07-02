import { NextResponse } from 'next/server';
import { readTransitStationDetails } from '../../../../lib/transit-station-details';

export const dynamic = 'force-dynamic';

export async function GET() {
  const details = await readTransitStationDetails();
  return NextResponse.json(details);
}
