import { NextResponse } from 'next/server';
import { readOperationsFeed } from '../../../../lib/operations-content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await readOperationsFeed();
  return NextResponse.json(response);
}
