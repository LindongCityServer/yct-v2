import type { MetroWayfindingElement, MetroWayfindingLayout } from './metro-wayfinding';
import type {
  MetroWayfindingImportPreview,
  MetroWayfindingImportSource,
  MetroWayfindingImportWarning,
} from './metro-wayfinding-import';

export const metroWayfindingCompositionChangedEventName =
  'yct:metro-wayfinding-composition-changed';

export type MetroWayfindingElementAction =
  | { type: 'add'; element: MetroWayfindingElement }
  | {
      type: 'duplicate';
      elementId: string;
      element: MetroWayfindingElement;
    }
  | { type: 'update'; elementId: string; patch: Partial<MetroWayfindingElement> }
  | {
      type: 'changeType';
      elementId: string;
      elementType: MetroWayfindingElement['type'];
    }
  | { type: 'remove'; elementId: string }
  | { type: 'move'; elementId: string; direction: 'up' | 'down' }
  | {
      type: 'reorder';
      elementId: string;
      targetElementId: string;
      placement: 'before' | 'after';
    };

export type MetroWayfindingCompositionAction =
  | (MetroWayfindingElementAction & { rowIndex: number })
  | { type: 'reverse' }
  | { type: 'replace'; layout: MetroWayfindingLayout };

export interface MetroWayfindingCompositionChangedPayload {
  editorId: string;
  action: MetroWayfindingCompositionAction;
}

export interface ExternalWayfindingProjectSelectedPayload {
  editorId: string;
  files: Array<{ name: string; size: number }>;
}

export interface ExternalWayfindingProjectParsedPayload {
  editorId: string;
  preview: MetroWayfindingImportPreview;
}

export interface ExternalWayfindingConversionWarningsRaisedPayload {
  editorId: string;
  source: MetroWayfindingImportSource;
  warnings: MetroWayfindingImportWarning[];
}

export interface MetroWayfindingProjectImportedPayload {
  editorId: string;
  preview: MetroWayfindingImportPreview;
}

export interface ExternalWayfindingImportFailedPayload {
  editorId: string;
  message: string;
}

export type MetroWayfindingImportLifecycleEvent =
  | {
      type: 'ExternalWayfindingProjectSelected';
      payload: ExternalWayfindingProjectSelectedPayload;
    }
  | {
      type: 'ExternalWayfindingProjectParsed';
      payload: ExternalWayfindingProjectParsedPayload;
    }
  | {
      type: 'ExternalWayfindingConversionWarningsRaised';
      payload: ExternalWayfindingConversionWarningsRaisedPayload;
    }
  | {
      type: 'MetroWayfindingProjectImported';
      payload: MetroWayfindingProjectImportedPayload;
    }
  | {
      type: 'ExternalWayfindingImportFailed';
      payload: ExternalWayfindingImportFailedPayload;
    };

export const metroWayfindingImportLifecycleEventName = 'yct:metro-wayfinding-import-lifecycle';

export function dispatchMetroWayfindingCompositionAction(
  payload: MetroWayfindingCompositionChangedPayload,
): void {
  window.dispatchEvent(
    new CustomEvent<MetroWayfindingCompositionChangedPayload>(
      metroWayfindingCompositionChangedEventName,
      { detail: payload },
    ),
  );
}

export function subscribeMetroWayfindingCompositionActions(
  editorId: string,
  listener: (action: MetroWayfindingCompositionAction) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<MetroWayfindingCompositionChangedPayload>).detail;
    if (detail?.editorId === editorId) {
      listener(detail.action);
    }
  };
  window.addEventListener(metroWayfindingCompositionChangedEventName, handleEvent);
  return () => window.removeEventListener(metroWayfindingCompositionChangedEventName, handleEvent);
}

export function publishMetroWayfindingImportLifecycleEvent(
  event: MetroWayfindingImportLifecycleEvent,
): void {
  window.dispatchEvent(
    new CustomEvent<MetroWayfindingImportLifecycleEvent>(metroWayfindingImportLifecycleEventName, {
      detail: event,
    }),
  );
}

export function subscribeMetroWayfindingImportLifecycleEvents(
  editorId: string,
  listener: (event: MetroWayfindingImportLifecycleEvent) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<MetroWayfindingImportLifecycleEvent>).detail;
    if (detail?.payload.editorId === editorId) {
      listener(detail);
    }
  };
  window.addEventListener(metroWayfindingImportLifecycleEventName, handleEvent);
  return () => window.removeEventListener(metroWayfindingImportLifecycleEventName, handleEvent);
}
