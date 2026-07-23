import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { YctAdminMembership, YctAdminRole } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface AdminMembershipSnapshot {
  version: 1;
  memberships: YctAdminMembership[];
}

const emptySnapshot: AdminMembershipSnapshot = {
  version: 1,
  memberships: [],
};

export async function listAdminMemberships(): Promise<YctAdminMembership[]> {
  const snapshot = await readSnapshot();
  return snapshot.memberships;
}

export async function findActiveAdminByLdpassUserId(
  ldpassUserId: string,
): Promise<YctAdminMembership | undefined> {
  const memberships = await listAdminMemberships();
  return memberships.find(
    (membership) => membership.ldpassUserId === ldpassUserId && membership.status === 'active',
  );
}

export async function upsertSuperAdmin(input: {
  ldpassUserId: string;
  yctUserId?: string;
}): Promise<YctAdminMembership> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const existing = snapshot.memberships.find(
    (membership) => membership.ldpassUserId === input.ldpassUserId,
  );

  if (existing) {
    const updated: YctAdminMembership = {
      ...existing,
      yctUserId: input.yctUserId ?? existing.yctUserId,
      role: 'super_admin',
      status: 'active',
      updatedAt: now,
    };
    await writeSnapshot({
      ...snapshot,
      memberships: snapshot.memberships.map((membership) =>
        membership.id === existing.id ? updated : membership,
      ),
    });
    return updated;
  }

  const created: YctAdminMembership = {
    id: `admin_${randomUUID()}`,
    yctUserId: input.yctUserId ?? `yct_user_${input.ldpassUserId}`,
    ldpassUserId: input.ldpassUserId,
    role: 'super_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await writeSnapshot({
    ...snapshot,
    memberships: [...snapshot.memberships, created],
  });
  return created;
}

export async function setAdminMembership(input: {
  ldpassUserId: string;
  yctUserId: string;
  role: YctAdminRole;
  status: YctAdminMembership['status'];
}): Promise<YctAdminMembership> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const existing = snapshot.memberships.find(
    (membership) => membership.ldpassUserId === input.ldpassUserId,
  );
  const membership: YctAdminMembership = existing
    ? {
        ...existing,
        yctUserId: input.yctUserId,
        role: input.role,
        status: input.status,
        updatedAt: now,
      }
    : {
        id: `admin_${randomUUID()}`,
        yctUserId: input.yctUserId,
        ldpassUserId: input.ldpassUserId,
        role: input.role,
        status: input.status,
        createdAt: now,
        updatedAt: now,
      };

  await writeSnapshot({
    ...snapshot,
    memberships: existing
      ? snapshot.memberships.map((item) => (item.id === existing.id ? membership : item))
      : [...snapshot.memberships, membership],
  });
  return membership;
}

async function readSnapshot(): Promise<AdminMembershipSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as AdminMembershipSnapshot;
    return {
      version: 1,
      memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: AdminMembershipSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.adminStorePath)
    ? config.adminStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.adminStorePath);
}
