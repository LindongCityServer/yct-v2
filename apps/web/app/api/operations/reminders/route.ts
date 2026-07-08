import { NextResponse } from 'next/server';
import { readOperationsStrongReminderItems } from '../../../../lib/operations-reminders';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await readOperationsStrongReminderItems();
  return NextResponse.json(response);
}
