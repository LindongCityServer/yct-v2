import { NextResponse } from 'next/server';
import { createApiMeta } from '../../../../lib/api-meta';
import { listTransitModeProfiles } from '../../../../lib/transit-mode-profile-workflow';

export const dynamic = 'force-dynamic';

export async function GET() {
  const modes = await listTransitModeProfiles();
  return NextResponse.json({
    meta: createApiMeta('ready'),
    items: modes,
  });
}
