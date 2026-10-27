/**
 * 用户口语词与站内分类名的映射。
 * 地图数据里只有“产业设施”“餐饮”这类分类名，用户却常说“工厂”“美食”，
 * 问答检索需要把两边对上，才能读到站内已有的地点。
 */
const placeSynonymGroups: Array<{ terms: string[]; targets: string[] }> = [
  { terms: ['工厂', '厂区', '厂房', '车间', '工业'], targets: ['产业设施', 'industry', '厂'] },
  { terms: ['超市', '商店', '便利店', '卖场'], targets: ['商业', 'commerce', '超市'] },
  { terms: ['商场', '购物', '商圈', '街区'], targets: ['商业', 'commerce'] },
  {
    terms: ['美食', '吃的', '饭店', '餐厅', '小吃', '早饭', '早点', '早餐'],
    targets: ['餐饮', 'dining'],
  },
  { terms: ['医院', '诊所', '看病', '卫生所'], targets: ['医疗', 'medical'] },
  { terms: ['学校', '大学', '中学', '小学', '幼儿园'], targets: ['教育', 'education'] },
  { terms: ['公园', '绿地', '草坪'], targets: ['公园绿地', 'park'] },
  { terms: ['景点', '景区', '游玩', '打卡'], targets: ['景点', 'scenery', '展馆', 'museum'] },
  { terms: ['停车', '车位'], targets: ['停车', 'parking'] },
  { terms: ['地铁站', '地铁'], targets: ['地铁站', 'metro-station', '地铁出入口'] },
  { terms: ['公交站', '车站', '站台'], targets: ['公交站', 'bus-stop'] },
  { terms: ['火车站', '铁路'], targets: ['铁路车站', 'railway-station'] },
  { terms: ['机场', '航班'], targets: ['机场', 'airport'] },
  { terms: ['码头', '轮渡', '船'], targets: ['轮渡码头', 'ferry-port'] },
  { terms: ['体育场', '球馆', '运动'], targets: ['体育', 'sports'] },
];

/** 按用户问法补充站内分类名，作为地点检索的额外关键词。 */
export function buildPlaceQueryCandidates(query: string): string[] {
  const normalized = query.toLocaleLowerCase();
  const candidates = new Set<string>();

  for (const group of placeSynonymGroups) {
    const matched = group.terms.some((term) => normalized.includes(term.toLocaleLowerCase()));
    if (!matched) {
      continue;
    }
    for (const target of group.targets) {
      candidates.add(target);
    }
  }

  return [...candidates];
}
