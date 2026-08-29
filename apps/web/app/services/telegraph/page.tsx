import { SecondaryShell } from '../../../components/app-shell';
import {
  TelegraphStudioPanel,
  TelegraphToolbarActions,
} from '../../../components/telegraph-studio-panel';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return getPageMetadata('telegraph');
}

export default function TelegraphPage() {
  return (
    <SecondaryShell
      title="电报体验"
      backHref="/services"
      desktopBackHref="/services"
      secondaryActions={<TelegraphToolbarActions />}
    >
      <TelegraphStudioPanel />
    </SecondaryShell>
  );
}
