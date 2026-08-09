import { SecondaryShell } from '../../../components/app-shell';
import { ChangelogPageContent } from '../../../components/changelog-page-content';
import { readReleaseManifest } from '../../../lib/release-manifest';
import { getPageMetadata } from '../../../lib/site-metadata';

export async function generateMetadata() {
  return getPageMetadata('changelog');
}

export default function ChangelogPage() {
  return (
    <SecondaryShell
      title="版本更新"
      titleKey="page.changelog"
      backHref="/services"
      desktopBackHref="/services"
    >
      <ChangelogPageContent manifest={readReleaseManifest()} />
    </SecondaryShell>
  );
}
