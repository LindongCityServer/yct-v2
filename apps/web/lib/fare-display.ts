export function formatFareTextWithoutCurrencyUnit(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const withoutCurrencyUnit = normalized
    .replace(/\s*(?:人民币|CNY|RMB|¥|￥|元)\s*/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return withoutCurrencyUnit || undefined;
}
