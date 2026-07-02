import { NextRequest, NextResponse } from 'next/server';
import { transitDataImportSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  importLegacyTransitDataRevision,
  listAdminTransitDataRevisions,
} from '../../../../../lib/transit-data-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const revisions = await listAdminTransitDataRevisions();
  return NextResponse.json({
    items: revisions,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = transitDataImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_import',
        message: '交通数据导入参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await importLegacyTransitDataRevision({
    actorId: admin.ldpassUserId,
    sourceProviderId: parsed.data.sourceProviderId,
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

  return NextResponse.json(result.revision, { status: 201 });
}
