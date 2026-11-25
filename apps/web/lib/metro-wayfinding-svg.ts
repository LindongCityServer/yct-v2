import {
  METRO_WAYFINDING_COMBINATION_GAP,
  METRO_WAYFINDING_COMBINATION_STRIPE_TOP,
  METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH,
  METRO_WAYFINDING_COMBINATION_VERTICAL_PADDING,
  METRO_WAYFINDING_DIVIDER_WIDTH,
  METRO_WAYFINDING_FOREGROUND,
  METRO_WAYFINDING_GAP,
  METRO_WAYFINDING_HEIGHT,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  METRO_WAYFINDING_PADDING,
  METRO_WAYFINDING_TEXT_HEIGHT,
  estimateMetroWayfindingLargeTextWidth,
  estimateMetroWayfindingTextWidth,
  hasMetroWayfindingTextRowContent,
  measureMetroWayfindingMainSegments,
  measureMetroWayfindingSecondaryText,
  metroWayfindingIconOptions,
  normalizeColor,
  parseMetroWayfindingLayout,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityIconAssetName,
  resolveMetroFacilityMirrorTransform,
  resolveMetroWayfindingCombinationSizing,
  resolveMetroWayfindingElementWidth,
  resolveMetroWayfindingFacilityDefaultDirection,
  resolveMetroWayfindingIconScaleFactor,
  resolveMetroWayfindingLayoutPadding,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  resolveMetroWayfindingVerticalLayoutSizing,
  splitMetroLargeTextRuns,
  type MetroArrowIconAssetName,
  type MetroFacilityIconAssetName,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingElement,
  type MetroWayfindingFrameFillMode,
  type MetroWayfindingFrameShape,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingMainSegment,
} from './metro-wayfinding';

/** 渲染所需的 SVG 素材片段；服务端从文件读取，浏览器从 public 资源获取。 */
export interface MetroWayfindingSvgMarkup {
  viewBox: string;
  content: string;
}

export interface MetroWayfindingSvgAssets {
  getMaterialSymbolMarkup(symbol: string): MetroWayfindingSvgMarkup;
  getMetroFacilityAssetMarkup(
    assetName: MetroFacilityIconAssetName | 'frame',
    variant: 'framed' | 'plain',
  ): MetroWayfindingSvgMarkup;
  getMetroArrowAssetMarkup(assetName: MetroArrowIconAssetName): MetroWayfindingSvgMarkup;
}

/** 把单个 SVG 文件解析成可复用的 `viewBox + 内部片段`；服务端与浏览器共用。 */
export function parseSvgMarkup(source: string): MetroWayfindingSvgMarkup | undefined {
  const viewBox = source.match(/\bviewBox="([^"]+)"/u)?.[1];
  const content = source
    .replace(/^\s*<svg\b[^>]*>/u, '')
    .replace(/<\/svg>\s*$/u, '')
    .trim();
  return viewBox && content ? { viewBox, content } : undefined;
}

/**
 * 导视牌同构 SVG 渲染：服务端导出与浏览器预览共用同一份实现，
 * 只有素材来源通过 `assets` 注入，保证画布与导出图的比例、坐标完全一致。
 */
export function renderMetroWayfindingSvg(
  value: string,
  canvasWidth: number,
  canvasHeight: number,
  assets: MetroWayfindingSvgAssets,
): string {
  const layout = parseMetroWayfindingLayout(value);
  if (layout.mode === 'vertical') {
    return renderMetroWayfindingVertical(layout, canvasWidth, canvasHeight, assets);
  }
  const rowCount = layout.mode === 'double' ? 2 : 1;
  const scale = canvasHeight / (METRO_WAYFINDING_HEIGHT * rowCount);
  const width = canvasWidth / scale;
  const padding = resolveMetroWayfindingLayoutPadding(layout);
  const rows = Array.from({ length: rowCount }, (_unused, index) =>
    renderMetroWayfindingRow(layout, layout.rows[index] ?? [], width, index, assets, padding),
  ).join('');
  const rowDivider =
    rowCount === 2 && layout.dividerBetweenRows
      ? `<rect x="${formatNumber(padding.start)}" y="${formatNumber(METRO_WAYFINDING_HEIGHT - METRO_WAYFINDING_DIVIDER_WIDTH / 2)}" width="${formatNumber(Math.max(width - padding.start - padding.end, 0))}" height="${METRO_WAYFINDING_DIVIDER_WIDTH}" fill="${normalizeColor(layout.foregroundColor, METRO_WAYFINDING_FOREGROUND)}"/>`
      : '';
  return `<g transform="scale(${formatNumber(scale)})" data-metro-wayfinding="true" data-metro-wayfinding-mode="${layout.mode}"><rect width="${formatNumber(width)}" height="${METRO_WAYFINDING_HEIGHT * rowCount}" fill="${normalizeColor(layout.backgroundColor, '#262626')}"/>${rows}${rowDivider}</g>`;
}

function renderMetroWayfindingVertical(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  canvasWidth: number,
  canvasHeight: number,
  assets: MetroWayfindingSvgAssets,
): string {
  const width = Math.max(canvasWidth, 1);
  const height = Math.max(canvasHeight, METRO_WAYFINDING_HEIGHT);
  const elements = layout.rows[0] ?? [];
  const padding = resolveMetroWayfindingLayoutPadding(layout);
  const sizing = resolveMetroWayfindingVerticalLayoutSizing(elements, height, padding);
  let cursorY = padding.start;
  const children = elements.map((element, index) => {
    const intrinsicElementHeight =
      element.type === 'space' && element.mode === 'flex'
        ? sizing.flexHeight
        : sizing.elementHeights[index]!;
    const elementScaleY =
      element.type === 'text' && element.writingMode === 'vertical' ? sizing.textScaleY : 1;
    const elementHeight = intrinsicElementHeight * elementScaleY;
    const nextElement = elements[index + 1];
    const output = renderMetroWayfindingVerticalElement(
      element,
      cursorY,
      elementHeight,
      width,
      layout,
      assets,
      intrinsicElementHeight,
    );
    const gap =
      nextElement &&
      resolveMetroElementBackground(element, layout) ===
        resolveMetroElementBackground(nextElement, layout)
        ? `<rect x="0" y="${formatNumber(cursorY + elementHeight)}" width="${formatNumber(width)}" height="${METRO_WAYFINDING_GAP}" fill="${resolveMetroElementBackground(element, layout)}"/>`
        : '';
    cursorY += elementHeight + (nextElement ? METRO_WAYFINDING_GAP : 0);
    return `${output}${gap}`;
  });
  return `<g data-metro-wayfinding="true" data-metro-wayfinding-mode="vertical"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${normalizeColor(layout.backgroundColor, '#262626')}"/>${children.join('')}</g>`;
}

