import { NextResponse } from 'next/server';
import { listPublishedAdministrativeAreas } from '../../../../lib/administrative-area-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    items: await listPublishedAdministrativeAreas(),
    fetchedAt: new Date().toISOString(),
  });
}
