/**
 * 搜索与检索共用的文本归一化：
 * - 去掉竖线分隔符、空格和全角空格；
 * - 统一小写；
 * - 保留中文原字符。
 */
export function normalizeSearchText(value: string): string {
  return value
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('')
    .toLocaleLowerCase()
    .replace(/[\s　]+/g, '');
}

export function buildSearchHaystack(values: Array<string | undefined | null>): string {
  return normalizeSearchText(
    values.filter((value): value is string => Boolean(value && value.trim())).join(' '),
  );
}

export function matchesSearchQuery(haystack: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return false;
  }

  return haystack.includes(normalizedQuery);
}

/**
 * 检索打分：优先整串命中，其次按空格/标点切分并生成中文二元片段。
 * 这样“临东港 班次”这类多词问句不会因为中间有空格而完全检索不到。
 */
export function scoreSearchMatch(haystack: string, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  let score = haystack.includes(normalizedQuery) ? 100 + normalizedQuery.length : 0;
  for (const token of buildSearchTokens(query)) {
    if (haystack.includes(token)) {
      score += token.length * 2 + 1;
    }
  }
  return score;
}

export function buildSearchTokens(query: string): string[] {
  const tokens = new Set<string>();
  const parts = query
    .toLocaleLowerCase()
    .split(/[\s,，。.!！?？、;；:：/\\|()（）[\]【】\-—]+/)
    .filter(Boolean);

  for (const part of parts) {
    const normalizedPart = normalizeSearchText(part);
    if (!normalizedPart) {
      continue;
    }

    if (/^[a-z0-9]+$/.test(normalizedPart)) {
      if (normalizedPart.length >= 2) {
        tokens.add(normalizedPart);
      }
      continue;
    }

    if (normalizedPart.length <= 4) {
      tokens.add(normalizedPart);
    }

    for (let index = 0; index <= normalizedPart.length - 2; index += 1) {
      tokens.add(normalizedPart.slice(index, index + 2));
    }
  }

  for (const stopword of [
    '怎么',
    '如何',
    '为什么',
    '什么',
    '可以',
    '能不能',
    '帮我',
    '我要',
    '想要',
    '请问',
    '明天',
    '今天',
    '现在',
    '一下',
    '怎样',
  ]) {
    tokens.delete(stopword);
  }

  return [...tokens].filter((token) => token.length >= 2);
}
