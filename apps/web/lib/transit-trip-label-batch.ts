/**
 * 班次标签批量生成：既支持“前缀 + 起止 + 位宽”的表单输入，
 * 也支持一行文本（如 `临东01-临东30，临东32`）。
 */

export interface TripLabelBatchResult {
  labels: string[];
  errors: string[];
}

const maximumBatchLabels = 2000;

export function buildTripLabelNumberRange(input: {
  prefix: string;
  start: number;
  end: number;
  width?: number;
}): TripLabelBatchResult {
  const start = Math.trunc(input.start);
  const end = Math.trunc(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0) {
    return { labels: [], errors: ['号段必须是大于等于 0 的整数。'] };
  }
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  if (upper - lower + 1 > maximumBatchLabels) {
    return { labels: [], errors: [`一次最多生成 ${maximumBatchLabels} 个标签。`] };
  }
  const width =
    input.width !== undefined && Number.isFinite(input.width) && input.width >= 0
      ? Math.min(6, Math.trunc(input.width))
      : Math.max(String(lower).length, String(upper).length);
  const prefix = input.prefix.trim();
  const labels: string[] = [];
  for (let value = lower; value <= upper; value += 1) {
    labels.push(`${prefix}${String(value).padStart(width, '0')}`);
  }
  return { labels, errors: [] };
}

export function expandTripLabelBatchText(text: string): TripLabelBatchResult {
  const labels: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const push = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed) || labels.length >= maximumBatchLabels) {
      return;
    }
    seen.add(trimmed);
    labels.push(trimmed);
  };

  for (const segment of text.split(/[\n\r,，、;；]+/u)) {
    const token = segment.trim();
    if (!token) {
      continue;
    }
    const rangeMatch = /^(.*?)(\d+)\s*[-~—–至到]\s*([^\d\s]*?)\s*(\d+)$/u.exec(token);
    if (!rangeMatch) {
      push(token);
      continue;
    }
    const prefix = (rangeMatch[1] ?? '').trim();
    const startText = rangeMatch[2] ?? '';
    const tailPrefix = (rangeMatch[3] ?? '').trim();
    const endText = rangeMatch[4] ?? '';
    const start = Number(startText);
    const end = Number(endText);
    const width = Math.max(startText.length, endText.length);
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    if (upper - lower + 1 > maximumBatchLabels) {
      errors.push(`号段 ${token} 超过 ${maximumBatchLabels} 个标签，已跳过。`);
      continue;
    }
    if (tailPrefix && tailPrefix !== prefix) {
      errors.push(`号段 ${token} 的起始与结束前缀不一致，已按前缀「${prefix}」展开。`);
    }
    for (let value = lower; value <= upper; value += 1) {
      push(`${prefix}${String(value).padStart(width, '0')}`);
    }
  }

  return { labels, errors };
}
