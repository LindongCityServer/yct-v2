import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeInternalTaskRequest,
  readInternalTaskBoolean,
  readInternalTaskJsonBody,
  readInternalTaskString,
} from '../../../../../../lib/internal-task-auth';
import {
  LegacyContentMigrationUnavailableError,
  migrateLegacyContent,
} from '../../../../../../lib/legacy-content-migration-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const unauthorized = authorizeInternalTaskRequest(request, '旧内容一次性迁移任务');
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readInternalTaskJsonBody(request);
  const apply = readInternalTaskBoolean(body, 'apply') ?? false;
  const actorId = readInternalTaskString(body, 'actorId') ?? 'legacy_content_migrator';

  try {
    const result = await migrateLegacyContent({ apply, actorId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LegacyContentMigrationUnavailableError) {
      return NextResponse.json(
        {
          error: 'legacy_content_source_unavailable',
          message: error.message,
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
