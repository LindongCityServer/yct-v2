import { NextRequest, NextResponse } from 'next/server';
import { materialTemplateRevisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { createMaterialTemplateRevision } from '../../../../../../../lib/material-workflow';
import { formatValidationErrorMessage } from '../../../../../../../lib/validation-error-message';

interface RouteContext {
  params: Promise<{
    templateId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = materialTemplateRevisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_template_revision',
        message: formatValidationErrorMessage('模板修订不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { templateId } = await context.params;
  const { baseVersion, ...template } = parsed.data;
  const result = await createMaterialTemplateRevision({
    templateId,
    baseVersion,
    template,
    actorId: admin.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.record, { status: 201 });
}
