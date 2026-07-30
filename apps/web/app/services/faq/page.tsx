'use client';

import { SecondaryShell } from '../../../components/app-shell';
import { useMemo } from 'react';
import { FaqPageContent } from '../../../components/faq-page-content';
import { OperationTableOfContents } from '../../../components/operation-table-of-contents';
import { useI18n } from '../../../lib/client-i18n';
import { getLocalizedFaqContent } from '../../../lib/faq-translations';

export default function FaqPage() {
  const { locale } = useI18n();
  const content = useMemo(() => getLocalizedFaqContent(locale), [locale]);
  const headings = useMemo(
    () =>
      content.groups.map((group) => ({
        id: group.id,
        level: 2 as const,
        text: group.title,
      })),
    [content.groups],
  );

  return (
    <SecondaryShell
      title={content.pageTitle}
      backHref="/services"
      desktopBackHref="/services"
      secondaryActions={
        <OperationTableOfContents headings={headings} title={content.directoryTitle} />
      }
    >
      <FaqPageContent />
    </SecondaryShell>
  );
}
