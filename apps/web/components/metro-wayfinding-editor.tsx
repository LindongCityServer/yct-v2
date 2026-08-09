'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
} from 'react';
import { appPath } from '../lib/app-paths';
import { findTextContinuation } from '../lib/text-continuation';
import type { MetroWayfindingExample } from '../lib/metro-wayfinding-examples';
import {
  dispatchMetroWayfindingCompositionAction,
  publishMetroWayfindingImportLifecycleEvent,
  subscribeMetroWayfindingCompositionActions,
  subscribeMetroWayfindingImportLifecycleEvents,
  type MetroWayfindingCompositionAction,
  type MetroWayfindingElementAction,
} from '../lib/client-metro-wayfinding-events';
import {
  METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES,
  METRO_WAYFINDING_IMPORT_MAX_FILES,
  METRO_WAYFINDING_SEMANTIC_TARGET_STYLE,
  parseMetroWayfindingImportFiles,
  reorderMetroWayfindingImportRows,
  resolveMetroWayfindingImportPreview,
  type MetroWayfindingImportMode,
  type MetroWayfindingImportPreview,
} from '../lib/metro-wayfinding-import';
import {
  createMetroWayfindingElement,
  createMetroWayfindingTextRow,
  duplicateMetroWayfindingElement,
  METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
  METRO_WAYFINDING_COMBINATION_MAX_SCALE,
  METRO_WAYFINDING_COMBINATION_MIN_SCALE,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  METRO_WAYFINDING_DIVIDER_WIDTH,
  METRO_WAYFINDING_WARNING_FOREGROUND,
  metroWayfindingArrowOptions,
  metroWayfindingBackgroundPalette,
  metroWayfindingFacilityOptions,
  metroWayfindingForegroundPalette,
  parseMetroWayfindingLayout,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityIconAssetName,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  resolveMetroWayfindingVerticalLayoutSizing,
  serializeMetroWayfindingLayout,
  type MetroWayfindingElement,
  type MetroWayfindingCombinationChild,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingCombinationFillMode,
  type MetroWayfindingCombinationStripePosition,
  type MetroWayfindingFrameFillMode,
  type MetroWayfindingFrameShape,
  type MetroWayfindingIconOption,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLayoutMode,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextAlign,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';

export function MetroWayfindingEditor({
  value,
  canvasWidth,
  canvasHeight,
  disabled,
  lineColorOptions,
  textSuggestions,
  examples = [],
  onLoadExample,
  onCanvasHeightChange,
  onCanvasWidthChange,
  onChange,
}: Readonly<{
  value: string;
  canvasWidth: number;
  canvasHeight: number;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  textSuggestions?: string[];
  examples?: readonly MetroWayfindingExample[];
  onLoadExample?: (example: MetroWayfindingExample) => void;
  onCanvasHeightChange: (height: number) => void;
  onCanvasWidthChange: (width: number) => void;
  onChange: (value: string) => void;
}>) {
  const editorId = useId();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState(() => parseMetroWayfindingLayout(value));
  const layoutRef = useRef(layout);
  const [selection, setSelection] = useState(() => ({
    rowIndex: 0,
    elementId: parseMetroWayfindingLayout(value).rows[0]?.[0]?.id ?? '',
  }));
  const [draggedElement, setDraggedElement] = useState<{
    rowIndex: number;
    elementId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    rowIndex: number;
    elementId: string;
    placement: 'before' | 'after';
  } | null>(null);
  const [importPreview, setImportPreview] = useState<MetroWayfindingImportPreview>();
  const [importMode, setImportMode] = useState<MetroWayfindingImportMode>('semantic');
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const nextLayout = parseMetroWayfindingLayout(value);
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    setSelection((current) => {
      const rowIndex = nextLayout.mode === 'double' ? Math.min(current.rowIndex, 1) : 0;
      const row = nextLayout.rows[rowIndex] ?? [];
      if (row.some((element) => element.id === current.elementId)) {
        return { rowIndex, elementId: current.elementId };
      }
      return { rowIndex, elementId: row[0]?.id ?? '' };
    });
  }, [value]);

  const applyAction = useCallback(
    (action: MetroWayfindingCompositionAction) => {
      const next = reduceMetroWayfindingAction(layoutRef.current, action);
      layoutRef.current = next;
      setLayout(next);
      onChange(serializeMetroWayfindingLayout(next));
    },
    [onChange],
  );

  useEffect(
    () => subscribeMetroWayfindingCompositionActions(editorId, applyAction),
    [applyAction, editorId],
  );

  useEffect(
    () =>
      subscribeMetroWayfindingImportLifecycleEvents(editorId, (event) => {
        if (event.type === 'ExternalWayfindingProjectParsed') {
          setImportPreview(event.payload.preview);
          setImportMode(event.payload.preview.source === 'yct' ? 'source-style' : 'semantic');
          setImportError('');
          return;
        }
        if (event.type === 'ExternalWayfindingImportFailed') {
          setImportPreview(undefined);
          setImportError(event.payload.message);
          return;
        }
        if (event.type !== 'MetroWayfindingProjectImported') return;
        const preview = event.payload.preview;
        setSelection({
          rowIndex: 0,
          elementId: preview.layout.rows[0]?.[0]?.id ?? '',
        });
        setDraggedElement(null);
        setDropTarget(null);
        onCanvasWidthChange(preview.canvas.widthM);
        onCanvasHeightChange(preview.canvas.heightM);
        dispatchMetroWayfindingCompositionAction({
          editorId,
          action: { type: 'replace', layout: preview.layout },
        });
        setImportPreview(undefined);
        setImportError('');
      }),
    [editorId, onCanvasHeightChange, onCanvasWidthChange],
  );

  useEffect(() => {
    if (!importPreview) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setImportPreview(undefined);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [importPreview]);

  const dispatchComposition = (action: MetroWayfindingCompositionAction) => {
    if (action.type === 'add' || action.type === 'duplicate') {
      setSelection({ rowIndex: action.rowIndex, elementId: action.element.id });
    } else if (
      action.type === 'remove' &&
      action.rowIndex === selection.rowIndex &&
      action.elementId === selection.elementId
    ) {
      const actionElements = layout.rows[action.rowIndex] ?? [];
      const removedIndex = actionElements.findIndex((element) => element.id === action.elementId);
      setSelection({
        rowIndex: action.rowIndex,
        elementId:
          actionElements[removedIndex + 1]?.id ?? actionElements[removedIndex - 1]?.id ?? '',
      });
    }
    dispatchMetroWayfindingCompositionAction({ editorId, action });
  };
  const dispatchElement = (rowIndex: number, action: MetroWayfindingElementAction) =>
    dispatchComposition({ ...action, rowIndex });
  const activeElements = layout.rows[selection.rowIndex] ?? [];
  const selectedElement =
    activeElements.find((element) => element.id === selection.elementId) ?? activeElements[0];
  const selectedElementIndex = selectedElement
    ? activeElements.findIndex((element) => element.id === selectedElement.id)
    : -1;
  const visibleRows = layout.rows.slice(0, layout.mode === 'double' ? 2 : 1);
  const hasElements = layout.rows.some((elements) => elements.length > 0);
  const hasVisibleElements = visibleRows.some((elements) => elements.length > 0);
  const rowSizings = visibleRows.map((elements) =>
    resolveMetroWayfindingLayoutSizing(elements, canvasWidth),
  );
  const tightestRowSizing = rowSizings.reduce((current, candidate) =>
    candidate.textScaleX < current.textScaleX ? candidate : current,
  );
  const layoutSizing = {
    ...tightestRowSizing,
    isWidthInsufficient: rowSizings.some((sizing) => sizing.isWidthInsufficient),
    hasUnresolvedOverflow: rowSizings.some((sizing) => sizing.hasUnresolvedOverflow),
  };
  const verticalLayoutSizing = resolveMetroWayfindingVerticalLayoutSizing(
    visibleRows[0] ?? [],
    canvasHeight * 128,
  );
  const backgroundColorOptions = mergeMetroColorOptions(
    metroWayfindingBackgroundPalette,
    lineColorOptions,
  );
  const activeImportPreview = importPreview
    ? resolveMetroWayfindingImportPreview(importPreview, importMode)
    : undefined;
  const activeImportWarnings = activeImportPreview?.warnings ?? [];

  useEffect(() => {
    document
      .getElementById(`${editorId}-${selection.elementId}-tab`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [editorId, selection.elementId]);

  const handleElementNavigationKeyDown = (
    event: KeyboardEvent<HTMLOListElement>,
    rowIndex: number,
  ) => {
    const target = event.target as HTMLElement;
    const elements = layout.rows[rowIndex] ?? [];
    if (!target.matches('[role="tab"]') || !elements.length) return;
    let nextIndex = elements.findIndex((element) => element.id === target.dataset.elementId);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = elements.length - 1;
    else return;
    event.preventDefault();
    const nextElement = elements[Math.max(0, Math.min(elements.length - 1, nextIndex))];
    if (nextElement) {
      setSelection({ rowIndex, elementId: nextElement.id });
      window.requestAnimationFrame(() => {
        document.getElementById(`${editorId}-${nextElement.id}-tab`)?.focus();
      });
    }
  };

  const handleElementDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    elementId: string,
  ) => {
    if (disabled || (layout.rows[rowIndex]?.length ?? 0) < 2) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', elementId);
    setDraggedElement({ rowIndex, elementId });
    setSelection({ rowIndex, elementId });
  };

  const handleElementDragOver = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    targetElementId: string,
  ) => {
    if (
      !draggedElement ||
      draggedElement.rowIndex !== rowIndex ||
      draggedElement.elementId === targetElementId
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    setDropTarget((current) =>
      current?.rowIndex === rowIndex &&
      current.elementId === targetElementId &&
      current.placement === placement
        ? current
        : { rowIndex, elementId: targetElementId, placement },
    );
  };

  const handleElementDrop = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    targetElementId: string,
  ) => {
    if (draggedElement?.rowIndex !== rowIndex) return;
    const elementId = draggedElement.elementId || event.dataTransfer.getData('text/plain');
    if (!elementId || elementId === targetElementId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    dispatchElement(rowIndex, { type: 'reorder', elementId, targetElementId, placement });
    setDraggedElement(null);
    setDropTarget(null);
  };

  const handleElementDragEnd = () => {
    setDraggedElement(null);
    setDropTarget(null);
  };

  const changeLayoutMode = (mode: MetroWayfindingLayoutMode) => {
    const rows = layout.rows.map((row) => [...row]);
    if (mode === 'double' && rows.length < 2) rows.push([]);
    if (mode !== 'double' && selection.rowIndex !== 0) {
      setSelection({ rowIndex: 0, elementId: rows[0]?.[0]?.id ?? '' });
    }
    const signLength =
      layout.mode === 'vertical'
        ? Math.max(1, Math.round(canvasHeight))
        : Math.max(1, Math.round(canvasWidth / 128));
    if (mode === 'vertical') {
      onCanvasWidthChange(1);
      onCanvasHeightChange(signLength);
    } else {
      onCanvasWidthChange(signLength);
      onCanvasHeightChange(mode === 'double' ? 2 : 1);
    }
    dispatchComposition({ type: 'replace', layout: { ...layout, mode, rows } });
  };

  const clearLayoutElements = () => {
    if (!hasElements || !window.confirm('确认清空当前地铁导视牌的全部元素？')) return;
    setSelection({ rowIndex: 0, elementId: '' });
    setDraggedElement(null);
    setDropTarget(null);
    dispatchComposition({
      type: 'replace',
      layout: { ...layout, rows: layout.rows.map(() => []) },
    });
  };

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length) return;
    setIsImporting(true);
    setImportError('');
    publishMetroWayfindingImportLifecycleEvent({
      type: 'ExternalWayfindingProjectSelected',
      payload: {
        editorId,
        files: files.map(({ name, size }) => ({ name, size })),
      },
    });
    try {
      if (files.length > METRO_WAYFINDING_IMPORT_MAX_FILES) {
        throw new Error(`一次最多导入 ${METRO_WAYFINDING_IMPORT_MAX_FILES} 个工程文件。`);
      }
      const oversizedFile = files.find(
        (file) => file.size > METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES,
      );
      if (oversizedFile) {
        throw new Error(`${oversizedFile.name} 超过 2 MB，已停止读取。`);
      }
      const inputs = await Promise.all(
        files.map(async (file) => ({ name: file.name, size: file.size, text: await file.text() })),
      );
      const preview = parseMetroWayfindingImportFiles(inputs);
      publishMetroWayfindingImportLifecycleEvent({
        type: 'ExternalWayfindingProjectParsed',
        payload: { editorId, preview },
      });
      if (preview.warnings.length) {
        publishMetroWayfindingImportLifecycleEvent({
          type: 'ExternalWayfindingConversionWarningsRaised',
          payload: { editorId, source: preview.source, warnings: preview.warnings },
        });
      }
    } catch (error) {
      publishMetroWayfindingImportLifecycleEvent({
        type: 'ExternalWayfindingImportFailed',
        payload: {
          editorId,
          message: error instanceof Error ? error.message : '工程文件解析失败。',
        },
      });
    } finally {
      setIsImporting(false);
    }
  };

  const applyImportPreview = () => {
    if (!importPreview) return;
    const resolvedPreview = resolveMetroWayfindingImportPreview(importPreview, importMode);
    publishMetroWayfindingImportLifecycleEvent({
      type: 'MetroWayfindingProjectImported',
      payload: { editorId, preview: resolvedPreview },
    });
  };

  return (
    <section className="metro-wayfinding-editor" aria-label="地铁导视牌编排">
      <div className="metro-wayfinding-toolbar">
        <SegmentedControl
          label="版式"
          value={layout.mode}
          options={[
            { value: 'single', label: '单行', icon: 'view_stream' },
            { value: 'double', label: '双行', icon: 'table_rows' },
            { value: 'vertical', label: '竖向', icon: 'view_column' },
          ]}
          disabled={disabled}
          wide
          onChange={changeLayoutMode}
        />
        <ColorControl
          label="导视牌底色"
          value={layout.backgroundColor}
          palette={backgroundColorOptions}
          disabled={disabled}
          onChange={(backgroundColor) =>
            dispatchComposition({ type: 'replace', layout: { ...layout, backgroundColor } })
          }
        />
        <ColorControl
          label="默认文字与图形颜色"
          value={layout.foregroundColor}
          palette={metroWayfindingForegroundPalette}
          disabled={disabled}
          onChange={(foregroundColor) =>
            dispatchComposition({ type: 'replace', layout: { ...layout, foregroundColor } })
          }
        />
        {layout.mode === 'double' ? (
          <label className="material-checkbox-row metro-wayfinding-toggle">
            <input
              type="checkbox"
              checked={layout.dividerBetweenRows}
              disabled={disabled}
              onChange={(event) =>
                dispatchComposition({
                  type: 'replace',
                  layout: { ...layout, dividerBetweenRows: event.currentTarget.checked },
                })
              }
            />
            <span>添加行间分割线</span>
          </label>
        ) : null}
        <div className="metro-wayfinding-toolbar-actions">
          <input
            ref={importInputRef}
            type="file"
            className="sr-only"
            accept=".json,application/json"
            multiple
            disabled={disabled || isImporting}
            onChange={(event) => void handleImportFiles(event)}
          />
          <button
            type="button"
            className="metro-wayfinding-import-button"
            disabled={disabled || isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isImporting ? 'progress_activity' : 'upload_file'}
            </span>
            <span>{isImporting ? '正在解析' : '导入工程'}</span>
          </button>
          <button
            type="button"
            className="metro-wayfinding-clear-button"
            disabled={disabled || !hasElements}
            onClick={clearLayoutElements}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              delete_sweep
            </span>
            <span>清空导视牌</span>
          </button>
        </div>
        {importError ? (
          <p className="metro-wayfinding-import-error" role="alert">
            {importError}
          </p>
        ) : null}
      </div>

      <div className="metro-wayfinding-row-lists">
        {visibleRows.map((elements, rowIndex) => (
          <div
            key={rowIndex}
            className={`metro-wayfinding-row-list${layout.mode !== 'double' ? ' is-single' : ''}`}
          >
            {layout.mode === 'double' ? (
              <strong>{rowIndex === 0 ? '第一行' : '第二行'}</strong>
            ) : null}
            <ol
              className="metro-wayfinding-element-list"
              role="tablist"
              aria-label={`${rowIndex === 0 ? '第一行' : '第二行'}已添加元素`}
              onKeyDown={(event) => handleElementNavigationKeyDown(event, rowIndex)}
            >
              {elements.map((element) => {
                const isSelected =
                  rowIndex === selection.rowIndex && element.id === selectedElement?.id;
                const isIconOnly =
                  element.type === 'facility' ||
                  element.type === 'arrow' ||
                  element.type === 'space' ||
                  element.type === 'divider';
                const tabLabel = metroElementTabAriaLabel(element, layout.mode);
                const canDrag = !disabled && elements.length > 1;
                return (
                  <li key={element.id} role="presentation">
                    <button
                      id={`${editorId}-${element.id}-tab`}
                      type="button"
                      role="tab"
                      data-element-id={element.id}
                      aria-selected={isSelected}
                      aria-controls={`${editorId}-element-panel`}
                      aria-label={canDrag ? `${tabLabel}，可拖动更改顺序` : tabLabel}
                      title={canDrag ? '拖动更改顺序' : undefined}
                      tabIndex={isSelected ? 0 : -1}
                      draggable={canDrag}
                      className={[
                        isSelected ? 'is-active' : '',
                        isIconOnly ? 'is-icon-only' : '',
                        canDrag ? 'is-draggable' : '',
                        draggedElement?.rowIndex === rowIndex &&
                        draggedElement.elementId === element.id
                          ? 'is-dragging'
                          : '',
                        dropTarget?.rowIndex === rowIndex && dropTarget.elementId === element.id
                          ? `is-drop-${dropTarget.placement}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelection({ rowIndex, elementId: element.id })}
                      onDragStart={(event) => handleElementDragStart(event, rowIndex, element.id)}
                      onDragOver={(event) => handleElementDragOver(event, rowIndex, element.id)}
                      onDrop={(event) => handleElementDrop(event, rowIndex, element.id)}
                      onDragEnd={handleElementDragEnd}
                    >
                      <MetroWayfindingElementTabContent
                        element={element}
                        layoutMode={layout.mode}
                      />
                    </button>
                  </li>
                );
              })}
              <li className="metro-wayfinding-element-list-add" role="presentation">
                <button
                  type="button"
                  className="is-icon-only"
                  aria-label={`向${rowIndex === 0 ? '第一行' : '第二行'}添加元素`}
                  title="添加元素"
                  onClick={() =>
                    dispatchElement(rowIndex, {
                      type: 'add',
                      element: createMetroWayfindingElement('facility'),
                    })
                  }
                  disabled={disabled}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add
                  </span>
                </button>
              </li>
            </ol>
          </div>
        ))}
      </div>

      {!hasVisibleElements && examples.length && onLoadExample ? (
        <MetroWayfindingExampleList
          examples={examples}
          disabled={disabled}
          onLoadExample={onLoadExample}
        />
      ) : null}

      {selectedElement ? (
        <MetroWayfindingInsertionSuggestions
          element={selectedElement}
          elements={activeElements}
          layoutMode={layout.mode}
          disabled={disabled}
          lineColorOptions={lineColorOptions}
          onAction={(action) => dispatchElement(selection.rowIndex, action)}
        />
      ) : null}

      {layout.mode !== 'vertical' && layoutSizing.isWidthInsufficient ? (
        <p className="metro-wayfinding-width-warning" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <span>
            当前尺寸宽度不足，文字、大文字与组合框已统一横向压缩至
            {Math.round(layoutSizing.textScaleX * 100)}%，文字行按需适配。
            {layoutSizing.hasUnresolvedOverflow
              ? '非文字元素仍超出可用宽度，请增加导视牌宽度。'
              : ''}
          </span>
        </p>
      ) : null}

      {layout.mode === 'vertical' && verticalLayoutSizing.isHeightInsufficient ? (
        <p className="metro-wayfinding-width-warning" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <span>
            当前高度不足
            {verticalLayoutSizing.textScaleY < 1
              ? `，竖向文字已按最长列优先压缩至${Math.round(verticalLayoutSizing.textScaleY * 100)}%`
              : ''}
            ，请增加 128 像素格数或减少固定高度元素。
          </span>
        </p>
      ) : null}

      {selectedElement ? (
        <div
          id={`${editorId}-element-panel`}
          role="tabpanel"
          aria-labelledby={`${editorId}-${selectedElement.id}-tab`}
          className="metro-wayfinding-element-panel"
        >
          <MetroWayfindingElementEditor
            element={selectedElement}
            layoutMode={layout.mode}
            disabled={disabled}
            isFirst={selectedElementIndex === 0}
            isLast={selectedElementIndex === activeElements.length - 1}
            lineColorOptions={lineColorOptions}
            backgroundColorOptions={backgroundColorOptions}
            inheritedBackgroundColor={layout.backgroundColor}
            inheritedForegroundColor={layout.foregroundColor}
            textSuggestions={textSuggestions}
            onAction={(action) => dispatchElement(selection.rowIndex, action)}
          />
        </div>
      ) : null}
      {importPreview ? (
        <div
          className="modal-backdrop metro-wayfinding-import-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setImportPreview(undefined);
          }}
        >
          <section
            className="modal-panel metro-wayfinding-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${editorId}-import-heading`}
          >
            <header>
              <div>
                <span>工程转换预览</span>
                <h2 id={`${editorId}-import-heading`}>{importPreview.projectName}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭导入预览"
                title="关闭"
                onClick={() => setImportPreview(undefined)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>

            {importPreview.source !== 'yct' ? (
              <SegmentedControl
                label="转换方式"
                value={importMode}
                options={[
                  { value: 'semantic', label: '仅语义（推荐）', icon: 'conversion_path' },
                  { value: 'source-style', label: '保留源样式', icon: 'palette' },
                ]}
                disabled={disabled}
                wide
                onChange={setImportMode}
              />
            ) : null}

            <dl className="metro-wayfinding-import-facts">
              <div>
                <dt>来源</dt>
                <dd>{importPreview.sourceLabel}</dd>
              </div>
              <div>
                <dt>来源风格</dt>
                <dd>{importPreview.styleLabel}</dd>
              </div>
              <div>
                <dt>目标风格</dt>
                <dd>
                  {importPreview.source === 'yct'
                    ? importPreview.styleLabel
                    : (activeImportPreview?.styleLabel ?? METRO_WAYFINDING_SEMANTIC_TARGET_STYLE)}
                </dd>
              </div>
              <div>
                <dt>版式</dt>
                <dd>
                  {activeImportPreview?.layout.mode === 'double'
                    ? '双行'
                    : activeImportPreview?.layout.mode === 'vertical'
                      ? '竖向'
                      : '单行'}
                  {' · '}
                  {activeImportPreview?.canvas.widthM ?? importPreview.canvas.widthM} ×{' '}
                  {activeImportPreview?.canvas.heightM ?? importPreview.canvas.heightM}
                </dd>
              </div>
            </dl>

            <ol className="metro-wayfinding-import-rows" aria-label="待导入行顺序">
              {importPreview.rowSources.map((row, index) => (
                <li key={`${row.fileName}-${index}`}>
                  <div>
                    <span>{index === 0 ? '第一行' : '第二行'}</span>
                    <strong>{row.summary}</strong>
                    <small>{row.label}</small>
                  </div>
                  {importPreview.rowSources.length > 1 ? (
                    <div className="metro-wayfinding-import-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="上移此行"
                        title="上移"
                        disabled={index === 0}
                        onClick={() =>
                          setImportPreview((current) =>
                            current
                              ? reorderMetroWayfindingImportRows(current, index, index - 1)
                              : current,
                          )
                        }
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          arrow_upward
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="下移此行"
                        title="下移"
                        disabled={index === importPreview.rowSources.length - 1}
                        onClick={() =>
                          setImportPreview((current) =>
                            current
                              ? reorderMetroWayfindingImportRows(current, index, index + 1)
                              : current,
                          )
                        }
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          arrow_downward
                        </span>
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>

            {activeImportWarnings.length ? (
              <section className="metro-wayfinding-import-warnings" aria-label="转换提醒">
                <header>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    warning
                  </span>
                  <strong>转换提醒</strong>
                </header>
                <ul>
                  {activeImportWarnings.map((warning) => (
                    <li key={`${warning.code}-${warning.message}`}>
                      {warning.message}
                      {warning.count > 1 ? `（${warning.count} 处）` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer>
              <span>
                {importPreview.files.length} 个 JSON · 单文件上限{' '}
                {METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB
              </span>
              <div>
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setImportPreview(undefined)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="primary-action-button"
                  onClick={applyImportPreview}
                >
                  {hasElements ? '替换现有导视牌' : '导入导视牌'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MetroWayfindingExampleList({
  examples,
  disabled,
  onLoadExample,
}: Readonly<{
  examples: readonly MetroWayfindingExample[];
  disabled: boolean;
  onLoadExample: (example: MetroWayfindingExample) => void;
}>) {
  return (
    <section className="material-template-examples" aria-label="地铁导视示例工程">
      <div className="material-template-examples-heading">
        <strong>示例工程</strong>
        <span>选择一个版式开始编辑</span>
      </div>
      <div className="material-template-example-list">
        {examples.map((example) => (
          <article className="material-template-example" key={example.source.id}>
            <div className="material-template-example-heading">
              <strong>{example.source.remark}</strong>
              <span>{example.source.label}</span>
            </div>
            <small className="material-template-example-meta">
              {example.summary.modeLabel} · {example.summary.sizeLabel}
            </small>
            <p>{example.summary.rows.map((row) => `${row.label}：${row.content}`).join('；')}</p>
            <button
              type="button"
              className="material-template-example-load"
              onClick={() => onLoadExample(example)}
              disabled={disabled}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                file_open
              </span>
              载入示例
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetroWayfindingElementTabContent({
  element,
  layoutMode,
}: Readonly<{
  element: MetroWayfindingElement;
  layoutMode: MetroWayfindingLayoutMode;
}>) {
  if (element.type === 'facility') {
    const icon =
      metroWayfindingFacilityOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingFacilityOptions[0]!;
    const assetName = resolveMetroFacilityIconAssetName(icon.id, element.direction);
    if (assetName) {
      return (
        <MetroFacilityAssetIcon
          assetName={assetName}
          style={metroFacilityAssetPreviewStyle(icon.id, element.direction)}
        />
      );
    }
    return (
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={metroIconElementPreviewStyle(icon.id, element.direction)}
      >
        {icon.symbol}
      </span>
    );
  }
  if (element.type === 'arrow') {
    return <MetroArrowAssetIcon assetName={element.iconId} />;
  }
  if (element.type === 'text') {
    const alignmentIcon = {
      left: 'format_align_left',
      center: 'format_align_center',
      right: 'format_align_right',
    }[layoutMode === 'vertical' ? 'center' : element.align];
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          {alignmentIcon}
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {summarizeMetroTextRows(element.rows) || '文字'}
        </span>
      </>
    );
  }
  if (element.type === 'largeText') {
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          title
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {[element.value, element.suffix].filter(Boolean).join('') || '大文字'}
        </span>
      </>
    );
  }
  if (element.type === 'combination') {
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          widgets
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {element.children.length ? `${element.children.length} 个子元素` : '组合框'}
        </span>
      </>
    );
  }
  if (element.type === 'space') {
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
        {element.mode === 'flex' ? 'arrow_range' : 'space_bar'}
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      split_scene
    </span>
  );
}

function metroElementTabAriaLabel(
  element: MetroWayfindingElement,
  layoutMode: MetroWayfindingLayoutMode,
): string {
  if (element.type === 'facility') {
    const label =
      metroWayfindingFacilityOptions.find((option) => option.id === element.iconId)?.label ??
      '设施';
    const direction =
      element.direction && ['stairs', 'stairs-down', 'escalator', 'exit'].includes(element.iconId)
        ? { left: '向左', right: '向右', up: '向上', down: '向下' }[element.direction]
        : '';
    return `${label}${direction ? `，${direction}` : ''}`;
  }
  if (element.type === 'arrow') {
    return (
      metroWayfindingArrowOptions.find((option) => option.id === element.iconId)?.label ?? '箭头'
    );
  }
  if (element.type === 'text') {
    const alignmentLabel =
      layoutMode === 'vertical'
        ? '居中'
        : { left: '左对齐', center: '居中', right: '右对齐' }[element.align];
    const writingModeLabel =
      layoutMode === 'vertical' ? (element.writingMode === 'vertical' ? '竖排' : '横排') : '';
    const summary = summarizeMetroTextRows(element.rows);
    return `文字，${element.rows.length} 行，${alignmentLabel}${writingModeLabel ? `，${writingModeLabel}` : ''}${summary ? `，${summary}` : ''}`;
  }
  if (element.type === 'largeText') {
    const summary = [element.value, element.suffix].filter(Boolean).join('');
    return summary ? `大文字，${summary}` : '大文字';
  }
  if (element.type === 'combination') {
    return `组合框，${element.children.length} 个子元素，缩放 ${Math.round(element.scale * 100)}%`;
  }
  if (element.type === 'space') {
    return element.mode === 'flex' ? '弹性空白' : `固定空白，${element.units} 格`;
  }
  return '分割线';
}

function summarizeMetroMainSegments(segments: MetroWayfindingMainSegment[]): string {
  return segments
    .map((segment) => (segment.kind === 'line' ? `[${segment.value || '线路'}]` : segment.value))
    .join('')
    .trim();
}

function summarizeMetroTextRows(rows: MetroWayfindingTextRow[]): string {
  return rows
    .map((row) =>
      row.kind === 'main' ? summarizeMetroMainSegments(row.segments) : row.value.trim(),
    )
    .filter(Boolean)
    .join(' / ')
    .slice(0, 120);
}

function formatMetroMetric(value: number): string {
  return `${Math.round(value * 10) / 10} px`;
}

function MetroWayfindingElementEditor({
  element,
  layoutMode,
  disabled,
  isFirst,
  isLast,
  lineColorOptions,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  textSuggestions,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  textSuggestions?: string[];
  onAction: (action: MetroWayfindingElementAction) => void;
}>) {
  const patch = (nextPatch: Partial<MetroWayfindingElement>) =>
    onAction({ type: 'update', elementId: element.id, patch: nextPatch });

  return (
    <article className="metro-wayfinding-element">
      <header>
        <strong>{metroElementLabel(element)}</strong>
        <div className="metro-wayfinding-element-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="向左移动"
            title="向左移动"
            disabled={disabled || isFirst}
            onClick={() => onAction({ type: 'move', elementId: element.id, direction: 'up' })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="向右移动"
            title="向右移动"
            disabled={disabled || isLast}
            onClick={() => onAction({ type: 'move', elementId: element.id, direction: 'down' })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="创建元素副本"
            title="创建元素副本"
            disabled={disabled}
            onClick={() =>
              onAction({
                type: 'duplicate',
                elementId: element.id,
                element: duplicateMetroWayfindingElement(element),
              })
            }
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              content_copy
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="移除元素"
            title="移除元素"
            disabled={disabled}
            onClick={() => onAction({ type: 'remove', elementId: element.id })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              delete
            </span>
          </button>
        </div>
      </header>
      <div className="metro-wayfinding-element-body">
        <SegmentedControl
          label="元素类型"
          value={element.type}
          options={[
            { value: 'facility', label: '设施', icon: 'accessible' },
            { value: 'arrow', label: '箭头', icon: 'arrow_forward' },
            { value: 'text', label: '文字', icon: 'text_fields' },
            { value: 'largeText', label: '大文字', icon: 'title' },
            { value: 'combination', label: '组合框', icon: 'widgets' },
            { value: 'space', label: '空白', icon: 'space_bar' },
            { value: 'divider', label: '分割线', icon: 'split_scene' },
          ]}
          disabled={disabled}
          wide
          onChange={(elementType) =>
            onAction({ type: 'changeType', elementId: element.id, elementType })
          }
        />
        <ElementColorFields
          element={element}
          disabled={disabled}
          backgroundColorOptions={backgroundColorOptions}
          inheritedBackgroundColor={inheritedBackgroundColor}
          inheritedForegroundColor={inheritedForegroundColor}
          patch={patch}
        />
        {element.type === 'facility' ? (
          <FacilityElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'arrow' ? (
          <ArrowElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'text' ? (
          <TextElementFields
            element={element}
            layoutMode={layoutMode}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            textSuggestions={textSuggestions}
            patch={patch}
          />
        ) : null}
        {element.type === 'largeText' ? (
          <LargeTextElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'combination' ? (
          <CombinationElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            backgroundColorOptions={backgroundColorOptions}
            inheritedBackgroundColor={inheritedBackgroundColor}
            inheritedForegroundColor={inheritedForegroundColor}
            textSuggestions={textSuggestions}
            patch={patch}
          />
        ) : null}
        {element.type === 'space' ? (
          <SpaceElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'divider' ? (
          <p className="muted">
            竖线宽 {METRO_WAYFINDING_DIVIDER_WIDTH}、高 72，随导视牌像素单元等比缩放。
          </p>
        ) : null}
      </div>
    </article>
  );
}

function FacilityElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'facility' }>;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const currentIcon =
    metroWayfindingFacilityOptions.find((option) => option.id === element.iconId) ??
    metroWayfindingFacilityOptions[0]!;
  const selectIcon = (iconId: string) => {
    const nextIcon = metroWayfindingFacilityOptions.find((option) => option.id === iconId);
    const shouldClearPreviousDefault =
      currentIcon.defaultForegroundColor === element.foregroundColor;
    patch({
      iconId,
      direction: ['stairs', 'stairs-down', 'escalator', 'exit'].includes(iconId)
        ? (element.direction ?? 'right')
        : undefined,
      foregroundColor:
        nextIcon?.defaultForegroundColor ??
        (shouldClearPreviousDefault ? undefined : element.foregroundColor),
    });
  };

  return (
    <div className="metro-wayfinding-field-grid">
      <IconChoiceGrid
        label="设施图标"
        value={element.iconId}
        options={metroWayfindingFacilityOptions.map((option) => {
          const assetName = resolveMetroFacilityIconAssetName(option.id);
          return {
            ...option,
            assetName,
            iconStyle: assetName
              ? metroFacilityAssetPreviewStyle(option.id, undefined)
              : metroIconPreviewStyle(option.id),
          };
        })}
        disabled={disabled}
        onChange={selectIcon}
      />
      {['stairs', 'stairs-down', 'escalator', 'exit'].includes(element.iconId) ? (
        <SegmentedControl
          label={element.iconId === 'exit' ? '出口图标方向' : '图标方向'}
          value={element.direction ?? 'right'}
          options={
            (element.iconId === 'exit'
              ? [
                  { value: 'left', label: '左' },
                  { value: 'up', label: '上' },
                  { value: 'right', label: '右' },
                  { value: 'down', label: '下' },
                ]
              : [
                  { value: 'left', label: '左' },
                  { value: 'right', label: '右' },
                ]
            ).map((option) => {
              const direction = option.value as 'left' | 'right' | 'up' | 'down';
              const assetName = resolveMetroFacilityIconAssetName(element.iconId, direction);
              return {
                ...option,
                icon: assetName ? undefined : currentIcon.symbol,
                assetName,
                iconStyle: assetName
                  ? metroFacilityAssetPreviewStyle(element.iconId, direction)
                  : metroFacilityDirectionPreviewStyle(element.iconId, direction),
              };
            }) as Array<{
              value: 'left' | 'right' | 'up' | 'down';
              label: string;
              icon?: string;
              assetName?: string;
              iconStyle?: { transform: string };
            }>
          }
          disabled={disabled}
          showLabels={false}
          onChange={(direction) => patch({ direction })}
        />
      ) : null}
      <FrameShapeControl
        value={element.frameShape}
        disabled={disabled}
        onChange={(frameShape) => patch({ frameShape })}
      />
      {element.frameShape !== 'none' ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function ArrowElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'arrow' }>;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  return (
    <div className="metro-wayfinding-field-grid">
      <IconChoiceGrid
        label="箭头"
        value={element.iconId}
        options={metroWayfindingArrowOptions.map((option) => ({
          ...option,
          arrowAssetName: resolveMetroArrowIconAssetName(option.id),
        }))}
        disabled={disabled}
        onChange={(iconId) => patch({ iconId })}
      />
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={element.framed}
          disabled={disabled}
          onChange={(event) => patch({ framed: event.currentTarget.checked })}
        />
        <span>添加外框</span>
      </label>
      {element.framed ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function TextElementFields({
  element,
  layoutMode,
  disabled,
  lineColorOptions,
  textSuggestions,
  patch,
}: Readonly<{
  element: MetroWayfindingTextElement;
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  textSuggestions?: string[];
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  const updateRow = (rowId: string, row: MetroWayfindingTextRow) =>
    patch({ rows: element.rows.map((item) => (item.id === rowId ? row : item)) });
  const moveRow = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= element.rows.length) return;
    const rows = [...element.rows];
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    patch({ rows });
  };
  const addRow = (kind: MetroWayfindingTextRow['kind']) => {
    patch({ rows: [...element.rows, createMetroWayfindingTextRow(kind)] });
  };
  const removeRow = (rowId: string) => {
    if (element.rows.length === 1) return;
    patch({ rows: element.rows.filter((row) => row.id !== rowId) });
  };

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <SegmentedControl
          label="对齐"
          value={layoutMode === 'vertical' ? 'center' : element.align}
          options={
            layoutMode === 'vertical'
              ? [{ value: 'center' as const, label: '居中', icon: 'format_align_center' }]
              : [
                  { value: 'left' as const, label: '左对齐', icon: 'format_align_left' },
                  { value: 'center' as const, label: '居中', icon: 'format_align_center' },
                  { value: 'right' as const, label: '右对齐', icon: 'format_align_right' },
                ]
          }
          disabled={disabled}
          showLabels={false}
          onChange={(align) => patch({ align })}
        />
        {layoutMode === 'vertical' ? (
          <SegmentedControl
            label="文字排列"
            value={element.writingMode}
            options={[
              { value: 'horizontal', label: '横向', icon: 'text_rotation_none' },
              { value: 'vertical', label: '竖向', icon: 'text_rotate_vertical' },
            ]}
            disabled={disabled}
            onChange={(writingMode) => patch({ writingMode })}
          />
        ) : null}
        <output className="metro-wayfinding-text-metrics">
          <span>动态字高</span>
          <strong>
            主文本 {formatMetroMetric(metrics.mainFontSize)} · 副文本{' '}
            {formatMetroMetric(metrics.secondaryFontSize)}
          </strong>
        </output>
      </div>
      <section className="metro-wayfinding-text-row-editor" aria-label="文本行">
        <ol className="metro-wayfinding-text-row-list">
          {element.rows.map((row, index) => (
            <li key={row.id} className="metro-wayfinding-text-row-item">
              <header>
                <strong>
                  第 {index + 1} 行 ·{' '}
                  {row.kind === 'main' ? '主文本' : '副文本·粗体'}
                </strong>
                <div className="metro-wayfinding-element-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`第 ${index + 1} 行上移`}
                    title="上移"
                    disabled={disabled || index === 0}
                    onClick={() => moveRow(index, 'up')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_upward
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`第 ${index + 1} 行下移`}
                    title="下移"
                    disabled={disabled || index === element.rows.length - 1}
                    onClick={() => moveRow(index, 'down')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_downward
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`删除第 ${index + 1} 行`}
                    title="删除文本行"
                    disabled={disabled || element.rows.length === 1}
                    onClick={() => removeRow(row.id)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </div>
              </header>
              {row.kind === 'main' ? (
                <MainSegmentEditor
                  label={`第 ${index + 1} 行主文本内容`}
                  fontSize={metrics.mainFontSize}
                  segments={row.segments}
                  disabled={disabled}
                  lineColorOptions={lineColorOptions}
                  textSuggestions={textSuggestions}
                  onChange={(segments) => updateRow(row.id, { ...row, segments })}
                />
              ) : (
                <label className="material-field">
                  <span>副文本内容 · 字高 {formatMetroMetric(metrics.secondaryFontSize)}</span>
                  <MetroWayfindingTextAutocompleteInput
                    value={row.value}
                    disabled={disabled}
                    suggestions={textSuggestions}
                    onChange={(value) => updateRow(row.id, { ...row, value })}
                  />
                </label>
              )}
            </li>
          ))}
        </ol>
        <div className="metro-wayfinding-inline-actions" aria-label="添加文本行">
          <button
            type="button"
            aria-label="添加主文本行"
            title="添加主文本行"
            onClick={() => addRow('main')}
            disabled={disabled || element.rows.length >= 32}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              text_fields
            </span>
            <span>主文本</span>
          </button>
          <button
            type="button"
            aria-label="添加副文本行"
            title="添加副文本行"
            onClick={() => addRow('secondary')}
            disabled={disabled || element.rows.length >= 32}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              short_text
            </span>
            <span>副文本</span>
          </button>
        </div>
      </section>
    </>
  );
}

type MetroWayfindingSegmentDialogState =
  | { mode: 'create'; draft: MetroWayfindingMainSegment }
  | { mode: 'edit'; index: number; draft: MetroWayfindingMainSegment };

function metroMainSegmentKindLabel(kind: MetroWayfindingMainSegment['kind']): string {
  if (kind === 'line') return '线路号';
  if (kind === 'boxed') return '方框文本';
  return '文本段';
}

function metroMainSegmentKindIcon(kind: MetroWayfindingMainSegment['kind']): string {
  if (kind === 'line') return 'subway';
  if (kind === 'boxed') return 'crop_square';
  return 'text_fields';
}

function findUniqueMetroLineColor(
  value: string,
  options: Array<{ value: string; label: string; aliases?: string[] }>,
): string | undefined {
  const normalizedValue = normalizeMetroLineNumber(value);
  if (!normalizedValue) return undefined;
  const matches = options.filter((option) => {
    const label = option.label.split('·', 1)[0]?.trim() ?? option.label;
    return [label, ...(option.aliases ?? [])].some(
      (candidate) => normalizeMetroLineNumber(candidate) === normalizedValue,
    );
  });
  const colors = Array.from(new Set(matches.map((option) => option.value.toUpperCase())));
  return colors.length === 1 ? colors[0] : undefined;
}

function normalizeMetroLineNumber(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/gu, '')
    .replace(/^line/iu, '')
    .replace(/(号线|路|line)$/iu, '');
}

function MainSegmentEditor({
  label,
  fontSize,
  segments,
  disabled,
  lineColorOptions,
  textSuggestions,
  onChange,
}: Readonly<{
  label: string;
  fontSize: number;
  segments: MetroWayfindingMainSegment[];
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  textSuggestions?: string[];
  onChange: (segments: MetroWayfindingMainSegment[]) => void;
}>) {
  const editorId = useId();
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const [segmentDialog, setSegmentDialog] = useState<MetroWayfindingSegmentDialogState | null>(
    null,
  );
  const activeSegmentIndex = Math.min(selectedSegmentIndex, Math.max(segments.length - 1, 0));

  const focusSegmentControl = (target: number | 'add') => {
    window.requestAnimationFrame(() => {
      document
        .getElementById(
          target === 'add' ? `${editorId}-add-segment` : `${editorId}-segment-${target}`,
        )
        ?.focus();
    });
  };
  const dismissSegmentDialog = () => {
    const focusTarget = segmentDialog?.mode === 'edit' ? segmentDialog.index : 'add';
    setSegmentDialog(null);
    focusSegmentControl(focusTarget);
  };
  const openSegmentDialog = (index: number) => {
    const segment = segments[index];
    if (!segment || disabled) return;
    setSelectedSegmentIndex(index);
    setSegmentDialog({ mode: 'edit', index, draft: { ...segment } });
  };
  const openCreateDialog = () => {
    if (disabled) return;
    setSegmentDialog({ mode: 'create', draft: { kind: 'text', value: '' } });
  };
  const changeDraftKind = (kind: MetroWayfindingMainSegment['kind']) => {
    setSegmentDialog((current) => {
      if (!current) return current;
      const draft: MetroWayfindingMainSegment =
        kind === 'line'
          ? {
              kind,
              value: current.draft.value,
              color:
                current.draft.kind === 'line'
                  ? current.draft.color
                  : (lineColorOptions[0]?.value ?? '#2F80ED'),
            }
          : { kind, value: current.draft.value };
      return { ...current, draft };
    });
  };
  const updateDraft = (draft: MetroWayfindingMainSegment) => {
    setSegmentDialog((current) => (current ? { ...current, draft } : current));
  };
  const saveSegmentDialog = () => {
    if (!segmentDialog) return;
    if (segmentDialog.mode === 'create') {
      const nextIndex = segments.length;
      onChange([...segments, segmentDialog.draft]);
      setSelectedSegmentIndex(nextIndex);
      setSegmentDialog(null);
      focusSegmentControl(nextIndex);
      return;
    }
    onChange(
      segments.map((segment, index) =>
        index === segmentDialog.index ? segmentDialog.draft : segment,
      ),
    );
    setSelectedSegmentIndex(segmentDialog.index);
    setSegmentDialog(null);
    focusSegmentControl(segmentDialog.index);
  };
  const deleteSegmentFromDialog = () => {
    if (segmentDialog?.mode !== 'edit' || segments.length === 1) return;
    const next = segments.filter((_segment, index) => index !== segmentDialog.index);
    const nextIndex = Math.min(segmentDialog.index, next.length - 1);
    onChange(next);
    setSelectedSegmentIndex(nextIndex);
    setSegmentDialog(null);
    focusSegmentControl(nextIndex);
  };
  const moveSelectedSegment = (direction: 'up' | 'down') => {
    const target = direction === 'up' ? activeSegmentIndex - 1 : activeSegmentIndex + 1;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[activeSegmentIndex], next[target]] = [next[target]!, next[activeSegmentIndex]!];
    setSelectedSegmentIndex(target);
    onChange(next);
    focusSegmentControl(target);
  };

  useEffect(() => {
    setSelectedSegmentIndex((current) => Math.min(current, Math.max(segments.length - 1, 0)));
  }, [segments.length]);

  useEffect(() => {
    if (!segmentDialog) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') dismissSegmentDialog();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [segmentDialog]);

  const handleSegmentNavigationKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches('[data-segment-selector]') || !segments.length) return;
    let nextIndex = Number(target.dataset.segmentIndex);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = segments.length - 1;
    else return;
    event.preventDefault();
    nextIndex = Math.max(0, Math.min(segments.length - 1, nextIndex));
    setSelectedSegmentIndex(nextIndex);
    focusSegmentControl(nextIndex);
  };

  return (
    <section className="metro-wayfinding-main-segments" aria-label={label}>
      <div>
        <strong>{label}</strong>
        <span>字高 {formatMetroMetric(fontSize)}</span>
      </div>
      <div className="metro-wayfinding-main-segment-control">
        <ol
          className="metro-wayfinding-main-segment-tabs"
          aria-label={`${label}的文本段`}
          onKeyDown={handleSegmentNavigationKeyDown}
        >
          {segments.map((segment, index) => (
            <li key={`${segment.kind}-${index}`}>
              <button
                id={`${editorId}-segment-${index}`}
                type="button"
                data-segment-selector
                data-segment-index={index}
                aria-pressed={index === activeSegmentIndex}
                aria-haspopup="dialog"
                aria-label={`${metroMainSegmentKindLabel(segment.kind)}，${segment.value.trim() || '未填写'}`}
                title={`编辑${metroMainSegmentKindLabel(segment.kind)}`}
                tabIndex={index === activeSegmentIndex ? 0 : -1}
                className={[`is-${segment.kind}`, index === activeSegmentIndex ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                style={
                  segment.kind === 'line'
                    ? ({ '--metro-wayfinding-segment-color': segment.color } as CSSProperties)
                    : undefined
                }
                onClick={() => openSegmentDialog(index)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {metroMainSegmentKindIcon(segment.kind)}
                </span>
                <span className="metro-wayfinding-main-segment-tab-summary">
                  {segment.value.trim() || '未填写'}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="metro-wayfinding-main-segment-toolbar" aria-label="文本段操作">
          <button
            type="button"
            className="icon-button"
            aria-label="当前文本段前移"
            title="前移"
            disabled={disabled || activeSegmentIndex === 0}
            onClick={() => moveSelectedSegment('up')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="当前文本段后移"
            title="后移"
            disabled={disabled || activeSegmentIndex === segments.length - 1}
            onClick={() => moveSelectedSegment('down')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </button>
          <button
            id={`${editorId}-add-segment`}
            type="button"
            aria-haspopup="dialog"
            onClick={openCreateDialog}
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            新增
          </button>
        </div>
      </div>

      {segmentDialog ? (
        <div
          className="modal-backdrop metro-wayfinding-segment-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) dismissSegmentDialog();
          }}
        >
          <form
            className="modal-panel metro-wayfinding-segment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${editorId}-segment-dialog-title`}
            onSubmit={(event) => {
              event.preventDefault();
              saveSegmentDialog();
            }}
          >
            <header>
              <div>
                <h2 id={`${editorId}-segment-dialog-title`}>
                  {segmentDialog.mode === 'create'
                    ? '新增主文本段'
                    : `编辑${metroMainSegmentKindLabel(segmentDialog.draft.kind)}`}
                </h2>
                <span>字高 {formatMetroMetric(fontSize)}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭文本段编辑"
                title="关闭"
                onClick={dismissSegmentDialog}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>
            <SegmentedControl
              label="文本段类型"
              value={segmentDialog.draft.kind}
              options={[
                { value: 'text', label: '文本段', icon: 'text_fields' },
                { value: 'line', label: '线路号', icon: 'subway' },
                { value: 'boxed', label: '方框文本', icon: 'crop_square' },
              ]}
              disabled={disabled}
              wide
              onChange={changeDraftKind}
            />
            {segmentDialog.draft.kind === 'line' ? (
              <div className="metro-wayfinding-field-grid">
                <label className="material-field">
                  <span>线路号</span>
                  <input
                    autoFocus
                    value={segmentDialog.draft.value}
                    disabled={disabled}
                    maxLength={20}
                    onChange={(event) => {
                      const draft = segmentDialog.draft;
                      if (draft.kind !== 'line') return;
                      const value = event.currentTarget.value;
                      const matchedColor = findUniqueMetroLineColor(value, lineColorOptions);
                      updateDraft({
                        kind: 'line',
                        value,
                        color: matchedColor ?? draft.color,
                      });
                    }}
                  />
                </label>
                <ColorControl
                  label="线路色"
                  value={segmentDialog.draft.color}
                  palette={lineColorOptions}
                  disabled={disabled}
                  onChange={(color) =>
                    updateDraft({
                      kind: 'line',
                      value: segmentDialog.draft.value,
                      color,
                    })
                  }
                />
              </div>
            ) : (
              <label className="material-field">
                <span>{segmentDialog.draft.kind === 'boxed' ? '方框文本' : '文本内容'}</span>
                <MetroWayfindingTextAutocompleteInput
                  autoFocus
                  value={segmentDialog.draft.value}
                  disabled={disabled}
                  suggestions={textSuggestions}
                  onChange={(value) =>
                    updateDraft({
                      ...segmentDialog.draft,
                      value,
                    })
                  }
                />
              </label>
            )}
            <footer>
              {segmentDialog.mode === 'edit' ? (
                <button
                  type="button"
                  className="metro-wayfinding-segment-dialog-delete"
                  onClick={deleteSegmentFromDialog}
                  disabled={disabled || segments.length === 1}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                  删除
                </button>
              ) : null}
              <button type="button" onClick={dismissSegmentDialog}>
                取消
              </button>
              <button type="submit" className="is-primary" disabled={disabled}>
                保存
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function MetroWayfindingTextAutocompleteInput({
  value,
  disabled,
  suggestions,
  autoFocus = false,
  onChange,
}: Readonly<{
  value: string;
  disabled: boolean;
  suggestions?: string[];
  autoFocus?: boolean;
  onChange: (value: string) => void;
}>) {
  const suggestionsId = useId();
  const continuation = findTextContinuation(value, suggestions);
  return (
    <>
      {suggestions?.length ? (
        <datalist id={suggestionsId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
      <div className="metro-wayfinding-text-autocomplete">
        {continuation ? (
          <span className="metro-wayfinding-text-autocomplete-ghost" aria-hidden="true">
            <span>{value}</span>
            <strong>{continuation.slice(value.length)}</strong>
          </span>
        ) : null}
        <input
          autoFocus={autoFocus}
          value={value}
          disabled={disabled}
          maxLength={160}
          list={suggestions?.length ? suggestionsId : undefined}
          onKeyDown={(event) => {
            if (event.key !== 'Tab' || !continuation) return;
            event.preventDefault();
            onChange(continuation);
          }}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    </>
  );
}

function LargeTextElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: MetroWayfindingLargeTextElement;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  return (
    <div className="metro-wayfinding-field-grid">
      <label className="material-field">
        <span>大文字（字高 85）</span>
        <input
          value={element.value}
          disabled={disabled}
          maxLength={160}
          onChange={(event) => patch({ value: event.currentTarget.value })}
        />
      </label>
      <label className="material-field">
        <span>下标</span>
        <input
          value={element.suffix}
          disabled={disabled}
          maxLength={24}
          onChange={(event) => patch({ suffix: event.currentTarget.value })}
        />
      </label>
      <FrameShapeControl
        value={element.frameShape}
        disabled={disabled}
        onChange={(frameShape) => patch({ frameShape })}
      />
      {element.frameShape !== 'none' ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function CombinationElementFields({
  element,
  disabled,
  lineColorOptions,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  textSuggestions,
  patch,
}: Readonly<{
  element: MetroWayfindingCombinationElement;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  textSuggestions?: string[];
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState(element.children[0]?.id ?? '');
  const selectedChild =
    element.children.find((child) => child.id === selectedChildId) ?? element.children[0];

  useEffect(() => {
    if (!element.children.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(element.children[0]?.id ?? '');
    }
  }, [element.children, selectedChildId]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const updateChildren = (children: MetroWayfindingCombinationChild[]) => patch({ children });
  const updateChild = (childId: string, nextPatch: Partial<MetroWayfindingElement>) =>
    updateChildren(
      element.children.map((child) =>
        child.id === childId
          ? ({ ...child, ...nextPatch } as MetroWayfindingCombinationChild)
          : child,
      ),
    );
  const addChild = (type: 'facility' | 'text' | 'largeText' | 'space') => {
    const child = createMetroWayfindingElement(type) as MetroWayfindingCombinationChild;
    updateChildren([...element.children, child]);
    setSelectedChildId(child.id);
  };
  const changeChildType = (
    child: MetroWayfindingCombinationChild,
    type: 'facility' | 'text' | 'largeText' | 'space',
  ) => {
    const replacement = createMetroWayfindingElement(type) as MetroWayfindingCombinationChild;
    updateChild(child.id, {
      ...replacement,
      id: child.id,
      backgroundColor: child.backgroundColor,
      foregroundColor: child.foregroundColor,
    });
  };
  const moveChild = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= element.children.length) return;
    const children = [...element.children];
    [children[index], children[target]] = [children[target]!, children[index]!];
    updateChildren(children);
  };
  const removeChild = (childId: string) => {
    const children = element.children.filter((child) => child.id !== childId);
    updateChildren(children);
    if (childId === selectedChildId) setSelectedChildId(children[0]?.id ?? '');
  };

  const childBackground =
    element.frameFillMode === 'inverse'
      ? (element.foregroundColor ?? inheritedForegroundColor)
      : element.frameFillMode === 'color'
        ? (element.frameFillColor ?? element.foregroundColor ?? inheritedForegroundColor)
        : (element.backgroundColor ?? inheritedBackgroundColor);
  const childForeground =
    element.frameFillMode === 'inverse'
      ? (element.backgroundColor ?? inheritedBackgroundColor)
      : (element.foregroundColor ?? inheritedForegroundColor);

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <label className="material-field">
          <span>组合框缩放倍数</span>
          <input
            type="number"
            min={METRO_WAYFINDING_COMBINATION_MIN_SCALE}
            max={METRO_WAYFINDING_COMBINATION_MAX_SCALE}
            step="0.05"
            value={element.scale}
            disabled={disabled}
            onChange={(event) =>
              patch({
                scale: Math.max(
                  METRO_WAYFINDING_COMBINATION_MIN_SCALE,
                  Math.min(
                    METRO_WAYFINDING_COMBINATION_MAX_SCALE,
                    Math.round(
                      (Number(event.currentTarget.value) ||
                        METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE) * 100,
                    ) / 100,
                  ),
                ),
              })
            }
          />
        </label>
        <CombinationFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          stripePosition={element.stripePosition}
          fallbackColor={element.foregroundColor ?? inheritedForegroundColor}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
        <button
          type="button"
          className="secondary-action-button metro-wayfinding-combination-edit-button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            tune
          </span>
          <span>编辑组合内容（{element.children.length}）</span>
        </button>
      </div>
      {isOpen ? (
        <div
          className="modal-backdrop metro-wayfinding-combination-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsOpen(false);
          }}
        >
          <section
            className="modal-panel metro-wayfinding-combination-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${element.id}-combination-heading`}
          >
            <header>
              <div>
                <span>组合框子元素</span>
                <h2 id={`${element.id}-combination-heading`}>编辑组合内容</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭组合框编辑"
                title="关闭"
                onClick={() => setIsOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>
            <p className="muted">
              支持设施图标、文字、大文字和固定或弹性空格，子元素不会超出组合框。
            </p>
            {element.children.length ? (
              <ol
                className="metro-wayfinding-combination-child-list"
                role="tablist"
                aria-label="组合框子元素列表"
              >
                {element.children.map((child, index) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={child.id === selectedChild?.id}
                      className={child.id === selectedChild?.id ? 'is-active' : undefined}
                      onClick={() => setSelectedChildId(child.id)}
                    >
                      <MetroWayfindingElementTabContent element={child} layoutMode="single" />
                      <span className="metro-wayfinding-combination-child-index">{index + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted metro-wayfinding-combination-empty">组合框还没有子元素。</p>
            )}
            <div className="metro-wayfinding-combination-add-actions" aria-label="添加组合框子元素">
              {[
                ['facility', '设施图标', 'accessible'],
                ['text', '文字', 'text_fields'],
                ['largeText', '大文字', 'title'],
                ['space', '空格', 'space_bar'],
              ].map(([type, label, icon]) => (
                <button
                  key={type}
                  type="button"
                  className="secondary-action-button"
                  disabled={disabled || element.children.length >= 32}
                  onClick={() => addChild(type as 'facility' | 'text' | 'largeText' | 'space')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {icon}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {selectedChild ? (
              <div className="metro-wayfinding-combination-child-editor">
                <header>
                  <strong>{metroElementLabel(selectedChild)}</strong>
                  <div className="metro-wayfinding-element-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="子元素上移"
                      title="上移"
                      disabled={disabled || element.children.indexOf(selectedChild) === 0}
                      onClick={() => moveChild(element.children.indexOf(selectedChild), 'up')}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        arrow_upward
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="子元素下移"
                      title="下移"
                      disabled={
                        disabled ||
                        element.children.indexOf(selectedChild) === element.children.length - 1
                      }
                      onClick={() => moveChild(element.children.indexOf(selectedChild), 'down')}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        arrow_downward
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="复制子元素"
                      title="复制"
                      disabled={disabled || element.children.length >= 32}
                      onClick={() => {
                        const copy = duplicateMetroWayfindingElement(
                          selectedChild,
                        ) as MetroWayfindingCombinationChild;
                        const index = element.children.indexOf(selectedChild);
                        const children = [...element.children];
                        children.splice(index + 1, 0, copy);
                        updateChildren(children);
                        setSelectedChildId(copy.id);
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        content_copy
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="删除子元素"
                      title="删除"
                      disabled={disabled}
                      onClick={() => removeChild(selectedChild.id)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </header>
                <SegmentedControl
                  label="子元素类型"
                  value={selectedChild.type}
                  options={[
                    { value: 'facility', label: '设施', icon: 'accessible' },
                    { value: 'text', label: '文字', icon: 'text_fields' },
                    { value: 'largeText', label: '大文字', icon: 'title' },
                    { value: 'space', label: '空格', icon: 'space_bar' },
                  ]}
                  disabled={disabled}
                  wide
                  onChange={(type) => changeChildType(selectedChild, type)}
                />
                <ElementColorFields
                  element={selectedChild}
                  disabled={disabled}
                  backgroundColorOptions={backgroundColorOptions}
                  inheritedBackgroundColor={childBackground}
                  inheritedForegroundColor={childForeground}
                  patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                />
                {selectedChild.type === 'facility' ? (
                  <FacilityElementFields
                    element={selectedChild}
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'text' ? (
                  <TextElementFields
                    element={selectedChild}
                    layoutMode="single"
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    textSuggestions={textSuggestions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'largeText' ? (
                  <LargeTextElementFields
                    element={selectedChild}
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'space' ? (
                  <SpaceElementFields
                    element={selectedChild}
                    disabled={disabled}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
              </div>
            ) : null}
            <footer>
              <button type="button" className="is-primary" onClick={() => setIsOpen(false)}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  check
                </span>
                完成
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function CombinationFillControl({
  mode,
  color,
  stroke,
  stripePosition,
  fallbackColor,
  lineColorOptions,
  disabled,
  patch,
}: Readonly<{
  mode: MetroWayfindingCombinationFillMode;
  color?: string;
  stroke: boolean;
  stripePosition: MetroWayfindingCombinationStripePosition;
  fallbackColor: string;
  lineColorOptions: Array<{ value: string; label: string }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const fillColor = color ?? lineColorOptions[0]?.value ?? fallbackColor;
  const fillColorOptions = mergeMetroColorOptions(
    lineColorOptions,
    metroWayfindingForegroundPalette,
  );
  return (
    <>
      <SegmentedControl
        label="组合框填充"
        value={mode}
        options={[
          { value: 'none', label: '无填充', icon: 'border_outer' },
          { value: 'inverse', label: '反色填充', icon: 'invert_colors' },
          { value: 'color', label: '颜色填充', icon: 'palette' },
          { value: 'stripe', label: '无填充+色带', icon: 'view_sidebar' },
        ]}
        disabled={disabled}
        wide
        onChange={(frameFillMode) =>
          patch({
            frameFillMode,
            ...((frameFillMode === 'color' || frameFillMode === 'stripe') && !color
              ? { frameFillColor: fillColor }
              : {}),
          })
        }
      />
      {mode === 'color' || mode === 'stripe' ? (
        <ColorControl
          label={mode === 'stripe' ? '色带颜色' : '组合框填充色'}
          value={fillColor}
          palette={fillColorOptions}
          disabled={disabled}
          onChange={(frameFillColor) => patch({ frameFillColor })}
        />
      ) : null}
      {mode === 'stripe' ? (
        <SegmentedControl
          label="色带位置"
          value={stripePosition}
          options={[
            { value: 'left', label: '左', icon: 'align_horizontal_left' },
            { value: 'right', label: '右', icon: 'align_horizontal_right' },
            { value: 'bottom', label: '下', icon: 'vertical_align_bottom' },
          ]}
          disabled={disabled}
          wide
          onChange={(nextPosition) => patch({ stripePosition: nextPosition })}
        />
      ) : null}
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={stroke}
          disabled={disabled}
          onChange={(event) => patch({ frameStroke: event.currentTarget.checked })}
        />
        <span>添加前景色描边</span>
      </label>
    </>
  );
}

function SpaceElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'space' }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  return (
    <div className="metro-wayfinding-field-grid">
      <SegmentedControl
        label="空白方式"
        value={element.mode}
        options={[
          { value: 'fixed', label: '固定宽度', icon: 'space_bar' },
          { value: 'flex', label: '平分剩余宽度', icon: 'arrow_range' },
        ]}
        disabled={disabled}
        onChange={(mode) => patch({ mode })}
      />
      {element.mode === 'fixed' ? (
        <label className="material-field">
          <span>宽度（16 像素间距单位）</span>
          <input
            type="number"
            min="1"
            max="32"
            step="1"
            value={element.units}
            disabled={disabled}
            onChange={(event) =>
              patch({
                units: Math.max(
                  1,
                  Math.min(32, Math.round(Number(event.currentTarget.value) || 1)),
                ),
              })
            }
          />
        </label>
      ) : (
        <p className="muted">所有“平分剩余宽度”空白元素会均分可用空间。</p>
      )}
    </div>
  );
}

function metroIconPreviewStyle(iconId: string): { transform: string } | undefined {
  if (iconId === 'no-entry') {
    return { transform: 'rotate(-45deg)' };
  }
  return undefined;
}

function metroIconElementPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): { transform: string } | undefined {
  const arrowStyle = metroIconPreviewStyle(iconId);
  if (arrowStyle) {
    return arrowStyle;
  }
  return direction && ['stairs', 'stairs-down', 'escalator', 'exit'].includes(iconId)
    ? metroFacilityDirectionPreviewStyle(iconId, direction)
    : undefined;
}

function metroFacilityAssetPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): { transform: string } | undefined {
  if (iconId === 'stairs' || iconId === 'stairs-down' || iconId === 'escalator') {
    return direction === 'left' ? { transform: 'scaleX(-1)' } : undefined;
  }
  if (iconId !== 'exit') {
    return undefined;
  }
  if (direction === 'left') return { transform: 'rotate(-90deg)' };
  if (direction === 'up') return undefined;
  if (direction === 'down') return { transform: 'rotate(180deg)' };
  return { transform: 'rotate(90deg)' };
}

function metroFacilityDirectionPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down',
): { transform: string } | undefined {
  if (direction === 'left') {
    return { transform: 'scaleX(-1)' };
  }
  if (iconId === 'exit' && direction === 'up') {
    return { transform: 'rotate(-90deg)' };
  }
  if (iconId === 'exit' && direction === 'down') {
    return { transform: 'rotate(90deg)' };
  }
  return undefined;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  disabled,
  showLabels = true,
  wide = false,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    icon?: string;
    assetName?: string;
    iconStyle?: { transform: string };
  }>;
  disabled: boolean;
  showLabels?: boolean;
  wide?: boolean;
  onChange: (value: T) => void;
}>) {
  return (
    <fieldset
      className={`metro-wayfinding-segmented-control${wide ? ' is-wide' : ''}`}
      disabled={disabled}
    >
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'is-active' : undefined}
            aria-pressed={option.value === value}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {option.assetName ? (
              <MetroFacilityAssetIcon assetName={option.assetName} style={option.iconStyle} />
            ) : option.icon ? (
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={option.iconStyle}
              >
                {option.icon}
              </span>
            ) : null}
            {showLabels ? <span>{option.label}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function IconChoiceGrid({
  label,
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: ReadonlyArray<
    Pick<MetroWayfindingIconOption, 'id' | 'label' | 'symbol' | 'assetName'> & {
      arrowAssetName?: string;
      iconStyle?: { transform: string };
    }
  >;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <fieldset className="metro-wayfinding-icon-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'is-active' : undefined}
            aria-pressed={option.id === value}
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            {option.arrowAssetName ? (
              <MetroArrowAssetIcon assetName={option.arrowAssetName} />
            ) : option.assetName ? (
              <MetroFacilityAssetIcon assetName={option.assetName} style={option.iconStyle} />
            ) : (
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={option.iconStyle}
              >
                {option.symbol}
              </span>
            )}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MetroFacilityAssetIcon({
  assetName,
  style,
}: Readonly<{ assetName: string; style?: { transform: string } }>) {
  const assetUrl = appPath(`/metro-facilities/plain/${assetName}.svg`);
  return (
    <span
      className="metro-wayfinding-facility-asset"
      aria-hidden="true"
      style={
        {
          '--metro-wayfinding-facility-asset': `url("${assetUrl}")`,
          ...style,
        } as CSSProperties
      }
    />
  );
}

function MetroArrowAssetIcon({ assetName }: Readonly<{ assetName: string }>) {
  const assetUrl = appPath(`/metro-arrows/${assetName}.svg`);
  return (
    <span
      className="metro-wayfinding-facility-asset metro-wayfinding-arrow-asset"
      aria-hidden="true"
      style={
        {
          '--metro-wayfinding-facility-asset': `url("${assetUrl}")`,
        } as CSSProperties
      }
    />
  );
}

interface MetroInsertionSuggestionTemplate {
  id: string;
  previewMain: string;
  previewSecondary: string;
  kind?: 'text' | 'flex-space' | 'right-text' | 'facility';
  facilityIconId?: string;
  facilityFrameShape?: MetroWayfindingFrameShape;
  textAlign?: MetroWayfindingTextAlign;
  icon?: string;
  createRows?: (lineColors: string[]) => MetroWayfindingTextRow[];
}

function createSimpleMetroTextSuggestion(
  id: string,
  main: string,
  secondary: string,
): MetroInsertionSuggestionTemplate {
  return {
    id,
    previewMain: main,
    previewSecondary: secondary,
    createRows: () => createSuggestedTextRows([{ kind: 'text', value: main }], secondary),
  };
}

const exitTextSuggestion = createSimpleMetroTextSuggestion('exit', '出口', 'EXIT');
const terminalTextSuggestion = createSimpleMetroTextSuggestion('terminal', '终点', 'Terminal');

const exitBoxedTextSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'exit-boxed-text-rows',
  previewMain: '方框主文本 / 方框主文本',
  previewSecondary: '追加两行空白方框文字',
  icon: 'crop_square',
  createRows: () => [
    createSuggestedMainTextRow([{ kind: 'boxed', value: '' }]),
    createSuggestedMainTextRow([{ kind: 'boxed', value: '' }]),
  ],
};

const metroTextSuggestionsByIconId: Record<string, MetroInsertionSuggestionTemplate[]> = {
  stairs: [createSimpleMetroTextSuggestion('stairs', '楼梯', 'Stairs')],
  escalator: [createSimpleMetroTextSuggestion('escalator', '自动扶梯', 'Escalator')],
  elevator: [
    createSimpleMetroTextSuggestion('accessible-elevator', '无障碍电梯', 'Accessible Elevator'),
  ],
  restroom: [createSimpleMetroTextSuggestion('restroom', '卫生间', 'Restrooms')],
  'mens-restroom': [createSimpleMetroTextSuggestion('mens-restroom', '男卫生间', 'Men')],
  'womens-restroom': [createSimpleMetroTextSuggestion('womens-restroom', '女卫生间', 'Women')],
  'nursing-room': [createSimpleMetroTextSuggestion('nursing-room', '母婴室', 'Baby Care')],
  'family-restroom': [
    createSimpleMetroTextSuggestion('family-restroom', '第三卫生间', 'Family Toilet'),
  ],
  wheelchair: [
    createSimpleMetroTextSuggestion('accessible-facilities', '无障碍设施', 'Accessible Facilities'),
  ],
  'wheelchair-lift': [
    createSimpleMetroTextSuggestion(
      'wheelchair-platform-lift',
      '轮椅升降平台',
      'Wheelchair Platform Lift',
    ),
  ],
  waiting: [
    createSimpleMetroTextSuggestion('waiting-room', '空调候车室', 'Air-conditioned Waiting Room'),
  ],
  exit: [exitTextSuggestion, exitBoxedTextSuggestion],
  subway: [
    createSimpleMetroTextSuggestion('subway-ride', '乘车', 'To Subway'),
    createSimpleMetroTextSuggestion('subway-towards', '开往', 'To '),
    {
      id: 'subway-transfer-line',
      previewMain: '换乘[线路]号线',
      previewSecondary: 'Transfer to Line',
      createRows: (lineColors) =>
        createSuggestedTextRows(
          [
            { kind: 'text', value: '换乘' },
            createSuggestedLineSegment(lineColors, 0),
            { kind: 'text', value: '号线' },
          ],
          'Transfer to Line ',
        ),
    },
    {
      id: 'subway-two-lines',
      previewMain: '[线路][线路]号线',
      previewSecondary: 'Line',
      createRows: (lineColors) =>
        createSuggestedTextRows(
          [
            createSuggestedLineSegment(lineColors, 0),
            createSuggestedLineSegment(lineColors, 1),
            { kind: 'text', value: '号线' },
          ],
          'Line ',
        ),
    },
  ],
  service: [
    createSimpleMetroTextSuggestion(
      'passenger-service-center',
      '乘客服务中心',
      'Customer Service Center',
    ),
  ],
  ticket: [
    createSimpleMetroTextSuggestion('automatic-ticketing', '自动售票', 'Automatic Ticketing'),
  ],
  'meeting-point': [createSimpleMetroTextSuggestion('meeting-point', '会合点', 'Meeting Point')],
  'no-entry': [createSimpleMetroTextSuggestion('no-entry', '禁止进入', 'No Entry')],
};

const exitLargeTextSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'exit-large-text-details',
  previewMain: '文字 + 副文本 × 2',
  previewSecondary: '追加四行空白，适合出口大文字组合',
  createRows: () => [
    createSuggestedMainTextRow([{ kind: 'text', value: '' }]),
    createSuggestedSecondaryTextRow(''),
    createSuggestedMainTextRow([{ kind: 'text', value: '' }]),
    createSuggestedSecondaryTextRow(''),
  ],
};

const leftTextFlexSpaceSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'left-text-flex-space',
  kind: 'flex-space',
  previewMain: '左对齐文字 + 弹性空白',
  previewSecondary: '追加到当前文字右侧，平分剩余空间',
};

const flexSpaceRightTextSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'flex-space-right-text',
  kind: 'right-text',
  previewMain: '弹性空白 + 右对齐文字',
  previewSecondary: '追加右对齐主文本与副文本',
};

const arrowLeadingTextSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'db21-arrow-leading-text',
  kind: 'text',
  textAlign: 'left',
  previewMain: '箭头右侧双语文字',
  previewSecondary: '按 DB21/T 2573-2023 左对齐',
  icon: 'format_align_left',
  createRows: () => [
    createSuggestedMainTextRow([{ kind: 'text', value: '' }]),
    createSuggestedSecondaryTextRow(''),
  ],
};

function MetroWayfindingInsertionSuggestions({
  element,
  elements,
  layoutMode,
  disabled,
  lineColorOptions,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  elements: MetroWayfindingElement[];
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  onAction: (action: MetroWayfindingElementAction) => void;
}>) {
  const lineColors = lineColorOptions.map((option) => option.value);
  const suggestions = resolveMetroInsertionSuggestionTemplates(element, elements, lineColors);
  if (!suggestions.length) return null;
  const addSuggestion = (suggestion: MetroInsertionSuggestionTemplate) => {
    const usesNoEntryDefaultForeground =
      element.type === 'facility' &&
      element.iconId === 'no-entry' &&
      (element.foregroundColor ?? METRO_WAYFINDING_WARNING_FOREGROUND).toUpperCase() ===
        METRO_WAYFINDING_WARNING_FOREGROUND;
    if (suggestion.kind === 'flex-space') {
      const spaceElement = createMetroWayfindingElement('space') as Extract<
        MetroWayfindingElement,
        { type: 'space' }
      >;
      onAction({
        type: 'add',
        element: {
          ...spaceElement,
          mode: 'flex',
          backgroundColor: element.backgroundColor,
          foregroundColor: element.foregroundColor,
        },
      });
      return;
    }
    if (suggestion.kind === 'facility' && suggestion.facilityIconId) {
      const facilityElement = createMetroWayfindingElement(
        'facility',
        suggestion.facilityIconId,
      ) as Extract<MetroWayfindingElement, { type: 'facility' }>;
      onAction({
        type: 'add',
        element: {
          ...facilityElement,
          frameShape: suggestion.facilityFrameShape ?? facilityElement.frameShape,
          backgroundColor: element.backgroundColor,
          foregroundColor: facilityElement.foregroundColor ?? element.foregroundColor,
        },
      });
      return;
    }
    const textElement = createMetroWayfindingElement('text') as MetroWayfindingTextElement;
    onAction({
      type: 'add',
      element: {
        ...textElement,
        align:
          suggestion.textAlign ??
          (suggestion.kind === 'right-text' ? 'right' : textElement.align),
        rows: suggestion.createRows?.(lineColors) ?? textElement.rows,
        backgroundColor: element.backgroundColor,
        foregroundColor: usesNoEntryDefaultForeground ? undefined : element.foregroundColor,
      },
    });
  };

  return (
    <fieldset className="metro-wayfinding-text-suggestions" disabled={disabled}>
      <legend>插入建议</legend>
      <div>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            aria-label={`添加${suggestionKindLabel(suggestion)}：${suggestion.previewMain}`}
            onClick={() => addSuggestion(suggestion)}
          >
            <MetroWayfindingSuggestionIcon suggestion={suggestion} />
            <span>
              <strong>{suggestion.previewMain}</strong>
              <small>
                {suggestionKindLabel(suggestion)} · {suggestion.previewSecondary}
                {suggestion.kind === 'text' || !suggestion.kind
                  ? ` · ${layoutMode === 'vertical' ? '默认横排，可改为竖排' : '双语文字元素'}`
                  : ''}
              </small>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function suggestionKindLabel(suggestion: MetroInsertionSuggestionTemplate): string {
  if (suggestion.kind === 'facility') return '图标';
  if (suggestion.kind === 'flex-space') return '弹性空白';
  if (suggestion.kind === 'right-text') return '文字组合';
  return '文字';
}

function resolveMetroInsertionSuggestionTemplates(
  element: MetroWayfindingElement,
  elements: MetroWayfindingElement[],
  lineColors: string[],
): MetroInsertionSuggestionTemplate[] {
  const suggestions =
    element.type === 'facility'
      ? element.iconId === 'subway' && element.frameShape === 'circle'
        ? [terminalTextSuggestion]
        : [...(metroTextSuggestionsByIconId[element.iconId] ?? [])]
      : [];
  if (element.type === 'arrow') {
    suggestions.push(arrowLeadingTextSuggestion);
  }
  if (
    (element.type === 'largeText' || (element.type === 'facility' && element.iconId === 'exit')) &&
    hasAdjacentExitAndLargeText(element, elements)
  ) {
    if (element.type === 'largeText') suggestions.push(exitTextSuggestion);
    suggestions.push(exitLargeTextSuggestion);
  }
  if (element.type === 'text' && element.align === 'left') {
    suggestions.push(leftTextFlexSpaceSuggestion);
  }
  if (element.type === 'space' && element.mode === 'flex') {
    suggestions.push(flexSpaceRightTextSuggestion);
  }
  if (element.type === 'text' && element.align === 'right') {
    const mainText = resolveMetroSuggestionMainText(element.rows);
    const subwayFrameShape = mainText.startsWith('终点')
      ? 'circle'
      : mainText.startsWith('开往') || mainText.startsWith('换乘')
        ? 'rectangle'
        : null;
    if (subwayFrameShape) {
      suggestions.push(createMatchingFacilitySuggestion('subway', subwayFrameShape));
    }
    for (const [iconId, iconSuggestions] of Object.entries(metroTextSuggestionsByIconId)) {
      const matches = iconSuggestions.some((suggestion) =>
        suggestion.createRows
          ? metroTextMainRowsMatch(element.rows, suggestion.createRows(lineColors))
          : false,
      );
      if (!matches) continue;
      if (suggestions.some((suggestion) => suggestion.facilityIconId === iconId)) continue;
      suggestions.push(createMatchingFacilitySuggestion(iconId, 'rectangle'));
    }
  }
  return suggestions;
}

function createMatchingFacilitySuggestion(
  iconId: string,
  frameShape: MetroWayfindingFrameShape,
): MetroInsertionSuggestionTemplate {
  const option = metroWayfindingFacilityOptions.find((item) => item.id === iconId);
  return {
    id: `matching-facility-${iconId}-${frameShape}`,
    kind: 'facility',
    facilityIconId: iconId,
    facilityFrameShape: frameShape,
    previewMain: option?.label ?? '设施图标',
    previewSecondary: frameShape === 'circle' ? '追加圆形外框设施图标' : '追加对应设施图标',
  };
}

function MetroWayfindingSuggestionIcon({
  suggestion,
}: Readonly<{ suggestion: MetroInsertionSuggestionTemplate }>) {
  if (suggestion.kind !== 'facility' || !suggestion.facilityIconId) {
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
        {suggestion.icon ?? 'add'}
      </span>
    );
  }
  const option = metroWayfindingFacilityOptions.find(
    (item) => item.id === suggestion.facilityIconId,
  );
  if (!option) return null;
  const assetName = resolveMetroFacilityIconAssetName(option.id);
  return assetName ? (
    <MetroFacilityAssetIcon
      assetName={assetName}
      style={metroFacilityAssetPreviewStyle(option.id, undefined)}
    />
  ) : (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={metroIconPreviewStyle(option.id)}
    >
      {option.symbol}
    </span>
  );
}

function metroTextMainRowsMatch(
  currentRows: MetroWayfindingTextRow[],
  suggestedRows: MetroWayfindingTextRow[],
): boolean {
  return (
    metroTextMainRowsMatchSignature(currentRows) === metroTextMainRowsMatchSignature(suggestedRows)
  );
}

function metroTextMainRowsMatchSignature(rows: MetroWayfindingTextRow[]): string {
  return JSON.stringify(
    rows
      .filter(
        (row): row is Extract<MetroWayfindingTextRow, { kind: 'main' }> => row.kind === 'main',
      )
      .map((row) => ({
        segments: row.segments.map((segment) =>
          segment.kind === 'line'
            ? { kind: segment.kind }
            : { kind: segment.kind, value: normalizeMetroSuggestionText(segment.value) },
        ),
      })),
  );
}

function resolveMetroSuggestionMainText(rows: MetroWayfindingTextRow[]): string {
  return normalizeMetroSuggestionText(
    rows
      .filter(
        (row): row is Extract<MetroWayfindingTextRow, { kind: 'main' }> => row.kind === 'main',
      )
      .flatMap((row) => row.segments)
      .map((segment) => segment.value)
      .join(''),
  );
}

function normalizeMetroSuggestionText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function hasAdjacentExitAndLargeText(
  element: MetroWayfindingElement,
  elements: MetroWayfindingElement[],
): boolean {
  const index = elements.findIndex((item) => item.id === element.id);
  if (index < 0) return false;
  return [elements[index - 1], elements[index + 1]].some((neighbor) =>
    element.type === 'largeText'
      ? neighbor?.type === 'facility' && neighbor.iconId === 'exit'
      : neighbor?.type === 'largeText',
  );
}

function createSuggestedTextRows(
  mainSegments: MetroWayfindingMainSegment[],
  secondary: string,
): MetroWayfindingTextRow[] {
  return [createSuggestedMainTextRow(mainSegments), createSuggestedSecondaryTextRow(secondary)];
}

function createSuggestedMainTextRow(
  segments: MetroWayfindingMainSegment[],
): MetroWayfindingTextRow {
  const row = createMetroWayfindingTextRow('main');
  return { id: row.id, kind: 'main', segments };
}

function createSuggestedSecondaryTextRow(value: string): MetroWayfindingTextRow {
  const row = createMetroWayfindingTextRow('secondary');
  return { id: row.id, kind: 'secondary', value, bold: true };
}

function createSuggestedLineSegment(
  lineColors: string[],
  index: number,
): MetroWayfindingLineSegment {
  return {
    kind: 'line',
    value: '',
    color: lineColors[index] ?? lineColors[0] ?? '#2F80ED',
  };
}

function ElementColorFields({
  element,
  disabled,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  patch,
}: Readonly<{
  element: MetroWayfindingElement;
  disabled: boolean;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  return (
    <div className="metro-wayfinding-color-row">
      <ColorControl
        label="元素背景色"
        value={element.backgroundColor ?? inheritedBackgroundColor}
        palette={backgroundColorOptions}
        disabled={disabled}
        inherit={{
          active: element.backgroundColor === undefined,
          label: '跟随导视牌',
          onSelect: () => patch({ backgroundColor: undefined }),
        }}
        onChange={(backgroundColor) => patch({ backgroundColor })}
      />
      <ColorControl
        label="元素文字、线条与图标颜色"
        value={element.foregroundColor ?? inheritedForegroundColor}
        palette={metroWayfindingForegroundPalette}
        disabled={disabled}
        inherit={{
          active: element.foregroundColor === undefined,
          label: '跟随导视牌',
          onSelect: () => patch({ foregroundColor: undefined }),
        }}
        onChange={(foregroundColor) => patch({ foregroundColor })}
      />
    </div>
  );
}

function ColorControl({
  label,
  value,
  palette,
  disabled,
  inherit,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  palette: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  inherit?: { active: boolean; label: string; onSelect: () => void };
  onChange: (value: string) => void;
}>) {
  const usesPreset = palette.some((item) => item.value.toUpperCase() === value.toUpperCase());
  const selectedValue = inherit?.active ? 'inherit' : usesPreset ? value.toUpperCase() : 'custom';
  return (
    <label className="material-field metro-wayfinding-color-control">
      <span>{label}</span>
      <div>
        <select
          value={selectedValue}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue === 'inherit') inherit?.onSelect();
            else if (nextValue !== 'custom') onChange(nextValue);
          }}
        >
          {inherit ? <option value="inherit">{inherit.label}</option> : null}
          {palette.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label} · {item.value}
            </option>
          ))}
          <option value="custom">自定义颜色</option>
        </select>
        <input
          type="color"
          aria-label={`${label}自定义颜色`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
        />
      </div>
    </label>
  );
}

function reduceMetroWayfindingAction(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  action: MetroWayfindingCompositionAction,
) {
  if (action.type === 'replace') return action.layout;
  const elements = layout.rows[action.rowIndex];
  if (!elements) return layout;
  if (action.type === 'add') {
    const previousElement = elements.at(-1);
    const element =
      action.element.type === 'facility' &&
      previousElement?.type === 'text' &&
      previousElement.align === 'right'
        ? { ...action.element, direction: 'right' as const }
        : action.element;
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, [...elements, element]);
  }
  if (action.type === 'duplicate') {
    const sourceIndex = elements.findIndex((element) => element.id === action.elementId);
    if (sourceIndex < 0) return layout;
    const duplicatedElements = [...elements];
    duplicatedElements.splice(sourceIndex + 1, 0, action.element);
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, duplicatedElements);
  }
  if (action.type === 'remove')
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.filter((element) => element.id !== action.elementId),
    );
  if (action.type === 'update')
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.map((element) =>
        element.id === action.elementId
          ? ({ ...element, ...action.patch } as MetroWayfindingElement)
          : element,
      ),
    );
  if (action.type === 'changeType') {
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.map((element, index) => {
        if (element.id !== action.elementId || element.type === action.elementType) return element;
        const replacement = createMetroWayfindingElement(action.elementType);
        const direction =
          replacement.type === 'facility' &&
          [elements[index - 1], elements[index + 1]].some(
            (neighbor) => neighbor?.type === 'text' && neighbor.align === 'right',
          )
            ? 'right'
            : replacement.type === 'facility'
              ? replacement.direction
              : undefined;
        return {
          ...replacement,
          id: element.id,
          backgroundColor: element.backgroundColor,
          foregroundColor: element.foregroundColor ?? replacement.foregroundColor,
          ...(replacement.type === 'facility' ? { direction } : {}),
        } as MetroWayfindingElement;
      }),
    );
  }
  if (action.type === 'reorder') {
    const sourceIndex = elements.findIndex((element) => element.id === action.elementId);
    if (sourceIndex < 0 || action.elementId === action.targetElementId) return layout;
    const reorderedElements = [...elements];
    const [element] = reorderedElements.splice(sourceIndex, 1);
    const targetIndex = reorderedElements.findIndex((item) => item.id === action.targetElementId);
    if (!element || targetIndex < 0) return layout;
    const insertionIndex = action.placement === 'before' ? targetIndex : targetIndex + 1;
    reorderedElements.splice(insertionIndex, 0, element);
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, reorderedElements);
  }
  const index = elements.findIndex((element) => element.id === action.elementId);
  const target = action.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= elements.length) return layout;
  const movedElements = [...elements];
  [movedElements[index], movedElements[target]] = [movedElements[target]!, movedElements[index]!];
  return replaceMetroWayfindingRowElements(layout, action.rowIndex, movedElements);
}

function replaceMetroWayfindingRowElements(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  rowIndex: number,
  elements: MetroWayfindingElement[],
) {
  return {
    ...layout,
    rows: layout.rows.map((row, index) => (index === rowIndex ? elements : row)),
  };
}

function metroElementLabel(element: MetroWayfindingElement): string {
  if (element.type === 'facility') return '设施图标 · 85 × 85';
  if (element.type === 'arrow') return '箭头 · 85 × 85';
  if (element.type === 'text') return `文字 · ${element.rows.length} 行`;
  if (element.type === 'largeText') {
    return `大文字 · 字高 ${
      element.frameShape !== 'none'
        ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
        : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE
    }`;
  }
  if (element.type === 'combination') {
    return `组合框 · ${Math.round(element.scale * 100)}% · ${element.children.length} 个子元素`;
  }
  if (element.type === 'space') return '空白元素';
  return `分割线 · ${METRO_WAYFINDING_DIVIDER_WIDTH} × 72`;
}

function FrameShapeControl({
  value,
  disabled,
  onChange,
}: Readonly<{
  value: MetroWayfindingFrameShape;
  disabled: boolean;
  onChange: (value: MetroWayfindingFrameShape) => void;
}>) {
  return (
    <SegmentedControl
      label="外框形状"
      value={value}
      options={[
        { value: 'none', label: '无', icon: 'block' },
        { value: 'rectangle', label: '矩形', icon: 'crop_square' },
        { value: 'circle', label: '圆形', icon: 'circle' },
      ]}
      disabled={disabled}
      wide
      onChange={onChange}
    />
  );
}

function FrameFillControl({
  mode,
  color,
  stroke,
  fallbackColor,
  lineColorOptions,
  disabled,
  patch,
}: Readonly<{
  mode: MetroWayfindingFrameFillMode;
  color?: string;
  stroke: boolean;
  fallbackColor: string;
  lineColorOptions: Array<{ value: string; label: string }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const fillColor = color ?? lineColorOptions[0]?.value ?? fallbackColor;
  const fillColorOptions = mergeMetroColorOptions(
    lineColorOptions,
    metroWayfindingForegroundPalette,
  );
  return (
    <>
      <SegmentedControl
        label="外框填充"
        value={mode}
        options={[
          { value: 'none', label: '无填充', icon: 'border_outer' },
          { value: 'inverse', label: '反色填充', icon: 'invert_colors' },
          { value: 'color', label: '颜色填充', icon: 'palette' },
        ]}
        disabled={disabled}
        wide
        onChange={(frameFillMode) =>
          patch({
            frameFillMode,
            ...(frameFillMode === 'color' && !color ? { frameFillColor: fillColor } : {}),
          })
        }
      />
      {mode === 'color' ? (
        <ColorControl
          label="外框填充色"
          value={fillColor}
          palette={fillColorOptions}
          disabled={disabled}
          onChange={(frameFillColor) => patch({ frameFillColor })}
        />
      ) : null}
      {mode !== 'none' ? (
        <label className="material-checkbox-row">
          <input
            type="checkbox"
            checked={stroke}
            disabled={disabled}
            onChange={(event) => patch({ frameStroke: event.currentTarget.checked })}
          />
          <span>添加前景色描边</span>
        </label>
      ) : null}
    </>
  );
}

function mergeMetroColorOptions(
  ...groups: ReadonlyArray<ReadonlyArray<{ value: string; label: string }>>
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((option) => {
      const key = option.value.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
