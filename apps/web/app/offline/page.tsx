import { SecondaryShell } from '../../components/app-shell';

export default function OfflinePage() {
  return (
    <SecondaryShell title="离线">
      <section className="module-panel empty-state" aria-labelledby="offline-title">
        <span className="material-symbols-outlined" aria-hidden="true">
          cloud_off
        </span>
        <h1 id="offline-title">当前网络不可用</h1>
        <p>可以继续打开近期访问过的线路、服务和运营信息。</p>
      </section>
    </SecondaryShell>
  );
}
