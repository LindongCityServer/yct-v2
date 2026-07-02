import { AppShell } from '../../components/app-shell';
import { readServiceEntryGroups } from '../../lib/service-entries';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const serviceGroups = await readServiceEntryGroups();

  return (
    <AppShell active="services" pageTitle="更多服务">
      <section className="module-panel" aria-labelledby="services-title">
        <h1 id="services-title" className="sr-only">
          更多服务
        </h1>
        {serviceGroups.items.length > 0 ? (
          <div className="service-groups">
            {serviceGroups.items.map((group) => (
              <section
                className="service-group"
                aria-labelledby={`service-group-${group.categoryId}`}
                key={group.categoryId}
              >
                <div className="section-heading">
                  <h2 id={`service-group-${group.categoryId}`}>{group.title}</h2>
                  <span className="muted">{group.items.length} 项</span>
                </div>
                <div className="service-entry-grid">
                  {group.items.map((entry) => (
                    <a
                      className="service-entry"
                      href={entry.href}
                      target={entry.openMode === 'new_tab' ? '_blank' : undefined}
                      rel={entry.openMode === 'new_tab' ? 'noreferrer' : undefined}
                      key={entry.id}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {entry.icon}
                      </span>
                      <span>
                        <strong>{entry.title}</strong>
                        {entry.description ? (
                          <span className="muted">{entry.description}</span>
                        ) : null}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              apps
            </span>
            <p>{serviceGroups.meta.message ?? '暂无服务入口'}</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