function renderMetroWayfindingVerticalElement(
  element: MetroWayfindingElement,
  y: number,
  height: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  assets: MetroWayfindingSvgAssets,
  contentHeight = height,
): string {
  const background = resolveMetroElementBackground(element, layout);
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  if (element.type === 'space') {
    return `<rect x="0" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>`;
  }
  if (element.type === 'divider') {
    return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/><rect x="28" width="${formatNumber(Math.max(width - 56, 0))}" height="${METRO_WAYFINDING_DIVIDER_WIDTH}" fill="${foreground}"/></g>`;
  }
  if (element.type === 'text' && element.writingMode === 'vertical') {
    const content = renderMetroVerticalTextRows(element, width, foreground, background, height);
    return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>${content}</g>`;
  }

  const naturalWidth =
    element.type === 'facility' || element.type === 'arrow'
      ? 85
      : Math.max(resolveMetroWayfindingElementWidth(element), 1);
  const availableWidth = Math.max(width - METRO_WAYFINDING_PADDING * 2, 1);
  const usesRowWidthCompression = element.type === 'text';
  const contentWidth = usesRowWidthCompression
    ? Math.min(naturalWidth, availableWidth)
    : naturalWidth;
  const scaleX = usesRowWidthCompression ? 1 : Math.min(1, availableWidth / naturalWidth);
  const displayWidth = contentWidth * scaleX;
  const x = (width - displayWidth) / 2;
  const centeredElement =
    element.type === 'text' ? { ...element, align: 'center' as const } : element;
  const content = renderMetroWayfindingElement(
    centeredElement,
    x,
    contentWidth,
    layout,
    scaleX,
    1,
    assets,
    element.type === 'text',
    contentHeight,
    element.type === 'facility' || element.type === 'arrow' ? -21.5 : 0,
  );
  return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>${content}</g>`;
}

function renderMetroWayfindingRow(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  elements: MetroWayfindingElement[],
  width: number,
  rowIndex: number,
  assets: MetroWayfindingSvgAssets,
  padding: { start: number; end: number },
): string {
  const sizing = resolveMetroWayfindingLayoutSizing(elements, width, padding);
  const contentWidth = Math.max(0, width - padding.start - padding.end);
  let cursor = padding.start + (contentWidth - sizing.totalDisplayWidth) / 2;
  const contentStart = cursor;
  const contentEnd = contentStart + sizing.totalDisplayWidth;
  const backgroundColor = normalizeColor(layout.backgroundColor, '#262626');
  const firstElementBackground = elements[0]
    ? resolveMetroElementBackground(elements[0], layout)
    : backgroundColor;
  const lastElement = elements.at(-1);
  const lastElementBackground = lastElement
    ? resolveMetroElementBackground(lastElement, layout)
    : backgroundColor;
  const edgeBackgrounds = [
    firstElementBackground !== backgroundColor
      ? `<rect width="${formatNumber(Math.max(contentStart, 0))}" height="128" fill="${firstElementBackground}"/>`
      : '',
    lastElementBackground !== backgroundColor
      ? `<rect x="${formatNumber(contentEnd)}" width="${formatNumber(Math.max(width - contentEnd, 0))}" height="128" fill="${lastElementBackground}"/>`
      : '',
  ].join('');
  const children = elements.map((element, index) => {
    const intrinsicElementWidth =
      element.type === 'space' && element.mode === 'flex'
        ? sizing.flexWidth
        : sizing.elementWidths[index]!;
    const elementWidth =
      element.type === 'text' ? intrinsicElementWidth * sizing.textScaleX : intrinsicElementWidth;
    const isFramedLargeText = element.type === 'largeText' && element.frameShape !== 'none';
    const elementScaleX = isFramedLargeText
      ? 1
      : sizing.layoutScale *
        (element.type === 'largeText' || element.type === 'combination' ? sizing.textScaleX : 1);
    const elementScaleY = isFramedLargeText ? 1 : sizing.layoutScale;
    const displayWidth = elementWidth * elementScaleX;
    const output = renderMetroWayfindingElement(
      element,
      cursor,
      elementWidth,
      layout,
      elementScaleX,
      elementScaleY,
      assets,
    );
    const nextElement = elements[index + 1];
    const gap = nextElement
      ? renderMetroWayfindingGap(
          element,
          nextElement,
          cursor + displayWidth,
          layout,
          sizing.layoutScale,
        )
      : '';
    cursor +=
      displayWidth + (index < elements.length - 1 ? METRO_WAYFINDING_GAP * sizing.layoutScale : 0);
    return `${output}${gap}`;
  });
  return `<g transform="translate(0 ${rowIndex * METRO_WAYFINDING_HEIGHT})" data-metro-wayfinding-row="${rowIndex + 1}"><rect width="${formatNumber(width)}" height="128" fill="${backgroundColor}"/>${edgeBackgrounds}${children.join('')}</g>`;
}

function renderMetroWayfindingGap(
  leftElement: MetroWayfindingElement,
  rightElement: MetroWayfindingElement,
  x: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scale: number,
): string {
  const leftBackground = resolveMetroElementBackground(leftElement, layout);
  const rightBackground = resolveMetroElementBackground(rightElement, layout);
  if (leftBackground !== rightBackground) {
    return '';
  }
  return `<rect x="${formatNumber(x)}" width="${formatNumber(METRO_WAYFINDING_GAP * scale)}" height="${formatNumber(METRO_WAYFINDING_HEIGHT * scale)}" fill="${leftBackground}"/>`;
}

function resolveMetroElementBackground(
  element: MetroWayfindingElement,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
): string {
  return normalizeColor(element.backgroundColor, layout.backgroundColor);
}

function renderMetroWayfindingElement(
  element: MetroWayfindingElement,
  x: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scaleX: number,
  scaleY: number,
  assets: MetroWayfindingSvgAssets,
  textTopAligned = false,
  elementHeight = METRO_WAYFINDING_HEIGHT,
  iconOffsetY = 0,
  suppressInheritedBackground = false,
): string {
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  const background = normalizeColor(element.backgroundColor, layout.backgroundColor);
  const backgroundRect =
    suppressInheritedBackground && element.backgroundColor === undefined
      ? ''
      : `<rect width="${formatNumber(width)}" height="${formatNumber(elementHeight)}" fill="${background}"/>`;
  const uniformFramedLargeTextScale =
    element.type === 'largeText' &&
    element.frameShape !== 'none' &&
    Math.abs(scaleX - scaleY) < 0.0001
      ? scaleY
      : 1;
  const uniformScaleOffsetY =
    uniformFramedLargeTextScale < 1
      ? (elementHeight - elementHeight * uniformFramedLargeTextScale) / 2
      : 0;
  const transform = `translate(${formatNumber(x)} ${formatNumber(uniformScaleOffsetY)}) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})`;
  if (element.type === 'space') {
    return suppressInheritedBackground && element.backgroundColor === undefined
      ? ''
      : `<rect x="${formatNumber(x)}" width="${formatNumber(width * scaleX)}" height="${formatNumber(elementHeight)}" fill="${background}"/>`;
  }
  if (element.type === 'divider') {
    return `<g><rect x="${formatNumber(x)}" width="${formatNumber(METRO_WAYFINDING_DIVIDER_WIDTH * scaleX)}" height="128" fill="${background}"/><rect x="${formatNumber(x)}" y="28" width="${formatNumber(METRO_WAYFINDING_DIVIDER_WIDTH * scaleX)}" height="72" fill="${foreground}"/></g>`;
  }
  if (element.type === 'facility' || element.type === 'arrow') {
    const hasFrame = element.type === 'arrow' ? element.framed : element.frameShape !== 'none';
    const frameFillColor =
      element.frameFillMode === 'color'
        ? normalizeColor(element.frameFillColor, foreground)
        : foreground;
    const graphicForeground =
      hasFrame && element.frameFillMode === 'inverse' ? background : foreground;
    const icon =
      metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingIconOptions[0]!;
    const graphic =
      element.type === 'arrow'
        ? element.style === 'classic'
          ? renderMetroClassicArrow(
              element.iconId,
              graphicForeground,
              element.id,
              element.framed,
              element.frameFillMode,
              frameFillColor,
              element.frameStroke,
              assets,
            )
          : renderMetroArrowAsset(
              resolveMetroArrowIconAssetName(element.iconId) ?? 'south-west',
              graphicForeground,
              element.id,
              element.framed,
              element.frameFillMode,
              frameFillColor,
              element.frameStroke,
              assets,
            )
        : renderMetroIcon(
            icon.symbol,
            icon.id,
            graphicForeground,
            element.id,
            assets,
            element.direction,
            element.frameShape,
            element.frameFillMode,
            frameFillColor,
            element.frameStroke,
            element.variant,
          );
    const dataAttribute =
      element.type === 'arrow'
        ? `data-metro-arrow="${escapeXml(element.iconId)}"`
        : `data-material-symbol="${escapeXml(icon.symbol)}"`;
    const iconScaleFactor = resolveMetroWayfindingIconScaleFactor(element.scale);
    const positionedGraphic =
      Math.abs(iconScaleFactor - 1) < 0.0001 && Math.abs(elementHeight / 2 - 64) < 0.0001
        ? graphic
        : `<g transform="translate(${formatNumber(width / 2 - 42.5 * iconScaleFactor)} ${formatNumber(
            elementHeight / 2 - 64 * iconScaleFactor,
          )}) scale(${formatNumber(iconScaleFactor)})">${graphic}</g>`;
    return `<g transform="${transform}" ${dataAttribute}>${backgroundRect}${positionedGraphic}</g>`;
  }
  if (element.type === 'largeText') {
    const frameFillColor =
      element.frameFillMode === 'color'
        ? normalizeColor(element.frameFillColor, foreground)
        : foreground;
    const contentColor =
      element.frameShape !== 'none' && element.frameFillMode === 'inverse'
        ? background
        : foreground;
    const text = renderMetroLargeText(element, width, contentColor, elementHeight);
    const frame = renderMetroLargeTextFrame(
      element.frameShape,
      width,
      foreground,
      element.frameFillMode,
      frameFillColor,
      elementHeight,
      element.frameStroke,
    );
    return `<g transform="${transform}">${backgroundRect}${frame}${text}</g>`;
  }
  if (element.type === 'combination') {
    return renderMetroWayfindingCombination(
      element,
      x,
      width,
      layout,
      scaleX,
      scaleY,
      elementHeight,
      assets,
    );
  }
  const textAlign =
    element.align === 'left' ? 'start' : element.align === 'right' ? 'end' : 'middle';
  const textX = element.align === 'left' ? 0 : element.align === 'right' ? width : width / 2;
  const rows = renderMetroTextRows(
    element,
    width,
    foreground,
    background,
    textX,
    textAlign,
    textTopAligned,
    elementHeight,
  );
  return `<g transform="${transform}">${backgroundRect}${rows}</g>`;
}

