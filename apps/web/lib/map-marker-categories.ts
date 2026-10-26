import type { LocaleCode } from '@yct/contracts';

const categoryNames: Record<string, { zh: string; en: string }> = {
  airport: { zh: '机场', en: 'Airport' },
  'bus-stop': { zh: '公交站', en: 'Bus stop' },
  'coach-station': { zh: '客运站', en: 'Coach station' },
  commerce: { zh: '商业', en: 'Commerce' },
  dining: { zh: '餐饮', en: 'Dining' },
  education: { zh: '教育', en: 'Education' },
  facility: { zh: '设施', en: 'Facility' },
  'ferry-port': { zh: '轮渡码头', en: 'Ferry port' },
  industry: { zh: '产业设施', en: 'Industry' },
  'map-marker': { zh: '地图标记', en: 'Map marker' },
  medical: { zh: '医疗', en: 'Medical' },
  'metro-entrance': { zh: '地铁出入口', en: 'Metro entrance' },
  'metro-station': { zh: '地铁站', en: 'Metro station' },
  museum: { zh: '展馆', en: 'Museum' },
  park: { zh: '公园绿地', en: 'Park' },
  parking: { zh: '停车', en: 'Parking' },
  player: { zh: '玩家', en: 'Player' },
  'public-service': { zh: '公共服务', en: 'Public service' },
  railway: { zh: '铁路', en: 'Railway' },
  'railway-station': { zh: '铁路车站', en: 'Railway station' },
  residence: { zh: '居住区', en: 'Residential' },
  road: { zh: '道路', en: 'Road' },
  scenery: { zh: '景点', en: 'Scenery' },
  sports: { zh: '体育', en: 'Sports' },
  'tram-station': { zh: '有轨电车站', en: 'Tram stop' },
  'transit-line': { zh: '线路', en: 'Transit line' },
  water: { zh: '水域', en: 'Water' },
};

/** 把地图标记的 categoryId 转成可识别的分类名；优先使用后台配置的名称。 */
export function getMarkerCategoryLabel(
  categoryId: string | undefined,
  names: Map<string, string> | undefined,
  locale: LocaleCode,
): string | undefined {
  if (!categoryId) {
    return undefined;
  }

  const configured = names?.get(categoryId)?.trim();
  if (configured && configured !== categoryId) {
    return configured;
  }

  const fallback = categoryNames[categoryId];
  if (fallback) {
    return locale === 'en' ? fallback.en : fallback.zh;
  }

  return configured || categoryId;
}
