'use client';

import { useEffect, useState } from 'react';
import type { MarkdownHeading } from './markdown-blocks';

export function OperationTableOfContents({
  headings,
}: Readonly<{
  headings: MarkdownHeading[];
}>) {
  const [expanded, setExpanded] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState(headings[0]?.id ?? null);

  useEffect(() => {
    const headingElements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((heading): heading is HTMLElement => heading !== null);

    if (headingElements.length === 0) {
      return undefined;
    }

    let frameId: number | undefined;
    const updateActiveHeading = () => {
      frameId = undefined;
      const nextHeading = headingElements.reduce<HTMLElement>((current, heading) => {
        return heading.getBoundingClientRect().top <= 96 ? heading : current;
      }, headingElements[0]);

      setActiveHeadingId((current) => (current === nextHeading.id ? current : nextHeading.id));
    };
    const requestUpdate = () => {
      if (frameId === undefined) {
        frameId = window.requestAnimationFrame(updateActiveHeading);
      }
    };

    updateActiveHeading();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <aside className={expanded ? 'operation-toc is-expanded' : 'operation-toc'}>
      <nav
        className="operation-toc-panel"
        id="operation-table-of-contents"
        aria-label="文章目录"
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <span className="operation-toc-title">文章目录</span>
        <ol>
          {headings.map((heading) => (
            <li className={`is-level-${heading.level}`} key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={activeHeadingId === heading.id ? 'location' : undefined}
                tabIndex={expanded ? undefined : -1}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveHeadingId(heading.id);
                  setExpanded(false);

                  window.history.pushState(null, '', `#${heading.id}`);
                  document.getElementById(heading.id)?.scrollIntoView({
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'auto'
                      : 'smooth',
                    block: 'start',
                  });
                }}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <button
        className="operation-toc-toggle"
        type="button"
        aria-controls="operation-table-of-contents"
        aria-expanded={expanded}
        aria-label={expanded ? '收起文章目录' : '展开文章目录'}
        title={expanded ? '收起文章目录' : '展开文章目录'}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {expanded ? 'close' : 'toc'}
        </span>
      </button>
    </aside>
  );
}
