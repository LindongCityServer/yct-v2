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

export const mapZoomRequestedEventName = 'yct:map-zoom-requested';

export interface MapZoomRequestedPayload {
  delta: number;
  source: 'keyboard';
}

export const appNavigationToggleRequestedEventName = 'yct:app-navigation-toggle-requested';

export interface AppNavigationToggleRequestedPayload {
  source: 'keyboard';
}

export const mapRouteShortcutRequestedEventName = 'yct:map-route-shortcut-requested';

export interface MapRouteShortcutRequestedPayload {
  command: 'swap_endpoints' | 'plan_focused_marker';
  source: 'keyboard';
}

export const mapViewShortcutRequestedEventName = 'yct:map-view-shortcut-requested';

export interface MapViewShortcutRequestedPayload {
  command: 'focus_search' | 'reset_view';
  source: 'keyboard';
}

export const mapShortcutContextChangedEventName = 'yct:map-shortcut-context-changed';

export interface MapShortcutContextChangedPayload {
  canPlanFocusedMarker: boolean;
  canSwapRouteEndpoints: boolean;
}

let currentMapRoutePanelVisibility = false;
let currentMapNavigationExpanded = true;
let currentMapNearbySearchScope: MapNearbySearchScopeChangedPayload | null = null;
let currentMapTileProviderId = '';
let currentMapShortcutContext: MapShortcutContextChangedPayload = {
  canPlanFocusedMarker: false,
  canSwapRouteEndpoints: false,
};

export function publishAppNavigationToggleRequested(
  payload: AppNavigationToggleRequestedPayload,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AppNavigationToggleRequestedPayload>(appNavigationToggleRequestedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeAppNavigationToggleRequested(
  listener: (payload: AppNavigationToggleRequestedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleToggleRequested = (event: Event) => {
    listener((event as CustomEvent<AppNavigationToggleRequestedPayload>).detail);
  };
  window.addEventListener(appNavigationToggleRequestedEventName, handleToggleRequested);
  return () =>
    window.removeEventListener(appNavigationToggleRequestedEventName, handleToggleRequested);
}

export function publishMapRouteShortcutRequested(payload: MapRouteShortcutRequestedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapRouteShortcutRequestedPayload>(mapRouteShortcutRequestedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapRouteShortcutRequested(
  listener: (payload: MapRouteShortcutRequestedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleShortcutRequested = (event: Event) => {
    listener((event as CustomEvent<MapRouteShortcutRequestedPayload>).detail);
  };
  window.addEventListener(mapRouteShortcutRequestedEventName, handleShortcutRequested);
  return () =>
    window.removeEventListener(mapRouteShortcutRequestedEventName, handleShortcutRequested);
}

export function publishMapViewShortcutRequested(payload: MapViewShortcutRequestedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapViewShortcutRequestedPayload>(mapViewShortcutRequestedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapViewShortcutRequested(
  listener: (payload: MapViewShortcutRequestedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleShortcutRequested = (event: Event) => {
    listener((event as CustomEvent<MapViewShortcutRequestedPayload>).detail);
  };
  window.addEventListener(mapViewShortcutRequestedEventName, handleShortcutRequested);
  return () =>
    window.removeEventListener(mapViewShortcutRequestedEventName, handleShortcutRequested);
}

export function publishMapShortcutContextChanged(payload: MapShortcutContextChangedPayload): void {
  currentMapShortcutContext = payload;
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapShortcutContextChangedPayload>(mapShortcutContextChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMapShortcutContextChanged(
  listener: (payload: MapShortcutContextChangedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleContextChanged = (event: Event) => {
    listener((event as CustomEvent<MapShortcutContextChangedPayload>).detail);
  };
  window.addEventListener(mapShortcutContextChangedEventName, handleContextChanged);
  listener(currentMapShortcutContext);
  return () => window.removeEventListener(mapShortcutContextChangedEventName, handleContextChanged);
}

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

export function publishMapZoomRequested(payload: MapZoomRequestedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapZoomRequestedPayload>(mapZoomRequestedEventName, { detail: payload }),
  );
}

export function subscribeMapZoomRequested(
  listener: (payload: MapZoomRequestedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleZoomRequested = (event: Event) => {
    listener((event as CustomEvent<MapZoomRequestedPayload>).detail);
  };
  window.addEventListener(mapZoomRequestedEventName, handleZoomRequested);
  return () => window.removeEventListener(mapZoomRequestedEventName, handleZoomRequested);
}
