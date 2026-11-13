import type { MapGeometry } from '@yct/contracts';

/**
 * 读取任意地图几何的代表坐标（包围盒中心）。
 * 列表筛选、标签绑定与工作台上下文标记共用同一套口径。
 */
export function getGeometryRepresentativeCoordinate(
  geometry: MapGeometry,
): [number, number] | undefined {
  const coordinates =
    geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPoint' || geometry.type === 'LineString'
        ? geometry.coordinates
        : geometry.type === 'Rectangle'
          ? rectangleCoordinates(geometry.bounds)
          : geometry.type === 'MultiRectangle'
            ? geometry.rectangles.flatMap(rectangleCoordinates)
            : geometry.type === 'Polygon'
              ? geometry.coordinates.flat()
              : geometry.coordinates.flat(2);
  if (coordinates.length === 0) return undefined;
  const bounds = coordinates.reduce(
    (current, [x, z]) => ({
      minX: Math.min(current.minX, x),
      maxX: Math.max(current.maxX, x),
      minZ: Math.min(current.minZ, z),
      maxZ: Math.max(current.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

function rectangleCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): Array<[number, number]> {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ];
}
