import { randomUUID } from 'node:crypto';
import type { YctAdminMembership, YctAdminRole, YctUserLink } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { listAdminMemberships, setAdminMembership } from './admin-membership-store';
import { listYctUserLinks } from './yct-user-link-store';

export interface AdminMembershipDirectory {
  memberships: YctAdminMembership[];
  users: YctUserLink[];
}

export type AdminMembershipUpdateResult =
  | { ok: true; membership: YctAdminMembership }
  | { ok: false; status: number; error: string; message: string };

export async function readAdminMembershipDirectory(): Promise<AdminMembershipDirectory> {
  const [memberships, users] = await Promise.all([listAdminMemberships(), listYctUserLinks()]);
  return { memberships, users };
}

export async function updateAdminMembership(input: {
  actorId: string;
  ldpassUserId: string;
  role: YctAdminRole;
  status: YctAdminMembership['status'];
}): Promise<AdminMembershipUpdateResult> {
  if (input.actorId === input.ldpassUserId && input.status === 'suspended') {
    return {
      ok: false,
      status: 409,
      error: 'cannot_suspend_current_admin',
      message: '不能在当前会话中停用自己的管理员权限。',
    };
  }

  const user = (await listYctUserLinks()).find(
    (candidate) => candidate.ldpassUserId === input.ldpassUserId,
  );
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: 'yct_user_not_found',
      message: '只能授权已经登录过雨城通的真实用户。',
    };
  }

  const membership = await setAdminMembership({
    ldpassUserId: user.ldpassUserId,
    yctUserId: user.id,
    role: input.role,
    status: input.status,
  });
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'AdminMembershipUpdated',
    actor: { type: 'admin', id: input.actorId },
    payload: {
      adminMembershipId: membership.id,
      yctUserId: membership.yctUserId,
      ldpassUserId: membership.ldpassUserId,
      role: membership.role,
      status: membership.status,
    },
  });
  return { ok: true, membership };
}
