import { AppShell } from '../components/app-shell';
import { OperationsHome } from '../components/operations-home';
import { readOperationsFeed } from '../lib/operations-content';
import { readOperationsStrongReminderItems } from '../lib/operations-reminders';
import { readOperationsServerStatus } from '../lib/operations-server-status';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [feed, reminders, serverStatus] = await Promise.all([
    readOperationsFeed(),
    readOperationsStrongReminderItems(),
    readOperationsServerStatus(),
  ]);

  return (
    <AppShell active="operations">
      <OperationsHome feed={feed} reminders={reminders} serverStatus={serverStatus} />
    </AppShell>
  );
}