function renderMetroWayfindingCombination(
  element: MetroWayfindingCombinationElement,
  x: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scaleX: number,
  scaleY: number,
  elementHeight: number,
  assets: MetroWayfindingSvgAssets,
): string {
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  const background = normalizeColor(element.backgroundColor, layout.backgroundColor);
  const fillColor = normalizeColor(element.frameFillColor, foreground);
  const frameBackground =
    element.frameFillMode === 'inverse'
      ? foreground
      : element.frameFillMode === 'color'
        ? fillColor
        : background;
  const contentColor = element.frameFillMode === 'inverse' ? background : foreground;
  const childLayout = {
    ...layout,
    backgroundColor: frameBackground,
    foregroundColor: contentColor,
  };
  const combinationScale = Math.max(0.25, Math.min(1, element.scale));
  const sizing = resolveMetroWayfindingCombinationSizing(element, width / combinationScale);
  const baseWidth = sizing.width;
  const baseHeight = METRO_WAYFINDING_HEIGHT;
  // 上下边距减半，左右仍保留 8；组合框外框高度（128 × scale）不变。
  const childHeight = baseHeight - METRO_WAYFINDING_COMBINATION_VERTICAL_PADDING * 2;
  const childY = METRO_WAYFINDING_COMBINATION_VERTICAL_PADDING;
  const combinationY = Math.max(0, (elementHeight - baseHeight * combinationScale) / 2);
  const hasFlexibleSpace = element.children.some(
    (child) => child.type === 'space' && child.mode === 'flex',
  );
  let cursor =
    sizing.contentX +
    (hasFlexibleSpace ? 0 : Math.max(0, sizing.contentWidth - sizing.totalDisplayWidth) / 2);
  const children = element.children.map((child, index) => {
    const intrinsicWidth =
      child.type === 'space' && child.mode === 'flex'
        ? sizing.flexWidth
        : sizing.elementWidths[index]!;
    const childWidth = child.type === 'text' ? intrinsicWidth * sizing.textScaleX : intrinsicWidth;
    const childScaleX =
      sizing.layoutScale *
      (child.type === 'text' || child.type === 'largeText' ? sizing.textScaleX : 1);
    const displayWidth = childWidth * childScaleX;
    const output = renderMetroWayfindingElement(
      child,
      cursor,
      childWidth,
      childLayout,
      childScaleX,
      1,
      assets,
      false,
      childHeight,
      0,
      true,
    );
    cursor +=
      displayWidth +
      (index < element.children.length - 1
        ? METRO_WAYFINDING_COMBINATION_GAP * sizing.layoutScale
        : 0);
    return output;
  });
  const totalScaleX = Math.max(Math.abs(scaleX * combinationScale), Number.EPSILON);
  const totalScaleY = Math.max(Math.abs(scaleY * combinationScale), Number.EPSILON);
  const fillRadiusX = 10 / totalScaleX;
  const fillRadiusY = 10 / totalScaleY;
  const outlineRadiusX = 8.5 / totalScaleX;
  const outlineRadiusY = 8.5 / totalScaleY;
  const frame =
    element.frameFillMode === 'inverse' || element.frameFillMode === 'color'
      ? `<rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" rx="${formatNumber(fillRadiusX)}" ry="${formatNumber(fillRadiusY)}" fill="${frameBackground}"/>`
      : '';
  const shouldStroke = element.frameStroke;
  const outline = shouldStroke
    ? `<rect x="1.5" y="1.5" width="${formatNumber(Math.max(baseWidth - 3, 0))}" height="${formatNumber(baseHeight - 3)}" rx="${formatNumber(outlineRadiusX)}" ry="${formatNumber(outlineRadiusY)}" fill="none" stroke="${foreground}" stroke-width="3"/>`
    : '';
  const stripe =
    element.frameFillMode === 'stripe'
      ? element.stripePosition === 'bottom'
        ? `<rect y="${formatNumber(baseHeight - METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH)}" width="${formatNumber(baseWidth)}" height="${METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH}" fill="${fillColor}"/>`
        : `<rect x="${formatNumber(element.stripePosition === 'right' ? baseWidth - METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH : 0)}" y="${METRO_WAYFINDING_COMBINATION_STRIPE_TOP}" width="${METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH}" height="${formatNumber(baseHeight - METRO_WAYFINDING_COMBINATION_STRIPE_TOP)}" fill="${fillColor}"/>`
      : '';
  const clipId = `metro-combination-clip-${element.id}`;
  const roundedBackdrop = `<defs><clipPath id="${escapeXml(clipId)}"><rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" rx="${formatNumber(fillRadiusX)}" ry="${formatNumber(fillRadiusY)}"/></clipPath></defs><g clip-path="url(#${escapeXml(clipId)})"><rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" fill="${background}"/>${frame}${stripe}</g>`;
  const squareBackdrop = `<rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" fill="${background}"/>${frame}${stripe}`;
  const backdrop =
    element.frameFillMode === 'none' || element.frameFillMode === 'stripe'
      ? squareBackdrop
      : roundedBackdrop;
  const transform = `translate(${formatNumber(x)} ${formatNumber(combinationY)}) scale(${formatNumber(scaleX * combinationScale)} ${formatNumber(scaleY * combinationScale)})`;
  return `<g transform="${transform}">${backdrop}<g transform="translate(0 ${formatNumber(childY)})">${children.join('')}</g>${outline}</g>`;
}

