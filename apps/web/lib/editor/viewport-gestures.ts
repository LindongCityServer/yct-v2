/**
 * 画布视口手势的纯函数层。
 *
 * 物料工作台的画布统一用同一套 CSS 表达视口：
 *   transform: translate(pan.x, pan.y) scale(zoom);  transform-origin: center
 * 于是内容坐标与屏幕（client）坐标满足
 *   screen = origin + pan + zoom * (content - origin)
 * 其中 origin 是变换元素「未变换」时的布局中心。单指平移、双指捏合 / 移动都在这条
 * 式子上求解，避免每个工作台各写一份容易漂移的缩放公式。
 *
 * 这一层只做数学，不碰 DOM 和 React，方便直接用 node:test 校验。
 */

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportPan {
  x: number;
  y: number;
}

export interface ViewportTransform {
  zoom: number;
  pan: ViewportPan;
}

/** 单指 / 单点拖拽超过多少像素才算手势，避免把轻点当成平移。 */
export const DEFAULT_GESTURE_SLOP = 4;

export function clampViewportZoom(zoom: number, minZoom: number, maxZoom: number): number {
  const safeMin = Math.min(minZoom, maxZoom);
  const safeMax = Math.max(minZoom, maxZoom);
  return Math.min(safeMax, Math.max(safeMin, zoom));
}

export function resolvePointerDistance(from: ViewportPoint, to: ViewportPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function resolvePointerMidpoint(from: ViewportPoint, to: ViewportPoint): ViewportPoint {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/** 光标 / 手指是否已经离开按下位置（超过阈值才算拖拽）。 */
export function hasPointerMoved(
  from: ViewportPoint,
  to: ViewportPoint,
  slop = DEFAULT_GESTURE_SLOP,
): boolean {
  return resolvePointerDistance(from, to) > slop;
}

/**
 * 由「已变换」矩形中心反推布局中心。
 *
 * translate 不改变缩放中心，所以把当前 pan 从变换后的中心减掉即可；这样即便画布
 * 带着缩放 / 平移，也能拿到捏合公式需要的 origin。
 */
export function resolveLayoutCenter(
  transformedCenter: ViewportPoint,
  pan: ViewportPan,
): ViewportPoint {
  return { x: transformedCenter.x - pan.x, y: transformedCenter.y - pan.y };
}

/** 单指 / 单点拖拽：只按起手后的位移平移，缩放保持不变。 */
export function resolvePanViewport(
  startPan: ViewportPan,
  startPoint: ViewportPoint,
  currentPoint: ViewportPoint,
): ViewportPan {
  return {
    x: startPan.x + (currentPoint.x - startPoint.x),
    y: startPan.y + (currentPoint.y - startPoint.y),
  };
}

export interface PinchViewportInput {
  /** 手势开始时的视口。 */
  start: ViewportTransform;
  /** 变换元素未变换时的布局中心（client 坐标）。 */
  layoutCenter: ViewportPoint;
  /** 两指按下时的中点（client 坐标）。 */
  startMidpoint: ViewportPoint;
  /** 两指当前的中点（client 坐标）。 */
  currentMidpoint: ViewportPoint;
  /** 两指按下时的间距，必须大于 0。 */
  startDistance: number;
  /** 两指当前的间距。 */
  currentDistance: number;
  minZoom: number;
  maxZoom: number;
}

/**
 * 双指捏合：缩放按两指间距比变化，并且始终把「起手时两指中点下的内容」钉在
 * 当前两指中点上——所以同一手势既能缩放也能拖动（两指同向滑动就是平移）。
 */
export function resolvePinchViewport(input: PinchViewportInput): ViewportTransform {
  const { start, layoutCenter, startMidpoint, currentMidpoint, minZoom, maxZoom } = input;
  const ratio = input.startDistance > 0 ? input.currentDistance / input.startDistance : 1;
  const zoom = clampViewportZoom(start.zoom * ratio, minZoom, maxZoom);
  // 起手中点下的内容坐标；整个手势期间它必须落回当前中点。
  const anchorX = layoutCenter.x + (startMidpoint.x - layoutCenter.x - start.pan.x) / start.zoom;
  const anchorY = layoutCenter.y + (startMidpoint.y - layoutCenter.y - start.pan.y) / start.zoom;
  return {
    zoom,
    pan: {
      x: currentMidpoint.x - layoutCenter.x - zoom * (anchorX - layoutCenter.x),
      y: currentMidpoint.y - layoutCenter.y - zoom * (anchorY - layoutCenter.y),
    },
  };
}
