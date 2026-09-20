/**
 * 文本补全：根据用户已输入的尾部片段，在候选词库里找最合适的一条续写。
 *
 * 候选词库本身只有「裸名」（如站名「人民广场」），但导视牌上常见的是
 * 「人民广场站」「人民广场地铁站」。因此这里在匹配时会给候选**派生后缀变体**，
 * 让「人民广场地」能续写为「人民广场地铁站」。
 */

/** 站点类后缀：按「更具体 → 更通用」排序，取第一个能续写的。 */
const SUGGESTION_STATION_SUFFIXES = ['地铁站', '站'] as const;

/**
 * 归一化：全角转半角、去首尾空白、统一小写，便于跨写法比较。
 *
 * 注意：**不去掉内部空格**。此函数的返回值与原始文本做 `slice` 对齐，
 * 去掉空格会让长度错位、补全后缀串位。内部空格由 `matchTextContinuation`
 * 通过逐位置尝试后缀（`for start ...`）自然跳过。
 */
export function normalizeSuggestionText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

/**
 * 由候选词派生出可用于补全的完整写法。
 * 例：「人民广场」→「人民广场地铁站」「人民广场站」「人民广场」。
 * 已带「站」的候选不再重复追加。
 */
export function expandSuggestionVariants(suggestion: string): string[] {
  const trimmed = suggestion.trim();
  if (!trimmed) return [];
  const variants = [trimmed];
  if (!/(站|线|路|机场|码头)$/u.test(trimmed)) {
    for (const suffix of SUGGESTION_STATION_SUFFIXES) {
      variants.push(`${trimmed}${suffix}`);
    }
  }
  return variants;
}

interface SuggestionCandidate {
  /** 原始候选词（用于派生变体）。 */
  source: string;
  /** 允许补全的完整写法。 */
  variant: string;
  /** variant 的归一化结果。 */
  normalized: string;
}

function buildSuggestionCandidates(suggestions: readonly string[]): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    for (const variant of expandSuggestionVariants(suggestion)) {
      const normalized = normalizeSuggestionText(variant);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push({ source: suggestion, variant, normalized });
    }
  }
  return candidates;
}

export interface TextContinuationMatch {
  /** 补全后的整串文本（含用户已输入部分）。 */
  next: string;
  /** 光标处待补的候选词。 */
  candidate: string;
  /** 本次要追加的后缀（展示用）。 */
  suffix: string;
}

/**
 * 找出最合适的补全。返回 undefined 表示无需补全。
 *
 * 匹配策略：从最长的输入后缀开始（`开往人民` 会先试 `开往人民`，再试 `人民`），
 * 命中即用；候选取「后缀最短」的那条，避免把用户输入吃掉太多。
 *
 * 用户输入里的空格不参与匹配（`人民广场 地` 与 `人民广场地` 等价），
 * 但补全追加的文本落到**原始输入**末尾，不破坏用户已敲的空格。
 */
export function matchTextContinuation(
  value: string,
  suggestions: readonly string[] | undefined,
): TextContinuationMatch | undefined {
  if (!value || !suggestions?.length) return undefined;
  const candidates = buildSuggestionCandidates(suggestions);

  for (let start = 0; start < value.length; start += 1) {
    const suffix = value.slice(start);
    // 去掉内部空格后比较；同时算出「去空格版本」比原串短了多少，用于还原追加长度。
    const compactSuffix = suffix.replace(/\s+/gu, '');
    const normalizedSuffix = normalizeSuggestionText(compactSuffix);
    if (!normalizedSuffix) continue;
    const matches = candidates.filter(({ normalized }) => normalized.startsWith(normalizedSuffix));
    if (!matches.length) continue;
    // 用户已经把某个候选完整打完了：不再补全。
    if (matches.some(({ normalized }) => normalized === normalizedSuffix)) return undefined;
    // 取候选词最短的一条：补全幅度最小，最贴近用户意图。
    const best = matches.reduce((left, right) =>
      left.normalized.length <= right.normalized.length ? left : right,
    );
    if (best.normalized.length <= normalizedSuffix.length) continue;
    // 补全只追加候选词尚未输入的部分；用户已敲的空格保留在 value 里不动。
    const addition = best.variant.slice(normalizedSuffix.length);
    return { next: `${value}${addition}`, candidate: best.variant, suffix: addition };
  }
  return undefined;
}

/**
 * 兼容旧接口：返回补全后的整串文本。
 * @deprecated 新代码请用 {@link matchTextContinuation}，以拿候选词与后缀。
 */
export function findTextContinuation(
  value: string,
  suggestions: readonly string[] | undefined,
): string | undefined {
  return matchTextContinuation(value, suggestions)?.next;
}
