import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../../../lib/admin-auth';
import { publishMaterialTemplateVersion } from '../../../../../../../../../lib/material-workflow';

interface RouteContext {
  params: Promise<{
    templateId: string;
    version: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const { templateId, version } = await context.params;
  const result = await publishMaterialTemplateVersion({
    templateId,
    version: Number(version),
    actorId: admin.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.record);
}
