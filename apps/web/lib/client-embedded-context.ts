export const embeddedContextChangedEventName = 'yct:embedded-context-changed';

export interface EmbeddedContextChangedPayload {
  embedded: boolean;
}

export function detectEmbeddedContext(): EmbeddedContextChangedPayload {
  return {
    embedded: window.self !== window.top,
  };
}

export function publishEmbeddedContextChanged(payload: EmbeddedContextChangedPayload): void {
  window.dispatchEvent(
    new CustomEvent<EmbeddedContextChangedPayload>(embeddedContextChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeEmbeddedContextChanged(
  listener: (payload: EmbeddedContextChangedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<EmbeddedContextChangedPayload>).detail);
  };

  window.addEventListener(embeddedContextChangedEventName, handleEvent);
  return () => window.removeEventListener(embeddedContextChangedEventName, handleEvent);
}
