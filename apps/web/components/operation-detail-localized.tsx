'use client';

import { useI18n } from '../lib/client-i18n';
import { ButtonLink } from './ui/button';
import { StatusChip } from './ui/chip';

export function OperationTagList({ tags }: Readonly<{ tags: string[] }>) {
  const { t } = useI18n();

  return (
    <div className="operation-tag-list" aria-label={t('operation.contentTagsAria')}>
      {tags.map((tag) => (
        <StatusChip key={tag}>{tag}</StatusChip>
      ))}
    </div>
  );
}

export function OperationSourceNote({
  legacyImageSourceUrl,
  legacyLink,
}: Readonly<{
  legacyImageSourceUrl?: string;
  legacyLink?: string;
}>) {
  const { t } = useI18n();

  if (!legacyImageSourceUrl && !legacyLink) {
    return null;
  }

  return (
    <p className="operation-source-note">
      {legacyImageSourceUrl
        ? t('operation.legacyImageSource', { url: legacyImageSourceUrl })
        : null}
      {legacyImageSourceUrl && legacyLink ? ' · ' : null}
      {legacyLink ? (
        <a href={legacyLink} target="_blank" rel="noreferrer">
          {t('operation.originalLink')}
        </a>
      ) : null}
    </p>
  );
}

export function LegacyBodyFallback({ legacyLink }: Readonly<{ legacyLink?: string }>) {
  const { t } = useI18n();

  return (
    <div className="operation-empty-body">
      <span className="material-symbols-outlined" aria-hidden="true">
        open_in_new
      </span>
      <div>
        <strong>{t('operation.legacyBodyTitle')}</strong>
        <p>{t('operation.legacyBodyDescription')}</p>
      </div>
      {legacyLink ? (
        <ButtonLink
          variant="secondary"
          href={legacyLink}
          target="_blank"
          rel="noreferrer"
          icon="open_in_new"
        >
          {t('operation.openOriginal')}
        </ButtonLink>
      ) : null}
    </div>
  );
}
