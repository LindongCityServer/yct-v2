import { NextRequest, NextResponse } from 'next/server';
import { readRuntimeConfig } from './runtime-config';

export function authorizeInternalTaskRequest(
  request: NextRequest,
  taskLabel = '内部任务',
): NextResponse | null {
  const config = readRuntimeConfig();
  if (!config.internalTaskToken) {
    return NextResponse.json(
      {
        error: 'internal_task_token_not_configured',
        message: `未配置 YCT_INTERNAL_TASK_TOKEN，${taskLabel}未开放。`,
      },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization')?.trim();
  const taskToken = request.headers.get('x-yct-task-token')?.trim();
  if (
    authorization === `Bearer ${config.internalTaskToken}` ||
    taskToken === config.internalTaskToken
  ) {
    return null;
  }

  return NextResponse.json(
    {
      error: 'unauthorized_internal_task',
      message: '内部任务令牌无效。',
    },
    { status: 401 },
  );
}

export async function readInternalTaskJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function readInternalTaskLimit(
  source: unknown,
  key = 'limit',
  max = 100,
): number | undefined {
  const rawValue = readInternalTaskValue(source, key);
  const limit = Number(rawValue);
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), max) : undefined;
}

export function readInternalTaskString(source: unknown, key: string): string | undefined {
  const rawValue = readInternalTaskValue(source, key);
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined;
}

export function readInternalTaskBoolean(source: unknown, key: string): boolean | undefined {
  const rawValue = readInternalTaskValue(source, key);
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return undefined;
}

function readInternalTaskValue(source: unknown, key: string): unknown {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  if (!source || typeof source !== 'object' || !(key in source)) {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
}
