'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { appPath } from '../lib/app-paths';
import {
  subscribeMetroWayfindingInspectorSnapshot,
  type MetroWayfindingElementAction,
  type MetroWayfindingInspectorSnapshot,
} from '../lib/client-metro-wayfinding-events';
import {
  buildMetroWayfindingLineNumberTemplateChildren,
  createMetroWayfindingElement,
  createMetroWayfindingTextRow,
  METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
  METRO_WAYFINDING_WARNING_FOREGROUND,
  metroWayfindingFacilityOptions,
  resolveMetroFacilityIconAssetName,
  resolveMetroFacilityMirrorAxis,
  resolveMetroWayfindingArrowBoundarySide,
  resolveMetroWayfindingCombinationScaleForFillMode,
  resolveMetroWayfindingFacilityDefaultDirection,
  resolveMetroWayfindingInsertionContextDefaults,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingVerticalLayoutSizing,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingElement,
  type MetroWayfindingFrameShape,
  type MetroWayfindingLayoutMode,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingTextAlign,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';
import { resolveMetroWayfindingLineTemplateOptions } from '../lib/metro-wayfinding-line-source';

/**
 * 导视牌检查器（Inspector）——编辑器之外的辅助面板宿主内容。
 *
 * 宽屏布局下这两个面板显示在页面右侧「预览」区下方，好处是：用户在预览里看到结果的同时，
 * 插入建议与尺寸警告就在旁边，不必来回滚动。窄屏时预览会退化成弹窗，此时由编辑器本体渲染它们。
 *
 * 数据来源：编辑器广播的只读快照（见 client-metro-wayfinding-events.ts）。
 * 这里不持有任何可变的布局状态，所有改动都通过 action 事件回抛给编辑器处理。
 *
 * `lineKeysByColor` 是宿主额外注入的补充信息：RMP 存档不含线路名，只能靠线路键
 * （`sh2`）推导编号，而线路键不在编辑器快照里，故由宿主直接传入。
 */
export function MetroWayfindingInspector({
  editorId,
  onAction,
  lineKeysByColor,
}: Readonly<{
  editorId: string;
  onAction: (rowIndex: number, action: MetroWayfindingElementAction) => void;
  lineKeysByColor?: ReadonlyMap<string, string>;
}>) {
  const [snapshot, setSnapshot] = useState<MetroWayfindingInspectorSnapshot | undefined>();

  useEffect(() => subscribeMetroWayfindingInspectorSnapshot(editorId, setSnapshot), [editorId]);

  if (!snapshot) return null;
  const { layout } = snapshot;
  const visibleRows = layout.rows.slice(0, layout.mode === 'double' ? 2 : 1);
  const activeElements = layout.rows[snapshot.rowIndex] ?? [];
  const selectedElement =
    activeElements.find((element) => element.id === snapshot.selectedElementId) ??
    activeElements[0];
  /*
    这里**不再**因为没有选中元素就整块 return null。

    尺寸警告只依赖版式与画布尺寸，跟选中谁无关；而选中元素可能合理地不存在
    （例如双行切回单行、当前行已没有元素）。整块返回 null 会让警告跟着插入建议一起消失，
    看起来就像面板凭空不见。正确做法是：警告照常渲染，只有依赖选中元素的插入建议才隐藏。
  */

  const rowSizings = visibleRows.map((elements) =>
    resolveMetroWayfindingLayoutSizing(elements, snapshot.canvasWidth),
  );
  const layoutSizing = {
    ...rowSizings.reduce((current, candidate) =>
      candidate.textScaleX < current.textScaleX ? candidate : current,
    ),
    isWidthInsufficient: rowSizings.some((sizing) => sizing.isWidthInsufficient),
    hasUnresolvedOverflow: rowSizings.some((sizing) => sizing.hasUnresolvedOverflow),
  };
  const verticalLayoutSizing = resolveMetroWayfindingVerticalLayoutSizing(
    visibleRows[0] ?? [],
    snapshot.canvasHeight * 128,
  );
  const rowIndex = snapshot.rowIndex;
  const dispatch = (action: MetroWayfindingElementAction) => onAction(rowIndex, action);

  return (
    <div className="metro-wayfinding-inspector">
      {/*
        宽度/高度警告排在插入建议之前：它是「当前结果有问题」的即时反馈，
        视觉上应紧贴预览画布（宽屏下 Inspector 就挂在预览面板正下方）。
      */}
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
        <MetroWayfindingInsertionSuggestions
          element={selectedElement}
          elements={activeElements}
          layoutMode={layout.mode}
          disabled={snapshot.disabled}
          lineColorOptions={snapshot.lineColorOptions}
          lineKeysByColor={lineKeysByColor}
          onAction={dispatch}
        />
      ) : null}
    </div>
  );
}

