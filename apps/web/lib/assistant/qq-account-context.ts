import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export interface QqAccountContext {
  ldpassUserId: string;
  openId: string;
}

interface ContextPayload extends QqAccountContext {
  iat: number;
  exp: number;
}

const maximumAgeSeconds = 10 * 60;
const clockSkewSeconds = 30;

/**
 * 验证 QQ 机器人带来的账号上下文。
 *
 * 该头只能由 QQ 机器人用独立 secret 签名；网页端不能从 query/body 接受
 * ldpassUserId，否则任何人都能伪造他人身份。
 */
export function readQqAccountContext(request: NextRequest): QqAccountContext | undefined {
  const secret = process.env.YCT_QQ_CONTEXT_SECRET?.trim();
  if (!secret) {
    return undefined;
  }
  const token = request.headers.get('x-yct-qq-account-context')?.trim();
  if (!token || token.length > 4096) {
    return undefined;
  }

  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) {
    return undefined;
  }
  const expected = createHmac('sha256', secret).update(encodedPayload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return undefined;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return undefined;
  }

  let payload: ContextPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as ContextPayload;
  } catch {
    return undefined;
  }
  if (
    typeof payload?.ldpassUserId !== 'string' ||
    !payload.ldpassUserId ||
    typeof payload?.openId !== 'string' ||
    !payload.openId ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return undefined;
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    payload.exp <= now ||
    payload.iat > now + clockSkewSeconds ||
    now - payload.iat > maximumAgeSeconds
  ) {
    return undefined;
  }

  return {
    ldpassUserId: payload.ldpassUserId,
    openId: payload.openId,
  };
}
