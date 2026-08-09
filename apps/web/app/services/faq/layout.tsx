import type { ReactNode } from 'react';
import type { FaqAnswer } from '../../../lib/faq-content';
import { getLocalizedFaqContent } from '../../../lib/faq-translations';
import { getPageMetadata, resolveRequestLocale, serializeJsonLd } from '../../../lib/site-metadata';

export async function generateMetadata() {
  return getPageMetadata('faq');
}

export default async function FaqLayout({ children }: Readonly<{ children: ReactNode }>) {
  const content = getLocalizedFaqContent(await resolveRequestLocale());

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: content.groups.flatMap((group) =>
              group.items.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: faqAnswerText(item.answer),
                },
              })),
            ),
          }),
        }}
      />
      {children}
    </>
  );
}

function faqAnswerText(answer: FaqAnswer): string {
  return Array.isArray(answer)
    ? answer
        .map((part) =>
          typeof part === 'string' ? part : 'text' in part ? part.text : (part.label ?? ''),
        )
        .join('')
    : answer;
}