function renderMetroVerticalTextRows(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  color: string,
  background: string,
  maxHeight = Number.POSITIVE_INFINITY,
): string {
  const rows = element.rows.filter(hasMetroWayfindingTextRowContent);
  if (rows.length === 0) {
    return '';
  }
  const metrics = resolveMetroWayfindingTextMetrics(rows, element.scale);
  const columns = rows.map((row) => ({
    row,
    fontSize: row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize,
    height:
      row.kind === 'main'
        ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
        : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  }));
  const contentWidth =
    columns.reduce((total, column) => total + column.fontSize, 0) +
    Math.max(columns.length - 1, 0) * metrics.spacing;
  const availableWidth = Math.max(width - METRO_WAYFINDING_PADDING * 2, 1);
  const scaleX = contentWidth > 0 ? Math.min(1, availableWidth / contentWidth) : 1;
  const contentX = (width - contentWidth * scaleX) / 2;
  let cursorRight = contentWidth;
  const markup = columns
    .map(({ row, fontSize, height }) => {
      const x = cursorRight - fontSize / 2;
      cursorRight -= fontSize + metrics.spacing;
      const columnMarkup =
        row.kind === 'main'
          ? renderMetroVerticalMainSegments(row.segments, fontSize, color, background, x)
          : renderMetroVerticalTextRun(row.value, fontSize, color, x, 0, 400);
      const columnScaleY = height > maxHeight && height > 0 ? maxHeight / height : 1;
      return `<g transform="scale(1 ${formatNumber(columnScaleY)})">${columnMarkup}</g>`;
    })
    .join('');
  return `<g transform="translate(${formatNumber(contentX)} 0) scale(${formatNumber(scaleX)} 1)">${markup}</g>`;
}

function renderMetroVerticalMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
  color: string,
  background: string,
  x: number,
): string {
  const segmentGap = fontSize * 0.12;
  let cursorY = 0;
  return segments
    .map((segment, index) => {
      const trailingGap = index < segments.length - 1 ? segmentGap : 0;
      if (segment.kind === 'line') {
        const diameter = fontSize * 1.12;
        const centerY = cursorY + diameter / 2;
        const lineColor = normalizeColor(segment.color, '#2F80ED');
        const shouldInvert = lineColor.toUpperCase() === background.toUpperCase();
        const badgeBackground = shouldInvert ? color : lineColor;
        const badgeForeground = shouldInvert ? lineColor : '#FFFFFF';
        const output = `<g transform="translate(${formatNumber(x)} ${formatNumber(centerY)})"><circle r="${formatNumber(diameter / 2)}" fill="${badgeBackground}"/><text x="${formatNumber(fontSize * -0.035)}" y="${formatNumber(fontSize * 0.9 * 0.34)}" transform="rotate(90)" fill="${badgeForeground}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize * 0.9)}" font-weight="400" text-anchor="middle" letter-spacing="${formatNumber(fontSize * -0.07)}" data-yct-spacing="glyph-middle">${escapeXml(segment.value)}</text></g>`;
        cursorY += diameter + trailingGap;
        return output;
      }
      const textHeight = estimateMetroWayfindingTextWidth(segment.value, fontSize);
      const verticalPadding = segment.kind === 'boxed' ? fontSize * 0.16 : 0;
      const segmentHeight =
        segment.kind === 'boxed'
          ? Math.max(fontSize * 1.05, textHeight + verticalPadding * 2)
          : textHeight;
      const textY = cursorY + (segmentHeight - textHeight) / 2;
      const frame =
        segment.kind === 'boxed'
          ? `<rect x="${formatNumber(x - fontSize * 0.525)}" y="${formatNumber(cursorY + fontSize * 0.02)}" width="${formatNumber(fontSize * 1.05)}" height="${formatNumber(segmentHeight - fontSize * 0.04)}" rx="${formatNumber(fontSize * 0.11)}" fill="none" stroke="${color}" stroke-width="${formatNumber(Math.max(1, fontSize * 0.04))}"/>`
          : '';
      const output = `${frame}${renderMetroVerticalTextRun(segment.value, fontSize, color, x, textY)}`;
      cursorY += segmentHeight + trailingGap;
      return output;
    })
    .join('');
}

function renderMetroVerticalTextRun(
  value: string,
  fontSize: number,
  color: string,
  x: number,
  startY: number,
  fontWeight: 400 | 700 = 400,
): string {
  let cursorY = startY;
  return Array.from(value)
    .map((character) => {
      const shouldRotate = /[A-Za-z0-9]/u.test(character);
      const advance = estimateMetroWayfindingTextWidth(character, fontSize);
      const output = /\s/u.test(character)
        ? ''
        : shouldRotate
          ? `<text transform="translate(${formatNumber(x - fontSize * 0.3)} ${formatNumber(cursorY)}) rotate(90)" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}">${escapeXml(character)}</text>`
          : `<text x="${formatNumber(x)}" y="${formatNumber(cursorY + fontSize * 0.82)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}" text-anchor="middle">${escapeXml(character)}</text>`;
      cursorY += advance;
      return output;
    })
    .join('');
}

function renderMetroTextRows(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  color: string,
  background: string,
  textX: number,
  textAnchor: string,
  topAligned = false,
  elementHeight = METRO_WAYFINDING_HEIGHT,
): string {
  const rows = topAligned ? element.rows.filter(hasMetroWayfindingTextRowContent) : element.rows;
  if (rows.length === 0) {
    return '';
  }
  const visibleElement = rows.length === element.rows.length ? element : { ...element, rows };
  const metrics = resolveMetroWayfindingTextMetrics(rows, element.scale);
  const rowScales = resolveMetroTextRowScales(visibleElement, width, metrics);
  const blockHeight = rows.reduce(
    (height, row, index) =>
      height +
      (row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize) +
      (index < rows.length - 1 ? metrics.spacing : 0),
    0,
  );
  let rowTop = topAligned ? 0 : Math.max(0, (elementHeight - blockHeight) / 2 + metrics.spacing);
  return rows
    .map((row, index) => {
      const fontSize = row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize;
      const baseline = rowTop + fontSize * 0.82;
      const output =
        row.kind === 'main'
          ? renderMetroMainSegments(
              row.segments,
              fontSize,
              color,
              background,
              textX,
              textAnchor,
              baseline,
              rowScales[index] ?? 1,
            )
          : renderMetroText(
              row.value,
              fontSize,
              width,
              color,
              textAnchor,
              textX,
              baseline,
              rowScales[index] ?? 1,
              400,
            );
      rowTop += fontSize + (index < rows.length - 1 ? metrics.spacing : 0);
      return output;
    })
    .join('');
}

function renderMetroMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
  color: string,
  background: string,
  textX: number,
  textAnchor: string,
  baseline: number,
  contentScale: number,
): string {
  const totalWidth = measureMetroWayfindingMainSegments(segments, fontSize);
  const renderedWidth = totalWidth * contentScale;
  const segmentGap = fontSize * 0.12;
  const startX =
    textAnchor === 'start'
      ? textX
      : textAnchor === 'end'
        ? textX - renderedWidth
        : textX - renderedWidth / 2;
  let cursor = 0;
  const content = segments
    .map((segment, index) => {
      const trailingGap = index < segments.length - 1 ? segmentGap : 0;
      if (segment.kind === 'line') {
        const diameter = fontSize * 1.12;
        const centerX = cursor + diameter / 2;
        const lineColor = normalizeColor(segment.color, '#2F80ED');
        const shouldInvert = lineColor.toUpperCase() === background.toUpperCase();
        const badgeBackground = shouldInvert ? color : lineColor;
        const badgeForeground = shouldInvert ? lineColor : '#FFFFFF';
        cursor += diameter + trailingGap;
        return `<g transform="translate(${formatNumber(centerX)} ${formatNumber(baseline - fontSize * 0.32)})"><circle r="${formatNumber(diameter / 2)}" fill="${badgeBackground}"/><text x="${formatNumber(fontSize * -0.035)}" y="${formatNumber(fontSize * 0.9 * 0.34)}" fill="${badgeForeground}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize * 0.9)}" font-weight="400" text-anchor="middle" letter-spacing="${formatNumber(fontSize * -0.07)}" data-yct-spacing="glyph-middle">${escapeXml(segment.value)}</text></g>`;
      }
      const textWidth = estimateMetroWayfindingTextWidth(segment.value, fontSize);
      const horizontalPadding = segment.kind === 'boxed' ? fontSize * 0.16 : 0;
      const segmentWidth =
        segment.kind === 'boxed'
          ? Math.max(fontSize * 1.05, textWidth + horizontalPadding * 2)
          : textWidth;
      const textX = cursor + (segmentWidth - textWidth) / 2;
      const frame =
        segment.kind === 'boxed'
          ? `<rect x="${formatNumber(cursor + fontSize * 0.02)}" y="${formatNumber(baseline - fontSize * 0.84)}" width="${formatNumber(segmentWidth - fontSize * 0.04)}" height="${formatNumber(fontSize * 1.05)}" rx="${formatNumber(fontSize * 0.11)}" fill="none" stroke="${color}" stroke-width="${formatNumber(Math.max(1, fontSize * 0.04))}"/>`
          : '';
      const output = `${frame}<text x="${formatNumber(textX)}" y="${formatNumber(baseline)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="400">${escapeXml(segment.value)}</text>`;
      cursor += segmentWidth + trailingGap;
      return output;
    })
    .join('');
  return `<g transform="translate(${formatNumber(startX)} 0) scale(${formatNumber(contentScale)} 1)">${content}</g>`;
}

function renderMetroText(
  value: string,
  fontSize: number,
  width: number,
  color: string,
  textAnchor: string,
  x = width / 2,
  y = 0,
  scale = 1,
  fontWeight: 400 | 700 = 400,
): string {
  return `<g transform="translate(${formatNumber(x)} 0) scale(${formatNumber(scale)} 1) translate(-${formatNumber(x)} 0)"><text x="${formatNumber(x)}" y="${formatNumber(y || fontSize)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}" text-anchor="${textAnchor}">${escapeXml(value)}</text></g>`;
}

function resolveMetroTextRowScales(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  metrics: ReturnType<typeof resolveMetroWayfindingTextMetrics>,
): number[] {
  const rowWidths = element.rows.map((row) =>
    row.kind === 'main'
      ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
      : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  );
  const scales = element.rows.map(() => 1);
  let groupStart = 0;

  while (groupStart < element.rows.length) {
    const kind = element.rows[groupStart]!.kind;
    let groupEnd = groupStart + 1;
    while (groupEnd < element.rows.length && element.rows[groupEnd]!.kind === kind) {
      groupEnd += 1;
    }
    const groupWidth = Math.max(...rowWidths.slice(groupStart, groupEnd), 0);
    const groupScale = groupWidth > width && groupWidth > 0 ? width / groupWidth : 1;
    scales.fill(groupScale, groupStart, groupEnd);
    groupStart = groupEnd;
  }

  return scales;
}

/**
 * 大文本渲染：正文与**任意位置**的下角标交替排版。
 *
 * `dy` 是相对位移且会累积，所以进入下角标时 +13 下沉、离开时 -13 回到基线；
 * 相邻两个角标之间不再重复下沉。`dx` 只在「正文 ↔ 角标」交界处补 3px 间距。
 */
function renderMetroLargeText(
  element: MetroWayfindingLargeTextElement,
  width: number,
  color: string,
  height: number,
): string {
  const frameShape = element.frameShape;
  const metricScale = Math.max(0.25, Math.min(4, Number(element.scale) || 1));
  const mainFontSize =
    (frameShape !== 'none'
      ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
      : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE) * metricScale;
  const suffixFontSize = METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE * metricScale;
  const runs = splitMetroLargeTextRuns(element);
  let markup = '';
  let gapTotal = 0;
  let lowered = false;
  runs.forEach((run, index) => {
    const previous = runs[index - 1];
    const next = runs[index + 1];
    if (run.kind === 'suffix') {
      if (previous?.kind === 'text') gapTotal += 3 * metricScale;
      if (next?.kind === 'text') gapTotal += 3 * metricScale;
      const dx = previous?.kind === 'text' ? 3 * metricScale : 0;
      const dy = lowered ? 0 : 13 * metricScale;
      markup += renderMetroLargeTextRuns(run.value, suffixFontSize, 700, dx, dy);
      lowered = true;
      return;
    }
    const dx = previous?.kind === 'suffix' ? 3 * metricScale : 0;
    const dy = lowered ? -13 * metricScale : 0;
    markup += renderMetroLargeTextRuns(run.value, mainFontSize, 400, dx, dy);
    lowered = false;
  });
  const text = `<text x="${formatNumber(width / 2 - gapTotal / 2)}" y="${formatNumber(height / 2)}" fill="${color}" text-anchor="middle" dominant-baseline="central" letter-spacing="0">${markup}</text>`;
  if (frameShape !== 'circle') {
    return text;
  }
  const contentWidth =
    runs.reduce(
      (total, run) =>
        total +
        estimateMetroWayfindingLargeTextWidth(
          run.value,
          run.kind === 'suffix' ? suffixFontSize : mainFontSize,
        ),
      0,
    ) + gapTotal;
  const scaleX = contentWidth > 72 ? 72 / contentWidth : 1;
  return scaleX < 1
    ? `<g transform="translate(${formatNumber(width / 2)} 0) scale(${formatNumber(scaleX)} 1) translate(${formatNumber(-width / 2)} 0)">${text}</g>`
    : text;
}

