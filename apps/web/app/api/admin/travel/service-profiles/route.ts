import { NextRequest, NextResponse } from 'next/server';
import { travelScheduleServiceProfileUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  listTravelServiceProfiles,
  updateTravelServiceProfiles,
} from '../../../../../lib/travel-service-profile-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const services = await listTravelServiceProfiles();
  return NextResponse.json({
    items: services,
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = travelScheduleServiceProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_service_profile',
        message: '可排班服务配置不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updateTravelServiceProfiles({
    actorId: admin.ldpassUserId,
    services: parsed.data.services,
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
    items: result.services ?? [],
  });
}
