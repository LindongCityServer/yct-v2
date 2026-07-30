'use client';

import type { ApiListResponse, ServiceEntry, ServiceEntryGroup } from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { getLocalizedFaqContent } from '../lib/faq-translations';

const serviceCategoryLabelKeys: Record<ServiceEntry['categoryId'], CommonMessageKey> = {
  operations: 'services.category.operations',
  server_sites: 'services.category.serverSites',
  toolbox: 'services.category.toolbox',
  other: 'services.category.other',
};

export function ServicesPageContent({
  serviceGroups,
}: Readonly<{
  serviceGroups: ApiListResponse<ServiceEntryGroup>;
}>) {
  const { locale, t } = useI18n();
  const faqContent = getLocalizedFaqContent(locale);

  return (
    <section className="module-panel" aria-labelledby="services-title">
      <h1 id="services-title" className="sr-only">
        {t('page.services')}
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
                <h2 id={`service-group-${group.categoryId}`}>
                  {t(serviceCategoryLabelKeys[group.categoryId])}
                </h2>
                <span className="muted">
                  {t('services.itemCount', { count: group.items.length })}
                </span>
              </div>
              <div className="service-entry-grid">
                {group.items.map((entry) => {
                  const localizedEntry =
                    entry.id === 'default-faq'
                      ? {
                          ...entry,
                          title: faqContent.serviceTitle,
                          description: faqContent.serviceDescription,
                        }
                      : entry;

                  return (
                    <a
                      className="service-entry"
                      href={appPath(localizedEntry.href)}
                      target={localizedEntry.openMode === 'new_tab' ? '_blank' : undefined}
                      rel={localizedEntry.openMode === 'new_tab' ? 'noreferrer' : undefined}
                      key={localizedEntry.id}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {localizedEntry.icon}
                      </span>
                      <span>
                        <strong>{localizedEntry.title}</strong>
                        {localizedEntry.description ? (
                          <span className="muted">{localizedEntry.description}</span>
                        ) : null}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            apps
          </span>
          <p>{t('services.empty')}</p>
        </div>
      )}
    </section>
  );
}
