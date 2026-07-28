import { NextResponse } from 'next/server';
import { listPublishedMaterialTemplates } from '../../../../lib/material-workflow';

export async function GET() {
  const items = await listPublishedMaterialTemplates();
  return NextResponse.json({ items });
}
