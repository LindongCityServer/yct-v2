'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  dispatchMetroWayfindingCompositionAction,
  subscribeMetroWayfindingCompositionActions,
  type MetroWayfindingCompositionAction,
} from '../lib/client-metro-wayfinding-events';
import {
  createMetroWayfindingElement,
  metroWayfindingBackgroundPalette,
  metroWayfindingForegroundPalette,
  metroWayfindingIconOptions,
  parseMetroWayfindingLayout,
  serializeMetroWayfindingLayout,
  type MetroWayfindingElement,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingTextElement,
} from '../lib/metro-wayfinding';

export function MetroWayfindingEditor({
  value,
  disabled,
  lineColorOptions,
  onChange,
}: Readonly<{
  value: string;
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
        <>
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
              return (
                <li key={element.id} role="presentation">
                  <button
                    id={`${editorId}-${element.id}-tab`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={`${editorId}-element-panel`}
                    aria-label={metroElementTabAriaLabel(element)}
                    tabIndex={isSelected ? 0 : -1}
                    className={[isSelected ? 'is-active' : '', isIconOnly ? 'is-icon-only' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedElementId(element.id)}
                  >
                    <MetroWayfindingElementTabContent element={element} />
                  </button>
                </li>
              );
            })}
          </ol>
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
        </>
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
      </div>
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
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
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
          {summarizeMetroMainSegments(element.main) ||
            (element.mode === 'double' ? '双行文字' : '单行文字')}
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
    return (
      metroWayfindingIconOptions.find((option) => option.id === element.iconId)?.label ?? '图标'
    );
  }
  if (element.type === 'text') {
    const alignmentLabel = { left: '左对齐', center: '居中', right: '右对齐' }[element.align];
    const summary = summarizeMetroMainSegments(element.main);
    return `${element.mode === 'double' ? '双行文字' : '单行文字'}，${alignmentLabel}${summary ? `，${summary}` : ''}`;
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
  return (
    <div className="metro-wayfinding-field-grid">
      <label className="material-field">
        <span>图标类型</span>
        <select
          value={element.iconId}
          disabled={disabled}
          onChange={(event) => {
            const iconId = event.currentTarget.value;
            const previousIcon = metroWayfindingIconOptions.find(
              (option) => option.id === element.iconId,
            );
            const nextIcon = metroWayfindingIconOptions.find((option) => option.id === iconId);
            const shouldClearPreviousDefault =
              previousIcon?.defaultForegroundColor === element.foregroundColor;
            patch({
              iconId,
              foregroundColor:
                nextIcon?.defaultForegroundColor ??
                (shouldClearPreviousDefault ? undefined : element.foregroundColor),
            });
          }}
        >
          <optgroup label="设施图标">
            {metroWayfindingIconOptions
              .filter((item) => item.group === 'facility')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="箭头">
            {metroWayfindingIconOptions
              .filter((item) => item.group === 'arrow')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {['stairs', 'escalator', 'exit'].includes(element.iconId) ? (
        <label className="material-field">
          <span>{element.iconId === 'exit' ? '出口图标方向' : '图标方向'}</span>
          <select
            value={element.direction ?? 'right'}
            disabled={disabled}
            onChange={(event) =>
              patch({ direction: event.currentTarget.value as 'left' | 'right' | 'up' | 'down' })
            }
          >
            {element.iconId === 'exit' ? (
              <>
                <option value="left">左</option>
                <option value="up">上</option>
                <option value="right">右</option>
                <option value="down">下</option>
              </>
            ) : (
              <>
                <option value="left">左</option>
                <option value="right">右</option>
              </>
            )}
          </select>
        </label>
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
  const updateMain = (nextMain: MetroWayfindingMainSegment[]) => patch({ main: nextMain });
  const updateSecondMain = (secondMain: MetroWayfindingMainSegment[]) => patch({ secondMain });

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <label className="material-field">
          <span>文字样式</span>
          <select
            value={element.mode}
            disabled={disabled}
            onChange={(event) =>
              patch({ mode: event.currentTarget.value as MetroWayfindingTextElement['mode'] })
            }
          >
            <option value="single">单行文字</option>
            <option value="double">双行文字</option>
          </select>
        </label>
        <label className="material-field">
          <span>对齐</span>
          <select
            value={element.align}
            disabled={disabled}
            onChange={(event) =>
              patch({ align: event.currentTarget.value as MetroWayfindingTextElement['align'] })
            }
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
      </div>
      <MainSegmentEditor
        label={element.mode === 'single' ? '主文本与线路号' : '第一行主文本与线路号'}
        segments={element.main}
        disabled={disabled}
        lineColorOptions={lineColorOptions}
        onChange={updateMain}
      />
      {element.mode === 'single' ? (
        <label className="material-field">
          <span>副文本（字高 28）</span>
          <input
            value={element.secondary}
            disabled={disabled}
            maxLength={160}
            onChange={(event) => patch({ secondary: event.currentTarget.value })}
          />
        </label>
      ) : (
        <>
          <MainSegmentEditor
            label="第二行主文本与线路号"
            segments={element.secondMain}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            onChange={updateSecondMain}
          />
          <div className="metro-wayfinding-field-grid">
            <label className="material-field">
              <span>第一行副文本（字高 14）</span>
              <input
                value={element.secondSecondary}
                disabled={disabled}
                maxLength={160}
                onChange={(event) => patch({ secondSecondary: event.currentTarget.value })}
              />
            </label>
            <label className="material-field">
              <span>第二行副文本（字高 14）</span>
              <input
                value={element.secondary}
                disabled={disabled}
                maxLength={160}
                onChange={(event) => patch({ secondary: event.currentTarget.value })}
              />
            </label>
          </div>
        </>
      )}
    </>
  );
}

function MainSegmentEditor({
  label,
  segments,
  disabled,
  lineColorOptions,
  onChange,
}: Readonly<{
  label: string;
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
        <span>主文本字高随文字样式自动使用 42 或 20。</span>
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
      <label className="material-field">
        <span>空白方式</span>
        <select
          value={element.mode}
          disabled={disabled}
          onChange={(event) => patch({ mode: event.currentTarget.value as 'fixed' | 'flex' })}
        >
          <option value="fixed">固定宽度</option>
          <option value="flex">平分剩余宽度</option>
        </select>
      </label>
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
  const index = layout.elements.findIndex((element) => element.id === action.elementId);
  const target = action.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= layout.elements.length) return layout;
  const elements = [...layout.elements];
  [elements[index], elements[target]] = [elements[target]!, elements[index]!];
  return { ...layout, elements };
}

function metroElementLabel(element: MetroWayfindingElement): string {
  if (element.type === 'icon') return '图标 · 85 × 85';
  if (element.type === 'text') return element.mode === 'single' ? '单行文字' : '双行文字';
  if (element.type === 'largeText') return '大文字 · 字高 85';
  if (element.type === 'space') return '空白元素';
  return '分割线 · 8 × 72';
}
