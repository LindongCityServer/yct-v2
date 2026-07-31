import { NextRequest, NextResponse } from 'next/server';
import { materialTransitNetworkProjectUpdateSchema } from '@yct/schemas';
import {
  removeMaterialTransitNetworkProject,
  updateMaterialTransitNetworkProject,
} from '../../../../../lib/material-transit-network-project-workflow';
import { requireActiveLdpassUser } from '../../../../../lib/user-auth';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) return user.response;
  const parsed = materialTransitNetworkProjectUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_transit_network_project_update',
        message: '线网项目补充信息不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { projectId } = await context.params;
  const result = await updateMaterialTransitNetworkProject({
    ownerId: user.ldpassUserId,
    projectId,
    update: parsed.data,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result.project);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) return user.response;
  const { projectId } = await context.params;
  const result = await removeMaterialTransitNetworkProject({
    ownerId: user.ldpassUserId,
    projectId,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return new NextResponse(null, { status: 204 });
}
