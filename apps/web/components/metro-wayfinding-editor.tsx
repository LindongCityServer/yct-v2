'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
} from 'react';
import { appPath } from '../lib/app-paths';
import {
  dispatchMetroWayfindingCompositionAction,
  subscribeMetroWayfindingCompositionActions,
  type MetroWayfindingCompositionAction,
  type MetroWayfindingElementAction,
} from '../lib/client-metro-wayfinding-events';
import {
  createMetroWayfindingElement,
  createMetroWayfindingTextRow,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  metroWayfindingArrowOptions,
  metroWayfindingBackgroundPalette,
  metroWayfindingFacilityOptions,
  metroWayfindingForegroundPalette,
  parseMetroWayfindingLayout,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityIconAssetName,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  serializeMetroWayfindingLayout,
  type MetroWayfindingElement,
  type MetroWayfindingIconOption,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLayoutMode,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';

export function MetroWayfindingEditor({
  value,
  canvasWidth,
  canvasHeight,
  disabled,
  lineColorOptions,
  onCanvasHeightChange,
  onChange,
}: Readonly<{
  value: string;
  canvasWidth: number;
  canvasHeight: number;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  onCanvasHeightChange: (height: 1 | 2) => void;
  onChange: (value: string) => void;
}>) {
  const editorId = useId();
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

  useEffect(() => {
    const desiredHeight = layout.mode === 'double' ? 2 : 1;
    if (canvasHeight !== desiredHeight) onCanvasHeightChange(desiredHeight);
  }, [canvasHeight, layout.mode, onCanvasHeightChange]);

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

  const dispatchComposition = (action: MetroWayfindingCompositionAction) => {
    if (action.type === 'add') {
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
    if (mode === 'single' && selection.rowIndex !== 0) {
      setSelection({ rowIndex: 0, elementId: rows[0]?.[0]?.id ?? '' });
    }
    dispatchComposition({ type: 'replace', layout: { ...layout, mode, rows } });
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
          ]}
          disabled={disabled}
          wide
          onChange={changeLayoutMode}
        />
        <ColorControl
          label="导视牌底色"
          value={layout.backgroundColor}
          palette={metroWayfindingBackgroundPalette}
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
      </div>

      <div className="metro-wayfinding-row-lists">
        {visibleRows.map((elements, rowIndex) => (
          <div
            key={rowIndex}
            className={`metro-wayfinding-row-list${layout.mode === 'single' ? ' is-single' : ''}`}
          >
            {layout.mode === 'double' ? <strong>{rowIndex === 0 ? '第一行' : '第二行'}</strong> : null}
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
                const tabLabel = metroElementTabAriaLabel(element);
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
                        dropTarget?.rowIndex === rowIndex &&
                        dropTarget.elementId === element.id
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
                      <MetroWayfindingElementTabContent element={element} />
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

      {selectedElement ? (
        <MetroWayfindingInsertionSuggestions
          element={selectedElement}
          elements={activeElements}
          disabled={disabled}
          lineColorOptions={lineColorOptions}
          onAction={(action) => dispatchElement(selection.rowIndex, action)}
        />
      ) : null}

      {layoutSizing.isWidthInsufficient ? (
        <p className="metro-wayfinding-width-warning" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <span>
            当前尺寸宽度不足，文字元素宽度与大文字已统一横向压缩至
            {Math.round(layoutSizing.textScaleX * 100)}%，文字行按需适配。
            {layoutSizing.hasUnresolvedOverflow
              ? '非文字元素仍超出可用宽度，请增加导视牌宽度。'
              : ''}
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
            disabled={disabled}
            isFirst={selectedElementIndex === 0}
            isLast={selectedElementIndex === activeElements.length - 1}
            lineColorOptions={lineColorOptions}
            onAction={(action) => dispatchElement(selection.rowIndex, action)}
          />
        </div>
      ) : null}
    </section>
  );
}

function MetroWayfindingElementTabContent({
  element,
}: Readonly<{ element: MetroWayfindingElement }>) {
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
    }[element.align];
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

function metroElementTabAriaLabel(element: MetroWayfindingElement): string {
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
    return metroWayfindingArrowOptions.find((option) => option.id === element.iconId)?.label ?? '箭头';
  }
  if (element.type === 'text') {
    const alignmentLabel = { left: '左对齐', center: '居中', right: '右对齐' }[element.align];
    const summary = summarizeMetroTextRows(element.rows);
    return `文字，${element.rows.length} 行，${alignmentLabel}${summary ? `，${summary}` : ''}`;
  }
  if (element.type === 'largeText') {
    const summary = [element.value, element.suffix].filter(Boolean).join('');
    return summary ? `大文字，${summary}` : '大文字';
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
  disabled,
  isFirst,
  isLast,
  lineColorOptions,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
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
            { value: 'space', label: '空白', icon: 'space_bar' },
            { value: 'divider', label: '分割线', icon: 'split_scene' },
          ]}
          disabled={disabled}
          wide
          onChange={(elementType) =>
            onAction({ type: 'changeType', elementId: element.id, elementType })
          }
        />
        {element.type === 'facility' ? (
          <FacilityElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'arrow' ? (
          <ArrowElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'text' ? (
          <TextElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'largeText' ? (
          <LargeTextElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'space' ? (
          <SpaceElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'divider' ? (
          <p className="muted">竖线宽 8、高 72，随导视牌像素单元等比缩放。</p>
        ) : null}
        <ElementColorFields element={element} disabled={disabled} patch={patch} />
      </div>
    </article>
  );
}

function FacilityElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'facility' }>;
  disabled: boolean;
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
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={element.framed}
          disabled={disabled}
          onChange={(event) => patch({ framed: event.currentTarget.checked })}
        />
        <span>添加外框</span>
      </label>
    </div>
  );
}

function ArrowElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'arrow' }>;
  disabled: boolean;
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
    </div>
  );
}

function TextElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: MetroWayfindingTextElement;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
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

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <SegmentedControl
          label="对齐"
          value={element.align}
          options={[
            { value: 'left', label: '左对齐', icon: 'format_align_left' },
            { value: 'center', label: '居中', icon: 'format_align_center' },
            { value: 'right', label: '右对齐', icon: 'format_align_right' },
          ]}
          disabled={disabled}
          showLabels={false}
          onChange={(align) => patch({ align })}
        />
        <output className="metro-wayfinding-text-metrics">
          <span>动态字高</span>
          <strong>
            主文本 {formatMetroMetric(metrics.mainFontSize)} · 副文本{' '}
            {formatMetroMetric(metrics.secondaryFontSize)}
          </strong>
        </output>
      </div>
      <ol className="metro-wayfinding-text-row-list">
        {element.rows.map((row, index) => (
          <li key={row.id}>
            <header>
              <strong>{row.kind === 'main' ? '主文本' : '副文本'}</strong>
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
                  title="删除"
                  disabled={disabled || element.rows.length === 1}
                  onClick={() => patch({ rows: element.rows.filter((item) => item.id !== row.id) })}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                </button>
              </div>
            </header>
            {row.kind === 'main' ? (
              <MainSegmentEditor
                label="主文本内容与线路号"
                fontSize={metrics.mainFontSize}
                segments={row.segments}
                disabled={disabled}
                lineColorOptions={lineColorOptions}
                onChange={(segments) => updateRow(row.id, { ...row, segments })}
              />
            ) : (
              <label className="material-field">
                <span>副文本内容 · 字高 {formatMetroMetric(metrics.secondaryFontSize)}</span>
                <input
                  value={row.value}
                  disabled={disabled}
                  maxLength={160}
                  onChange={(event) =>
                    updateRow(row.id, { ...row, value: event.currentTarget.value })
                  }
                />
              </label>
            )}
          </li>
        ))}
      </ol>
      <div className="metro-wayfinding-inline-actions" aria-label="添加文字行">
        <button
          type="button"
          onClick={() => patch({ rows: [...element.rows, createMetroWayfindingTextRow('main')] })}
          disabled={disabled || element.rows.length >= 32}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            text_fields
          </span>
          主文本
        </button>
        <button
          type="button"
          onClick={() =>
            patch({ rows: [...element.rows, createMetroWayfindingTextRow('secondary')] })
          }
          disabled={disabled || element.rows.length >= 32}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            short_text
          </span>
          副文本
        </button>
      </div>
    </>
  );
}

