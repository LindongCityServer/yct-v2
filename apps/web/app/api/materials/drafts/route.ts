import { NextRequest, NextResponse } from 'next/server';
import { materialDraftInputSchema } from '@yct/schemas';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import {
  createManualMaterialDraft,
  listMaterialDraftsForUser,
} from '../../../../lib/material-workflow';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  return NextResponse.json({ items: await listMaterialDraftsForUser(user.ldpassUserId) });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  const parsed = materialDraftInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_draft',
        message: '物料草稿不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await createManualMaterialDraft({
    draft: parsed.data,
    actorId: user.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.draft, { status: 201 });
}
