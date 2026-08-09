import type { ReleaseNotesViewedPayload } from '@yct/contracts';

export const releaseNotesViewedEventName = 'yct:release-notes-viewed';

export function publishReleaseNotesViewed(payload: ReleaseNotesViewedPayload): void {
  window.dispatchEvent(
    new CustomEvent<ReleaseNotesViewedPayload>(releaseNotesViewedEventName, { detail: payload }),
  );
}

export function subscribeReleaseNotesViewed(
  listener: (payload: ReleaseNotesViewedPayload) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ReleaseNotesViewedPayload>).detail);
  };
  window.addEventListener(releaseNotesViewedEventName, handler);
  return () => window.removeEventListener(releaseNotesViewedEventName, handler);
}
