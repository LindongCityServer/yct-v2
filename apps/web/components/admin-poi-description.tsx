'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Keep the complete description in the DOM for selection and accessible reading. */
export function AdminPoiDescription({ description }: Readonly<{ description: string }>) {
  const id = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    setExpanded(false);
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      setOverflows(element.scrollHeight > lineHeight * 3 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description]);

  return (
    <div className="admin-poi-description">
      <p
        className={`muted admin-poi-description-text${expanded ? ' is-expanded' : ''}`}
        id={id}
        ref={textRef}
      >
        {description}
      </p>
      {overflows ? (
        <button
          type="button"
          className="admin-poi-description-toggle"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起全文' : '展开全文'}
        </button>
      ) : null}
    </div>
  );
}
