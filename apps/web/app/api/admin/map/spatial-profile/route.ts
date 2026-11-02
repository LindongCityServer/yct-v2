import { NextRequest, NextResponse } from 'next/server';
import { mapSpatialProfileUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  getMapSpatialProfile,
  updateMapSpatialProfile,
} from '../../../../../lib/map-spatial-profile-workflow';
import { formatValidationErrorMessage } from '../../../../../lib/validation-error-message';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  return NextResponse.json({ profile: await getMapSpatialProfile() });
}

export async function PUT(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = mapSpatialProfileUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_map_spatial_profile',
        message: formatValidationErrorMessage('地图空间设置不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({
    profile: await updateMapSpatialProfile({
      actorId: admin.ldpassUserId,
      update: parsed.data,
    }),
  });
}