function renderMetroLargeTextFrame(
  frameShape: MetroWayfindingFrameShape,
  width: number,
  color: string,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  height: number,
  frameStroke: boolean,
): string {
  const usesFill = frameFillMode !== 'none';
  const frameY = (height - METRO_WAYFINDING_TEXT_HEIGHT) / 2;
  if (frameShape === 'rectangle') {
    return usesFill
      ? frameStroke
        ? `<rect x="1.5" y="${formatNumber(frameY + 1.5)}" width="${formatNumber(width - 3)}" height="${formatNumber(METRO_WAYFINDING_TEXT_HEIGHT - 3)}" rx="8.5" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<rect x="0" y="${formatNumber(frameY)}" width="${formatNumber(width)}" height="${METRO_WAYFINDING_TEXT_HEIGHT}" rx="10" fill="${frameFillColor}"/>`
      : `<rect x="1.5" y="${formatNumber(frameY + 1.5)}" width="${formatNumber(width - 3)}" height="${formatNumber(METRO_WAYFINDING_TEXT_HEIGHT - 3)}" rx="8.5" fill="none" stroke="${color}" stroke-width="3"/>`;
  }
  return frameShape === 'circle'
    ? usesFill
      ? frameStroke
        ? `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="41" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="42.5" fill="${frameFillColor}"/>`
      : `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="41" fill="none" stroke="${color}" stroke-width="3"/>`
    : '';
}

function renderMetroLargeTextRuns(
  value: string,
  fontSize: number,
  fontWeight: 400 | 700,
  firstDx = 0,
  firstDy = 0,
): string {
  const runs = Array.from(value).reduce<Array<{ value: string; usesArial: boolean }>>(
    (result, character) => {
      const usesArial = isBasicLatinCharacter(character);
      const previous = result.at(-1);
      if (previous?.usesArial === usesArial) {
        previous.value += character;
      } else {
        result.push({ value: character, usesArial });
      }
      return result;
    },
    [],
  );
  return runs
    .map((run, index) => {
      const offset =
        index === 0 ? ` dx="${formatNumber(firstDx)}" dy="${formatNumber(firstDy)}"` : '';
      const fontFamily = run.usesArial
        ? "Arial, 'HarmonyOS Sans SC', sans-serif"
        : "'HarmonyOS Sans SC', sans-serif";
      return `<tspan${offset} font-family="${fontFamily}" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}">${escapeXml(run.value)}</tspan>`;
    })
    .join('');
}

function renderMetroIcon(
  symbol: string,
  iconId: string,
  color: string,
  instanceId: string,
  assets: MetroWayfindingSvgAssets,
  direction?: 'left' | 'right' | 'up' | 'down',
  frameShape: MetroWayfindingFrameShape = 'none',
  frameFillMode: MetroWayfindingFrameFillMode = 'none',
  frameFillColor = color,
  frameStroke = false,
  variant?: 'two-way' | 'up' | 'down',
): string {
  const assetName = resolveMetroFacilityIconAssetName(iconId, direction, variant);
  if (assetName) {
    const directionTransform = resolveMetroFacilityAssetDirectionTransform(
      iconId,
      direction,
      variant,
    );
    if (frameShape === 'rectangle' && frameFillMode === 'none') {
      return renderMetroFacilityAsset(
        assetName,
        'framed',
        color,
        instanceId,
        assets,
        directionTransform,
      );
    }
    const frame = renderMetroFacilityFrame(
      frameShape,
      color,
      instanceId,
      frameFillMode,
      frameFillColor,
      frameStroke,
      assets,
    );
    const icon = renderMetroFacilityAsset(
      assetName,
      'plain',
      color,
      instanceId,
      assets,
      directionTransform,
      frameShape === 'circle' ? 0.86 : frameShape === 'rectangle' ? 0.9 : 1.1,
    );
    return `${frame}${icon}`;
  }

  const frame = renderMetroFacilityFrame(
    frameShape,
    color,
    instanceId,
    frameFillMode,
    frameFillColor,
    frameStroke,
    assets,
  );
  const { viewBox, content } = assets.getMaterialSymbolMarkup(symbol);
  const transform = resolveMetroIconDirectionTransform(iconId, direction);
  const scaleTransform = resolveMetroIconScaleTransform(
    frameShape === 'rectangle' ? 0.9 : frameShape === 'circle' ? 0.84 : 1,
  );
  return `${frame}<g transform="${transform}"><g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" fill="${color}" aria-hidden="true">${content}</svg></g></g>`;
}

function renderMetroFacilityFrame(
  frameShape: MetroWayfindingFrameShape,
  color: string,
  instanceId: string,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  frameStroke: boolean,
  assets: MetroWayfindingSvgAssets,
): string {
  if (frameShape === 'rectangle') {
    return frameFillMode === 'none'
      ? renderMetroFacilityAsset('frame', 'framed', color, `${instanceId}-frame`, assets)
      : frameStroke
        ? `<rect x="1.5" y="23" width="82" height="82" rx="7" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<rect x="0" y="21.5" width="85" height="85" rx="8.5" fill="${frameFillColor}"/>`;
  }
  return frameShape === 'circle'
    ? frameFillMode === 'none'
      ? `<circle cx="42.5" cy="64" r="41" fill="none" stroke="${color}" stroke-width="3"/>`
      : frameStroke
        ? `<circle cx="42.5" cy="64" r="41" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<circle cx="42.5" cy="64" r="42.5" fill="${frameFillColor}"/>`
    : '';
}

function renderMetroFacilityAsset(
  assetName: MetroFacilityIconAssetName | 'frame',
  variant: 'framed' | 'plain',
  color: string,
  instanceId: string,
  assets: MetroWayfindingSvgAssets,
  transform = '',
  scale = 1,
): string {
  const { viewBox, content } = assets.getMetroFacilityAssetMarkup(assetName, variant);
  const namespacedContent = namespaceMetroFacilityAssetMarkup(
    content,
    `${instanceId}-${variant}-${assetName}`,
  );
  const scaleTransform = resolveMetroIconScaleTransform(scale);
  return `<g transform="${transform}"><g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" color="${color}" fill="${color}" aria-hidden="true">${namespacedContent}</svg></g></g>`;
}

