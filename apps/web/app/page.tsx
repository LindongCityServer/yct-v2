import { AppShell } from '../components/app-shell';
import { OperationsHome } from '../components/operations-home';
import { readOperationsFeed } from '../lib/operations-content';
import { readOperationsStrongReminderItems } from '../lib/operations-reminders';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [feed, reminders] = await Promise.all([
    readOperationsFeed(),
    readOperationsStrongReminderItems(),
  ]);

  return (
    <AppShell active="operations">
      <OperationsHome feed={feed} reminders={reminders} />
    </AppShell>
  );
}
