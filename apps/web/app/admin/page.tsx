import { SecondaryShell } from '../../components/app-shell';
import { AdminHomeOverview } from '../../components/admin-home-overview';
import { AdminSectionNavigation } from '../../components/admin-section-navigation';

export const dynamic = 'force-dynamic';

export default function AdminHomePage() {
  return (
    <SecondaryShell title="管理后台" backHref="/account">
      <section className="module-panel admin-home-panel" aria-labelledby="admin-home-title">
        <div className="section-heading">
          <h1 id="admin-home-title">管理后台</h1>
          <span className="muted">按业务域进入对应后台，账号页只保留这个统一入口。</span>
        </div>
        <AdminHomeOverview />
        <AdminSectionNavigation currentPath="/admin" />
      </section>
    </SecondaryShell>
  );
}
