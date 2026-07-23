import { cookies } from 'next/headers';
import { SecondaryShell } from '../../components/app-shell';
import { AccountSettingsPanel } from '../../components/account-settings-panel';
import { readRuntimeConfig } from '../../lib/runtime-config';
import { readYctServerSession } from '../../lib/yct-server-session-store';
import { yctSessionCookieName } from '../../lib/yct-session';

export default async function AccountPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ auth?: string | string[] }>;
}>) {
  const config = readRuntimeConfig();
  const cookieStore = await cookies();
  const serverSession = await readYctServerSession(cookieStore.get(yctSessionCookieName)?.value);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const authStatus = Array.isArray(resolvedSearchParams?.auth)
    ? (resolvedSearchParams?.auth[0] ?? '')
    : (resolvedSearchParams?.auth ?? '');

  return (
    <SecondaryShell title="账号设置" titleKey="page.account" legalVariant="mobile">
      <AccountSettingsPanel
        auth={{
          ldpassConfigured: Boolean(config.ldpassBaseUrl && config.ldpassClientId),
          ldpassBaseUrl: config.ldpassBaseUrl,
          status: normalizeAuthStatus(authStatus),
          session: serverSession?.snapshot,
        }}
      />
    </SecondaryShell>
  );
}

function normalizeAuthStatus(value: string) {
  const knownStatuses = [
    'login_success',
    'readonly',
    'logged_out',
    'state_invalid',
    'session_unavailable_localhost',
    'session_cookie_missing',
    'session_unavailable',
    'session_error',
    'ldpass_not_configured',
  ] as const;

  return knownStatuses.find((status) => status === value);
}
