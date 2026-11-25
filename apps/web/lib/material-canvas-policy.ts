import type { MaterialCanvasConfig } from '@yct/contracts';
import { parseMetroWayfindingLayout, METRO_WAYFINDING_TEMPLATE_ID } from './metro-wayfinding';
import {
  BUS_STOP_DETAIL_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_TERMINUS_NEW_TEMPLATE_ID,
  METRO_TERMINUS_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_TRANSITION_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  isMetroLineMapVerticalTemplateId,
} from './material-template-ids';

/** 画布最长边上限：导出与预览统一按 4096 px 控制。 */
export const MATERIAL_CANVAS_MAX_LONG_SIDE_PX = 4096;
/** pxPerMeter 的硬上限：最终仍受「最长边 ≤ 4096」约束。 */
export const MATERIAL_CANVAS_MAX_PX_PER_METER = 4096;
export const MATERIAL_CANVAS_MIN_PX_PER_METER = 16;

export interface MaterialCanvasLocks {
  width: boolean;
  height: boolean;
}

const FULLY_LOCKED_TEMPLATE_IDS = new Set([
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_DETAIL_TEMPLATE_ID,
]);

const HEIGHT_LOCKED_TEMPLATE_IDS = new Set([
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_TERMINUS_NEW_TEMPLATE_ID,
  METRO_TERMINUS_OLD_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
]);

/**
 * 模板可调维度：
 * - 公交站牌三种版式（含方块 / 拟真）宽高都固定；
 * - 地铁导视牌单行 / 双行、公交横版线路详情、地铁横版线路图与站台站名标志锁高度（宽度可调）；
 * - 地铁导视牌竖向、地铁竖版线路图锁宽度（高度可调）。
 */
export function resolveMaterialCanvasLocks(input: {
  templateId: string;
  /** 导视牌版式序列化内容；其它模板忽略。 */
  layout?: string;
}): MaterialCanvasLocks {
  if (FULLY_LOCKED_TEMPLATE_IDS.has(input.templateId)) {
    return { width: true, height: true };
  }
  if (input.templateId === METRO_WAYFINDING_TEMPLATE_ID) {
    const isVertical = parseMetroWayfindingLayout(input.layout ?? '').mode === 'vertical';
    return { width: isVertical, height: !isVertical };
  }
  if (isMetroLineMapVerticalTemplateId(input.templateId)) {
    return { width: true, height: false };
  }
  if (HEIGHT_LOCKED_TEMPLATE_IDS.has(input.templateId)) {
    return { width: false, height: true };
  }
  return { width: false, height: false };
}

/** 按当前画布尺寸计算 pxPerMeter 的可用上限：保证对齐取整后最长边仍不超过 4096。 */
export function resolveMaterialMaxPxPerMeter(canvas: MaterialCanvasConfig): number {
  for (
    let pxPerMeter = MATERIAL_CANVAS_MAX_PX_PER_METER;
    pxPerMeter >= MATERIAL_CANVAS_MIN_PX_PER_METER;
    pxPerMeter -= 1
  ) {
    if (resolveMaterialOutputLongSide(canvas, pxPerMeter) <= MATERIAL_CANVAS_MAX_LONG_SIDE_PX) {
      return pxPerMeter;
    }
  }
  return MATERIAL_CANVAS_MIN_PX_PER_METER;
}

export function resolveMaterialOutputLongSide(
  canvas: MaterialCanvasConfig,
  pxPerMeter = canvas.pxPerMeter,
): number {
  return Math.max(
    resolveMaterialOutputSidePx(canvas.widthM, canvas, pxPerMeter),
    resolveMaterialOutputSidePx(canvas.heightM, canvas, pxPerMeter),
  );
}

function resolveMaterialOutputSidePx(
  meters: number,
  canvas: MaterialCanvasConfig,
  pxPerMeter: number,
): number {
  const contentPx = Math.max(1, Math.round(meters * pxPerMeter));
  return canvas.alignToTile
    ? Math.ceil(contentPx / Math.max(1, canvas.tileSizePx)) * Math.max(1, canvas.tileSizePx)
    : contentPx;
}

/** 画布最长边超过 4096 px 时的明确文案；未超限返回 undefined。 */
export function describeMaterialCanvasSizeError(
  canvas: MaterialCanvasConfig,
  pxPerMeter = canvas.pxPerMeter,
): string | undefined {
  const longSide = resolveMaterialOutputLongSide(canvas, pxPerMeter);
  if (longSide <= MATERIAL_CANVAS_MAX_LONG_SIDE_PX) {
    return undefined;
  }
  return `画布最长边不能超过 ${MATERIAL_CANVAS_MAX_LONG_SIDE_PX} 像素（当前 ${longSide} 像素），请降低每米像素数或缩小画布。`;
}

/** 服务端复核：被锁定的维度不允许修改（与模板默认画布比较）。 */
export function describeMaterialCanvasLockError(input: {
  templateId: string;
  defaultCanvas: MaterialCanvasConfig;
  canvas: MaterialCanvasConfig;
  layout?: string;
}): string | undefined {
  const locks = resolveMaterialCanvasLocks({
    templateId: input.templateId,
    layout: input.layout,
  });
  // 导视牌双行版式的高度由版式决定（2 米），不按模板默认画布（1 米）比较。
  const expectedHeightM =
    input.templateId === METRO_WAYFINDING_TEMPLATE_ID &&
    parseMetroWayfindingLayout(input.layout ?? '').mode === 'double'
      ? 2
      : input.defaultCanvas.heightM;
  if (locks.width && !isCloseTo(input.canvas.widthM, input.defaultCanvas.widthM)) {
    return '当前模板的画布宽度固定，不能修改。';
  }
  if (locks.height && !isCloseTo(input.canvas.heightM, expectedHeightM)) {
    return '当前模板的画布高度固定，不能修改。';
  }
  return undefined;
}

function isCloseTo(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}
