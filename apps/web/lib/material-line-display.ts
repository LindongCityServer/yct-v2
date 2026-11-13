/**
 * 线路显示名拆分：把「101路区间」拆成编号 101 与后缀 区间。
 * 服务端解析与工作台套用共用同一份规则，避免两边拆法不一致。
 */
export function parseMaterialTransitLineDisplay(lineName: string): {
  number: string;
  suffix: string;
} {
  const normalizedName = lineName.trim();
  const numericPrefixMatch = normalizedName.match(/^([0-9０-９]+)(.+)$/u);
  if (numericPrefixMatch) {
    return { number: numericPrefixMatch[1], suffix: numericPrefixMatch[2] };
  }
  const roadSuffixMatch = normalizedName.match(/^(.*?)(路.*)$/u);
  if (roadSuffixMatch?.[1]?.trim() && roadSuffixMatch[2]) {
    return { number: roadSuffixMatch[1].trim(), suffix: roadSuffixMatch[2] };
  }
  return { number: normalizedName, suffix: '路' };
}

export function getMaterialTransitLineSuffix(lineName: string): string {
  return parseMaterialTransitLineDisplay(lineName).suffix;
}
