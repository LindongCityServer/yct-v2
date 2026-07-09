import type { LdpassClientSessionResponse, YctAdminMembership, YctAdminRole } from '@yct/contracts';
import { findActiveAdminByLdpassUserId } from './admin-membership-store';

type ActiveLdpassUser = NonNullable<LdpassClientSessionResponse['user']>;

export async function resolveYctAdminMembershipForLdpassUser(
  user: ActiveLdpassUser,
): Promise<YctAdminMembership | undefined> {
  const localMembership = await findActiveAdminByLdpassUserId(user.id);
  if (localMembership) {
    return localMembership;
  }

  const inheritedRole = resolveInheritedLdpassAdminRole(user.role);
  if (!inheritedRole) {
    return undefined;
  }

  const now = new Date().toISOString();
  return {
    id: `ldpass_admin_${user.id}`,
    yctUserId: `yct_user_${user.id}`,
    ldpassUserId: user.id,
    role: inheritedRole,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveInheritedLdpassAdminRole(role: string | undefined): YctAdminRole | undefined {
  if (role === 'super_admin') {
    return 'super_admin';
  }

  if (role === 'admin') {
    return 'admin';
  }

  return undefined;
}
