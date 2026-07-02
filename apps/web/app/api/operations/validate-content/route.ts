import { NextRequest, NextResponse } from 'next/server';
import { contentRevisionDraftSchema } from '@yct/schemas';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = contentRevisionDraftSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    value: parsed.data,
  });
}
