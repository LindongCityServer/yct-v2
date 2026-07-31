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
} from '../lib/client-metro-wayfinding-events';
import {
  createMetroWayfindingElement,
  createMetroWayfindingTextRow,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  metroWayfindingBackgroundPalette,
  metroWayfindingForegroundPalette,
  metroWayfindingIconOptions,
  parseMetroWayfindingLayout,
  resolveMetroFacilityIconAssetName,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  serializeMetroWayfindingLayout,
  type MetroWayfindingElement,
  type MetroWayfindingIconOption,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';

export function MetroWayfindingEditor({
  value,
  canvasWidth,
  disabled,
  lineColorOptions,
  onChange,
}: Readonly<{
  value: string;
  canvasWidth: number;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}>) {
  const editorId = useId();
  const elementListRef = useRef<HTMLOListElement>(null);
  const [layout, setLayout] = useState(() => parseMetroWayfindingLayout(value));
  const [selectedElementId, setSelectedElementId] = useState(
    () => parseMetroWayfindingLayout(value).elements[0]?.id ?? '',
  );
  const [draggedElementId, setDraggedElementId] = useState('');
  const [dropTarget, setDropTarget] = useState<{
    elementId: string;
    placement: 'before' | 'after';
  } | null>(null);

  useEffect(() => {
    const nextLayout = parseMetroWayfindingLayout(value);
    setLayout(nextLayout);
    setSelectedElementId((current) =>
      nextLayout.elements.some((element) => element.id === current)
        ? current
        : (nextLayout.elements[0]?.id ?? ''),
    );
  }, [value]);

  const applyAction = useCallback(
    (action: MetroWayfindingCompositionAction) => {
      setLayout((current) => {
        const next = reduceMetroWayfindingAction(current, action);
        onChange(serializeMetroWayfindingLayout(next));
        return next;
      });
    },
    [onChange],
  );

  useEffect(
    () => subscribeMetroWayfindingCompositionActions(editorId, applyAction),
    [applyAction, editorId],
  );

  const dispatch = (action: MetroWayfindingCompositionAction) => {
    if (action.type === 'add') {
      setSelectedElementId(action.element.id);
    } else if (action.type === 'remove' && action.elementId === selectedElementId) {
      const removedIndex = layout.elements.findIndex((element) => element.id === action.elementId);
      setSelectedElementId(
        layout.elements[removedIndex + 1]?.id ?? layout.elements[removedIndex - 1]?.id ?? '',
      );
    }
    dispatchMetroWayfindingCompositionAction({ editorId, action });
  };
  const selectedElement =
    layout.elements.find((element) => element.id === selectedElementId) ?? layout.elements[0];
  const selectedElementIndex = selectedElement
    ? layout.elements.findIndex((element) => element.id === selectedElement.id)
    : -1;
  const layoutSizing = resolveMetroWayfindingLayoutSizing(layout, canvasWidth);

  useEffect(() => {
    const selectedTab = elementListRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    selectedTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [selectedElementId]);

  const handleElementNavigationKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!layout.elements.length) return;
    let nextIndex = selectedElementIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = layout.elements.length - 1;
    else return;
    event.preventDefault();
    const nextElement =
      layout.elements[Math.max(0, Math.min(layout.elements.length - 1, nextIndex))];
    if (nextElement) {
      setSelectedElementId(nextElement.id);
      window.requestAnimationFrame(() => {
        document.getElementById(`${editorId}-${nextElement.id}-tab`)?.focus();
      });
    }
  };

  const handleElementDragStart = (event: ReactDragEvent<HTMLButtonElement>, elementId: string) => {
    if (disabled || layout.elements.length < 2) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', elementId);
    setDraggedElementId(elementId);
    setSelectedElementId(elementId);
  };

  const handleElementDragOver = (
    event: ReactDragEvent<HTMLButtonElement>,
    targetElementId: string,
  ) => {
    if (!draggedElementId || draggedElementId === targetElementId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    setDropTarget((current) =>
      current?.elementId === targetElementId && current.placement === placement
        ? current
        : { elementId: targetElementId, placement },
    );
  };

  const handleElementDrop = (event: ReactDragEvent<HTMLButtonElement>, targetElementId: string) => {
    const elementId = draggedElementId || event.dataTransfer.getData('text/plain');
    if (!elementId || elementId === targetElementId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    dispatch({ type: 'reorder', elementId, targetElementId, placement });
    setDraggedElementId('');
    setDropTarget(null);
  };

  const handleElementDragEnd = () => {
    setDraggedElementId('');
    setDropTarget(null);
  };

  return (
    <section className="metro-wayfinding-editor" aria-label="地铁导视牌编排">
      <div className="metro-wayfinding-toolbar">
        <ColorControl
          label="导视牌底色"
          value={layout.backgroundColor}
          palette={metroWayfindingBackgroundPalette}
          disabled={disabled}
          onChange={(backgroundColor) =>
            dispatch({ type: 'replace', layout: { ...layout, backgroundColor } })
          }
        />
        <ColorControl
          label="默认文字与图形颜色"
          value={layout.foregroundColor}
          palette={metroWayfindingForegroundPalette}
          disabled={disabled}
          onChange={(foregroundColor) =>
            dispatch({ type: 'replace', layout: { ...layout, foregroundColor } })
          }
        />
      </div>

      {layout.elements.length ? (
        <ol
          ref={elementListRef}
          className="metro-wayfinding-element-list"
          role="tablist"
          aria-label="已添加元素"
          onKeyDown={handleElementNavigationKeyDown}
        >
          {layout.elements.map((element) => {
            const isSelected = element.id === selectedElement?.id;
            const isIconOnly =
              element.type === 'icon' || element.type === 'space' || element.type === 'divider';
            const tabLabel = metroElementTabAriaLabel(element);
            const canDrag = !disabled && layout.elements.length > 1;
            return (
              <li key={element.id} role="presentation">
                <button
                  id={`${editorId}-${element.id}-tab`}
                  type="button"
                  role="tab"
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
                    draggedElementId === element.id ? 'is-dragging' : '',
                    dropTarget?.elementId === element.id ? `is-drop-${dropTarget.placement}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedElementId(element.id)}
                  onDragStart={(event) => handleElementDragStart(event, element.id)}
                  onDragOver={(event) => handleElementDragOver(event, element.id)}
                  onDrop={(event) => handleElementDrop(event, element.id)}
                  onDragEnd={handleElementDragEnd}
                >
                  <MetroWayfindingElementTabContent element={element} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="metro-wayfinding-empty">从下方选择元素，横向编排导视内容。</p>
      )}

      <div className="metro-wayfinding-add-bar" aria-label="添加导视元素">
        <span>添加元素</span>
        <div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'add', element: createMetroWayfindingElement('icon') })}
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              stairs
            </span>
            图标
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'add', element: createMetroWayfindingElement('text') })}
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              text_fields
            </span>
            文字
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'add', element: createMetroWayfindingElement('largeText') })
            }
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              title
            </span>
            大文字
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'add', element: createMetroWayfindingElement('space') })
            }
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              space_bar
            </span>
            空白
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'add', element: createMetroWayfindingElement('divider') })
            }
            disabled={disabled}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              vertical_split
            </span>
            分割线
          </button>
        </div>
        {selectedElement ? (
          <MetroTextInsertionSuggestions
            element={selectedElement}
            elements={layout.elements}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            onAction={dispatch}
          />
        ) : null}
      </div>

      {layoutSizing.isWidthInsufficient ? (
        <p className="metro-wayfinding-width-warning" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <span>
            当前尺寸宽度不足，文字与大文字已统一横向压缩至
            {Math.round(layoutSizing.textScaleX * 100)}%。
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
            isLast={selectedElementIndex === layout.elements.length - 1}
            lineColorOptions={lineColorOptions}
            onAction={dispatch}
          />
        </div>
      ) : null}
    </section>
  );
}

function MetroWayfindingElementTabContent({
  element,
}: Readonly<{ element: MetroWayfindingElement }>) {
  if (element.type === 'icon') {
    const icon =
      metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingIconOptions[0]!;
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
  if (element.type === 'icon') {
    const label =
      metroWayfindingIconOptions.find((option) => option.id === element.iconId)?.label ?? '图标';
    const direction =
      element.direction && ['stairs', 'stairs-down', 'escalator', 'exit'].includes(element.iconId)
        ? { left: '向左', right: '向右', up: '向上', down: '向下' }[element.direction]
        : '';
    return `${label}${direction ? `，${direction}` : ''}`;
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
  onAction: (action: MetroWayfindingCompositionAction) => void;
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
        {element.type === 'icon' ? (
          <IconElementFields element={element} disabled={disabled} patch={patch} />
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

function IconElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'icon' }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const currentIcon =
    metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
    metroWayfindingIconOptions[0]!;
  const pickerGroup = metroIconPickerGroupById(element.iconId);
  const pickerOptions = metroIconPickerOptions(pickerGroup);
  const selectIcon = (iconId: string) => {
    const nextIcon = metroWayfindingIconOptions.find((option) => option.id === iconId);
    const shouldClearPreviousDefault =
      currentIcon.defaultForegroundColor === element.foregroundColor;
    patch({
      iconId,
      direction: nextIcon?.group === 'arrow' ? undefined : element.direction,
      framed: nextIcon?.group !== currentIcon.group ? nextIcon?.group !== 'arrow' : element.framed,
      foregroundColor:
        nextIcon?.defaultForegroundColor ??
        (shouldClearPreviousDefault ? undefined : element.foregroundColor),
    });
  };

  return (
    <div className="metro-wayfinding-field-grid">
      <SegmentedControl
        label="图标类型"
        value={pickerGroup}
        options={metroIconPickerGroups}
        disabled={disabled}
        wide
        onChange={(group) => selectIcon(metroIconPickerOptions(group)[0]!.id)}
      />
      <IconChoiceGrid
        label={pickerGroup === 'facility' ? '设施图标' : '箭头图标'}
        value={element.iconId}
        options={pickerOptions.map((option) => {
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

type MetroIconPickerGroup = MetroWayfindingIconOption['group'];

const metroIconPickerGroups: Array<{ value: MetroIconPickerGroup; label: string }> = [
  { value: 'facility', label: '设施' },
  { value: 'arrow', label: '箭头' },
];

function metroIconPickerGroupById(iconId: string): MetroIconPickerGroup {
  return metroWayfindingIconOptions.find((option) => option.id === iconId)?.group ?? 'facility';
}

function metroIconPickerOptions(group: MetroIconPickerGroup): MetroWayfindingIconOption[] {
  return metroWayfindingIconOptions.filter((option) => option.group === group);
}

function metroIconPreviewStyle(iconId: string): { transform: string } | undefined {
  if (iconId === 'no-entry') {
    return { transform: 'rotate(-45deg)' };
  }
  if (iconId === 'turn-left-up' || iconId === 'turn-left-down') {
    return { transform: 'rotate(-90deg)' };
  }
  if (iconId === 'turn-right-up' || iconId === 'turn-right-down') {
    return { transform: 'rotate(90deg)' };
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
            {option.assetName ? (
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

interface MetroTextSuggestionTemplate {
  id: string;
  previewMain: string;
  previewSecondary: string;
  createRows: (lineColors: string[]) => MetroWayfindingTextRow[];
}

function createSimpleMetroTextSuggestion(
  id: string,
  main: string,
  secondary: string,
): MetroTextSuggestionTemplate {
  return {
    id,
    previewMain: main,
    previewSecondary: secondary,
    createRows: () => createSuggestedTextRows([{ kind: 'text', value: main }], secondary),
  };
}

const exitTextSuggestion = createSimpleMetroTextSuggestion('exit', '出口', 'EXIT');

const metroTextSuggestionsByIconId: Record<string, MetroTextSuggestionTemplate[]> = {
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

const exitLargeTextSuggestion: MetroTextSuggestionTemplate = {
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

function MetroTextInsertionSuggestions({
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
  onAction: (action: MetroWayfindingCompositionAction) => void;
}>) {
  const suggestions = resolveMetroTextSuggestionTemplates(element, elements);
  if (!suggestions.length) return null;
  const lineColors = lineColorOptions.map((option) => option.value);
  const addSuggestion = (suggestion: MetroTextSuggestionTemplate) => {
    const textElement = createMetroWayfindingElement('text') as MetroWayfindingTextElement;
    const usesNoEntryDefaultForeground =
      element.type === 'icon' &&
      element.iconId === 'no-entry' &&
      (element.foregroundColor ?? '#E53935').toUpperCase() === '#E53935';
    onAction({
      type: 'add',
      element: {
        ...textElement,
        rows: suggestion.createRows(lineColors),
        backgroundColor: element.backgroundColor,
        foregroundColor: usesNoEntryDefaultForeground ? undefined : element.foregroundColor,
      },
    });
  };

  return (
    <fieldset className="metro-wayfinding-text-suggestions" disabled={disabled}>
      <legend>添加关联文字</legend>
      <div>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            aria-label={`添加${suggestion.previewMain}文字`}
            onClick={() => addSuggestion(suggestion)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
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

function resolveMetroTextSuggestionTemplates(
  element: MetroWayfindingElement,
  elements: MetroWayfindingElement[],
): MetroTextSuggestionTemplate[] {
  const suggestions =
    element.type === 'icon' ? [...(metroTextSuggestionsByIconId[element.iconId] ?? [])] : [];
  if (
    (element.type === 'largeText' || (element.type === 'icon' && element.iconId === 'exit')) &&
    hasAdjacentExitAndLargeText(element, elements)
  ) {
    if (element.type === 'largeText') suggestions.push(exitTextSuggestion);
    suggestions.push(exitLargeTextSuggestion);
  }
  return suggestions;
}

function hasAdjacentExitAndLargeText(
  element: MetroWayfindingElement,
  elements: MetroWayfindingElement[],
): boolean {
  const index = elements.findIndex((item) => item.id === element.id);
  if (index < 0) return false;
  return [elements[index - 1], elements[index + 1]].some((neighbor) =>
    element.type === 'largeText'
      ? neighbor?.type === 'icon' && neighbor.iconId === 'exit'
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
  if (action.type === 'add') return { ...layout, elements: [...layout.elements, action.element] };
  if (action.type === 'remove')
    return {
      ...layout,
      elements: layout.elements.filter((element) => element.id !== action.elementId),
    };
  if (action.type === 'update')
    return {
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === action.elementId
          ? ({ ...element, ...action.patch } as MetroWayfindingElement)
          : element,
      ),
    };
  if (action.type === 'reorder') {
    const sourceIndex = layout.elements.findIndex((element) => element.id === action.elementId);
    if (sourceIndex < 0 || action.elementId === action.targetElementId) return layout;
    const elements = [...layout.elements];
    const [element] = elements.splice(sourceIndex, 1);
    const targetIndex = elements.findIndex((item) => item.id === action.targetElementId);
    if (!element || targetIndex < 0) return layout;
    const insertionIndex = action.placement === 'before' ? targetIndex : targetIndex + 1;
    elements.splice(insertionIndex, 0, element);
    return { ...layout, elements };
  }
  const index = layout.elements.findIndex((element) => element.id === action.elementId);
  const target = action.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= layout.elements.length) return layout;
  const elements = [...layout.elements];
  [elements[index], elements[target]] = [elements[target]!, elements[index]!];
  return { ...layout, elements };
}

function metroElementLabel(element: MetroWayfindingElement): string {
  if (element.type === 'icon') return '图标 · 85 × 85';
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
