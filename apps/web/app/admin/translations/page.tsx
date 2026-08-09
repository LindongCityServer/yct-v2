import { SecondaryShell } from '../../../components/app-shell';
import { AdminEntityTranslationsPanel } from '../../../components/admin-entity-translations-panel';
import { AdminSectionNavigation } from '../../../components/admin-section-navigation';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('adminTranslations');
}

export default function AdminTranslationsPage() {
  return (
    <SecondaryShell
      title="名称翻译后台"
      backHref="/admin"
      desktopNavigation={
        <AdminSectionNavigation currentPath="/admin/translations" includeOverview />
      }
    >
      <AdminEntityTranslationsPanel />
    </SecondaryShell>
  );
}
