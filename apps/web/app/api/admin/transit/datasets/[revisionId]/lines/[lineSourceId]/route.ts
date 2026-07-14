import { NextRequest, NextResponse } from 'next/server';
import { transitItemApprovalActionSchema, transitLineDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../lib/admin-auth';
import {
  deleteTransitLine,
  saveTransitLine,
  updateTransitLineApprovalStatus,
} from '../../../../../../../../lib/transit-data-workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; lineSourceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitItemApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_line_approval_action',
        message: '线路审批动作不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, lineSourceId } = await params;
  const result = await updateTransitLineApprovalStatus({
    revisionId: decodeSegment(revisionId),
    lineSourceId: decodeSegment(lineSourceId),
    actorId: admin.ldpassUserId,
    action: parsed.data.action,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result.revision);
}

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; lineSourceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitLineDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_line_update',
        message: '线路编辑内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, lineSourceId } = await params;
  const result = await saveTransitLine({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    lineSourceId: decodeSegment(lineSourceId),
    patch: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result.revision);
}

export async function DELETE(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; lineSourceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { revisionId, lineSourceId } = await params;
  const result = await deleteTransitLine({
    revisionId: decodeSegment(revisionId),
    lineSourceId: decodeSegment(lineSourceId),
    actorId: admin.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result.revision);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
