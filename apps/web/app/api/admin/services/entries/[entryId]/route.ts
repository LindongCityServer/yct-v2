import { NextRequest, NextResponse } from 'next/server';
import { serviceEntryDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import {
  deleteServiceEntry,
  updateServiceEntry,
} from '../../../../../../lib/service-entry-workflow';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ entryId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = serviceEntryDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_service_entry_update',
        message: '服务入口更新内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { entryId } = await params;
  const result = await updateServiceEntry({
    serviceEntryId: decodeSegment(entryId),
    actorId: admin.ldpassUserId,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.entry);
}

export async function DELETE(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ entryId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { entryId } = await params;
  const result = await deleteServiceEntry({
    serviceEntryId: decodeSegment(entryId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.entry?.id,
  });
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
