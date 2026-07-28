import { NextRequest, NextResponse } from 'next/server';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { listPublishedMaterialTemplates } from '../../../../lib/material-workflow';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  const items = await listPublishedMaterialTemplates();
  return NextResponse.json({ items });
}
