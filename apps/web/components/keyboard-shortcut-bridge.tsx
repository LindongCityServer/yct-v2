'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  publishAppNavigationToggleRequested,
  publishMapRouteShortcutRequested,
  publishMapViewShortcutRequested,
  publishMapZoomRequested,
  subscribeMapShortcutContextChanged,
} from '../lib/client-map-ui-events';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { IconButton } from './ui/button';
import {
  AREA_EDITOR_SHORTCUT_IDS,
  EDITOR_SHORTCUT_CATALOG,
  EDITOR_SHORTCUT_GROUPS,
  LINE_EDITOR_SHORTCUT_IDS,
  MARKDOWN_EDITOR_SHORTCUT_IDS,
  METRO_WAYFINDING_SHORTCUT_IDS,
  POI_GEOMETRY_SHORTCUT_IDS,
  POI_INTRO_SHORTCUT_IDS,
  TRIP_WORKBENCH_SHORTCUT_IDS,
} from '../lib/editor/shortcuts';
import { Modal } from './ui/modal';

const controlHoldDurationMs = 600;
/** 双击斜杠触发「手气不错」的时间窗与单击聚焦搜索的延迟。 */
const doubleSlashWindowMs = 280;
const slashFocusDelayMs = 320;
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
  const slashTimer = useRef<number | null>(null);
  const lastSlashAt = useRef(0);
  const mapPath = appPath('/map');
  const isMapPage = pathname === mapPath || pathname.startsWith(`${mapPath}/`);
  const isLineEditorPage =
    pathname.startsWith(appPath('/admin/transit/lines/')) && pathname.endsWith('/edit');
  const isTripWorkbenchPage =
    pathname.startsWith(appPath('/admin/transit/lines/')) && pathname.endsWith('/schedule');
  const isWayfindingPage =
    pathname === appPath('/services/road-materials') ||
    pathname.startsWith(`${appPath('/services/road-materials')}/`);
  const isTransitWayfindingPage = pathname === appPath('/services/transit-materials');
  const isPoiIntroEditorPage = pathname === appPath('/admin/map-poi/intro-editor');
  const isMarkdownEditorPage = pathname === appPath('/admin/operations/editor');
  const isVisualEditorPage =
    (pathname.startsWith(appPath('/admin/map-poi')) ||
      pathname.startsWith(`${appPath('/admin/operations')}/`) ||
      pathname === appPath('/admin/map-areas/editor')) &&
    !isPoiIntroEditorPage &&
    !isMarkdownEditorPage;
  const isGeometryEditorPage = pathname === appPath('/admin/map-poi/editor');
  const isAreaEditorPage = pathname === appPath('/admin/map-areas/editor');
  const showGlobalSearchShortcut =
    !pathname.startsWith(appPath('/admin')) && !pathname.startsWith(appPath('/auth'));
  const isAdminReviewPage =
    pathname === appPath('/admin/map-poi') || pathname === appPath('/admin/operations');
  const isTravelPage = pathname === appPath('/travel/schedules');
  const isDocumentTocPage =
    pathname.startsWith(`${appPath('/operations')}/`) || pathname === appPath('/services/faq');

  useEffect(() => subscribeMapShortcutContextChanged(setMapShortcutContext), []);

  useEffect(() => {
    const clearControlTimer = () => {
      if (controlTimer.current !== null) {
        window.clearTimeout(controlTimer.current);
        controlTimer.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (event.defaultPrevented ||
          event.repeat ||
          event.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey)
      )
        return;
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

      if (event.key === 'Escape' && isMapPage && !shortcutDialogOpen && !hasOpenGlobalOverlay()) {
        event.preventDefault();
        publishMapViewShortcutRequested({ command: 'dismiss', source: 'keyboard' });
        return;
      }

      if (
        !shortcutDialogOpen &&
        isMapPage &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.repeat &&
        !isEditableTarget(event.target)
      ) {
        const viewKey = event.key.toLowerCase();
        if (viewKey === 'l' || viewKey === 'f' || viewKey === 'n') {
          event.preventDefault();
          publishMapViewShortcutRequested({
            command:
              viewKey === 'l'
                ? 'toggle_layers'
                : viewKey === 'f'
                  ? 'toggle_favorite'
                  : 'search_nearby',
            source: 'keyboard',
          });
          return;
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
        !event.shiftKey &&
        !event.repeat &&
        !isEditableTarget(event.target)
      ) {
        if (event.key === '/') {
          event.preventDefault();
          const now = Date.now();
          const isDoubleTap = now - lastSlashAt.current <= doubleSlashWindowMs;
          lastSlashAt.current = now;
          if (slashTimer.current !== null) {
            window.clearTimeout(slashTimer.current);
            slashTimer.current = null;
          }
          if (isDoubleTap) {
            lastSlashAt.current = 0;
            publishMapViewShortcutRequested({ command: 'random_explore', source: 'keyboard' });
            return;
          }
          // 延迟聚焦搜索，给第二次斜杠留出识别窗口，避免双击被拆成两次单击。
          slashTimer.current = window.setTimeout(() => {
            slashTimer.current = null;
            publishMapViewShortcutRequested({ command: 'focus_search', source: 'keyboard' });
          }, slashFocusDelayMs);
          return;
        }

        if (event.key === '0') {
          event.preventDefault();
          publishMapViewShortcutRequested({ command: 'reset_view', source: 'keyboard' });
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
      if (slashTimer.current !== null) {
        window.clearTimeout(slashTimer.current);
        slashTimer.current = null;
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isMapPage, mapShortcutContext, router, shortcutDialogOpen]);

  // 面板打开后，鼠标在面板外移动超过阈值就关闭，避免按住 Ctrl 时遮挡后续拖拽/点击。
  useEffect(() => {
    if (!shortcutDialogOpen) {
      return undefined;
    }

    const moveThresholdPx = 16;
    let origin: { x: number; y: number } | null = null;

    const handleMouseMove = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.shortcut-dialog')) {
        return;
      }
      if (!origin) {
        origin = { x: event.clientX, y: event.clientY };
        return;
      }
      if (
        Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) >
        moveThresholdPx
      ) {
        setShortcutDialogOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [shortcutDialogOpen]);

  if (!shortcutDialogOpen) {
    return null;
  }

  const closeDialog = () => setShortcutDialogOpen(false);
  const availableNavigationShortcuts = navigationShortcuts.filter(
    (shortcut) => !isCurrentNavigationPath(pathname, appPath(shortcut.href)),
  );

  return (
    <Modal
      labelledBy="keyboard-shortcuts-title"
      ariaModal={false}
      backdropClassName="shortcut-backdrop"
      className="shortcut-dialog"
      as="div"
      onBackdropClick={() => closeDialog}
    >
      <header className="shortcut-dialog-header">
        <h2 id="keyboard-shortcuts-title">{t('shortcut.title')}</h2>
        <IconButton icon="close" label={t('shortcut.close')} onClick={closeDialog} />
      </header>

      <div className="shortcut-columns">
        {showGlobalSearchShortcut ? (
          <section className="shortcut-section" aria-labelledby="shortcut-global-title">
            <h3 id="shortcut-global-title">{t('shortcut.global')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.globalSearch')}</dt>
                <dd>
                  <KeyboardKeys keys={[t('shortcut.doubleShift')]} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.searchResults')}</dt>
                <dd>
                  <KeyboardKeys keys={['↑', '↓']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {availableNavigationShortcuts.length > 0 ? (
          <section className="shortcut-section" aria-labelledby="shortcut-navigation-title">
            <h3 id="shortcut-navigation-title">{t('nav.label')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.focusMapSearch')}</dt>
                <dd>
                  <KeyboardKeys keys={['/']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.doubleSlashExplore')}</dt>
                <dd>
                  <KeyboardKeys keys={['/ /']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.resetMapView')}</dt>
                <dd>
                  <KeyboardKeys keys={['0']} />
                </dd>
              </div>
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
              <div>
                <dt>{t('shortcut.panMap')}</dt>
                <dd>
                  <KeyboardKeys keys={['WASD / ↑↓←→']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.toggleLayers')}</dt>
                <dd>
                  <KeyboardKeys keys={['L']} />
                </dd>
              </div>
              {mapShortcutContext.canPlanFocusedMarker ? (
                <>
                  <div>
                    <dt>{t('shortcut.toggleFavorite')}</dt>
                    <dd>
                      <KeyboardKeys keys={['F']} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t('shortcut.searchNearby')}</dt>
                    <dd>
                      <KeyboardKeys keys={['N']} />
                    </dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>{t('shortcut.dismissLayers')}</dt>
                <dd>
                  <KeyboardKeys keys={['Esc']} />
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

        {isLineEditorPage
          ? EDITOR_SHORTCUT_GROUPS.map((group) => {
              const shortcuts = LINE_EDITOR_SHORTCUT_IDS.map(
                (key) => EDITOR_SHORTCUT_CATALOG[key],
              ).filter((shortcut) => shortcut.group === group.id);
              if (shortcuts.length === 0) {
                return null;
              }
              return (
                <section
                  className="shortcut-section"
                  key={group.id}
                  aria-labelledby={`shortcut-line-editor-${group.id}`}
                >
                  <h3 id={`shortcut-line-editor-${group.id}`}>
                    {`${t('shortcut.lineEditor')} · ${group.label}`}
                  </h3>
                  <dl className="shortcut-list">
                    {shortcuts.map((shortcut) => (
                      <div key={shortcut.id}>
                        <dt>{shortcut.label}</dt>
                        <dd>
                          <KeyboardKeys keys={[...shortcut.displayKeys]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })
          : null}

        {isTransitWayfindingPage
          ? EDITOR_SHORTCUT_GROUPS.map((group) => {
              const shortcuts = METRO_WAYFINDING_SHORTCUT_IDS.map(
                (key) => EDITOR_SHORTCUT_CATALOG[key],
              ).filter((shortcut) => shortcut.group === group.id);
              if (shortcuts.length === 0) {
                return null;
              }
              return (
                <section
                  className="shortcut-section"
                  key={group.id}
                  aria-labelledby={`shortcut-transit-wayfinding-${group.id}`}
                >
                  <h3 id={`shortcut-transit-wayfinding-${group.id}`}>
                    {`公共交通导视工作台 · ${group.label}`}
                  </h3>
                  <dl className="shortcut-list">
                    {shortcuts.map((shortcut) => (
                      <div key={shortcut.id}>
                        <dt>{shortcut.label}</dt>
                        <dd>
                          <KeyboardKeys keys={[...shortcut.displayKeys]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })
          : null}

        {isWayfindingPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-wayfinding-title">
            <h3 id="shortcut-wayfinding-title">{t('shortcut.wayfinding')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.undo')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Z']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.redo')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl + Shift + Z / Ctrl + Y']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.deleteSelected')}</dt>
                <dd>
                  <KeyboardKeys keys={['Delete']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.acceptSuggestion')}</dt>
                <dd>
                  <KeyboardKeys keys={['Tab']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.duplicateElement')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', 'C']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.moveElement')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', '↑↓←→']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.reverseElements')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', 'R']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.switchRow')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', '↑ / ↓']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.openTemplateLibrary')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', 'O']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.previewMaterial')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Enter']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.exportProject')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Shift', 'E']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.switchTemplate')}</dt>
                <dd>
                  <KeyboardKeys keys={['[ / ]']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.switchDataSource')}</dt>
                <dd>
                  <KeyboardKeys keys={['Alt', 'M']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {isTravelPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-travel-title">
            <h3 id="shortcut-travel-title">{t('shortcut.travel')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.focusScheduleSearch')}</dt>
                <dd>
                  <KeyboardKeys keys={['/']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.resetFilters')}</dt>
                <dd>
                  <KeyboardKeys keys={['Esc']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.planJourney')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Enter']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {isDocumentTocPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-operation-detail-title">
            <h3 id="shortcut-operation-detail-title">{t('shortcut.documentToc')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.sections')}</dt>
                <dd>
                  <KeyboardKeys keys={['J', 'K']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.firstLastSection')}</dt>
                <dd>
                  <KeyboardKeys keys={['G / Shift+G']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {isVisualEditorPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-editor-title">
            <h3 id="shortcut-editor-title">{t('shortcut.editor')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.save')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'S']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.saveAndBack')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Enter']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {isGeometryEditorPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-geometry-editor-title">
            <h3 id="shortcut-geometry-editor-title">几何编辑</h3>
            <dl className="shortcut-list">
              {POI_GEOMETRY_SHORTCUT_IDS.map((key) => {
                const shortcut = EDITOR_SHORTCUT_CATALOG[key];
                return (
                  <div key={shortcut.id}>
                    <dt>{shortcut.label}</dt>
                    <dd>
                      <KeyboardKeys keys={[...shortcut.displayKeys]} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ) : null}

        {isPoiIntroEditorPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-poi-intro-editor-title">
            <h3 id="shortcut-poi-intro-editor-title">POI 简介工作台</h3>
            <dl className="shortcut-list">
              {POI_INTRO_SHORTCUT_IDS.map((key) => {
                const shortcut = EDITOR_SHORTCUT_CATALOG[key];
                return (
                  <div key={shortcut.id}>
                    <dt>{shortcut.label}</dt>
                    <dd>
                      <KeyboardKeys keys={[...shortcut.displayKeys]} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ) : null}

        {isMarkdownEditorPage
          ? EDITOR_SHORTCUT_GROUPS.map((group) => {
              const shortcuts = MARKDOWN_EDITOR_SHORTCUT_IDS.map(
                (key) => EDITOR_SHORTCUT_CATALOG[key],
              ).filter((shortcut) => shortcut.group === group.id);
              if (shortcuts.length === 0) {
                return null;
              }
              return (
                <section
                  className="shortcut-section"
                  key={group.id}
                  aria-labelledby={`shortcut-markdown-editor-${group.id}`}
                >
                  <h3 id={`shortcut-markdown-editor-${group.id}`}>
                    {`运营消息工作台 · ${group.label}`}
                  </h3>
                  <dl className="shortcut-list">
                    {shortcuts.map((shortcut) => (
                      <div key={shortcut.id}>
                        <dt>{shortcut.label}</dt>
                        <dd>
                          <KeyboardKeys keys={[...shortcut.displayKeys]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })
          : null}

        {isAreaEditorPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-area-editor-title">
            <h3 id="shortcut-area-editor-title">区划工作台</h3>
            <dl className="shortcut-list">
              {AREA_EDITOR_SHORTCUT_IDS.map((key) => {
                const shortcut = EDITOR_SHORTCUT_CATALOG[key];
                return (
                  <div key={shortcut.id}>
                    <dt>{shortcut.label}</dt>
                    <dd>
                      <KeyboardKeys keys={[...shortcut.displayKeys]} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ) : null}

        {isAdminReviewPage ? (
          <section className="shortcut-section" aria-labelledby="shortcut-admin-review-title">
            <h3 id="shortcut-admin-review-title">{t('shortcut.adminReview')}</h3>
            <dl className="shortcut-list">
              <div>
                <dt>{t('shortcut.listNavigate')}</dt>
                <dd>
                  <KeyboardKeys keys={['J', 'K']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.listOpen')}</dt>
                <dd>
                  <KeyboardKeys keys={['Enter']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.listSelect')}</dt>
                <dd>
                  <KeyboardKeys keys={['Shift', 'Space']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.insertPrepend')}</dt>
                <dd>
                  <KeyboardKeys keys={['[']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.insertAppend')}</dt>
                <dd>
                  <KeyboardKeys keys={[']']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.insertNearest')}</dt>
                <dd>
                  <KeyboardKeys keys={['\\']} />
                </dd>
              </div>
              <div>
                <dt>{t('shortcut.listBulk')}</dt>
                <dd>
                  <KeyboardKeys keys={['Ctrl', 'Enter']} />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {isTripWorkbenchPage
          ? EDITOR_SHORTCUT_GROUPS.map((group) => {
              const shortcuts = TRIP_WORKBENCH_SHORTCUT_IDS.map(
                (key) => EDITOR_SHORTCUT_CATALOG[key],
              ).filter((shortcut) => shortcut.group === group.id);
              if (shortcuts.length === 0) {
                return null;
              }
              return (
                <section
                  className="shortcut-section"
                  key={group.id}
                  aria-labelledby={`shortcut-trip-workbench-${group.id}`}
                >
                  <h3 id={`shortcut-trip-workbench-${group.id}`}>
                    {`${t('shortcut.tripWorkbench')} · ${group.label}`}
                  </h3>
                  <dl className="shortcut-list">
                    {shortcuts.map((shortcut) => (
                      <div key={shortcut.id}>
                        <dt>{shortcut.label}</dt>
                        <dd>
                          <KeyboardKeys keys={[...shortcut.displayKeys]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })
          : null}

        <section className="shortcut-section" aria-labelledby="shortcut-general-title">
          <h3 id="shortcut-general-title">{t('shortcut.general')}</h3>
          <dl className="shortcut-list">
            <div>
              <dt>{t('shortcut.dismissPopover')}</dt>
              <dd>
                <KeyboardKeys keys={['Esc']} />
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="shortcut-help-row">
        <span>{t('shortcut.openMenu')}</span>
        <KeyboardKeys keys={[t('shortcut.holdCtrl')]} />
      </div>
    </Modal>
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

/**
 * 全局搜索面板与快捷键面板优先消费 Esc，地图页不应同时关闭自己的浮层。
 * 这里直接查 DOM，是因为两者分属不同组件、没有共享的弹层栈。
 */
function hasOpenGlobalOverlay(): boolean {
  return Boolean(document.querySelector('.global-search-panel, .shortcut-dialog'));
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
