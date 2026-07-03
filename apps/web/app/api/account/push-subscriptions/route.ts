import { NextRequest, NextResponse } from 'next/server';
import { pushSubscriptionDeleteSchema, pushSubscriptionSchema } from '@yct/schemas';
import {
  listUserPushSubscriptions,
  registerUserPushSubscription,
  revokeUserPushSubscription,
} from '../../../../lib/push-subscription-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const items = await listUserPushSubscriptions(user.userId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_push_subscription',
        message: 'Push 设备订阅不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const item = await registerUserPushSubscription({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: parsed.data.userAgent,
  });

  return NextResponse.json({ item }, { status: 202 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await readJsonBody(request);
  const parsed = pushSubscriptionDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_push_subscription_delete',
        message: 'Push 设备订阅撤销请求不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const item = await revokeUserPushSubscription({
    userId: user.userId,
    endpoint: parsed.data.endpoint,
    subscriptionId: parsed.data.subscriptionId,
  });

  return NextResponse.json({
    item,
    revoked: Boolean(item),
  });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
