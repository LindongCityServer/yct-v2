'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  publishAppNavigationToggleRequested,
  publishMapRouteShortcutRequested,
  publishMapZoomRequested,
  subscribeMapShortcutContextChanged,
} from '../lib/client-map-ui-events';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

const controlHoldDurationMs = 600;
const navigationShortcuts = [
  { digit: '1', href: '/', labelKey: 'nav.operations' },
  { digit: '2', href: '/map', labelKey: 'nav.map' },
  { digit: '3', href: '/travel', labelKey: 'nav.travel' },
  { digit: '4', href: '/services', labelKey: 'nav.services' },
] as const satisfies ReadonlyArray<{
  digit: string;
  href: string;
  labelKey: CommonMessageKey;
}>;

export function KeyboardShortcutBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [mapShortcutContext, setMapShortcutContext] = useState({
    canPlanFocusedMarker: false,
    canSwapRouteEndpoints: false,
  });
  const controlTimer = useRef<number | null>(null);
  const controlHeld = useRef(false);
  const mapPath = appPath('/map');
  const isMapPage = pathname === mapPath || pathname.startsWith(`${mapPath}/`);

  useEffect(() => subscribeMapShortcutContextChanged(setMapShortcutContext), []);

  useEffect(() => {
    const clearControlTimer = () => {
      if (controlTimer.current !== null) {
        window.clearTimeout(controlTimer.current);
        controlTimer.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && shortcutDialogOpen) {
        event.preventDefault();
        setShortcutDialogOpen(false);
        return;
      }

      if (event.key === 'Control') {
        if (event.repeat || controlTimer.current !== null || shortcutDialogOpen) {
          return;
        }
        controlHeld.current = true;
        controlTimer.current = window.setTimeout(() => {
          controlTimer.current = null;
          if (controlHeld.current) {
            setShortcutDialogOpen(true);
          }
        }, controlHoldDurationMs);
        return;
      }

      if (event.ctrlKey && controlHeld.current) {
        clearControlTimer();
        if (shortcutDialogOpen) {
          setShortcutDialogOpen(false);
        }
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat) {
        if (event.key === '\\') {
          event.preventDefault();
          publishAppNavigationToggleRequested({ source: 'keyboard' });
          return;
        }

        const shortcut = navigationShortcuts.find((item) => item.digit === event.key);
        if (shortcut) {
          event.preventDefault();
          router.push(appPath(shortcut.href));
          return;
        }
      }

      if (
        !shortcutDialogOpen &&
        isMapPage &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.repeat &&
        event.key === 'Enter'
      ) {
        if (event.shiftKey && mapShortcutContext.canSwapRouteEndpoints) {
          event.preventDefault();
          publishMapRouteShortcutRequested({ command: 'swap_endpoints', source: 'keyboard' });
          return;
        }

        if (
          !event.shiftKey &&
          mapShortcutContext.canPlanFocusedMarker &&
          !isInteractiveTarget(event.target)
        ) {
          event.preventDefault();
          publishMapRouteShortcutRequested({
            command: 'plan_focused_marker',
            source: 'keyboard',
          });
          return;
        }
      }

      if (
        !shortcutDialogOpen &&
        isMapPage &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isEditableTarget(event.target) &&
        (event.key === '=' || event.key === '+' || event.key === '-')
      ) {
        event.preventDefault();
        publishMapZoomRequested({
          delta: event.key === '-' ? -0.5 : 0.5,
          source: 'keyboard',
        });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control') {
        return;
      }
      controlHeld.current = false;
      clearControlTimer();
      setShortcutDialogOpen(false);
    };

    const handleWindowBlur = () => {
      controlHeld.current = false;
      clearControlTimer();
      setShortcutDialogOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      clearControlTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isMapPage, mapShortcutContext, router, shortcutDialogOpen]);

  if (!shortcutDialogOpen) {
    return null;
  }

  const closeDialog = () => setShortcutDialogOpen(false);
  const availableNavigationShortcuts = navigationShortcuts.filter(
    (shortcut) => !isCurrentNavigationPath(pathname, appPath(shortcut.href)),
  );

  return (
    <div className="modal-backdrop shortcut-backdrop" role="presentation" onMouseDown={closeDialog}>
      <div
        className="modal-panel shortcut-dialog"
        role="dialog"
        aria-modal="false"
        aria-labelledby="keyboard-shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shortcut-dialog-header">
          <h2 id="keyboard-shortcuts-title">{t('shortcut.title')}</h2>
          <button
            className="icon-action-button"
            type="button"
            aria-label={t('shortcut.close')}
            title={t('shortcut.close')}
            onClick={closeDialog}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </header>

        {availableNavigationShortcuts.length > 0 ? (
          <section className="shortcut-section" aria-labelledby="shortcut-navigation-title">
            <h3 id="shortcut-navigation-title">{t('nav.label')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.toggleNavigation')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', '\\']} />
                </dd>
              </div>
              {availableNavigationShortcuts.map((shortcut) => (
                <div key={shortcut.digit}>
                  <dt>{t(shortcut.labelKey)}</dt>
                  <dd>
                    <KeyboardKeys keys={['Alt', shortcut.digit]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {isMapPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-map-title">
            <h3 id="shortcut-map-title">{t('shortcut.map')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('map.toolbar.zoomIn')}</dt>
                <dd>
                  <KeyboardKeys keys={['=']} />
                </dd>
              </div>
              <div>
                <dt>{t('map.toolbar.zoomOut')}</dt>
                <dd>
                  <KeyboardKeys keys={['-']} />
                </dd>
              </div>
              {mapShortcutContext.canSwapRouteEndpoints ? (
                <div>
                  <dt>{t('shortcut.swapRouteEndpoints')}</dt>
                  <dd>
                    <KeyboardKeys keys={['Shift', 'Enter']} />
                  </dd>
                </div>
              ) : null}
              {mapShortcutContext.canPlanFocusedMarker ? (
                <div>
                  <dt>{t('shortcut.planFocusedMarker')}</dt>
                  <dd>
                    <KeyboardKeys keys={['Enter']} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        <div className="shortcut-help-row">
          <span>{t('shortcut.openMenu')}</span>
          <KeyboardKeys keys={[t('shortcut.holdCtrl')]} />
        </div>
      </div>
    </div>
  );
}

function KeyboardKeys({ keys }: Readonly<{ keys: string[] }>) {
  return (
    <span className="keyboard-keys">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`}>
          {index > 0 ? <span aria-hidden="true">+</span> : null}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest('button[data-map-marker-id]')) {
    return false;
  }

  return Boolean(target.closest('a, button, input, select, textarea, [contenteditable="true"]'));
}

function isCurrentNavigationPath(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || (targetPath !== '/' && pathname.startsWith(`${targetPath}/`));
}