const metroClassicArrowPath =
  'M0.424316 20.8928L20.9401 0.369168L28.7222 0.306091L10.7137 17.6759L41.4243 17.6759L41.4243 23.4632L10.7137 23.4632L28.7222 41.4717L21.0347 41.5032L0.424316 20.8928Z';

const metroClassicArrowAngles: Record<string, number> = {
  west: 0,
  'north-west': 45,
  north: 90,
  'north-east': 135,
  east: 180,
  'south-east': 225,
  south: 270,
  'south-west': 315,
};

/** 旧版箭头只有八方向，直接复用横向线路图方向版式的箭头路径。 */
function renderMetroClassicArrow(
  iconId: string,
  color: string,
  instanceId: string,
  framed: boolean,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  frameStroke: boolean,
  assets: MetroWayfindingSvgAssets,
): string {
  const frame = framed
    ? renderMetroFacilityFrame(
        'rectangle',
        color,
        instanceId,
        frameFillMode,
        frameFillColor,
        frameStroke,
        assets,
      )
    : '';
  const angle = metroClassicArrowAngles[iconId] ?? 0;
  const scaleTransform = resolveMetroIconScaleTransform(framed ? 0.9 : 1);
  return `${frame}<g transform="${scaleTransform}"><g transform="translate(42.5 64) rotate(${angle}) scale(1.4) translate(-20.92 -20.92)"><path d="${metroClassicArrowPath}" fill="${color}"/></g></g>`;
}

function renderMetroArrowAsset(
  assetName: MetroArrowIconAssetName,
  color: string,
  instanceId: string,
  framed: boolean,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  frameStroke: boolean,
  assets: MetroWayfindingSvgAssets,
): string {
  const frame = framed
    ? renderMetroFacilityFrame(
        'rectangle',
        color,
        instanceId,
        frameFillMode,
        frameFillColor,
        frameStroke,
        assets,
      )
    : '';
  const { viewBox, content } = assets.getMetroArrowAssetMarkup(assetName);
  const namespacedContent = namespaceMetroFacilityAssetMarkup(
    content,
    `${instanceId}-arrow-${assetName}`,
  );
  const scaleTransform = resolveMetroIconScaleTransform(framed ? 0.9 : 1);
  return `${frame}<g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" color="${color}" fill="${color}" aria-hidden="true">${namespacedContent}</svg></g>`;
}

function resolveMetroIconScaleTransform(scale: number): string {
  return scale === 1 ? '' : `translate(42.5 64) scale(${scale}) translate(-42.5 -64)`;
}

function resolveMetroFacilityAssetDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
  variant?: 'two-way' | 'up' | 'down',
): string {
  // 楼梯：每个「变种 × 方向」都有独立素材（-right 后缀为朝右版），
  // 翻转已经烘焙在素材自身（双向 / 向上为水平镜像，向下为垂直镜像），因此这里不再叠加变换。
  // 其余声明了 assetNameByDirection 的图标（扶梯 / 轮椅升降机 / 轮椅）素材只有朝右一份，
  // 朝左时靠镜像复用，因此这里继续往下走镜像分支。
  if (iconId === 'stairs' || iconId === 'stairs-down') {
    return '';
  }
  if (iconId === 'escalator' || iconId === 'wheelchair-lift' || iconId === 'wheelchair') {
    const effectiveDirection =
      direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'left';
    // 素材原始朝向为“朝右”，朝左时按图标声明的镜像轴翻转。
    return effectiveDirection === 'left'
      ? resolveMetroFacilityMirrorTransform(iconId, effectiveDirection, variant)
      : '';
  }
  if (iconId !== 'exit') {
    return '';
  }
  const effectiveDirection =
    direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
  if (effectiveDirection === 'left') return 'rotate(-90 42.5 64)';
  if (effectiveDirection === 'up') return '';
  if (effectiveDirection === 'down') return 'rotate(180 42.5 64)';
  return 'rotate(90 42.5 64)';
}

function resolveMetroIconDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): string {
  if (iconId === 'no-entry') {
    return 'rotate(-45 42.5 64)';
  }
  // 声明了 assetNameByDirection 的图标（如楼梯三向）由图形本身决定朝向，不再做镜像。
  if (metroWayfindingIconOptions.find((option) => option.id === iconId)?.assetNameByDirection) {
    return '';
  }
  if (iconId === 'turn-left-up' || iconId === 'turn-left-down') {
    return 'rotate(-90 42.5 64)';
  }
  if (iconId === 'turn-right-up' || iconId === 'turn-right-down') {
    return 'rotate(90 42.5 64)';
  }
  const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(iconId);
  if (!fallbackDirection) {
    return '';
  }
  const effectiveDirection = direction ?? fallbackDirection;
  if (iconId !== 'exit') {
    return effectiveDirection === 'left' ? 'translate(85 0) scale(-1 1)' : '';
  }
  if (effectiveDirection === 'left') return 'translate(85 0) scale(-1 1)';
  if (effectiveDirection === 'up') return 'rotate(-90 42.5 64)';
  if (effectiveDirection === 'down') return 'rotate(90 42.5 64)';
  return '';
}

function namespaceMetroFacilityAssetMarkup(content: string, instanceId: string): string {
  const prefix = instanceId.replace(/[^a-zA-Z0-9_-]/gu, '-');
  const ids = Array.from(content.matchAll(/\bid="([^"]+)"/gu), (match) => match[1]!);
  return ids.reduce(
    (markup, id) =>
      markup
        .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
        .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
        .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`)
        .replaceAll(`xlink:href="#${id}"`, `xlink:href="#${prefix}-${id}"`),
    content,
  );
}

export function formatNumber(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}

export function isBasicLatinCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint <= 0x7e;
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    const entityByCharacter: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entityByCharacter[character];
  });
}
