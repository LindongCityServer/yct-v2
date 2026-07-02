import { NextRequest, NextResponse } from 'next/server';
import { serviceEntryDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  createServiceEntryDraft,
  listAdminServiceEntries,
} from '../../../../../lib/service-entry-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const entries = await listAdminServiceEntries();
  return NextResponse.json({
    items: entries,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = serviceEntryDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_service_entry_draft',
        message: '服务入口草稿不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await createServiceEntryDraft({
    ...parsed.data,
    actorId: admin.ldpassUserId,
  });

  return NextResponse.json(result.entry, { status: 201 });
}
