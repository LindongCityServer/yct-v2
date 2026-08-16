export type MaterialStudioAction = 'preview' | 'submit' | 'download' | 'export-project';

export interface MaterialStudioActionRequestedPayload {
  studioId: string;
  action: MaterialStudioAction;
}

export interface MaterialStudioStateChangedPayload {
  studioId: string;
  mode: 'manual' | 'server';
  transitNetworkSource: 'server' | 'rmp';
  hasPreview: boolean;
  isBusy: boolean;
  canExportProject: boolean;
}

export interface MaterialStudioActionBlockedPayload {
  studioId: string;
  message: string;
}

const actionRequestedEventName = 'yct:material-studio-action-requested';
const stateChangedEventName = 'yct:material-studio-state-changed';
const actionBlockedEventName = 'yct:material-studio-action-blocked';

export function requestMaterialStudioAction(payload: MaterialStudioActionRequestedPayload): void {
  window.dispatchEvent(
    new CustomEvent<MaterialStudioActionRequestedPayload>(actionRequestedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMaterialStudioActions(
  studioId: string,
  listener: (action: MaterialStudioAction) => void,
): () => void {
  return subscribeToStudioEvent<MaterialStudioActionRequestedPayload>(
    actionRequestedEventName,
    studioId,
    (payload) => listener(payload.action),
  );
}

export function publishMaterialStudioState(payload: MaterialStudioStateChangedPayload): void {
  window.dispatchEvent(
    new CustomEvent<MaterialStudioStateChangedPayload>(stateChangedEventName, { detail: payload }),
  );
}

export function subscribeMaterialStudioState(
  studioId: string,
  listener: (state: MaterialStudioStateChangedPayload) => void,
): () => void {
  return subscribeToStudioEvent(stateChangedEventName, studioId, listener);
}

export function publishMaterialStudioActionBlocked(
  payload: MaterialStudioActionBlockedPayload,
): void {
  window.dispatchEvent(
    new CustomEvent<MaterialStudioActionBlockedPayload>(actionBlockedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMaterialStudioActionBlocked(
  studioId: string,
  listener: (message: string) => void,
): () => void {
  return subscribeToStudioEvent<MaterialStudioActionBlockedPayload>(
    actionBlockedEventName,
    studioId,
    (payload) => listener(payload.message),
  );
}

function subscribeToStudioEvent<TPayload extends { studioId: string }>(
  eventName: string,
  studioId: string,
  listener: (payload: TPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<TPayload>).detail;
    if (payload?.studioId === studioId) {
      listener(payload);
    }
  };
  window.addEventListener(eventName, handleEvent);
  return () => window.removeEventListener(eventName, handleEvent);
}
