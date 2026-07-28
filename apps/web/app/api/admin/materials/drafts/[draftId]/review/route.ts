import { NextRequest, NextResponse } from 'next/server';
import { materialReviewDecisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { reviewManualMaterialDraft } from '../../../../../../../lib/material-workflow';

interface RouteContext {
  params: Promise<{
    draftId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = materialReviewDecisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_review',
        message: '审核参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { draftId } = await context.params;
  const result = await reviewManualMaterialDraft({
    draftId,
    actorId: admin.ldpassUserId,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.draft);
}
