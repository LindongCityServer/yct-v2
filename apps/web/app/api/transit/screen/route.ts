import { NextResponse } from 'next/server';
import { readTransitScreenSnapshot } from '../../../../lib/transit-screen';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await readTransitScreenSnapshot();
  return NextResponse.json(snapshot);
}
