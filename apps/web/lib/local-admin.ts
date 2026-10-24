import { readRuntimeConfig } from './runtime-config';

/**
 * 本机开发用的本地管理员身份判断。
 *
 * 本地管理员登录后直接视为已验证服务器账号，便于在本地测试
 * 免审核下载、乘车码等依赖「服务器账号已验证」的功能。
 */
export function isLocalAdminUser(
  user: { id?: string; username?: string } | undefined,
): boolean {
  if (!user) {
    return false;
  }
  const config = readRuntimeConfig();
  if (!config.localAdminAuthEnabled) {
    return false;
  }
  return (
    (Boolean(config.localAdminUserId) && user.id === config.localAdminUserId) ||
    (Boolean(config.localAdminUsername) && user.username === config.localAdminUsername)
  );
}

export function resolveServerAccountVerified(
  user:
    | { id?: string; username?: string; serverAccountVerified?: boolean }
    | undefined,
): boolean {
  return user?.serverAccountVerified === true || isLocalAdminUser(user);
}
