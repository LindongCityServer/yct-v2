import { NextRequest, NextResponse } from 'next/server';
import { materialTemplateDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../lib/admin-auth';
import {
  createMaterialTemplateDraft,
  listAdminMaterialState,
} from '../../../../lib/material-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  try {
    return NextResponse.json(await listAdminMaterialState());
  } catch {
    return NextResponse.json(
      {
        error: 'material_admin_state_unavailable',
        message: '物料后台数据暂时不可用。',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = materialTemplateDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_template',
        message: '模板草稿不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await createMaterialTemplateDraft({
    template: parsed.data,
    actorId: admin.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.record, { status: 201 });
}
