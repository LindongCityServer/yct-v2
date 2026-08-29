export type TelegraphPrintStage =
  'header' | 'recipient' | 'code' | 'message' | 'footer' | 'stamp' | 'envelope';

export interface TelegraphPrintProgressPayload {
  draftId: string;
  stage: TelegraphPrintStage;
  progress: number;
}

export interface TelegraphPrintStartedPayload {
  draftId: string;
  serialNumber: string;
  generatedAt: string;
}

export interface TelegraphDraftUpdatedPayload {
  draftId: string;
  billableGrids: number;
  amount: number;
  destination: string;
  recipient: string;
  bodyLength: number;
}

export interface TelegraphArtifactDownloadedPayload {
  draftId: string;
  artifact:
    'send-paper' | 'receive-paper' | 'envelope-front' | 'envelope-back' | 'code-text' | 'audio';
  anonymous: boolean;
}

const printProgressEventName = 'yct:telegraph-print-progress';
const printStartedEventName = 'yct:telegraph-print-started';
const artifactDownloadedEventName = 'yct:telegraph-artifact-downloaded';
const draftUpdatedEventName = 'yct:telegraph-draft-updated';

export function publishTelegraphDraftUpdated(payload: TelegraphDraftUpdatedPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(draftUpdatedEventName, { detail: payload }));
}

export function publishTelegraphPrintProgress(payload: TelegraphPrintProgressPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(printProgressEventName, { detail: payload }));
}

export function publishTelegraphPrintStarted(payload: TelegraphPrintStartedPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(printStartedEventName, { detail: payload }));
}

export function subscribeTelegraphPrintProgress(
  listener: (payload: TelegraphPrintProgressPayload) => void,
): () => void {
  const handleEvent = (event: Event) =>
    listener((event as CustomEvent<TelegraphPrintProgressPayload>).detail);
  window.addEventListener(printProgressEventName, handleEvent);
  return () => window.removeEventListener(printProgressEventName, handleEvent);
}

export function publishTelegraphArtifactDownloaded(
  payload: TelegraphArtifactDownloadedPayload,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(artifactDownloadedEventName, { detail: payload }));
}
