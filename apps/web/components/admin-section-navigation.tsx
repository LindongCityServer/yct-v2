import Link from 'next/link';
import { appPath } from '../lib/app-paths';

const adminEntries = [
  {
    path: '/admin',
    icon: 'space_dashboard',
    title: '概览',
    description: '查看后台状态摘要和各业务域入口。',
  },
  {
    path: '/admin/operations',
    icon: 'admin_panel_settings',
    title: '内容后台',
    description: '管理内容、素材、首页强提醒和运营展示。',
  },
  {
    path: '/admin/audit-events',
    icon: 'fact_check',
    title: '审计事件',
    description: '追踪后台事件、操作者、实体 ID、派发状态和失败原因。',
  },
  {
    path: '/admin/services',
    icon: 'dashboard_customize',
    title: '服务后台',
    description: '维护服务入口、排序、上下线状态和跳转方式。',
  },
  {
    path: '/admin/transit',
    icon: 'route',
    title: '线路与班次后台',
    description: '管理线路、班次、交通方式、服务摘要和发布版本。',
  },
  {
    path: '/admin/map-poi',
    icon: 'add_location_alt',
    title: 'POI 后台',
    description: '审核 POI 投稿，维护分类、图标和地图资料。',
  },
] as const;

export function AdminSectionNavigation({
  currentPath,
  includeOverview = false,
}: Readonly<{
  currentPath?: string;
  includeOverview?: boolean;
}>) {
  const entries = includeOverview ? adminEntries : adminEntries.slice(1);

  return (
    <nav className="service-entry-grid admin-home-grid" aria-label="后台导航">
      {entries.map((entry) => (
        <Link
          className="service-entry admin-home-entry"
          href={appPath(entry.path)}
          aria-current={currentPath === entry.path ? 'page' : undefined}
          key={entry.path}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {entry.icon}
          </span>
          <span>
            <strong>{entry.title}</strong>
            <span className="muted">{entry.description}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
