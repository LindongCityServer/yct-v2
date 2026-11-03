import { getCoordinateDistance, type MapCoordinate } from './map-spatial';

export type MapMeasureMode = 'distance' | 'area';

export interface MapMeasureAreaSummary {
  area: number;
  perimeter: number;
}

export type MapMeasureAreaReason =
  'tooFewPoints' | 'duplicatePoint' | 'collinear' | 'selfIntersecting';

export type MapMeasureAreaValidation =
  { valid: true; summary: MapMeasureAreaSummary } | { valid: false; reason: MapMeasureAreaReason };

/** 面积退化阈值：小于该值视为共线或点重合，不再输出误导性面积。 */
const degenerateAreaThreshold = 0.5;
/** 判定重复点的世界坐标距离（格）。 */
const duplicatePointThreshold = 0.01;
const geometryEpsilon = 1e-9;

/** 折线各分段长度，仅相邻点，不含闭合边。 */
export function getMeasureSegmentDistances(points: MapCoordinate[]): number[] {
  return points.slice(1).map((point, index) => getCoordinateDistance(points[index]!, point));
}

/** 闭合多边形周长：相邻点相加，末点回到首点只计一次。 */
export function getMeasurePerimeter(points: MapCoordinate[]): number {
  if (points.length < 2) {
    return 0;
  }

  const closing = getCoordinateDistance(points.at(-1)!, points[0]!);
  return getMeasureSegmentDistances(points).reduce((total, value) => total + value, 0) + closing;
}

/** 鞋带公式面积，顺时针与逆时针取绝对值后一致。 */
export function getMeasureArea(points: MapCoordinate[]): number {
  if (points.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum) / 2;
}

/** 闭合多边形是否自交：跳过共享端点的相邻边，次近邻交叉视为自交。 */
export function isMeasurePolygonSelfIntersecting(points: MapCoordinate[]): boolean {
  const count = points.length;
  if (count < 4) {
    return false;
  }

  for (let first = 0; first < count; first += 1) {
    const firstStart = points[first]!;
    const firstEnd = points[(first + 1) % count]!;
    for (let second = first + 1; second < count; second += 1) {
      if (second === first + 1 || (first === 0 && second === count - 1)) {
        continue;
      }
      const secondStart = points[second]!;
      const secondEnd = points[(second + 1) % count]!;
      if (segmentsCross(firstStart, firstEnd, secondStart, secondEnd)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 面积完成前的统一校验：少于 3 点、重复点、共线/退化、自交都拒绝产出面积。
 * 与边界重合的相邻点不算自交，避免把正常折返的形状误判成无效。
 */
export function validateMeasureArea(points: MapCoordinate[]): MapMeasureAreaValidation {
  if (points.length < 3) {
    return { valid: false, reason: 'tooFewPoints' };
  }
  if (hasDuplicateMeasurePoint(points)) {
    return { valid: false, reason: 'duplicatePoint' };
  }

  const area = getMeasureArea(points);
  // 自交优先于面积阈值判断：对称蝴蝶结的鞋带面积可能为 0，但问题是边界交叉而非共线。
  if (isMeasurePolygonSelfIntersecting(points)) {
    return { valid: false, reason: 'selfIntersecting' };
  }
  if (!Number.isFinite(area) || area < degenerateAreaThreshold) {
    return { valid: false, reason: 'collinear' };
  }

  return { valid: true, summary: { area, perimeter: getMeasurePerimeter(points) } };
}

/** 展示用数值：保留 1 位小数，整数不带“.0”，避免暗示超出手工取点的精度。 */
export function formatMeasureValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1).replace(/\.0$/, '');
}

function hasDuplicateMeasurePoint(points: MapCoordinate[]): boolean {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (getCoordinateDistance(points[first]!, points[second]!) < duplicatePointThreshold) {
        return true;
      }
    }
  }
  return false;
}

function segmentsCross(
  firstStart: MapCoordinate,
  firstEnd: MapCoordinate,
  secondStart: MapCoordinate,
  secondEnd: MapCoordinate,
): boolean {
  const firstDeltaX = firstEnd[0] - firstStart[0];
  const firstDeltaZ = firstEnd[1] - firstStart[1];
  const secondDeltaX = secondEnd[0] - secondStart[0];
  const secondDeltaZ = secondEnd[1] - secondStart[1];
  const denominator = firstDeltaX * secondDeltaZ - firstDeltaZ * secondDeltaX;
  const offsetX = secondStart[0] - firstStart[0];
  const offsetZ = secondStart[1] - firstStart[1];

  if (Math.abs(denominator) <= geometryEpsilon) {
    // 平行：只有真正共线且内部区间重叠才算自交，避免贴边折返被误判。
    if (Math.abs(offsetX * firstDeltaZ - offsetZ * firstDeltaX) > geometryEpsilon) {
      return false;
    }
    const lengthSquared = firstDeltaX * firstDeltaX + firstDeltaZ * firstDeltaZ;
    if (lengthSquared <= geometryEpsilon) {
      return false;
    }
    const secondStartRatio = (offsetX * firstDeltaX + offsetZ * firstDeltaZ) / lengthSquared;
    const secondEndRatio =
      ((secondEnd[0] - firstStart[0]) * firstDeltaX +
        (secondEnd[1] - firstStart[1]) * firstDeltaZ) /
      lengthSquared;
    const overlapStart = Math.max(0, Math.min(secondStartRatio, secondEndRatio));
    const overlapEnd = Math.min(1, Math.max(secondStartRatio, secondEndRatio));
    return overlapEnd - overlapStart > geometryEpsilon;
  }

  const firstRatio = (offsetX * secondDeltaZ - offsetZ * secondDeltaX) / denominator;
  const secondRatio = (offsetX * firstDeltaZ - offsetZ * firstDeltaX) / denominator;
  return (
    firstRatio > geometryEpsilon &&
    firstRatio < 1 - geometryEpsilon &&
    secondRatio > geometryEpsilon &&
    secondRatio < 1 - geometryEpsilon
  );
}
