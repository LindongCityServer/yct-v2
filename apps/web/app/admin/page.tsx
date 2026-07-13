import Link from 'next/link';
import { SecondaryShell } from '../../components/app-shell';
import { appPath } from '../../lib/app-paths';

const adminEntries = [
  {
    href: appPath('/admin/operations'),
    icon: 'admin_panel_settings',
    title: '内容后台',
    description: '管理内容、素材、首页强提醒和后台审计事件。',
  },
  {
    href: appPath('/admin/services'),
    icon: 'dashboard_customize',
    title: '服务后台',
    description: '维护服务入口、排序、上下线状态和跳转方式。',
  },
  {
    href: appPath('/admin/transit'),
    icon: 'route',
    title: '线路与班次后台',
    description: '管理线路、班次、交通方式、服务摘要和发布版本。',
  },
  {
    href: appPath('/admin/map-poi'),
    icon: 'add_location_alt',
    title: 'POI 后台',
    description: '审核 POI 投稿，维护分类、图标和地图资料。',
  },
] as const;

export const dynamic = 'force-dynamic';

export default function AdminHomePage() {
  return (
    <SecondaryShell title="管理后台" backHref="/account">
      <section className="module-panel admin-home-panel" aria-labelledby="admin-home-title">
        <div className="section-heading">
          <h1 id="admin-home-title">管理后台</h1>
          <span className="muted">按业务域进入对应后台，账号页只保留这个统一入口。</span>
        </div>
        <div className="service-entry-grid admin-home-grid" aria-label="后台入口">
          {adminEntries.map((entry) => (
            <Link className="service-entry admin-home-entry" href={entry.href} key={entry.href}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {entry.icon}
              </span>
              <span>
                <strong>{entry.title}</strong>
                <span className="muted">{entry.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </SecondaryShell>
  );
}
