import { NextRequest, NextResponse } from 'next/server';
import { authorizeRideGatewayRequest } from '../../../../../lib/ride-gateway-auth';
import { acceptRideGateEvent } from '../../../../../lib/ride-code-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const input = await readGateEventBody(request);
  if (!input) {
    return NextResponse.json(
      {
        error: 'invalid_gate_event',
        message: '乘车设备事件格式无效。',
      },
      { status: 400 },
    );
  }
  const unauthorized = authorizeRideGatewayRequest(request, input.gatewayToken);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await acceptRideGateEvent(input);
  if (result.ok) {
    return NextResponse.json({
      accepted: true,
      sessionId: result.sessionId,
      status: result.status,
      message: result.message,
    });
  }

  return NextResponse.json(
    {
      accepted: false,
      error: result.reason,
      message: result.message,
    },
    { status: readGateEventFailureStatus(result.reason) },
  );
}

async function readGateEventBody(request: NextRequest): Promise<{
  deviceEventId: string;
  deviceId: string;
  operation: 'entry' | 'exit';
  playerName: string;
  occurredAt: string;
  gatewayToken?: string;
} | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const deviceEventId = readRequiredString(record.deviceEventId, 36, 64);
  const deviceId = readRequiredString(record.deviceId, 1, 80);
  const playerName = readRequiredString(record.playerName, 1, 64);
  const operation =
    record.operation === 'entry' || record.operation === 'exit' ? record.operation : null;
  const occurredAt = readRequiredString(record.occurredAt, 20, 64);
  if (
    !deviceEventId ||
    !isUuid(deviceEventId) ||
    !deviceId ||
    !playerName ||
    !operation ||
    !occurredAt ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    return null;
  }

  return {
    deviceEventId,
    deviceId,
    operation,
    playerName,
    occurredAt: new Date(occurredAt).toISOString(),
    gatewayToken: readOptionalString(record.gatewayToken, 1, 512),
  };
}

function readRequiredString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length >= minimumLength && trimmed.length <= maximumLength ? trimmed : null;
}

function readOptionalString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | undefined {
  return readRequiredString(value, minimumLength, maximumLength) ?? undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readGateEventFailureStatus(
  reason:
    | 'device_not_configured'
    | 'operation_mismatch'
    | 'session_not_found'
    | 'session_not_ready'
    | 'fare_not_configured'
    | 'upstream_unavailable',
): number {
  if (reason === 'device_not_configured') {
    return 404;
  }
  if (reason === 'fare_not_configured') {
    return 422;
  }
  if (reason === 'upstream_unavailable') {
    return 502;
  }
  return 409;
}
