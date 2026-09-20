import { extractMetroWayfindingLineNumber } from './metro-wayfinding';

/**
 * 线路名 / 线路编号的来源推导。
 *
 * 背景：RMP 项目的存档里，线路只用**颜色**来区分，`lineKey` 形如 `sh2`、`bj1`、`pjl`、
 * `maglevA`——它是绘图工具的内部标识，**不含正式的线路名**。
 *
 * 但 `lineKey` 并非无信息量：它的**字母前缀**是城市/线路代号（`sh` = 上海），
 * **数字部分**就是线路编号（`sh2` → 2 号线）。因此约定：
 *
 *   1. **优先**采信用户在「配置项目线路名称」里填写的正式线路名（`snapshot.lineNames`）；
 *   2. 未配置时，**从 `lineKey` 剥离字母前缀推导默认名称**（`sh2` → `2号线`），
 *      作为编辑面板的**预填值**，交由用户确认或修正；
 *   3. 推导不出编号的（`pjl`、`maglevA`、`jsr`），用线路代号本身做名称
 *      （浦江线在存档里就叫 `pjl`），同样交由用户修正。
 *
 * 关键点：**不能把整个 `lineKey` 当成编号**（`sh2` 展示成「sh2号线」是错的），
 * 但也不该把 `sh2` 整个丢弃——它的 `2` 正是用户需要的编号。
 */

/** 从 `lineKey` 推导出的线路编号信息。 */
export interface MetroWayfindingDerivedLineIdentity {
  /** 推导出的线路编号，如 `2`；无数字部分时为 `undefined`。 */
  lineNumber?: string;
  /**
   * 建议的线路名称（可直接作为编辑面板的预填值）。
   * 有编号时是 `2号线`，无编号时退回线路代号（`pjl`）。
   */
  suggestedName: string;
  /** `lineKey` 里的字母前缀（城市/线路代号），如 `sh`、`bj`；无前缀时为 `undefined`。 */
  prefix?: string;
}

/**
 * 从 RMP 的 `lineKey` 推导线路编号。
 *
 * 规则：拆成「字母前缀 + 数字编号 + 可选字母后缀」，**只保留数字部分**作为编号；
 * 字母前缀是城市代号，必须丢弃。
 *
 * 例：`sh2` → `2`、`sh14` → `14`、`bj1` → `1`、`line:S1` → `S1`、
 * `pjl` → 无编号、`maglevA` → 无编号、`stn_sh2` → 无编号（站点键）。
 */
export function deriveMetroWayfindingLineIdentity(
  lineKey: string,
): MetroWayfindingDerivedLineIdentity {
  const key = lineKey.split(':').at(-1)?.trim() ?? '';
  // 站点键（`stn_xxx` / `stn:xxx`）不是线路，不推导。
  if (!key || /^stn[_:]/iu.test(key)) return { suggestedName: lineKey.trim() };

  // 「字母前缀 + 数字 + 可选字母后缀」：`sh2`、`sh14`、`sh4A`。
  const withPrefix = /^([A-Za-z]+)([0-9]+)([A-Za-z]*)$/u.exec(key);
  if (withPrefix) {
    // 纯字母前缀是**颜色命名习惯的产物**（城市/线路代号），丢弃它取数字：
    //   `sy1` → `1`、`sh2` → `2`、`bj1` → `1`
    //
    // 但若前缀本身带数字之外的语义、且整体是「字母+数字」的正式编号形式
    // （`S1`、`S2`——字母后紧跟数字且前缀很短），则不能削：
    //   `line:S1` → `S1`（S 是线路名的一部分，不是城市代号）
    const prefix = withPrefix[1]!;
    const suffix = withPrefix[3] ?? '';
    // 判定：前缀是**单个大写字母**时视为编号本体（S1 / T2 这类）。
    // 颜色工程键习惯用小写城市码（sy / sh / bj / pjl），不会命中。
    if (prefix.length === 1 && prefix === prefix.toLocaleUpperCase('en-US')) {
      const lineNumber = `${prefix}${withPrefix[2]}${suffix}`;
      return { lineNumber, suggestedName: `${lineNumber}号线` };
    }
    const lineNumber = `${withPrefix[2]}${suffix}`;
    return {
      lineNumber,
      suggestedName: `${lineNumber}号线`,
      prefix: prefix.toLocaleLowerCase('en-US'),
    };
  }

  // 「数字 + 可选字母」：`2`、`4A`——本来就已是编号形态。
  const numericOnly = /^([0-9]+)([A-Za-z]*)$/u.exec(key);
  if (numericOnly) {
    const lineNumber = `${numericOnly[1]}${numericOnly[2]}`;
    return { lineNumber, suggestedName: `${lineNumber}号线` };
  }

  // 纯字母代号（`pjl`、`maglevA`、`jsr`）：无编号，用代号本身做名称。
  return { suggestedName: key, prefix: key.toLocaleLowerCase('en-US') };
}

