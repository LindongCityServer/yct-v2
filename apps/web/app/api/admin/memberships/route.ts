import { NextRequest, NextResponse } from 'next/server';
import { adminMembershipUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../lib/admin-auth';
import {
  readAdminMembershipDirectory,
  updateAdminMembership,
} from '../../../../lib/admin-membership-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  if (admin.membership.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'super_admin_required', message: '只有超级管理员可以管理管理员成员。' },
      { status: 403 },
    );
  }
  return NextResponse.json(await readAdminMembershipDirectory());
}

export async function PATCH(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  if (admin.membership.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'super_admin_required', message: '只有超级管理员可以管理管理员成员。' },
      { status: 403 },
    );
  }

  const parsed = adminMembershipUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_admin_membership_update',
        message: '管理员成员设置不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await updateAdminMembership({
    actorId: admin.ldpassUserId,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json(result.membership);
}
