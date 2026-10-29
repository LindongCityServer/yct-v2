import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  analyticsLimits,
  analyticsSchemaVersion,
  isAnalyticsEventName,
  toAnalyticsDay,
  type AnalyticsEventRecord,
} from '../../../../lib/analytics/schema';
import {
  resolveAnalyticsIdentity,
  writeAnalyticsClientCookie,
} from '../../../../lib/analytics/identity';
import { createAnalyticsStore } from '../../../../lib/analytics/store';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { resolveClientIp } from '../../../../lib/request-client-ip';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  event_id: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  event_name: z.string().min(1).max(64),
  session_id: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  occurred_at: z.string().min(10).max(40),
  client_id: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  route: z.string().max(analyticsLimits.maxRouteLength).optional(),
  locale: z.string().max(16).optional(),
  embed_host: z.string().max(32).optional(),
  release: z.string().max(64).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(analyticsLimits.maxBatchSize),
});

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateWindowMs = 60_000;
const rateMaxRequests = 120;
const rateMaxBuckets = 5000;
const rateBuckets = new Map<string, RateLimitBucket>();

export async function POST(request: NextRequest) {
  const config = readRuntimeConfig();
  if (!config.analyticsEnabled) {
    return NextResponse.json(
      { error: 'analytics_disabled', message: '统计采集未启用。' },
      { status: 503 },
    );
  }

  const rate = consumeRateLimit(resolveClientIp(request.headers));
  if (!rate.allowed) {
    const response = NextResponse.json(
      { error: 'rate_limited', message: '上报过于频繁，请稍后重试。' },
      { status: 429 },
    );
    response.headers.set('Retry-After', String(rate.retryAfterSeconds));
    return markResponseNoStore(response);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return markResponseNoStore(
      NextResponse.json(
        { error: 'invalid_body', message: '请求体不是合法 JSON。' },
        { status: 400 },
      ),
    );
  }

  const parsed = batchSchema.safeParse(payload);
  if (!parsed.success) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'invalid_events',
          message: '事件格式不符合要求。',
          issues: parsed.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const now = new Date();
  const receivedAt = now.toISOString();
  const day = toAnalyticsDay(now);
  if (!day) {
    return NextResponse.json(
      { error: 'server_clock_invalid', message: '服务端时间不可用。' },
      { status: 500 },
    );
  }

  const identity = await resolveAnalyticsIdentity({
    request,
    clientIdFromBody: parsed.data.events.find((event) => event.client_id)?.client_id,
    sessionIdFromBody: parsed.data.events[0]?.session_id,
  });

  const maxSkewMs = analyticsLimits.maxEventAgeDays * 24 * 60 * 60 * 1000;
  const env = resolveAnalyticsEnv();
  const accepted: AnalyticsEventRecord[] = [];
  let dropped = 0;

  for (const item of parsed.data.events) {
    if (!isAnalyticsEventName(item.event_name)) {
      dropped += 1;
      continue;
    }

    const occurredAt = new Date(item.occurred_at);
    if (
      Number.isNaN(occurredAt.getTime()) ||
      Math.abs(now.getTime() - occurredAt.getTime()) > maxSkewMs
    ) {
      dropped += 1;
      continue;
    }

    const properties = item.properties ?? {};
    if (
      Buffer.byteLength(JSON.stringify(properties), 'utf8') > analyticsLimits.maxPropertiesBytes
    ) {
      dropped += 1;
      continue;
    }

    accepted.push({
      eventId: item.event_id,
      eventName: item.event_name,
      schemaVersion: analyticsSchemaVersion,
      project: 'yct',
      env,
      occurredAt: occurredAt.toISOString(),
      receivedAt,
      day,
      clientId: item.client_id ?? identity.clientId,
      sessionId: item.session_id,
      userId: identity.userId,
      route: item.route,
      locale: item.locale,
      embedHost: item.embed_host,
      release: item.release,
      properties,
    });
  }

  let inserted = 0;
  if (accepted.length > 0) {
    try {
      const store = createAnalyticsStore(config.analyticsDbPath);
      inserted = await store.append(accepted);
    } catch {
      return NextResponse.json(
        { error: 'analytics_store_unavailable', message: '统计存储暂不可用。' },
        { status: 500 },
      );
    }
  }

  const response = NextResponse.json({
    accepted: inserted,
    duplicate: accepted.length - inserted,
    dropped,
  });

  if (identity.issuedClientId) {
    writeAnalyticsClientCookie(response, {
      clientId: identity.clientId,
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  return markResponseNoStore(response);
}

function resolveAnalyticsEnv(): string {
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return process.env.NODE_ENV === 'test' ? 'test' : 'local';
}

function consumeRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  if (rateBuckets.size > rateMaxBuckets) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) {
        rateBuckets.delete(bucketKey);
      }
    }
  }

  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + rateWindowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= rateMaxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