/**
 * 判断一个字符串是否形如 RMP 颜色工程键（而非正式线路名）。
 *
 * 用途：识别「这个名称只是从 `lineKey` 推导来的占位值」，
 * 从而在 UI 上标记它为待确认，而不是当成用户已确认的线路名。
 *
 * 命中条件：不含中文、不以数字开头、是纯 ASCII 字母数字（无空格/分隔符）。
 * 于是 `sh2`、`pjl`、`maglevA`、`shanghai` 命中；而 `1号线`、`S1线`、`环线`、
 * `Line 1`、`Airport Express` 都不命中。
 */
export function isMetroWayfindingPseudoLineKey(value: string): boolean {
  // 站点键（`stn_xxx` / `stn:xxx`），与 rmp-transit-network 的排除规则保持一致。
  if (/^stn[_:]/iu.test(value)) return true;
  // 含中文 → 一定是给人看的线路名。
  if (/\p{Script=Han}/u.test(value)) return false;
  // 以数字开头（`1`、`4A`）→ 是编号而非工程键。
  if (/^[0-9]/u.test(value)) return false;
  // 纯 ASCII 字母数字且无分隔符 → 工程键形态（`sh2`、`pjl`、`maglevA`、`shanghai`）。
  // 正式线路名的英文写法通常含空格（`Line 1`、`Airport Express`），不会命中。
  return /^[A-Za-z][A-Za-z0-9]*$/u.test(value);
}

/**
 * 从线路选项里取**可用的线路名**：别名优先（别名是纯线路名），否则取 label 中「·」前的部分。
 *
 * 与「丢弃工程键」思路的区别：这里**允许**工程键形态的名称通过——`sh2` 推导出的
 * `2号线` 是可用的，即便退回到 `sh2` 本身，也该交给用户修正而非直接丢弃。
 * 真正要挡住的是「把 `sh2` 当成编号」，那由候选列表构造负责。
 */
export function resolveMetroWayfindingSuggestionLineName(option: {
  label: string;
  aliases?: string[];
}): string {
  const candidates = [
    ...(option.aliases ?? []),
    option.label.split('·', 1)[0]?.trim() ?? '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const name = candidate.trim();
    if (name) return name;
  }
  return '';
}

/**
 * 判断从线路名提取出的「线路编号」是否可信。
 *
 * 既有契约允许中文线路名退化为首字（`环线` → `环`），所以这里不能做强格式约束。
 * **唯一要拒绝的是「提取结果 == 线路名」**：那说明输入本身就是工程键
 * （`sh2` → `sh2`），这样的「编号」没有意义；这种情况应由 {@link deriveMetroWayfindingLineIdentity}
 * 剥离前缀得到 `2`。
 */
export function isMetroWayfindingLineNumberLike(lineNumber: string, lineName: string): boolean {
  if (!lineNumber) return false;
  return lineNumber !== lineName;
}

/** 线路编号选择器的候选项。 */
export interface MetroWayfindingLineTemplateOption {
  /** 以线路名为唯一标识，避免同色线路互相覆盖。 */
  id: string;
  name: string;
  lineNumber: string;
  color: string;
  /** 名称是否只是从 `lineKey` 推导的占位值（尚未经用户确认）。 */
  isDerivedName: boolean;
}

/**
 * 构造「线路编号」模板的线路候选列表。
 *
 * 名称来源分两种：
 *   - 选项已带正式线路名（在 `snapshot.lineNames` 中配置过）→ 走统一编号提取口径；
 *   - 选项只有从 `lineKey` 推导的占位名 → 剥离字母前缀取编号（`sh2` → `2`）。
 *
 * 无论哪种，都**不会**把 `lineKey` 整体当成编号。
 *
 * @param lineColorOptions 线路色选项：`value` 是颜色，`label` 是展示文本，
 *   `aliases` 是候选名（正式名称，或从 `lineKey` 推导的默认值）。
 * @param lineKeysByColor 颜色 → `lineKey` 映射，用于在名称缺失时兜底推导编号。
 */
export function resolveMetroWayfindingLineTemplateOptions(
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>,
  lineKeysByColor?: ReadonlyMap<string, string>,
): MetroWayfindingLineTemplateOption[] {
  const seen = new Set<string>();
  const options: MetroWayfindingLineTemplateOption[] = [];
  for (const option of lineColorOptions) {
    const color = option.value.toUpperCase();
    const name = resolveMetroWayfindingSuggestionLineName(option);
    // 名称形如工程键（或缺失）→ 判定为「推导名」，需从 lineKey 取编号，不能整体当编号用。
    const isDerivedName = !name || isMetroWayfindingPseudoLineKey(name);
    const lineKey = lineKeysByColor?.get(color) ?? lineKeysByColor?.get(option.value);
    const derived = lineKey ? deriveMetroWayfindingLineIdentity(lineKey) : undefined;
    const lineNumber = isDerivedName
      ? (derived?.lineNumber ?? '')
      : extractMetroWayfindingLineNumber(name);
    if (!lineNumber) continue;
    // 推导名不直接展示（`sh2` 对用户没意义），改用 `2号线`。
    const displayName = isDerivedName ? (derived?.suggestedName ?? name) : name;
    if (!displayName || seen.has(displayName)) continue;
    seen.add(displayName);
    options.push({ id: displayName, name: displayName, lineNumber, color, isDerivedName });
  }
  return options;
}
