export interface PoiAddressMarkerCandidate {
  id: string;
  label: string;
}

export function findPoiAddressMarkerMatches<TMarker extends PoiAddressMarkerCandidate>(
  address: string,
  markers: TMarker[],
): TMarker[] {
  const normalizedAddress = normalizeAddressText(address);
  if (!normalizedAddress) {
    return [];
  }

  return markers
    .filter((marker) => {
      const label = normalizeAddressText(marker.label);
      return label.length >= 2 && normalizedAddress.includes(label);
    })
    .sort(
      (left, right) =>
        normalizeAddressText(right.label).length - normalizeAddressText(left.label).length ||
        left.label.localeCompare(right.label, 'zh-CN'),
    );
}

export function selectUnambiguousAddressMarker<TMarker extends PoiAddressMarkerCandidate>(
  matches: TMarker[],
): TMarker | undefined {
  const first = matches[0];
  if (!first) {
    return undefined;
  }

  const longestLength = normalizeAddressText(first.label).length;
  return matches.filter((marker) => normalizeAddressText(marker.label).length === longestLength)
    .length === 1
    ? first
    : undefined;
}

export function inferPoiFloorLabel(address: string): string | undefined {
  const normalized = address.normalize('NFKC');
  const codeMatch = /(?:^|[^A-Z0-9])((?:B|F)\d{1,2}|\d{1,2}F)(?=$|[^A-Z0-9])/i.exec(normalized);
  if (codeMatch?.[1]) {
    return codeMatch[1].toUpperCase();
  }

  const basementMatch = /地下\s*([负-]?\d{1,2}|[一二三四五六七八九十两]+)\s*(?:层|楼)/.exec(
    normalized,
  );
  if (basementMatch?.[1]) {
    const number = parseFloorNumber(basementMatch[1]);
    return number ? `B${Math.abs(number)}` : basementMatch[0].replaceAll(/\s/g, '');
  }

  const numberedFloorMatch =
    /(?:^|[^地下])([负-]?\d{1,2}|[一二三四五六七八九十两]+)\s*(?:层|楼)/.exec(normalized);
  if (numberedFloorMatch?.[1]) {
    const number = parseFloorNumber(numberedFloorMatch[1]);
    if (number !== undefined && number !== 0) {
      return number < 0 ? `B${Math.abs(number)}` : `${number}F`;
    }
  }

  return /站厅层|站台层|夹层|地面层/.exec(normalized)?.[0];
}

function normalizeAddressText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replaceAll(/\s+/g, '');
}

function parseFloorNumber(value: string): number | undefined {
  const normalized = value.replace('两', '二').replace('-', '负');
  if (/^负?\d+$/.test(normalized)) {
    const sign = normalized.startsWith('负') ? -1 : 1;
    return sign * Number.parseInt(normalized.replace('负', ''), 10);
  }

  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === '十') {
    return 10;
  }
  if (normalized.includes('十')) {
    const [tensText, unitsText] = normalized.split('十');
    const tens = tensText ? digits[tensText] : 1;
    const units = unitsText ? digits[unitsText] : 0;
    return tens === undefined || units === undefined ? undefined : tens * 10 + units;
  }
  return digits[normalized];
}
