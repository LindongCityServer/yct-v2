import Link from 'next/link';
import { SecondaryShell } from '../../components/app-shell';
import { appPath } from '../../lib/app-paths';

export default function OfflinePage() {
  return (
    <SecondaryShell title="离线">
      <section className="module-panel offline-page-panel" aria-labelledby="offline-title">
        <span className="material-symbols-outlined" aria-hidden="true">
          cloud_off
        </span>
        <h1 id="offline-title">当前网络不可用</h1>
        <p>
          可以继续打开近期访问过的运营信息、线路、站点详情和服务入口。恢复联网后，雨城通会重新读取最新数据。
        </p>
        <div className="settings-action-row" aria-label="离线可用入口">
          <Link className="secondary-action-button" href={appPath('/')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              article
            </span>
            <span>运营信息</span>
          </Link>
          <Link className="secondary-action-button" href={appPath('/map')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              map
            </span>
            <span>地图探索</span>
          </Link>
          <Link className="secondary-action-button" href={appPath('/travel/schedules')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              departure_board
            </span>
            <span>班次查询</span>
          </Link>
          <Link className="secondary-action-button" href={appPath('/account')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              download_for_offline
            </span>
            <span>离线管理</span>
          </Link>
        </div>
        <p className="settings-row-note">
          如果这些入口无法打开，说明对应内容尚未被缓存。联网后可在账号设置中刷新缓存或更新自定义离线范围。
        </p>
      </section>
    </SecondaryShell>
  );
}
