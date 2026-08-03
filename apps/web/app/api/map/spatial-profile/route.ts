import { NextResponse } from 'next/server';
import { createApiMeta } from '../../../../lib/api-meta';
import { getMapSpatialProfile } from '../../../../lib/map-spatial-profile-workflow';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    meta: createApiMeta('ready'),
    profile: await getMapSpatialProfile(),
  });
}
