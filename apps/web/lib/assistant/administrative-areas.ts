/**
 * 行政区名（含已改名、已撤并的历史名称）。
 *
 * 用户常常把它们当作“范围”而不是“检索对象”：
 * “临东有什么值得去的地方”问的是景点，不是名字里带“临东”的实体。
 * 检索时如果把这些词当成普通关键词，所有同前缀地点会拿到相同分数，
 * 结果就会退化成“按数据顺序取前几条”。
 */
const administrativeAreaNames = [
  '临东市',
  '宣庆区',
  '语汇区',
  '城海区',
  '铁西区',
  '临西区',
  '北关岭区',
  '南图县',
  '新庄县',
  '兴县',
  '沙泉市',
];

/**
 * 不带行政后缀的简称。
 * “兴”只有一个字，容易误伤普通词，因此不参与简称匹配。
 */
const administrativeAreaShortNames = [
  '临东',
  '宣庆',
  '语汇',
  '城海',
  '铁西',
  '临西',
  '北关岭',
  '南图',
  '新庄',
  '沙泉',
];

/**
 * 只有这些问法才把行政区名当作“范围”剥离。
 * 例如“临东站在哪”不能剥离，否则会把实体名拆坏。
 */
const areaScopeIntentPattern =
  /有什么|有哪些|值得|好玩|好去处|去哪儿|去哪里|去哪玩|去哪逛|逛逛|逛一逛|游玩|游览/;

/**
 * 去掉问句里表示范围的行政区名；不在范围语境时原样返回。
 * 优先使用后台已挂的行政区划名称，内置列表只作为旧名/改名前名称的兜底。
 * 长名优先剥离，避免“临东市”只被剥成“市”。
 */
export function stripAdministrativeAreaScope(query: string, areaNames: string[] = []): string {
  if (!areaScopeIntentPattern.test(query)) {
    return query;
  }

  const fullNames = [...areaNames, ...administrativeAreaNames];
  // 动态名称同样需要简称，“宣庆区”也要能匹配用户口中的“宣庆”。
  const shortNames = [...buildShortNames(areaNames), ...administrativeAreaShortNames];

  let result = query;
  for (const name of [...fullNames, ...shortNames]) {
    result = result.split(name).join(' ');
  }

  return result.replace(/\s+/g, ' ').trim() || query;
}

/** 去掉行政后缀生成简称；单字简称（如“兴”）容易误伤普通词，直接丢弃。 */
function buildShortNames(names: string[]): string[] {
  return names
    .map((name) => name.replace(/(特别行政区|自治县|自治旗|新区|市|区|县|旗)$/u, ''))
    .filter((name) => name.length >= 2);
}
