import type { MapMarkerSnapshot } from '@yct/contracts';

/**
 * 搜索结果跳转地址。
 * 玩家位置不在公开地点快照里，地图按坐标定位；普通地点仍走 marker id。
 */
export function buildMapMarkerHref(marker: MapMarkerSnapshot['markers'][number]): string {
  if (marker.categoryId === 'player' && marker.geometry.type === 'Point') {
    const [x, z] = marker.geometry.coordinates;
    return `/map?x=${x}&z=${z}&label=${encodeURIComponent(marker.label)}`;
  }
  return `/map?marker=${encodeURIComponent(marker.id)}`;
}
