import { NextResponse } from 'next/server';
import { readServiceEntryGroups } from '../../../../lib/service-entries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await readServiceEntryGroups();
  return NextResponse.json(response);
}