interface MetroInsertionSuggestionTemplate {
  id: string;
  previewMain: string;
  previewSecondary: string;
  kind?: 'text' | 'flex-space' | 'right-text' | 'facility' | 'line-combination';
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
    createSimpleMetroTextSuggestion('family-restroom', '家庭卫生间', 'Family Restroom'),
  ],
  'accessible-restroom': [
    createSimpleMetroTextSuggestion('accessible-restroom', '无障碍卫生间', 'Accessible Toilet'),
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

// 组合框的「线路编号」内容模板：选定线路后一次性生成编号大文本与线路名双行文本。
const lineNumberCombinationSuggestion: MetroInsertionSuggestionTemplate = {
  id: 'line-number-combination',
  kind: 'line-combination',
  icon: 'add_road',
  previewMain: '线路编号',
  previewSecondary: '编号大文字 + 线路名双行文本，可套用线路标识色为填充或色带',
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
  previewMain: '箭头一侧双语文字',
  previewSecondary: '根据箭头与弹性空白自动对齐',
  icon: 'format_align_center',
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
  lineKeysByColor,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  elements: MetroWayfindingElement[];
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  lineKeysByColor?: ReadonlyMap<string, string>;
  onAction: (action: MetroWayfindingElementAction) => void;
}>) {
  const lineColors = lineColorOptions.map((option) => option.value);
  const suggestions = resolveMetroInsertionSuggestionTemplates(element, elements, lineColors);
  // 「线路编号」模板需要先选定线路：以线路名（而非颜色值）为唯一标识，避免同色线路互相覆盖。
  // 编号来源分两种：已配置线路名 → 按统一口径提取；未配置 → 从 RMP 线路键剥离字母前缀
  // 推导（`sh2` → 2 号线）。**绝不**把 `sh2` 整体当成编号。详见 metro-wayfinding-line-source.ts。
  const lineTemplateOptions = useMemo(
    () => resolveMetroWayfindingLineTemplateOptions(lineColorOptions, lineKeysByColor),
    [lineColorOptions, lineKeysByColor],
  );
  const [templateLineId, setTemplateLineId] = useState(lineTemplateOptions[0]?.id ?? '');
  useEffect(() => {
    if (!lineTemplateOptions.some((line) => line.id === templateLineId)) {
      setTemplateLineId(lineTemplateOptions[0]?.id ?? '');
    }
  }, [lineTemplateOptions, templateLineId]);
  const selectedTemplateLine =
    lineTemplateOptions.find((line) => line.id === templateLineId) ?? lineTemplateOptions[0];

  if (!suggestions.length) return null;
  const selectedIndex = elements.findIndex((item) => item.id === element.id);
  const insertionDefaults =
    layoutMode === 'vertical'
      ? ({ textAlign: 'center', facilityDirection: undefined } as const)
      : resolveMetroWayfindingInsertionContextDefaults(
          elements,
          selectedIndex >= 0 ? selectedIndex + 1 : elements.length,
        );
  const selectedArrowSide =
    element.type === 'arrow' ? resolveMetroWayfindingArrowBoundarySide(element.iconId) : undefined;
  const suggestedTextAlign =
    layoutMode === 'vertical' || insertionDefaults.textAlign !== 'center'
      ? insertionDefaults.textAlign
      : selectedArrowSide === 'left' || selectedArrowSide === 'up'
        ? 'left'
        : selectedArrowSide === 'right'
          ? 'right'
          : 'center';
  const suggestedFacilityDirection =
    layoutMode === 'vertical'
      ? undefined
      : (insertionDefaults.facilityDirection ??
        (element.type === 'text' && element.align !== 'center' ? element.align : undefined));
  /**
   * 应用「线路编号」内容模板。
   * - 选中组合框：用新生成的两个子元素**替换**原有子元素，并把填充色 / 色带色设为线路标识色。
   * - 选中其他元素：新建一个组合框承载这两个子元素。
   * 两种填充样式分别对应「颜色填充（+ 前景色描边）」与「无填充+色带（取消描边）」。
   */
  const applyLineNumberTemplate = (fillMode: 'color' | 'stripe') => {
    const line = selectedTemplateLine;
    if (!line) return;
    const children = buildMetroWayfindingLineNumberTemplateChildren({
      lineNumber: line.lineNumber,
      color: line.color,
      lineName: line.name,
    });
    // 切换填充样式的缩放换算与填充模式分段控件保持一致，避免两条入口产出不同缩放。
    const previousMode = element.type === 'combination' ? element.frameFillMode : 'none';
    const fillPatch = {
      frameFillMode: fillMode,
      frameFillColor: line.color,
      // 与填充分段控件的联动规则一致：颜色填充默认勾选描边，色带样式默认取消描边。
      frameStroke: fillMode === 'color',
      scale: resolveMetroWayfindingCombinationScaleForFillMode(
        element.type === 'combination' ? element.scale : METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
        previousMode,
        fillMode,
      ),
    } as const;
    if (element.type === 'combination') {
      onAction({
        type: 'update',
        elementId: element.id,
        patch: { ...fillPatch, children },
      });
      return;
    }
    const combinationElement = createMetroWayfindingElement(
      'combination',
    ) as MetroWayfindingCombinationElement;
    onAction({
      type: 'add',
      element: {
        ...combinationElement,
        children: children as MetroWayfindingCombinationElement['children'],
        ...fillPatch,
        backgroundColor: element.backgroundColor,
        foregroundColor: element.foregroundColor,
      },
    });
  };
  const addSuggestion = (suggestion: MetroInsertionSuggestionTemplate) => {
    const usesNoEntryDefaultForeground =
      element.type === 'facility' &&
      element.iconId === 'no-entry' &&
      (element.foregroundColor ?? METRO_WAYFINDING_WARNING_FOREGROUND).toUpperCase() ===
        METRO_WAYFINDING_WARNING_FOREGROUND;
    // 「线路编号」模板由下方的两个专用按钮调用 applyLineNumberTemplate，不走通用分支。
    if (suggestion.kind === 'line-combination') return;
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
      const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(
        suggestion.facilityIconId,
      );
      onAction({
        type: 'add',
        element: {
          ...facilityElement,
          direction: fallbackDirection
            ? (suggestedFacilityDirection ?? fallbackDirection)
            : undefined,
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
          layoutMode === 'vertical'
            ? 'center'
            : (suggestion.textAlign ??
              (suggestion.kind === 'right-text' ? 'right' : suggestedTextAlign)),
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
        {suggestions.map((suggestion) =>
          suggestion.kind === 'line-combination' ? (
            <div key={suggestion.id} className="metro-wayfinding-line-template-suggestion">
              <MetroWayfindingSuggestionIcon
                suggestion={suggestion}
                contextDirection={suggestedFacilityDirection}
                contextTextAlign={suggestedTextAlign}
              />
              <span className="metro-wayfinding-line-template-suggestion-body">
                <strong>{suggestion.previewMain}</strong>
                <small>{suggestion.previewSecondary}</small>
                <span className="metro-wayfinding-line-template-suggestion-actions">
                  <select
                    aria-label="选择线路"
                    value={selectedTemplateLine?.id ?? ''}
                    disabled={disabled || !lineTemplateOptions.length}
                    onChange={(event) => setTemplateLineId(event.currentTarget.value)}
                  >
                    {lineTemplateOptions.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.name}
                        {line.isDerivedName ? '（推断）' : ''} · {line.color}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={disabled || !selectedTemplateLine}
                    onClick={() => applyLineNumberTemplate('color')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      palette
                    </span>
                    <span>
                      {element.type === 'combination' ? '替换为颜色填充' : '添加颜色填充'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !selectedTemplateLine}
                    onClick={() => applyLineNumberTemplate('stripe')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      view_sidebar
                    </span>
                    <span>
                      {element.type === 'combination' ? '替换为色带样式' : '添加色带样式'}
                    </span>
                  </button>
                </span>
                {lineTemplateOptions.some((line) => line.isDerivedName) ? (
                  <small>
                    带「推断」标记的编号由项目线路键推断得出（如 sh2 → 2），
                    可在「配置项目线路名称」中修正为正式名称。
                  </small>
                ) : null}
                {!lineTemplateOptions.length ? (
                  <small>当前没有带标识色的地铁线路数据。</small>
                ) : null}
              </span>
            </div>
          ) : (
            <button
              key={suggestion.id}
              type="button"
              aria-label={`添加${suggestionKindLabel(suggestion)}：${suggestion.previewMain}`}
              onClick={() => addSuggestion(suggestion)}
            >
              <MetroWayfindingSuggestionIcon
                suggestion={suggestion}
                contextDirection={suggestedFacilityDirection}
                contextTextAlign={suggestedTextAlign}
              />
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
          ),
        )}
      </div>
    </fieldset>
  );
}

function suggestionKindLabel(suggestion: MetroInsertionSuggestionTemplate): string {
  if (suggestion.kind === 'facility') return '图标';
  if (suggestion.kind === 'flex-space') return '弹性空白';
  if (suggestion.kind === 'right-text') return '文字组合';
  if (suggestion.kind === 'line-combination') return '内容模板';
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
  // 组合框提供「线路编号」内容模板：由建议区统一承接，避免埋在组合内容弹窗里难以发现。
  if (element.type === 'combination') {
    suggestions.push(lineNumberCombinationSuggestion);
  }
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
  contextDirection,
  contextTextAlign,
}: Readonly<{
  suggestion: MetroInsertionSuggestionTemplate;
  contextDirection?: 'left' | 'right' | 'up' | 'down';
  contextTextAlign: MetroWayfindingTextAlign;
}>) {
  if (suggestion.kind !== 'facility' || !suggestion.facilityIconId) {
    const icon =
      suggestion.id === arrowLeadingTextSuggestion.id
        ? {
            left: 'format_align_left',
            center: 'format_align_center',
            right: 'format_align_right',
          }[contextTextAlign]
        : suggestion.icon;
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon ?? 'add'}
      </span>
    );
  }
  const option = metroWayfindingFacilityOptions.find(
    (item) => item.id === suggestion.facilityIconId,
  );
  if (!option) return null;
  const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(option.id);
  const direction = fallbackDirection ? (contextDirection ?? fallbackDirection) : undefined;
  const assetName = resolveMetroFacilityIconAssetName(option.id, direction);
  return assetName ? (
    <MetroFacilityAssetIcon
      assetName={assetName}
      style={metroFacilityAssetPreviewStyle(option.id, direction)}
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
  return { id: row.id, kind: 'secondary', value, bold: false };
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

function metroIconPreviewStyle(iconId: string): { transform: string } | undefined {
  if (iconId === 'no-entry') {
    return { transform: 'rotate(-45deg)' };
  }
  return undefined;
}

function metroFacilityAssetPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
  variant?: string,
): { transform: string } | undefined {
  // 楼梯：每个「变种 × 方向」都有独立素材（-right 后缀为朝右版），不再做镜像。
  if (iconId === 'stairs' || iconId === 'stairs-down') {
    return undefined;
  }
  // 扶梯 / 轮椅升降机 / 轮椅：素材原始朝向为“朝右”，朝左时按图标声明的镜像轴翻转。
  // 默认水平镜像（scaleX(-1)），个别图标可能是垂直镜像（scaleY(-1)）。
  if (iconId === 'escalator' || iconId === 'wheelchair-lift' || iconId === 'wheelchair') {
    const effectiveDirection =
      direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
    if (effectiveDirection !== 'left') return undefined;
    return {
      transform:
        resolveMetroFacilityMirrorAxis(iconId, variant as never) === 'vertical'
          ? 'scaleY(-1)'
          : 'scaleX(-1)',
    };
  }
  if (iconId !== 'exit') {
    return undefined;
  }
  const effectiveDirection =
    direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
  if (effectiveDirection === 'left') return { transform: 'rotate(-90deg)' };
  if (effectiveDirection === 'up') return undefined;
  if (effectiveDirection === 'down') return { transform: 'rotate(180deg)' };
  return { transform: 'rotate(90deg)' };
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
