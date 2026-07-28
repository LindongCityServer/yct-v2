import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readRuntimeConfig } from './runtime-config';

export function authorizeRideGatewayRequest(
  request: NextRequest,
  bodyToken?: string,
): NextResponse | null {
  const expectedToken = readRuntimeConfig().rideGatewayToken;
  if (!expectedToken) {
    return NextResponse.json(
      {
        error: 'ride_gateway_not_configured',
        message: '未配置 YCT_RIDE_GATEWAY_TOKEN，乘车设备网关未开放。',
      },
      { status: 503 },
    );
  }

  const providedToken =
    request.headers.get('x-yct-ride-gateway-token')?.trim() ?? bodyToken?.trim();
  if (!providedToken || !safeEqual(providedToken, expectedToken)) {
    return NextResponse.json(
      {
        error: 'unauthorized_ride_gateway',
        message: '乘车设备网关令牌无效。',
      },
      { status: 401 },
    );
  }

  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
