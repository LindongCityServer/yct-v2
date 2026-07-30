'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { appPath } from '../lib/app-paths';
import type { FaqAnswer } from '../lib/faq-content';
import { formatFaqMessage, getLocalizedFaqContent } from '../lib/faq-translations';
import { useI18n } from '../lib/client-i18n';

export function FaqPageContent() {
  const { locale } = useI18n();
  const content = useMemo(() => getLocalizedFaqContent(locale), [locale]);

  useEffect(() => {
    const openHashTarget = () => {
      const targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!targetId) {
        return;
      }

      const target = document.getElementById(targetId);
      if (!(target instanceof HTMLDetailsElement)) {
        return;
      }

      target.open = true;
      window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    };

    openHashTarget();
    window.addEventListener('hashchange', openHashTarget);
    return () => window.removeEventListener('hashchange', openHashTarget);
  }, []);

  return (
    <article className="faq-page" aria-labelledby="faq-heading">
      <header className="faq-intro">
        <span className="material-symbols-outlined" aria-hidden="true">
          help
        </span>
        <div>
          <h2 id="faq-heading">{content.introTitle}</h2>
          <p>
            {formatFaqMessage(content.introDescription, {
              count: content.groups.reduce((total, group) => total + group.items.length, 0),
            })}
          </p>
        </div>
      </header>

      <div className="faq-groups">
        {content.groups.map((group) => (
          <section
            className="faq-group"
            id={group.id}
            aria-labelledby={`faq-group-${group.id}`}
            key={group.id}
          >
            <div className="faq-group-heading">
              <span className="material-symbols-outlined" aria-hidden="true">
                {group.icon}
              </span>
              <h2 id={`faq-group-${group.id}`}>{group.title}</h2>
              <span className="muted">
                {formatFaqMessage(content.groupItemCount, { count: group.items.length })}
              </span>
            </div>
            <div className="faq-list">
              {group.items.map((item) => (
                <details className="faq-item" id={item.id} key={item.id}>
                  <summary>
                    <span>{item.question}</span>
                    <span className="material-symbols-outlined faq-item-expand" aria-hidden="true">
                      expand_more
                    </span>
                  </summary>
                  <div className="faq-answer">{renderAnswer(item.answer)}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function renderAnswer(answer: FaqAnswer) {
  if (typeof answer === 'string') {
    return <p>{answer}</p>;
  }

  return (
    <p>
      {answer.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Link href={appPath(part.href)} key={`${part.href}-${index}`}>
            {part.text}
          </Link>
        ),
      )}
    </p>
  );
}
