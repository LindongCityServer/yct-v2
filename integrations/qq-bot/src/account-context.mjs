import { createHmac } from 'node:crypto';

/**
 * 生成给雨城通问一问的账号上下文头。
 * 只签 ldpassUserId/openId 和短时效，不包含服务器账号、Wiki 资料或订单。
 */
export function createAccountContextToken({
  ldpassUserId,
  openId,
  secret,
  ttlSeconds = 60,
  now = Date.now(),
}) {
  if (!ldpassUserId || !openId || !secret) {
    return null;
  }
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      ldpassUserId,
      openId,
      iat,
      exp: iat + Math.max(15, Math.min(300, ttlSeconds)),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
