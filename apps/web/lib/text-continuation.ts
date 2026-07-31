export function findTextContinuation(
  value: string,
  suggestions: readonly string[] | undefined,
): string | undefined {
  if (!value || !suggestions?.length) return undefined;
  const normalizedSuggestions = suggestions.map((suggestion) => ({
    suggestion,
    normalized: normalizeSuggestionText(suggestion),
  }));

  // 优先匹配最长的输入后缀，使“开往人民”也能续写为“开往人民广场”。
  for (let start = 0; start < value.length; start += 1) {
    const suffix = value.slice(start);
    const normalizedSuffix = normalizeSuggestionText(suffix);
    if (!normalizedSuffix) continue;
    const candidates = normalizedSuggestions.filter(({ normalized }) =>
      normalized.startsWith(normalizedSuffix),
    );
    if (candidates.some(({ normalized }) => normalized === normalizedSuffix)) {
      return undefined;
    }
    const candidate = candidates.find(
      ({ normalized }) => normalized.length > normalizedSuffix.length,
    );
    if (candidate) return `${value.slice(0, start)}${candidate.suggestion}`;
  }
  return undefined;
}

function normalizeSuggestionText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}
