import { NextRequest, NextResponse } from 'next/server';
import { materialTransitNetworkProjectCreateSchema } from '@yct/schemas';
import {
  createMaterialTransitNetworkProject,
  listMaterialTransitNetworkProjectsForUser,
} from '../../../../lib/material-transit-network-project-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) return user.response;
  return NextResponse.json({
    items: await listMaterialTransitNetworkProjectsForUser(user.ldpassUserId),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) return user.response;
  const parsed = materialTransitNetworkProjectCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_transit_network_project',
        message: '导入的线网项目不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await createMaterialTransitNetworkProject({
    ownerId: user.ldpassUserId,
    project: parsed.data,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result.project, { status: 201 });
}
