export function roadNameTranslationEntityId(roadName: string): string {
  const normalized = roadName.trim();
  const directId = `road-name:${normalized}`;
  if (directId.length <= 128) {
    return directId;
  }
  return `road-name:${normalized.slice(0, 100)}:${hashRoadName(normalized)}`;
}

function hashRoadName(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
