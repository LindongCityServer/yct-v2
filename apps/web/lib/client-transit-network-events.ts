import type { MaterialTransitNetworkSnapshot } from '@yct/contracts';

export type TransitNetworkSourceKind = 'server' | 'rmp';

export interface TransitNetworkSourceChangedPayload {
  studioId: string;
  source: TransitNetworkSourceKind;
  snapshot?: MaterialTransitNetworkSnapshot;
  clearSnapshot?: boolean;
}

export interface TransitNetworkImportSucceededPayload {
  studioId: string;
  fileName: string;
  snapshot: MaterialTransitNetworkSnapshot;
}

export interface TransitNetworkImportFailedPayload {
  studioId: string;
  fileName: string;
  message: string;
}

export interface TransitNetworkLineNamesChangedPayload {
  studioId: string;
  snapshot: MaterialTransitNetworkSnapshot;
}

export interface TransitNetworkLineNameEditorRequestedPayload {
  studioId: string;
}

const sourceChangedEventName = 'yct:transit-network-source-changed';
const importSucceededEventName = 'yct:transit-network-import-succeeded';
const importFailedEventName = 'yct:transit-network-import-failed';
const lineNamesChangedEventName = 'yct:transit-network-line-names-changed';
const lineNameEditorRequestedEventName = 'yct:transit-network-line-name-editor-requested';

export function publishTransitNetworkSourceChanged(
  payload: TransitNetworkSourceChangedPayload,
): void {
  window.dispatchEvent(new CustomEvent(sourceChangedEventName, { detail: payload }));
}

export function publishTransitNetworkImportSucceeded(
  payload: TransitNetworkImportSucceededPayload,
): void {
  window.dispatchEvent(new CustomEvent(importSucceededEventName, { detail: payload }));
}

export function publishTransitNetworkImportFailed(
  payload: TransitNetworkImportFailedPayload,
): void {
  window.dispatchEvent(new CustomEvent(importFailedEventName, { detail: payload }));
}

export function publishTransitNetworkLineNamesChanged(
  payload: TransitNetworkLineNamesChangedPayload,
): void {
  window.dispatchEvent(new CustomEvent(lineNamesChangedEventName, { detail: payload }));
}

export function publishTransitNetworkLineNameEditorRequested(
  payload: TransitNetworkLineNameEditorRequestedPayload,
): void {
  window.dispatchEvent(new CustomEvent(lineNameEditorRequestedEventName, { detail: payload }));
}

export function subscribeTransitNetworkSourceChanged(
  studioId: string,
  listener: (payload: TransitNetworkSourceChangedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<TransitNetworkSourceChangedPayload>).detail;
    if (payload?.studioId === studioId) listener(payload);
  };
  window.addEventListener(sourceChangedEventName, handleEvent);
  return () => window.removeEventListener(sourceChangedEventName, handleEvent);
}

export function subscribeTransitNetworkLineNamesChanged(
  studioId: string,
  listener: (payload: TransitNetworkLineNamesChangedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<TransitNetworkLineNamesChangedPayload>).detail;
    if (payload?.studioId === studioId) listener(payload);
  };
  window.addEventListener(lineNamesChangedEventName, handleEvent);
  return () => window.removeEventListener(lineNamesChangedEventName, handleEvent);
}

export function subscribeTransitNetworkLineNameEditorRequested(
  studioId: string,
  listener: () => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<TransitNetworkLineNameEditorRequestedPayload>).detail;
    if (payload?.studioId === studioId) listener();
  };
  window.addEventListener(lineNameEditorRequestedEventName, handleEvent);
  return () => window.removeEventListener(lineNameEditorRequestedEventName, handleEvent);
}
