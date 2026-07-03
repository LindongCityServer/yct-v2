import { NextRequest, NextResponse } from 'next/server';
import { pushPreferenceSchema } from '@yct/schemas';
import {
  readUserPushPreference,
  updateUserPushPreference,
} from '../../../../lib/notification-preference-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const item = await readUserPushPreference({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
  });

  return NextResponse.json({ item });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = pushPreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_push_preference',
        message: '通知偏好不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const item = await updateUserPushPreference({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    ...parsed.data,
  });

  return NextResponse.json({ item });
}
