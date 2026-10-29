import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../lib/admin-auth';
import { listYctUserLinks } from '../../../../lib/yct-user-link-store';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const users = await listYctUserLinks();
  return NextResponse.json({
    actors: users.map((user) => ({
      id: user.id,
      ldpassUserId: user.ldpassUserId,
      displayName: user.usernameSnapshot || user.serverAccountNameSnapshot || user.ldpassUserId,
    })),
  });
}
