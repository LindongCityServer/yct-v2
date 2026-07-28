import { NextRequest, NextResponse } from 'next/server';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { listMaterialTransitLines } from '../../../../lib/material-transit-source';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  return NextResponse.json({ items: await listMaterialTransitLines() });
}