function MainSegmentEditor({
  label,
  fontSize,
  segments,
  disabled,
  lineColorOptions,
  onChange,
}: Readonly<{
  label: string;
  fontSize: number;
  segments: MetroWayfindingMainSegment[];
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  onChange: (segments: MetroWayfindingMainSegment[]) => void;
}>) {
  const updateSegment = (index: number, segment: MetroWayfindingMainSegment) =>
    onChange(segments.map((item, itemIndex) => (itemIndex === index ? segment : item)));
  const moveSegment = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <section className="metro-wayfinding-main-segments" aria-label={label}>
      <div>
        <strong>{label}</strong>
        <span>字高 {formatMetroMetric(fontSize)}</span>
      </div>
      <ol>
        {segments.map((segment, index) => (
          <li key={`${segment.kind}-${index}`}>
            {segment.kind === 'line' ? (
              <>
                <label className="material-field">
                  <span>线路号</span>
                  <input
                    value={segment.value}
                    disabled={disabled}
                    maxLength={20}
                    onChange={(event) =>
                      updateSegment(index, { ...segment, value: event.currentTarget.value })
                    }
                  />
                </label>
                <ColorControl
                  label="线路色"
                  value={segment.color}
                  palette={lineColorOptions}
                  disabled={disabled}
                  onChange={(color) => updateSegment(index, { ...segment, color })}
                />
              </>
            ) : (
              <label className="material-field">
                <span>文本段</span>
                <input
                  value={segment.value}
                  disabled={disabled}
                  maxLength={160}
                  onChange={(event) =>
                    updateSegment(index, { ...segment, value: event.currentTarget.value })
                  }
                />
              </label>
            )}
            <div className="metro-wayfinding-segment-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="线路号或文本段前移"
                title="前移"
                disabled={disabled || index === 0}
                onClick={() => moveSegment(index, 'up')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="线路号或文本段后移"
                title="后移"
                disabled={disabled || index === segments.length - 1}
                onClick={() => moveSegment(index, 'down')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="删除线路号或文本段"
                title="删除"
                disabled={disabled || segments.length === 1}
                onClick={() => onChange(segments.filter((_item, itemIndex) => itemIndex !== index))}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="metro-wayfinding-inline-actions">
        <button
          type="button"
          onClick={() => onChange([...segments, { kind: 'text', value: '' }])}
          disabled={disabled}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            text_fields
          </span>
          文本段
        </button>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...segments,
              {
                kind: 'line',
                value: '',
                color: lineColorOptions[0]?.value ?? '#2F80ED',
              } satisfies MetroWayfindingLineSegment,
            ])
          }
          disabled={disabled}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            subway
          </span>
          线路号
        </button>
      </div>
    </section>
  );
}

function LargeTextElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: MetroWayfindingLargeTextElement;
  disabled: boolean;
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
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={element.framed}
          disabled={disabled}
          onChange={(event) => patch({ framed: event.currentTarget.checked })}
        />
        <span>添加外框</span>
      </label>
    </div>
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

const metroTextSuggestionsByIconId: Record<string, MetroInsertionSuggestionTemplate[]> = {
  elevator: [
    createSimpleMetroTextSuggestion('accessible-elevator', '无障碍电梯', 'Accessible Elevator'),
  ],
  restroom: [createSimpleMetroTextSuggestion('restroom', '卫生间', 'Toilets')],
  'mens-restroom': [createSimpleMetroTextSuggestion('mens-restroom', '男卫生间', 'Men')],
  'womens-restroom': [createSimpleMetroTextSuggestion('womens-restroom', '女卫生间', 'Women')],
  'nursing-room': [createSimpleMetroTextSuggestion('nursing-room', '母婴室', 'Baby Care')],
  'family-restroom': [
    createSimpleMetroTextSuggestion('family-restroom', '第三卫生间', 'Family Toilet'),
  ],
  waiting: [
    createSimpleMetroTextSuggestion('waiting-room', '空调候车室', 'Air-conditioned Waiting Room'),
  ],
  exit: [exitTextSuggestion],
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
  previewMain: '主文本 / 副文本 / 主文本 / 副文本',
  previewSecondary: '四行空白文字',
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
  previewMain: '平分剩余宽度',
  previewSecondary: '追加弹性空白',
};

const flexSpaceRightTextSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'flex-space-right-text',
  kind: 'right-text',
  previewMain: '右对齐文字',
  previewSecondary: '追加空白主文本与副文本',
};

