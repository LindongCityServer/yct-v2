/**
 * 问一问的结构化界面指令（试点版：地点列表、线路条、班次卡）。
 *
 * 卡片是“文本的替代”：模型只给出要展示的引用编号，
 * 名称、地址、站点、时间都由前端从站内引用里取，避免编造和重复。
 */
export type AssistantUiDirective =
  | { type: 'place_list'; refs: number[] }
  | { type: 'line_strip'; ref: number }
  | { type: 'trip_card'; refs: number[] };

/** 一组地点最多展示 4 条，超过说明该用表格或分段。 */
export const maximumPlaceRefs = 4;
/** 重点班次最多 3 条，完整时刻表交给表格。 */
export const maximumTripRefs = 3;

/** 一个代码块里可能是单条 JSON，也可能是一行一条（JSONL）。 */
export function parseUiBlock(body: string): AssistantUiDirective[] {
  const text = body.trim();
  if (!text) {
    return [];
  }

  const whole = parseUiDirective(text);
  if (whole) {
    return [whole];
  }

  return text
    .split('\n')
    .map((line) => parseUiDirective(line))
    .filter((directive): directive is AssistantUiDirective => directive !== null);
}

/** 校验单条指令；未知类型或参数不合规时返回 null，由渲染层忽略。 */
export function parseUiDirective(raw: string): AssistantUiDirective | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { type?: unknown; refs?: unknown; ref?: unknown };
  if (candidate.type === 'place_list') {
    const refs = normalizeRefs(candidate.refs, maximumPlaceRefs);
    return refs.length > 0 ? { type: 'place_list', refs } : null;
  }
  if (candidate.type === 'trip_card') {
    const refs = normalizeRefs(candidate.refs, maximumTripRefs);
    return refs.length > 0 ? { type: 'trip_card', refs } : null;
  }
  if (candidate.type === 'line_strip') {
    const ref = normalizeRef(candidate.ref);
    return ref === undefined ? null : { type: 'line_strip', ref };
  }

  return null;
}

function normalizeRefs(value: unknown, limit: number): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  for (const item of value) {
    const ref = normalizeRef(item);
    if (ref === undefined || seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    if (seen.size >= limit) {
      break;
    }
  }

  return [...seen];
}

function normalizeRef(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 999) {
    return undefined;
  }
  return numeric;
}
