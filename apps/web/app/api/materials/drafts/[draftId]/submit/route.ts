import { NextRequest, NextResponse } from 'next/server';
import { requireActiveLdpassUser } from '../../../../../../lib/user-auth';
import { submitManualMaterialDraft } from '../../../../../../lib/material-workflow';

interface RouteContext {
  params: Promise<{
    draftId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  const { draftId } = await context.params;
  const result = await submitManualMaterialDraft({ draftId, actorId: user.ldpassUserId });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.draft);
}
