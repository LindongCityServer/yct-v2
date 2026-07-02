export function normalizeLegacyId(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function buildLegacySourceId(prefix: string, rawId: string, index?: number): string {
  const suffix = normalizeLegacyId(rawId) || `item-${index ?? 0}`;
  const id = index === undefined ? `${prefix}:${suffix}` : `${prefix}:${index}:${suffix}`;
  return id.slice(0, 128);
}
