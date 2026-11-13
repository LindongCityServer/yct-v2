import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { materialServerSourceSchema, materialTransitNetworkSnapshotSchema } from '@yct/schemas';
import { resolveMaterialServerInputValues } from '../../../../lib/material-workflow';
import { formatValidationErrorMessage } from '../../../../lib/validation-error-message';

const requestSchema = z.object({
  templateId: z.string().trim().min(1).max(160),
  templateVersion: z.number().int().positive(),
  source: materialServerSourceSchema,
  networkGeometry: materialTransitNetworkSnapshotSchema.optional(),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_resolved_input',
        message: formatValidationErrorMessage('数据来源参数不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await resolveMaterialServerInputValues(parsed.data);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(
    {
      values: result.values,
      sourceKind: result.sourceKind,
      sourceRef: result.sourceRef,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
