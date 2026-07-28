import type { TransitStationDetailSnapshot } from '@yct/contracts';

export function findTransitStationDetail(
  details: readonly TransitStationDetailSnapshot[] | undefined,
  lineName: string | undefined,
  stationName: string | undefined,
): TransitStationDetailSnapshot | undefined {
  if (!details || !lineName || !stationName) {
    return undefined;
  }

  const stationKeys = new Set(getTransitStationNameMatchKeys(stationName));
  return details.find(
    (detail) =>
      normalizeTransitLineName(detail.lineName) === normalizeTransitLineName(lineName) &&
      getTransitStationNameMatchKeys(detail.stationName).some((key) => stationKeys.has(key)),
  );
}

export function getTransitStationNameMatchKeys(value: string): string[] {
  const normalized = normalizeTransitStationName(value);
  if (!normalized) {
    return [];
  }

  const keys = new Set([normalized]);
  const withoutLindongPrefix = normalized.replace(/^临东/u, '');
  if (withoutLindongPrefix) {
    keys.add(withoutLindongPrefix);
  }

  const withoutTransitSuffix = normalized
    .replace(/地铁站$/u, '')
    .replace(/公交枢纽站$/u, '')
    .replace(/公交枢纽$/u, '')
    .replace(/公交站$/u, '')
    .replace(/汽车客运枢纽站$/u, '客运站')
    .replace(/汽车客运站$/u, '客运站')
    .replace(/区客运站$/u, '客运站');
  if (withoutTransitSuffix) {
    keys.add(withoutTransitSuffix);
    keys.add(withoutTransitSuffix.replace(/^临东/u, ''));
  }

  if (normalized.endsWith('客运站')) {
    keys.add(`临东${normalized}`);
    keys.add(normalized.replace(/客运站$/u, ''));
  }

  if (normalized.endsWith('站')) {
    keys.add(normalized.replace(/站$/u, ''));
  }

  return Array.from(keys).filter(Boolean);
}

export function mergeTransitStationDetails(
  storedDetails: readonly TransitStationDetailSnapshot[] | undefined,
  legacyDetails: readonly TransitStationDetailSnapshot[] | undefined,
): TransitStationDetailSnapshot[] {
  const stored = [...(storedDetails ?? [])];
  const storedSourceIds = new Set(stored.map((detail) => detail.sourceId));

  return [
    ...stored,
    ...(legacyDetails ?? []).filter(
      (legacyDetail) =>
        !storedSourceIds.has(legacyDetail.sourceId) &&
        !findTransitStationDetail(stored, legacyDetail.lineName, legacyDetail.stationName),
    ),
  ];
}

function normalizeTransitStationName(value: string): string {
  return value
    .replace(/[|｜]+/gu, '')
    .replace(/[\s\u3000]+/gu, '')
    .trim()
    .toLocaleLowerCase('zh-CN');
}

function normalizeTransitLineName(value: string): string {
  return value
    .replace(/[\s\u3000|｜]+/gu, '')
    .trim()
    .toLocaleLowerCase('zh-CN');
}
