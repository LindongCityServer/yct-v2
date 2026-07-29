const roadSuffixSource = [
  '环城高速公路',
  '高速公路',
  '快速路',
  '高架路',
  '立交桥',
  '环路',
  '大道',
  '大街',
  '北路',
  '南路',
  '东路',
  '西路',
  '胡同',
  '隧道',
  '街(?!道)',
  '路',
  '巷',
  '弄',
  '道',
].join('|');

const completeRoadNamePattern = new RegExp(
  `^[\\u3400-\\u9fffA-Za-z0-9]+(?:${roadSuffixSource})$`,
  'u',
);
const administrativeDivisionPattern =
  /特别行政区|自治区|自治州|街道办事处|地区|省|市|盟|区|县|旗|镇|乡/gu;

export interface MaterialAddressInformation {
  roadName: string;
  buildingNumber: string;
  buildingSuffix: string;
}

export function parseMaterialAddress(
  value: string,
  roadNameHint?: string,
): MaterialAddressInformation {
  const normalized = value.replace(/[\s\u3000,，]+/gu, '').trim();
  const road = findRoadName(normalized, roadNameHint);
  if (!road) {
    return { roadName: '', buildingNumber: '', buildingSuffix: '' };
  }

  const remainder = normalized.slice(road.endIndex);
  const numberMatch = remainder.match(/^(\d+)((?:-\d+)|[甲乙丙丁戊己庚辛壬癸A-Za-z])?号?/u);
  return {
    roadName: road.name,
    buildingNumber: numberMatch?.[1] ?? '',
    buildingSuffix: numberMatch?.[2] ?? '',
  };
}

function findRoadName(
  value: string,
  roadNameHint?: string,
): { name: string; endIndex: number } | undefined {
  const normalizedHint = roadNameHint?.replace(/[\s\u3000,，]+/gu, '').trim();
  if (normalizedHint) {
    const hintIndex = value.lastIndexOf(normalizedHint);
    if (hintIndex >= 0) {
      return { name: normalizedHint, endIndex: hintIndex + normalizedHint.length };
    }
  }
  const pattern = new RegExp(`[\\u3400-\\u9fffA-Za-z0-9]+(?:${roadSuffixSource})`, 'gu');
  const matches = [...value.matchAll(pattern)];
  if (!matches.length) {
    return undefined;
  }

  const selected =
    matches.find((match) => /^\d/u.test(value.slice((match.index ?? 0) + match[0].length))) ??
    matches.at(-1);
  if (!selected) {
    return undefined;
  }
  return {
    name: stripAdministrativePrefix(selected[0]),
    endIndex: (selected.index ?? 0) + selected[0].length,
  };
}

function stripAdministrativePrefix(value: string): string {
  let roadName = value;
  for (const match of value.matchAll(administrativeDivisionPattern)) {
    const remainder = value.slice((match.index ?? 0) + match[0].length);
    if (completeRoadNamePattern.test(remainder)) {
      roadName = remainder;
    }
  }
  return roadName;
}