function MetroWayfindingInsertionSuggestions({
  element,
  elements,
  disabled,
  lineColorOptions,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  elements: MetroWayfindingElement[];
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
      (element.foregroundColor ?? '#E53935').toUpperCase() === '#E53935';
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
        align: suggestion.kind === 'right-text' ? 'right' : textElement.align,
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
            aria-label={`添加${suggestion.previewMain}`}
            onClick={() => addSuggestion(suggestion)}
          >
            <MetroWayfindingSuggestionIcon suggestion={suggestion} />
            <span>
              <strong>{suggestion.previewMain}</strong>
              <small>{suggestion.previewSecondary}</small>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function resolveMetroInsertionSuggestionTemplates(
  element: MetroWayfindingElement,
  elements: MetroWayfindingElement[],
  lineColors: string[],
): MetroInsertionSuggestionTemplate[] {
  const suggestions =
    element.type === 'facility' ? [...(metroTextSuggestionsByIconId[element.iconId] ?? [])] : [];
  if (
    (element.type === 'largeText' ||
      (element.type === 'facility' && element.iconId === 'exit')) &&
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
    for (const [iconId, iconSuggestions] of Object.entries(metroTextSuggestionsByIconId)) {
      const matches = iconSuggestions.some((suggestion) =>
        suggestion.createRows
          ? metroTextRowsMatch(element.rows, suggestion.createRows(lineColors))
          : false,
      );
      if (!matches) continue;
      const option = metroWayfindingFacilityOptions.find((item) => item.id === iconId);
      if (!option) continue;
      suggestions.push({
        id: `matching-facility-${iconId}`,
        kind: 'facility',
        facilityIconId: iconId,
        previewMain: option.label,
        previewSecondary: '追加对应设施图标',
      });
    }
  }
  return suggestions;
}

function MetroWayfindingSuggestionIcon({
  suggestion,
}: Readonly<{ suggestion: MetroInsertionSuggestionTemplate }>) {
  if (suggestion.kind !== 'facility' || !suggestion.facilityIconId) {
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
        add
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

function metroTextRowsMatch(
  currentRows: MetroWayfindingTextRow[],
  suggestedRows: MetroWayfindingTextRow[],
): boolean {
  return metroTextRowsMatchSignature(currentRows) === metroTextRowsMatchSignature(suggestedRows);
}

function metroTextRowsMatchSignature(rows: MetroWayfindingTextRow[]): string {
  return JSON.stringify(
    rows.map((row) =>
      row.kind === 'main'
        ? {
            kind: row.kind,
            segments: row.segments.map((segment) =>
              segment.kind === 'line'
                ? { kind: segment.kind }
                : { kind: segment.kind, value: normalizeMetroSuggestionText(segment.value) },
            ),
          }
        : { kind: row.kind, value: normalizeMetroSuggestionText(row.value) },
    ),
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
  return { id: row.id, kind: 'secondary', value };
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
  patch,
}: Readonly<{
  element: MetroWayfindingElement;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  return (
    <div className="metro-wayfinding-color-row">
      <ColorControl
        label="元素背景色"
        value={element.backgroundColor ?? '#262626'}
        palette={metroWayfindingBackgroundPalette}
        disabled={disabled}
        onChange={(backgroundColor) => patch({ backgroundColor })}
      />
      <ColorControl
        label="元素文字、线条与图标颜色"
        value={element.foregroundColor ?? '#FFFFFF'}
        palette={metroWayfindingForegroundPalette}
        disabled={disabled}
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
  onChange,
}: Readonly<{
  label: string;
  value: string;
  palette: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  const usesPreset = palette.some((item) => item.value.toUpperCase() === value.toUpperCase());
  return (
    <label className="material-field metro-wayfinding-color-control">
      <span>{label}</span>
      <div>
        <select
          value={usesPreset ? value.toUpperCase() : 'custom'}
          disabled={disabled}
          onChange={(event) => {
            if (event.currentTarget.value !== 'custom') onChange(event.currentTarget.value);
          }}
        >
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
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, [
      ...elements,
      element,
    ]);
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
      element.framed
        ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
        : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE
    }`;
  }
  if (element.type === 'space') return '空白元素';
  return '分割线 · 8 × 72';
}
