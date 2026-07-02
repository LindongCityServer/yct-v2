import { NextResponse } from 'next/server';
import { readLegacyTransitOverview } from '../../../../lib/legacy-transit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const overview = await readLegacyTransitOverview();
  return NextResponse.json(overview);
}
