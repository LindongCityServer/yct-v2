import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { publishDomainEvent } from '../../../../../lib/app-event-bus';
import { findRideCodeSessionById } from '../../../../../lib/ride-code-session-store';
import { ensureRideCodeListenersRegistered } from '../../../../../lib/ride-code-workflow';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

const supportedEventTypes = new Set([
  'RideAuthorizationGranted',
  'RideAuthorizationEntered',
  'RideAuthorizationCaptured',
  'RideAuthorizationReleased',
]);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const signingSecret = readRuntimeConfig().ldpassRideWebhookSecret;
  if (!signingSecret) {
    return NextResponse.json(
      {
        error: 'ride_webhook_not_configured',
        message: '未配置 LDPASS_RIDE_WEBHOOK_SECRET。',
      },
      { status: 503 },
    );
  }

  const timestamp = request.headers.get('x-ldpass-timestamp')?.trim();
  const signature = request.headers.get('x-ldpass-signature')?.trim();
  const headerEventType = request.headers.get('x-ldpass-webhook-event')?.trim();
  const body = await request.text();
  if (
    !timestamp ||
    !signature ||
    !headerEventType ||
    !verifyWebhookSignature({ timestamp, signature, body, signingSecret })
  ) {
    return NextResponse.json(
      {
        error: 'invalid_ldpass_webhook_signature',
        message: '临东通 Webhook 签名无效。',
      },
      { status: 401 },
    );
  }

  const parsed = parseWebhookBody(body, headerEventType);
  if (!parsed) {
    return NextResponse.json(
      {
        error: 'invalid_ldpass_webhook_payload',
        message: '临东通 Webhook 负载无效。',
      },
      { status: 400 },
    );
  }
  if (!supportedEventTypes.has(parsed.eventType)) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const session = await findRideCodeSessionById(parsed.externalReferenceId);
  if (!session) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const synchronization = buildSynchronizationPayload(parsed, session);
  if (!synchronization) {
    return NextResponse.json(
      {
        error: 'invalid_ldpass_ride_authorization',
        message: '临东通乘车授权事件缺少必要字段。',
      },
      { status: 400 },
    );
  }

  ensureRideCodeListenersRegistered();
  await publishDomainEvent({
    eventId: `ldpass_webhook_${parsed.eventId}`,
    type: 'RideCodeAuthorizationSynchronized',
    occurredAt: parsed.createdAt,
    actor: {
      type: 'adapter',
      id: 'ldpass-webhook',
    },
    payload: synchronization,
  });
  if (synchronization.status === 'Released' || synchronization.status === 'Expired') {
    await publishDomainEvent({
      eventId: `ldpass_release_${parsed.eventId}`,
      type: 'RideCodeAuthorizationReleased',
      occurredAt: parsed.createdAt,
      actor: {
        type: 'adapter',
        id: 'ldpass-webhook',
      },
      payload: {
        sessionId: synchronization.sessionId,
        authorizationId: synchronization.authorizationId,
        reason: parsed.reason ?? 'provider_released',
        releasedAt: parsed.createdAt,
      },
    });
  }

  return NextResponse.json({ accepted: true });
}

function verifyWebhookSignature(input: {
  timestamp: string;
  signature: string;
  body: string;
  signingSecret: string;
}): boolean {
  if (!Number.isFinite(Date.parse(input.timestamp))) {
    return false;
  }
  const providedSignature = input.signature.startsWith('v1=') ? input.signature.slice(3) : '';
  const expectedSignature = createHmac('sha256', input.signingSecret)
    .update(`${input.timestamp}\n${input.body}`)
    .digest('base64url');
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function parseWebhookBody(
  body: string,
  headerEventType: string,
): {
  eventId: string;
  eventType: string;
  createdAt: string;
  authorizationId: string;
  externalReferenceId: string;
  passId: string;
  actionLinkId?: string;
  maximumFareValue?: string;
  reservedValue?: string;
  capturedValue?: string;
  expiresAt?: string;
  reason?: string;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const eventId = readString(record.eventId);
  const eventType = readString(record.eventType);
  const createdAt = readString(record.createdAt);
  const payload = record.payload;
  if (
    !eventId ||
    !eventType ||
    eventType !== headerEventType ||
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return null;
  }

  const authorization = payload as Record<string, unknown>;
  const authorizationId = readString(authorization.authorizationId);
  const externalReferenceId = readString(authorization.externalReferenceId);
  const passId = readString(authorization.passId);
  if (!authorizationId || !externalReferenceId || !passId) {
    return null;
  }
  return {
    eventId,
    eventType,
    createdAt: new Date(createdAt).toISOString(),
    authorizationId,
    externalReferenceId,
    passId,
    actionLinkId: readString(authorization.actionLinkId),
    maximumFareValue: readString(authorization.maximumFareValue),
    reservedValue: readString(authorization.reservedValue),
    capturedValue: readString(authorization.capturedValue),
    expiresAt: readString(authorization.expiresAt),
    reason: readString(authorization.reason),
  };
}

function buildSynchronizationPayload(
  webhook: NonNullable<ReturnType<typeof parseWebhookBody>>,
  session: Awaited<ReturnType<typeof findRideCodeSessionById>> & {},
) {
  if (!session) {
    return null;
  }
  const status: 'Authorized' | 'Entered' | 'Captured' | 'Released' | 'Expired' =
    webhook.eventType === 'RideAuthorizationGranted'
      ? 'Authorized'
      : webhook.eventType === 'RideAuthorizationEntered'
        ? 'Entered'
        : webhook.eventType === 'RideAuthorizationCaptured'
          ? 'Captured'
          : webhook.reason === 'authorization_expired'
            ? 'Expired'
            : 'Released';
  const authorizationExpiresAt = webhook.expiresAt ?? session.authorizationExpiresAt;
  if (!authorizationExpiresAt) {
    return null;
  }
  return {
    sessionId: session.id,
    authorizationId: webhook.authorizationId,
    ...(webhook.actionLinkId ? { actionLinkId: webhook.actionLinkId } : {}),
    passId: webhook.passId,
    status,
    maximumFareValue: webhook.maximumFareValue ?? session.maximumFareValue,
    reservedValue: webhook.reservedValue ?? (status === 'Entered' ? session.maximumFareValue : '0'),
    ...(webhook.capturedValue ? { capturedValue: webhook.capturedValue } : {}),
    authorizationExpiresAt,
    occurredAt: webhook.createdAt,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
