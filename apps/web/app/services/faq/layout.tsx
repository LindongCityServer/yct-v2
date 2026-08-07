import type { ReactNode } from 'react';
import { faqGroups } from '../../../lib/faq-content';
import { pageMetadata, serializeJsonLd } from '../../../lib/site-metadata';

export const metadata = pageMetadata.faq;

export default function FaqLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqGroups.flatMap((group) =>
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

function faqAnswerText(answer: (typeof faqGroups)[number]['items'][number]['answer']): string {
  return Array.isArray(answer)
    ? answer.map((part) => (typeof part === 'string' ? part : part.text)).join('')
    : answer;
}
