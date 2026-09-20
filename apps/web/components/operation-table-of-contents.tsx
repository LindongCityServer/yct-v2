'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MarkdownHeading } from './markdown-blocks';

export function OperationTableOfContents({
  headings,
  title = '文章目录',
}: Readonly<{
  headings: MarkdownHeading[];
  title?: string;
}>) {
  const [expanded, setExpanded] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState(headings[0]?.id ?? null);
  const tocRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!expanded) return;
    const updatePosition = () => {
      const rect = toggleRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const top = Math.min(rect.bottom + 12, Math.max(12, window.innerHeight - 120));
      setPanelPosition({
        position: 'fixed',
        top,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        width,
        maxHeight: Math.max(80, Math.min(520, window.innerHeight - top - 12)),
        zIndex: 100,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [expanded]);

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

  useEffect(() => {
    if (!expanded) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        (!tocRef.current?.contains(target) && !panelRef.current?.contains(target))
      ) {
        setExpanded(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      toggleRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <aside ref={tocRef} className={expanded ? 'operation-toc is-expanded' : 'operation-toc'}>
      {expanded
        ? createPortal(
            <nav
              ref={panelRef}
              style={panelPosition}
              className="operation-toc-panel is-expanded"
              id="operation-table-of-contents"
              aria-label={title}
              aria-hidden={!expanded}
              inert={!expanded}
            >
              <span className="operation-toc-title">{title}</span>
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
                      <span className="material-interaction-label">{heading.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>,
            document.body,
          )
        : null}
      <button
        ref={toggleRef}
        className="operation-toc-toggle"
        type="button"
        aria-controls="operation-table-of-contents"
        aria-expanded={expanded}
        aria-label={expanded ? `收起${title}` : `展开${title}`}
        title={expanded ? `收起${title}` : `展开${title}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {expanded ? 'close' : 'toc'}
        </span>
      </button>
    </aside>
  );
}
