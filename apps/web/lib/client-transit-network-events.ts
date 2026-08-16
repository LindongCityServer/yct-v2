import type { MaterialTransitNetworkSnapshot } from '@yct/contracts';

export type TransitNetworkSourceKind = 'server' | 'rmp';
export type TransitNetworkSourceChangeReason =
  | 'initialization'
  | 'selection'
  | 'project-import'
  | 'project-removal';

export interface TransitNetworkSourceChangedPayload {
  studioId: string;
  source: TransitNetworkSourceKind;
  reason: TransitNetworkSourceChangeReason;
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

export interface TransitNetworkProjectSnapshotChangedPayload {
  studioId: string;
  snapshot: MaterialTransitNetworkSnapshot;
}

export interface TransitNetworkLineNameEditorRequestedPayload {
  studioId: string;
}

const sourceChangedEventName = 'yct:transit-network-source-changed';
const importSucceededEventName = 'yct:transit-network-import-succeeded';
const importFailedEventName = 'yct:transit-network-import-failed';
const projectSnapshotChangedEventName = 'yct:transit-network-project-snapshot-changed';
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

export function publishTransitNetworkProjectSnapshotChanged(
  payload: TransitNetworkProjectSnapshotChangedPayload,
): void {
  window.dispatchEvent(new CustomEvent(projectSnapshotChangedEventName, { detail: payload }));
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

export function subscribeTransitNetworkProjectSnapshotChanged(
  studioId: string,
  listener: (payload: TransitNetworkProjectSnapshotChangedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<TransitNetworkProjectSnapshotChangedPayload>).detail;
    if (payload?.studioId === studioId) listener(payload);
  };
  window.addEventListener(projectSnapshotChangedEventName, handleEvent);
  return () => window.removeEventListener(projectSnapshotChangedEventName, handleEvent);
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
