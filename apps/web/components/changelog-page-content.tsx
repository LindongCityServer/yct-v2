'use client';

import type { ReleaseChangeCategory, ReleaseManifest } from '../lib/release-manifest';
import { useEffect } from 'react';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { publishReleaseNotesViewed } from '../lib/client-release-events';

const categoryLabelKeys: Record<ReleaseChangeCategory, CommonMessageKey> = {
  feat: 'changelog.category.feat',
  fix: 'changelog.category.fix',
  perf: 'changelog.category.perf',
  style: 'changelog.category.style',
};

export function ChangelogPageContent({
  manifest,
}: Readonly<{
  manifest: ReleaseManifest;
}>) {
  const { locale, t } = useI18n();
  const dateFormatter = new Intl.DateTimeFormat(locale === 'en' ? 'en' : locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  });

  useEffect(() => {
    publishReleaseNotesViewed({
      version: manifest.currentVersion,
      buildId: manifest.buildId,
      viewedAt: new Date().toISOString(),
    });
  }, [manifest.buildId, manifest.currentVersion]);

  return (
    <section className="module-panel changelog-page" aria-labelledby="changelog-title">
      <header className="changelog-heading">
        <h1 id="changelog-title">{t('changelog.title')}</h1>
        <span className="changelog-current-version">{manifest.currentVersion}</span>
      </header>

      {manifest.releases.length > 0 ? (
        <div className="changelog-release-list">
          {manifest.releases.map((release, index) => (
            <details className="changelog-release" open={index === 0} key={release.version}>
              <summary>
                <span className="changelog-release-heading">
                  <strong>{release.version}</strong>
                  <time dateTime={release.releasedAt}>
                    {dateFormatter.format(new Date(release.releasedAt))}
                  </time>
                </span>
                <span className="muted">
                  {t('changelog.changeCount', { count: release.changeCount })}
                </span>
                <span
                  className="material-symbols-outlined changelog-release-toggle"
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </summary>
              <ul className="changelog-change-list">
                {release.changes.map((change) => (
                  <li key={change.changeId}>
                    <span className={`changelog-change-category is-${change.category}`}>
                      {t(categoryLabelKeys[change.category])}
                    </span>
                    <span className="changelog-change-summary">{change.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : (
        <p className="empty-state changelog-empty">{t('changelog.empty')}</p>
      )}
    </section>
  );
}
