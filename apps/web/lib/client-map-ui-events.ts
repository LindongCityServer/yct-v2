export const mapRoutePanelVisibilityChangedEventName = 'yct:map-route-panel-visibility-changed';

export interface MapRoutePanelVisibilityChangedPayload {
  visible: boolean;
}

export const mapNavigationLayoutChangedEventName = 'yct:map-navigation-layout-changed';

export interface MapNavigationLayoutChangedPayload {
  expanded: boolean;
}

export type MapNearbySearchScope = 'outside' | 'inside';

export interface MapNearbySearchScopeChangedPayload {
  markerId: string;
  scope: MapNearbySearchScope;
}

export const mapNearbySearchScopeChangedEventName = 'yct:map-nearby-search-scope-changed';

export const mapTileProviderSelectedEventName = 'yct:map-tile-provider-selected';

export interface MapTileProviderSelectedPayload {
  providerId: string;
}

let currentMapRoutePanelVisibility = false;
let currentMapNavigationExpanded = true;
let currentMapNearbySearchScope: MapNearbySearchScopeChangedPayload | null = null;
let currentMapTileProviderId = '';

export function publishMapRoutePanelVisibilityChanged(
  payload: MapRoutePanelVisibilityChangedPayload,
): void {
  currentMapRoutePanelVisibility = payload.visible;
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapRoutePanelVisibilityChangedPayload>(
      mapRoutePanelVisibilityChangedEventName,
      { detail: payload },
    ),
  );
}

export function subscribeMapRoutePanelVisibilityChanged(
  listener: (payload: MapRoutePanelVisibilityChangedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleVisibilityChanged = (event: Event) => {
    listener((event as CustomEvent<MapRoutePanelVisibilityChangedPayload>).detail);
  };
  window.addEventListener(mapRoutePanelVisibilityChangedEventName, handleVisibilityChanged);
  listener({ visible: currentMapRoutePanelVisibility });
  return () =>
    window.removeEventListener(mapRoutePanelVisibilityChangedEventName, handleVisibilityChanged);
}

export function publishMapNavigationLayoutChanged(
  payload: MapNavigationLayoutChangedPayload,
): void {
  currentMapNavigationExpanded = payload.expanded;
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapNavigationLayoutChangedPayload>(mapNavigationLayoutChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapNavigationLayoutChanged(
  listener: (payload: MapNavigationLayoutChangedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleLayoutChanged = (event: Event) => {
    listener((event as CustomEvent<MapNavigationLayoutChangedPayload>).detail);
  };
  window.addEventListener(mapNavigationLayoutChangedEventName, handleLayoutChanged);
  listener({ expanded: currentMapNavigationExpanded });
  return () => window.removeEventListener(mapNavigationLayoutChangedEventName, handleLayoutChanged);
}

export function publishMapNearbySearchScopeChanged(
  payload: MapNearbySearchScopeChangedPayload,
): void {
  currentMapNearbySearchScope = payload;
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapNearbySearchScopeChangedPayload>(mapNearbySearchScopeChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapNearbySearchScopeChanged(
  listener: (payload: MapNearbySearchScopeChangedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleScopeChanged = (event: Event) => {
    listener((event as CustomEvent<MapNearbySearchScopeChangedPayload>).detail);
  };
  window.addEventListener(mapNearbySearchScopeChangedEventName, handleScopeChanged);
  if (currentMapNearbySearchScope) {
    listener(currentMapNearbySearchScope);
  }
  return () => window.removeEventListener(mapNearbySearchScopeChangedEventName, handleScopeChanged);
}

export function publishMapTileProviderSelected(payload: MapTileProviderSelectedPayload): void {
  currentMapTileProviderId = payload.providerId;
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapTileProviderSelectedPayload>(mapTileProviderSelectedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapTileProviderSelected(
  listener: (payload: MapTileProviderSelectedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleProviderSelected = (event: Event) => {
    listener((event as CustomEvent<MapTileProviderSelectedPayload>).detail);
  };
  window.addEventListener(mapTileProviderSelectedEventName, handleProviderSelected);
  if (currentMapTileProviderId) {
    listener({ providerId: currentMapTileProviderId });
  }
  return () => window.removeEventListener(mapTileProviderSelectedEventName, handleProviderSelected);
}
