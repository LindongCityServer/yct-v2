import { NextResponse } from 'next/server';
import { readTransitOverview } from '../../../../lib/transit-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const overview = await readTransitOverview();
  return NextResponse.json(overview);
}
