import { AppShell } from '../../components/app-shell';
import { GlobalSearchPanel } from '../../components/global-search-panel';
import { getPageMetadata } from '../../lib/site-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return getPageMetadata('ask');
}

export default async function AskPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ q?: string | string[] }>;
}>) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const q = resolvedSearchParams?.q;
  const initialQuery = Array.isArray(q) ? (q[0] ?? '') : (q ?? '');

  return (
    <AppShell pageTitleKey="page.ask" hideAssistantEntry>
      <GlobalSearchPanel variant="page" initialQuery={initialQuery} />
    </AppShell>
  );
}
