import { NextResponse } from 'next/server';
import { markResponseNoStore } from '../../../../../lib/http-cache';
import { readActiveOperationsForPoi } from '../../../../../lib/content-poi-read-model';

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ markerId: string }> }>,
) {
  const { markerId } = await params;
  const response = await readActiveOperationsForPoi(decodeSegment(markerId));
  return markResponseNoStore(NextResponse.json(response));
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
