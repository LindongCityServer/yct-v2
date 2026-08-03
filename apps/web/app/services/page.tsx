import { AppShell } from '../../components/app-shell';
import { ServicesPageContent } from '../../components/services-page-content';
import { readServiceEntryGroups } from '../../lib/service-entries';
import { pageMetadata } from '../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata.services;

export default async function ServicesPage() {
  const serviceGroups = await readServiceEntryGroups();

  return (
    <AppShell active="services" pageTitle="更多服务" pageTitleKey="page.services">
      <ServicesPageContent serviceGroups={serviceGroups} />
    </AppShell>
  );
}
