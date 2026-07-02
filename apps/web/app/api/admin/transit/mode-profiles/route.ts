import { NextRequest, NextResponse } from 'next/server';
import { transitModeProfileUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  listTransitModeProfiles,
  updateTransitModeProfiles,
} from '../../../../../lib/transit-mode-profile-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const modes = await listTransitModeProfiles();
  return NextResponse.json({
    items: modes,
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = transitModeProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_mode_profile',
        message: '交通方式配置不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updateTransitModeProfiles({
    actorId: admin.ldpassUserId,
    modes: parsed.data.modes,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json({
    items: result.modes ?? [],
  });
}
