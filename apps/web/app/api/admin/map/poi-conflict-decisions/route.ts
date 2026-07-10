import { NextRequest, NextResponse } from 'next/server';
import { poiConflictDecisionUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  listAdminPoiConflictDecisions,
  updatePoiConflictDecision,
} from '../../../../../lib/poi-conflict-decision-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const decisions = await listAdminPoiConflictDecisions();
  return NextResponse.json({
    items: decisions,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = poiConflictDecisionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_conflict_decision',
        message: 'POI 冲突提示决策不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updatePoiConflictDecision({
    ...parsed.data,
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json({
    items: result.decisions ?? [],
  });
}
