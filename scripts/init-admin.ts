import { upsertSuperAdmin } from '../apps/web/lib/admin-membership-store';

async function main() {
  const ldpassUserId = process.argv[2]?.trim();

  if (!ldpassUserId) {
    console.error('用法：pnpm admin:init <ldpassUserId>');
    process.exitCode = 1;
    return;
  }

  const membership = await upsertSuperAdmin({ ldpassUserId });
  console.log(
    JSON.stringify(
      {
        ok: true,
        adminMembershipId: membership.id,
        ldpassUserId: membership.ldpassUserId,
        role: membership.role,
        status: membership.status,
      },
      null,
      2,
    ),
  );
}

void main();
