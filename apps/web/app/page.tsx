import { AppShell } from '../components/app-shell';
import { OperationsHome } from '../components/operations-home';
import { readOperationsFeed } from '../lib/operations-content';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const feed = await readOperationsFeed();

  return (
    <AppShell active="operations">
      <OperationsHome feed={feed} />
    </AppShell>
  );
}
