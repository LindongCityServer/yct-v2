import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { operationsStrongReminderRuleUpdateSchema } from '../../../../../lib/operations-reminder-rule-schema';
import {
  listOperationsStrongReminderRules,
  updateOperationsStrongReminderRules,
} from '../../../../../lib/operations-reminder-rule-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const items = await listOperationsStrongReminderRules();
  return NextResponse.json({ items });
}

export async function PUT(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = operationsStrongReminderRuleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_operations_reminder_rules',
        message: '首页强提醒规则不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updateOperationsStrongReminderRules({
    actorId: admin.ldpassUserId,
    rules: parsed.data.items.map((item) => ({
      ...item,
      id: item.id ?? '',
    })),
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
    items: result.rules ?? [],
  });
}
