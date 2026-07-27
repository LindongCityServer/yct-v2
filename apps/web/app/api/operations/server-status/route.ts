import { NextResponse } from 'next/server';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { readOperationsServerStatus } from '../../../../lib/operations-server-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await readOperationsServerStatus();
  return markResponseNoStore(NextResponse.json(response));
}
