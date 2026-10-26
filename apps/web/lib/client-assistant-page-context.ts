export const assistantPageContextChangedEventName = 'yct:assistant-page-context-changed';

export type AssistantPageHighlightKind =
  'line' | 'station' | 'marker' | 'search' | 'schedule' | 'route';

export interface AssistantPageHighlight {
  kind: AssistantPageHighlightKind;
  title: string;
  detail?: string;
  href?: string;
}

export interface AssistantPageContextDetail {
  pathname: string;
  highlights: AssistantPageHighlight[];
}

const emptyContext: AssistantPageContextDetail = { pathname: '', highlights: [] };

let latestContext: AssistantPageContextDetail = emptyContext;

export function publishAssistantPageContext(detail: AssistantPageContextDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  const highlights = detail.highlights
    .map((highlight) => ({
      kind: highlight.kind,
      title: highlight.title.trim().slice(0, 120),
      detail: highlight.detail?.trim().slice(0, 600) || undefined,
      href: highlight.href?.trim().slice(0, 300) || undefined,
    }))
    .filter((highlight) => highlight.title)
    .slice(0, 4);

  latestContext = { pathname: detail.pathname, highlights };
  window.dispatchEvent(
    new CustomEvent<AssistantPageContextDetail>(assistantPageContextChangedEventName, {
      detail: latestContext,
    }),
  );
}

export function readAssistantPageContext(): AssistantPageContextDetail {
  return latestContext;
}

export function subscribeAssistantPageContextChanged(
  listener: (detail: AssistantPageContextDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<AssistantPageContextDetail>).detail;
    listener(detail ?? readAssistantPageContext());
  };
  window.addEventListener(assistantPageContextChangedEventName, handleEvent);
  return () => window.removeEventListener(assistantPageContextChangedEventName, handleEvent);
}
