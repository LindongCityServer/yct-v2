import { NextRequest, NextResponse } from 'next/server';
import { rectangleBoundsSchema } from '@yct/schemas';
import { z } from 'zod';
import {
  deleteUserOfflinePackageRequest,
  listUserOfflinePackageRequests,
  requestOfflinePackage,
} from '../../../../lib/offline-package-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

const offlinePackageRequestSchema = z.object({
  packageId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  bounds: rectangleBoundsSchema,
});

const offlinePackageDeleteSchema = z.object({
  packageId: z.string().trim().min(1).max(128),
});

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const items = await listUserOfflinePackageRequests(user.userId);
  return NextResponse.json({
    items,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = offlinePackageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_offline_package_request',
        message: '离线范围请求不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const record = await requestOfflinePackage({
    packageId: parsed.data.packageId,
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    name: parsed.data.name,
    bounds: parsed.data.bounds,
  });

  return NextResponse.json(
    {
      item: record,
    },
    { status: 202 },
  );
}

export async function DELETE(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await readJsonBody(request);
  const parsed = offlinePackageDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_offline_package_delete',
        message: '离线范围删除请求不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await deleteUserOfflinePackageRequest({
    userId: user.userId,
    packageId: parsed.data.packageId,
  });

  return NextResponse.json({
    deletedAt: result.deletedAt,
    deleted: Boolean(result.request),
    packageId: parsed.data.packageId,
  });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
