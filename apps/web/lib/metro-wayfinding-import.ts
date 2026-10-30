import {
  appendMetroLargeTextSuffix,
  applyMetroWayfindingRowContextDefaults,
  createMetroWayfindingId,
  extractMetroWayfindingLineNumber,
  resolveMetroLargeTextSuffixes,
  METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
  METRO_WAYFINDING_COMBINATION_MAX_SCALE,
  METRO_WAYFINDING_BACKGROUND,
  METRO_WAYFINDING_FOREGROUND,
  METRO_WAYFINDING_GAP,
  METRO_WAYFINDING_PROJECT_FORMAT,
  METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
  METRO_WAYFINDING_WARNING_FOREGROUND,
  parseMetroWayfindingLayout,
  summarizeMetroWayfindingLayout,
  type MetroWayfindingArrowElement,
  type MetroWayfindingCombinationChild,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingCombinationStripePosition,
  type MetroWayfindingElement,
  type MetroWayfindingFacilityElement,
  type MetroWayfindingFrameShape,
  type MetroWayfindingIconDirection,
  type MetroWayfindingIconVariant,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLayout,
  type MetroWayfindingMainSegment,
  type MetroWayfindingProjectCanvas,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextRow,
  type MetroWayfindingTextAlign,
} from './metro-wayfinding';

export const METRO_WAYFINDING_IMPORT_MAX_FILES = 2;
export const METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const METRO_WAYFINDING_SEMANTIC_TARGET_STYLE = 'DB21/T 2573-2023 语义适配';

export type MetroWayfindingImportSource =
  'yct' | 'nal-vitool' | 'chitose-signmaker' | 'moert-guidegen';
export type MetroWayfindingImportMode = 'semantic' | 'source-style';

export interface MetroWayfindingImportFile {
  name: string;
  size: number;
  text: string;
}

export interface MetroWayfindingImportWarning {
  code: string;
  message: string;
  count: number;
}

export interface MetroWayfindingImportRowSource {
  fileName: string;
  label: string;
  /**
   * 中文一句话描述（"箭头：左 → 图标：出口 …"），仅用于纯文本场景或
   * 屏幕阅读器兜底。弹窗与后台审核面板已统一改为图形化预览，
   * 不再把这段文字当主呈现。
   */
  summary: string;
  /**
   * 该行的元素数组，供前端以图形方式预览（图标 / 文字 / 组合框 / 弹性空白）。
   * 是 preview.rendering 一致性的源头：summary 由它派生。
   */
  elements: readonly MetroWayfindingElement[];
}

export interface MetroWayfindingImportPreview {
  source: MetroWayfindingImportSource;
  sourceLabel: string;
  styleLabel: string;
  projectName: string;
  files: Array<{ name: string; size: number }>;
  canvas: MetroWayfindingProjectCanvas;
  layout: MetroWayfindingLayout;
  rowSources: MetroWayfindingImportRowSource[];
  warnings: MetroWayfindingImportWarning[];
}

type JsonObject = Record<string, unknown>;

interface ParsedImportDocument {
  source: MetroWayfindingImportSource;
  sourceLabel: string;
  styleLabel: string;
  projectName: string;
  fileName: string;
  canvasLength: number;
  canvas?: MetroWayfindingProjectCanvas;
  layout?: MetroWayfindingLayout;
  backgroundColor: string;
  foregroundColor: string;
  dividerBetweenRows: boolean;
  rows: MetroWayfindingElement[][];
  warnings: MetroWayfindingImportWarning[];
}

interface ElementColors {
  backgroundColor?: string;
  foregroundColor?: string;
}

/**
 * NaL vitool 的 `definitions.*` 文本块定义。字段名以线上导出为准：
 * 普通文本框用 `cn` / `en`；多层文本框把中英文拆进 `a-cn` / `a-en1` / `a-en2`
 * 与 `c-cn1` / `c-cn2` / `c-en1` / `c-en2`。`clr` 是文字色，`drct` 是基线方向。
 * `file` 指向该定义对应的素材名，`originalSvg` 是源工程内嵌图形。
 */
interface NalTextDefinition extends JsonObject {
  cn?: unknown;
  en?: unknown;
  'a-cn'?: unknown;
  'a-en1'?: unknown;
  'a-en2'?: unknown;
  'c-cn1'?: unknown;
  'c-cn2'?: unknown;
  'c-en1'?: unknown;
  'c-en2'?: unknown;
  drct?: unknown;
  clr?: unknown;
  file?: unknown;
}

/** NaL vitool 的 group（分栏）。`align` 决定该栏在画板上的对齐方式。 */
type NalGroupAlign = 'left' | 'center' | 'right' | 'equidistant';

const CHITOSE_BACKGROUND = '#FFFFFF';
const CHITOSE_FOREGROUND = '#111111';
const CHITOSE_EXIT_BACKGROUND = '#FFD701';
const CHITOSE_FACILITY_BACKGROUND = '#333F48';
const NAL_BACKGROUND = '#092F52';
const NAL_LINE_10_COLOR = '#009BC0';
const NAL_EXIT_COLOR = '#009F3C';
const NAL_ACCENT_BLUE = '#00A0E9';
const NAL_ACCENT_PINK = '#E6007E';
// `oth@hub*` 经典系列方框底色（取自素材 SVG 实际 fill，勿凭观感改）。
const NAL_HUB_BLUE = '#0C2F54';
const NAL_HUB_AIRPORT = '#F3D420';
const NAL_HUB_TAXI = '#14964E';

/**
 * NaL 线路色带 / 车头标素材 → 该素材表达的运营线路名。
 *
 * ## 结论（四源交叉确证）
 * 1. **`clss@NN` = NN 号线**（`clss@01`~`clss@21` 严格成立）：
 *    `clss@05`=5号线、`clss@07`=7号线、`clss@09`=9号线、`clss@10`=10号线、
 *    `clss@13`=13号线、`clss@17`=17号线 …… 号段自洽。
 *    22 号位起是特殊线路：22=八通线、23=大兴线、24=亦庄线、25=房山线、
 *    26=燕房线、27=S1线、28=昌平线、29=西郊线、30=亦庄T1线、
 *    31=首都机场线、32=大兴机场线。
 * 2. **`line@NN` 也按界面顺序编号，但比 `clss@` 多插入了「八通线」「大兴线」两个占位**，
 *    因此不能写成简单的 `NN±k`：
 *    `line@01`=1号线、`line@02`=八通线、`line@03`=2号线、`line@04`=3号线、
 *    `line@05`=4号线、`line@06`=大兴线、`line@07`=5号线……`line@32`=大兴机场线。
 * 3. **`cls@NN` 是车头标**，顺序与 `clss@` 基本一致但号段不同（如 `cls@27`=17号线）。
 *
 * ## 证据来源（改表前必须回查，勿凭印象增删）
 * - ① **vitool 界面截图**（用户提供，2026-09-19）：「经典线路标」/「色带线路标」
 *   两个分类的网格逐格标注了线路中英文名，直接给出顺序与线路名对应。
 * - ② **线上素材 SVG 的 `fill` 色值**：抓取 `clss@01-32`、`line@01-32` 共 64 份
 *   素材，其内置色值与「①」的网格顺序**逐位吻合**
 *   （例：`clss@09 = #8fc31f` 草绿 ↔ 界面第 9 格「9号线」）。
 * - ③ **素材清单 `title` 明文**：`{'title':'7号线','file':'clss@07.svg'}`、
 *   `{'title':'9号线','file':'clss@09.svg'}`、`{'title':'10号线','file':'clss@10.svg'}`、
 *   `{'title':'17号线','file':'line@19.svg'}`、`{'title':'亦庄线','file':'line@24.svg'}`
 *   等，与 ①② 同号位完全一致。
 * - ④ **官方模板工程文件** `assets/template/*.json` + `presetTemplates` 的
 *   `subtitle` 明文（模板 1-5-3 = 「2号线开往鼓楼大街」用 `line@03`）。
 *
 * ## 历史教训（勿重蹈）
 * - 素材清单里的 `refresh` 字段**不是「同线路新版素材」**，而是素材库升级时的
 *   替换索引表，与线路无关。曾据 `clss@07 → refresh: line@09` 错误推断
 *   「`line@09` = 7号线」，实际 `line@09` = 7号线纯属巧合，`line@11` 实为 7号线
 *   之外的线路，据此推出的整张 `line@` 表全错。**`refresh` 不可用作线路依据。**
 * - 包内 AI 指令文本的「颜色辅助 Icons」对照表把 `clss@10` 记作 9 号线，
 *   与素材清单 title 冲突，属提示词示例、非机器可读权威数据，不予采信。
 */
const nalRouteAssetMap: Record<string, string> = {
  // —— 经典系列 clss@NN：号即线号（01~21）——
  'clss@01.svg': '1号线',
  'clss@02.svg': '2号线',
  'clss@03.svg': '3号线',
  'clss@04.svg': '4号线',
  'clss@05.svg': '5号线',
  'clss@06.svg': '6号线',
  'clss@07.svg': '7号线',
  'clss@08.svg': '8号线',
  'clss@09.svg': '9号线',
  'clss@10.svg': '10号线',
  'clss@11.svg': '11号线',
  'clss@12.svg': '12号线',
  'clss@13.svg': '13号线',
  'clss@14.svg': '14号线',
  'clss@15.svg': '15号线',
  'clss@16.svg': '16号线',
  'clss@17.svg': '17号线',
  'clss@18.svg': '18号线',
  'clss@19.svg': '19号线',
  'clss@20.svg': '22号线',
  'clss@21.svg': '28号线',
  // —— 经典系列 clss@22~32：特殊线路 ——
  'clss@22.svg': '八通线',
  'clss@23.svg': '大兴线',
  'clss@24.svg': '亦庄线',
  'clss@25.svg': '房山线',
  'clss@26.svg': '燕房线',
  'clss@27.svg': 'S1线',
  'clss@28.svg': '昌平线',
  'clss@29.svg': '西郊线',
  'clss@30.svg': '亦庄T1线',
  'clss@31.svg': '首都机场线',
  'clss@32.svg': '大兴机场线',
  // —— 实验系列 line@NN：比 clss@ 多插「八通线(02)」「大兴线(06)」两个占位 ——
  'line@01.svg': '1号线',
  'line@02.svg': '八通线',
  'line@03.svg': '2号线',
  'line@04.svg': '3号线',
  'line@05.svg': '4号线',
  'line@06.svg': '大兴线',
  'line@07.svg': '5号线',
  'line@08.svg': '6号线',
  'line@09.svg': '7号线',
  'line@10.svg': '8号线',
  'line@11.svg': '9号线',
  'line@12.svg': '10号线',
  'line@13.svg': '11号线',
  'line@14.svg': '12号线',
  'line@15.svg': '13号线',
  'line@16.svg': '14号线',
  'line@17.svg': '15号线',
  'line@18.svg': '16号线',
  'line@19.svg': '17号线',
  'line@20.svg': '18号线',
  'line@21.svg': '19号线',
  'line@22.svg': '22号线',
  'line@23.svg': '28号线',
  'line@24.svg': '亦庄线',
  'line@25.svg': '房山线',
  'line@26.svg': '燕房线',
  'line@27.svg': 'S1线',
  'line@28.svg': '昌平线',
  'line@29.svg': '西郊线',
  'line@30.svg': '亦庄T1线',
  'line@31.svg': '首都机场线',
  'line@32.svg': '大兴机场线',
  // —— 车头标 cls@NN（顺序同 clss@，号段另有偏移）——
  'cls@27.svg': '17号线',
};

/**
 * 「非纯数字线路名」的中英对照。用于把 `亦庄线` 这类线路名转成
 * 「填充风格组合框 + 中英双语文本」的产出形态。
 * 英文名取自 vitool 界面截图上各线路标的官方英文标注。
 * 表外的非数字线路名回退到「原名 + 原名」的中性处理，不臆造英文。
 */
const nalNamedLineTranslations: Record<string, string> = {
  八通线: 'Batong Line',
  大兴线: 'Daxing Line',
  亦庄线: 'Yizhuang Line',
  房山线: 'Fangshan Line',
  燕房线: 'Yanfang Line',
  S1线: 'Line S1',
  昌平线: 'Changping Line',
  西郊线: 'Xijiao Line',
  亦庄T1线: 'Yizhuang T1 Line',
  首都机场线: 'Capital Airport Express',
  大兴机场线: 'Daxing Airport Express',
};

/**
 * 判断线路名是否为「纯数字编号」形态（如 `10号线`、`S1号线`、`2号线`）。
 * 非数字形态（如 `亦庄线`）走另一套产出逻辑。
 */
function isNumericLineName(lineName: string): boolean {
  return /^[a-z]?\d+[a-z]?号线$/iu.test(lineName.trim());
}

/** 非数字线路名的官方英文名；表外线路返回空字符串，避免臆造翻译。 */
export function resolveMetroLineEnglishName(lineName: string): string {
  return nalNamedLineTranslations[lineName.trim()] ?? '';
}

/**
 * 从线路名里取出编号部分与后缀部分。`10号线` → `{ number: '10', suffix: '号线' }`；
 * `S1号线` → `{ number: 'S1', suffix: '号线' }`；非数字名 → `undefined`。
 */
function splitNumericLineName(lineName: string): { number: string; suffix: string } | undefined {
  const match = lineName.trim().match(/^([a-z]?\d+[a-z]?)(号线)$/iu);
  if (!match) return undefined;
  return { number: match[1]!, suffix: match[2]! };
}

/**
 * NaL 线路名 → 线路标识色。
 *
 * 数据来源：**线上素材 SVG 内置的 `fill` 色值**（抓取 `clss@01-32`）。
 * 由于 `clss@NN` 与线路名的对应关系已由四源交叉确证（见 `nalRouteAssetMap`），
 * 这里可以直接按「素材号 → 线路名 → 该素材的 fill 色」建立映射，
 * 色值全部是官方素材原样，未经推测。
 *
 * 补充说明：vitool 包内还有一份 CGoUI 调色板（`{'name':'N号线','value':'#rrggbb'}`），
 * 但其名值字段在打包时被部分混淆，且提取出的明文条目与素材实际色存在错位
 * （把 `#006098` 标作「3号线」，实际是 2 号线），故**不以调色板为准**，
 * 一律以素材 SVG 的实际填色为准。
 */
const nalLineColorMap: Record<string, string> = {
  '1号线': '#c23a30',
  '2号线': '#006098',
  '3号线': '#e60033',
  '4号线': '#008e9c',
  '5号线': '#a6217f',
  '6号线': '#d29700',
  '7号线': '#fac671',
  '8号线': '#009b6b',
  '9号线': '#8fc31f',
  '10号线': '#009bc0',
  '11号线': '#ed796b',
  '12号线': '#c76b00',
  '13号线': '#f9e700',
  '14号线': '#d5a7a1',
  '15号线': '#6a357d',
  '16号线': '#76a32d',
  '17号线': '#00a9a9',
  '18号线': '#6059a5',
  '19号线': '#d6abc1',
  '22号线': '#f7c8ce',
  '28号线': '#35570b',
  八通线: '#c23a30',
  大兴线: '#008e9c',
  亦庄线: '#e40077',
  房山线: '#e46022',
  燕房线: '#e46022',
  S1线: '#b25921',
  昌平线: '#de82b2',
  西郊线: '#e6081b',
  亦庄T1线: '#e6081b',
  首都机场线: '#a29bbb',
  大兴机场线: '#004ba0',
};

/** 取线路名对应的标识色；未收录时回退到 10 号线色占位。 */
function resolveNalLineColor(lineName: string): string {
  return nalLineColorMap[lineName] ?? NAL_LINE_10_COLOR;
}

/**
 * NaL 「方向指示」素材的语义分组（`way@NN`）。
 *
 * ## 确证方法（四源逐位吻合）
 * ① **包内 AI 指令文本（最权威）**：vitool 主包里有一条给 AI 用的明文说明，
 *    原样写着「`直/上: way@05.svg | 下: way@06.svg`」「`左下: way@09 way@10`」
 *    「`way@11.svg | 右后掉头`」。这是**官方自己给出的号段表**，
 *    优先级高于任何推断。
 * ② **包内素材清单明文 `title`**（形如 `{'title':'左下箭头','file':'way@09.svg'}`）——
 *    本次抓到的锚点：`way@05` 紧邻「下箭头」条目之前（即上/直行）、
 *    `way@09`=左下箭头、`way@10`=右下箭头、`way@12`=右掉头、
 *    `way@14` 附近有「右前箭头」、`way@22` 附近有「内环」、`way@27`=外环、
 *    `way@28`=新标准形出口。
 * ③ **线上素材 SVG 几何实证**（`https://centralgo.site/vitool/assets/way/way@NN.svg`）：
 *    箭头素材都是**单个多边形/路径**，用「离重心的最远顶点 = 箭头尖端」可唯一定向：
 *    - `way@03` 尖端在**左边缘**（`x=0`）→ 左向箭头；
 *    - `way@04` 尖端在**右边缘**（`x=100`）→ 右向箭头；
 *    - `way@05` 尖端在**上边缘**（`y=25`），箭杆垂直 → 上/直行箭头；
 *    - `way@06` 尖端在**下边缘**（`y=125`）→ 下向箭头；
 *    - `way@07` 尖端在左上角 → 左上；`way@08` 右上；`way@09` 左下；`way@10` 右下。
 *    - `way@01/02/28/29` 含**绿色底 `<rect>`**（`#009f3c`）→ 出口；
 *    - `way@24` 含 `#fff`+`#00263b`+`#d80c24`（红圈）→ 禁止通行；
 *    - `way@25/30` 宽 50、仅 2 条单色 `path` → 步行小人；
 *    - `way@23` 宽 125、14 条 `path`、**无多边形** → 「下一站」文字；
 *    - `way@26/27` 宽 117/123、13 条 `path` → 汉字字形（内环 / 外环）。
 * ④ **界面截图网格顺序**（用户提供，每格带图标图形）。
 *
 * ## 铁律：旧表整表作废
 * 历史实现是「按方位猜号」，把 `way@05` 当西、`way@03`/`way@04` 当左/右却
 * **漏掉了它们本身就是左右箭头**，且 `way@05` 实为**上/直行**。
 * 修此表前必须重跑上面四源；**尤其不能只看 SVG 的 `viewBox` 与元素计数**
 * （方位靠顶点几何，不靠尺寸）。
 */
const nalArrowAssetMap: Record<string, MetroWayfindingArrowElement['iconId']> = {
  // —— 四个基本方位 ——
  'way@03.svg': 'west', // SVG 尖端在 x=0 → 左
  'way@04.svg': 'east', // SVG 尖端在 x=100 → 右
  'way@05.svg': 'north', // 明文「直/上: way@05.svg」+ SVG 尖端在 y=25
  'way@06.svg': 'south', // 明文「下: way@06.svg」+ SVG 尖端在 y=125
  // —— 四个斜向 ——
  'way@07.svg': 'north-west',
  'way@08.svg': 'north-east',
  'way@09.svg': 'south-west', // 明文佐证：「左下箭头」
  'way@10.svg': 'south-east', // 明文佐证：「右下箭头」
  // —— 掉头 ——
  'way@11.svg': 'u-turn-left', // 明文：way@12=右掉头 → way@11 为左掉头（同段成对）
  'way@12.svg': 'u-turn-right', // 明文佐证：「右掉头」
  // —— 转向箭头（先横后竖 / 先竖后横）——
  'way@13.svg': 'turn-left-down',
  'way@14.svg': 'turn-right-up',
  'way@15.svg': 'turn-left-up',
  'way@16.svg': 'turn-right-down',
};

/**
 * NaL「方向指示」中需要转成**纯文本元素**的素材（无箭头，只有文字）。
 * - `way@23`：SVG 实证为 14 条 `path`、**无 `<polygon>`**、宽 125 —— 即「下一站 / Next Station」三行文字。
 * - `way@26` / `way@27`：SVG 实证为汉字字形 —— 内环 / 外环（清单明文确证）。
 */
const nalDirectionTextAssets: Record<
  string,
  { cn: string; en: string; align: MetroWayfindingTextAlign }
> = {
  'way@23.svg': { cn: '下一站', en: 'Next Station', align: 'center' },
  'way@26.svg': { cn: '内环', en: 'Inner Circle', align: 'center' },
  'way@27.svg': { cn: '外环', en: 'Outer Circle', align: 'center' },
};

/**
 * NaL「方向指示」中「箭头 + 文本」合体素材：拆成**箭头图标 + 文本元素**两个元素，
 * 文本放在箭柄一侧，对齐方向与箭头方向一致。
 *
 * SVG 实证：`way@21` / `way@22` 均含 `<polygon>`（箭头）+ 十余条文字字形 `path`，
 * 即「← 下一站 / Next Station」「→ 下一站 / Next Station」。
 * 文本对齐口径：箭头朝左 → 文本靠左；箭头朝右 → 文本靠右。
 */
const nalDirectionArrowWithTextAssets: Record<
  string,
  { iconId: MetroWayfindingArrowElement['iconId']; align: MetroWayfindingTextAlign }
> = {
  'way@21.svg': { iconId: 'west', align: 'left' },
  'way@22.svg': { iconId: 'east', align: 'right' },
};

/** 「箭头 + 文本」素材里附带的文案（两个素材都是「下一站 / Next Station」）。 */
const NAL_DIRECTION_ARROW_TEXT = { cn: '下一站', en: 'Next Station' } as const;

/**
 * NaL「方向指示」中应**忽略**的素材（不进画布）。
 * - `way@24`：SVG 实证为 白圆 + 深色人影 + 红色斜杠 —— 即**禁止通行**符号的图形部分，
 *   本模板无等价图标，忽略。⚠️ 不要与「步行」混淆。
 * - `way@25` / `way@30`：SVG 实证为宽 50、单色人形轮廓 —— **步行小人**，按需求忽略。
 */
const nalDirectionIgnoredAssets = new Set(['way@24.svg', 'way@25.svg', 'way@30.svg']);

/**
 * NaL「方向指示」中须**一律转为「向上出口」**的素材。
 *
 * 需求：四个出口图标（方向各异）统一转成向上的出口图标。
 * SVG 实证：这四个素材都带**绿色底 `<rect>`**（`#009f3c`），是出口专用底色。
 * - `way@01`（150 宽，含 EXIT 字样）
 * - `way@02`（110 宽）
 * - `way@28`（125 宽，清单明文「新标准形出口」）
 * - `way@29`（80 宽）
 */
const nalDirectionExitAssets = new Set(['way@01.svg', 'way@02.svg', 'way@28.svg', 'way@29.svg']);

/**
 * NaL vitool 的「实验系列」素材名。
 *
 * 依据：①线上素材 SVG 实证——`stn@23`–`stn@36` 全部是**彩色单色人形图标**
 * （蓝 `#00a0e9` / 粉 `#e61673`），没有经典外框矩形；
 * ②vitool 官方模板工程文件（`assets/template/*.json`）实际引用的元素；
 * ③包内素材清单条目。
 *
 * ⚠️ 旧实现在这里列了 stn@01 / stn@02 / stn@07 / stn@11 / stn@12 / stn@17 /
 * stn@18 / stn@26 / stn@27 / stn@28 / stn@29 / stn@34 与 oth@04，共 13 个号
 * ——这些号在三份来源里**都不存在**，导致系列判定几乎永远不会命中。
 *
 * **号段口径**（2026-09-19 按 SVG 实测校正）：
 * `stn@23`–`stn@36` 是实验系列；`stn@01`–`stn@22` 与 `stn@37` / `stn@38` 是经典系列。
 * 这个边界**不是**「连续递增」的自然结果——`stn@15` 等号是跳过的语义项，
 * 但**系列边界本身是连号的**，故可用区间表达，无需逐个枚举。
 */
const nalExperimentalStyleAssets = new Set([
  ...range(23, 36).map((n) => `stn@${String(n).padStart(2, '0')}.svg`),
  'way@02.svg',
  'way@28.svg',
  'way@29.svg',
  'oth@01.svg',
  'oth@03.svg',
  'oth@A.svg',
  'oth@Dot.svg',
  'oth@06.svg',
]);

/**
 * NaL vitool 的「经典系列」素材名。
 *
 * 号段口径见 `nalExperimentalStyleAssets`：`stn@01`–`stn@22` + `stn@37` / `stn@38`。
 *
 * 旧实现在这里列了 stn@01 / stn@02 / stn@05 / stn@07 / stn@08 / stn@11 /
 * stn@12 / stn@17 / stn@18 与 oth@hub04 / oth@cls02 / oth@bw 等号，
 * 其中 stn@01 / stn@02 / stn@07 / stn@08 / stn@11 / stn@12 / stn@17 /
 * stn@18 / oth@hub04 / oth@cls02 / oth@bw 均不存在于 vitool。
 *
 * 两点易错处（改动前务必回查官方模板 assets/template/*.json）：
 * 1. `oth@hub03` / `oth@hub05` 是**真实存在**的经典系列素材（清单 file 字段明文可查），
 *    勿与臆造的 oth@hub04 混为一谈；其清单 title / keywords 为混淆串，语义无法确证，
 *    故只参与系列判定，不写入设施映射（避免臆造图标）。
 * 2. `oth@yl` 是**真实存在**的经典分割线素材——它不在素材清单里，但出现在
 *    官方模板 1-5-4 / 1-6-2 / 1-7-2 / 1-8-1 / 1-8-2 / 1-8-3 / 2-5-1 / 2-8-1
 *    的 elements 中。**证伪它属于只看清单不看模板造成的误判**。
 */
const nalClassicStyleAssets = new Set([
  ...range(1, 22).map((n) => `stn@${String(n).padStart(2, '0')}.svg`),
  'stn@37.svg',
  'stn@38.svg',
  'oth@cls01.svg',
  'oth@cls06.svg',
  'oth@cls11.svg',
  'oth@cls12.svg',
  'oth@cls14.svg',
  'oth@cls16.svg',
  'oth@cls18.svg',
  'oth@cls23.svg',
  'oth@cls27.svg',
  'oth@hub03.svg',
  'oth@hub05.svg',
  'oth@yl.svg',
]);

/**
 * NaL vitool 设施素材（`stn@NN`）到本模板图标的映射。
 *
 * ## 号段规则（**线上 SVG 逐张渲染实证**，2026-09-19 重写）
 *
 * ⚠️ 历史版本按「界面截图网格顺序 + 用户手抄编号」建表，**整表错位**：
 * 用户抄号时把跳过项（`stn@15` 行李安检、`stn@17` 轮椅升降机等）
 * 也当成了连号，于是 03 之后的每个号整体前移。**号段必须以
 * `https://centralgo.site/vitool/assets/stn/stn@NN.svg` 的实际渲染结果为准**，
 * 素材号并不连续可用，截图网格的「行优先递推」不成立。
 *
 * | 号 | vitool 图形 | 本模板语义 |
 * | --- | --- | --- |
 * | 01 | 电梯（带外框） | 电梯 |
 * | 02 | 男女卫生间 | 卫生间 |
 * | 03 / 04 | 扶梯（上 / 下） | 扶梯·右 / 扶梯·左（03 更符合图标原本朝向） |
 * | 05 / 06 | 双向楼梯（镜像） | 双向楼梯·右 / 双向楼梯·左 |
 * | 07 | 母婴室（奶瓶+婴儿） | 母婴室 |
 * | 08 | 自动售票（硬币+票） | 自动售票 |
 * | 09 | 票券 / 卡片 | **人工售票处** —— 先合并到「乘客服务中心」 |
 * | 10 | 问号「?」 | **问讯处** —— 先合并到「乘客服务中心」 |
 * | 11 | 服务中心（双人台） | 乘客服务中心 |
 * | 12 | 垃圾桶 | **警务室**（本模板图标样式差别较大，暂按 `police` 表达） |
 * | 13 | 行李 / 寄存 | **紧急按钮**（无等价图标 → 跳过） |
 * | 14 | 门 / 入口 | **安检门**（无等价图标 → 跳过） |
 * | 15 | 阅读 / 报刊 | **行李安检机**（无等价图标 → 跳过） |
 * | 16 | 门 / 坡道 | **无障碍坡道**（`accessible-ramp`） |
 * | 17 | 禁止轮椅（斜杠） | **轮椅升降机** |
 * | 18 | 轮椅 | 轮椅 |
 * | 19 | 拄拐人 | **老人**（无等价图标 → 跳过） |
 * | 20 | 盲人牵导盲犬 | **推婴儿车的人**（无等价图标 → 跳过） |
 * | 21 | 孕妇 | **孕妇**（无等价图标 → 跳过） |
 * | 22 | 拖行李人 | **携带大件行李的旅客**（无等价图标 → 跳过） |
 * | 23 | 电梯（蓝，实验） | 电梯 |
 * | 24 | 男女（蓝/粉，实验） | **卫生间** |
 * | 25 | 三人 + 轮椅（实验） | **无障碍卫生间** |
 * | 26 | 男（蓝） | 男卫生间 |
 * | 27 | 女（粉） | 女卫生间 |
 * | 28 | 家庭 + 轮椅 | **第三卫生间**（并入家庭卫生间） |
 * | 29 / 30 | 扶梯（蓝，上 / 下） | 扶梯·右 / 扶梯·左（29 为原本朝向） |
 * | 31 / 32 | 楼梯（蓝，镜像） | 双向楼梯·右 / 双向楼梯·左 |
 * | 33 | 婴儿 + 奶瓶（蓝） | 母婴室 |
 * | 34 | 轮椅（蓝） | 轮椅 |
 * | 35 | 红心 / 急救（红） | **AED**（无等价图标 → 跳过） |
 * | 36 | 盲人导盲犬（蓝） | 无等价图标 → **跳过** |
 * | 37 | 电梯（经典带框） | **先合并到自动售票机**（`ticket`） |
 * | 38 | 男女 + 轮椅（经典带框） | **无障碍卫生间** |
 * | 39 / 40 | 长条横幅（440×57） | **跳过**（无实际图形） |
 *
 * ## 色板口径
 * 实验系列（23–36）是**单色人形图标**：蓝 `#00a0e9` 为主、粉 `#e61673` 用于女性语义。
 * 经典系列（01–22、37、38）是单色 `var(--mode-item)` 带外框。
 * 保留原样式模式按 `frameForeground`（`foregroundColor`）还原实验系列的蓝/粉。
 *
 * ## 方向口径
 * 「扶梯」与「双向楼梯」在素材里是**一对镜像图形**，
 * 因此在映射里用 `direction: 'right' | 'left'` 表达，不要拆成两个图标。
 * 楼梯的 05/06/31/32 都是**双向**变体。
 *
 * ## 历史教训
 * 旧表引用了 stn@01 / 02 / 07 / 11 / 12 / 17 / 18 / 24 / 26 / 27 / 28 / 29 / 34
 * 等号并给了**臆造语义**（如 stn@15=电梯、stn@20=卫生间），与实测号段完全不符。
 * 凡「本模板无等价图标」的号一律返回空元素，不进画布也不报未识别告警。
 */
const nalFacilityAssetMap: Record<
  string,
  { iconId: string; options?: Partial<MetroWayfindingFacilityElement> }
> = {
  // —— 经典系列 01–02 ——
  'stn@01.svg': { iconId: 'elevator', options: { frameShape: 'rectangle' } },
  'stn@02.svg': { iconId: 'restroom', options: { frameShape: 'rectangle' } },
  // —— 经典系列 03–04：扶梯（右 / 左）——
  'stn@03.svg': {
    iconId: 'escalator',
    options: { direction: 'right', frameShape: 'rectangle' },
  },
  'stn@04.svg': {
    iconId: 'escalator',
    options: { direction: 'left', frameShape: 'rectangle' },
  },
  // —— 经典系列 05–06：双向楼梯（右 / 左）——
  'stn@05.svg': {
    iconId: 'stairs',
    options: { direction: 'right', variant: 'two-way', frameShape: 'rectangle' },
  },
  'stn@06.svg': {
    iconId: 'stairs',
    options: { direction: 'left', variant: 'two-way', frameShape: 'rectangle' },
  },
  // —— 经典系列 07：母婴室 ——
  'stn@07.svg': { iconId: 'nursing-room', options: { frameShape: 'rectangle' } },
  // —— 经典系列 08：自动售票机 ——
  'stn@08.svg': { iconId: 'ticket', options: { frameShape: 'rectangle' } },
  // —— 经典系列 09：人工售票处（先合并到乘客服务中心）——
  'stn@09.svg': { iconId: 'service', options: { frameShape: 'rectangle' } },
  // —— 经典系列 10：问讯处（先合并到乘客服务中心）——
  'stn@10.svg': { iconId: 'service', options: { frameShape: 'rectangle' } },
  // —— 经典系列 11：乘客服务中心 ——
  'stn@11.svg': { iconId: 'service', options: { frameShape: 'rectangle' } },
  // —— 经典系列 12：警务室 ——
  'stn@12.svg': { iconId: 'police', options: { frameShape: 'rectangle' } },
  // —— 经典系列 13：紧急按钮（无等价图标 → 跳过）——
  // —— 经典系列 14：安检门（无等价图标 → 跳过）——
  // —— 经典系列 15：行李安检（无等价图标 → 跳过）——
  // —— 经典系列 16：无障碍坡道 ——
  // 用户 2026-09-19 提供源图 `ramp.svg`，已产出本模板 `accessible-ramp` 资产。
  'stn@16.svg': { iconId: 'accessible-ramp', options: { frameShape: 'rectangle' } },
  // —— 经典系列 17–18 ——
  'stn@17.svg': { iconId: 'wheelchair-lift', options: { frameShape: 'rectangle' } },
  'stn@18.svg': { iconId: 'wheelchair', options: { frameShape: 'rectangle' } },
  // —— 经典系列 19–22：老人 / 幼童 / 孕妇 / 大件行李旅客（无等价图标 → 跳过）——
  // —— 实验系列 23–28 ——
  'stn@23.svg': { iconId: 'elevator', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@24.svg': { iconId: 'restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@25.svg': { iconId: 'accessible-restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@26.svg': { iconId: 'mens-restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@27.svg': { iconId: 'womens-restroom', options: { foregroundColor: NAL_ACCENT_PINK } },
  'stn@28.svg': { iconId: 'family-restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  // —— 实验系列 29–30：扶梯（右 / 左）——
  'stn@29.svg': {
    iconId: 'escalator',
    options: { direction: 'right', foregroundColor: NAL_ACCENT_BLUE },
  },
  'stn@30.svg': {
    iconId: 'escalator',
    options: { direction: 'left', foregroundColor: NAL_ACCENT_BLUE },
  },
  // —— 实验系列 31–32：楼梯（右 / 左，双向）——
  'stn@31.svg': {
    iconId: 'stairs',
    options: { direction: 'right', variant: 'two-way', foregroundColor: NAL_ACCENT_BLUE },
  },
  'stn@32.svg': {
    iconId: 'stairs',
    options: { direction: 'left', variant: 'two-way', foregroundColor: NAL_ACCENT_BLUE },
  },
  // —— 实验系列 33：母婴室 ——
  'stn@33.svg': { iconId: 'nursing-room', options: { foregroundColor: NAL_ACCENT_PINK } },
  // —— 实验系列 34：轮椅 ——
  'stn@34.svg': { iconId: 'wheelchair', options: { foregroundColor: NAL_ACCENT_BLUE } },
  // —— 实验系列 35–36：AED / 幼童（无等价图标 → 跳过）——
  // —— 经典系列（回尾）37–38 ——
  // 37 图形是「带外框的电梯」但**暂按自动售票机合并**（用户 2026-09-19 决定，
  // 后续若确认语义可改回 elevator）。
  'stn@37.svg': { iconId: 'ticket', options: { frameShape: 'rectangle' } },
  'stn@38.svg': { iconId: 'accessible-restroom', options: { frameShape: 'rectangle' } },
  // 注意：`oth@` 号段**不在这里登记**——它由下方的 `nalOthIconAssets` 统一处理
  // （位次 1-4 实验裸图标 / 5-9 经典带框 / hub02 出租车）。历史版本曾把
  // `oth@03` 当「火车站」硬塞进本表，导致它的图标被抢注成 train 而走不到新逻辑。
};

/**
 * `stn@` 中**明确跳过**（不进画布、不报未识别告警）的号。
 *
 * 判据：**本模板没有等价图标**。列出全部为「用户确证语义、但本模板不表达」的号：
 * - 13 紧急按钮、14 安检门、15 行李安检机；
 * - 19 老人、20 推婴儿车的人、21 孕妇、22 携带大件行李的旅客；
 * - 35 AED、36 盲人导盲犬（蓝）；
 * - 39 / 40 长条横幅（440×57，无实际图形）。
 *
 * 这些号在 vitool 里**真实存在**（故不能删出白名单），只是本模板不表达。
 */
const nalFacilitySkippedAssets = new Set([
  'stn@13.svg',
  'stn@14.svg',
  'stn@15.svg',
  'stn@19.svg',
  'stn@20.svg',
  'stn@21.svg',
  'stn@22.svg',
  'stn@35.svg',
  'stn@36.svg',
  'stn@39.svg',
  'stn@40.svg',
]);

/**
 * NaL「色带信息」素材（`sub@NN`）号段。
 *
 * ## 四源交叉确证
 * ① **包内素材清单明文 `title`**（`.tmp-manifest-ordered.json`，共 196 条）：
 *    `sub@` 区落在末尾 22 格，明文 `title` 依次是「色带文本」(格1)、「色带分隔点」(格2)、
 *    「色带字母A」(格3)、「色带字母B」(格4)、「色带字母C」(格5) …… 「色带字母G」(格9)……
 *    「色带字母M」(格15)、「色带长空格」(格22)。清单里另有 `sub@04.svg`(格3)、
 *    `sub@07.svg`(格6)、`sub@18.svg`(格17)、`sub@21.svg`(格20) 的 `file` 明文。
 * ② **位次对齐**（唯一自洽解）：把「格3=`sub@04`」当锚点往前推，则
 *    格1=`sub@02`、格2=`sub@03`、格3=`sub@04` …… 格17=`sub@18`、格20=`sub@21`。
 *    这条锚链同时解释了清单里另一个明文 `file=sub@07`(格6) 与 `sub@18`(格17)、
 *    `sub@21`(格20) —— **四个明文 `file` 全部落在同一条锚链上**，无一处矛盾。
 * ③ **线上素材 SVG 实证**（`https://centralgo.site/vitool/assets/sub/sub@NN.svg`）：
 *    - `sub@01`/`sub@02`：`viewBox 80x150`，**底部固定 `#78848b` 灰带**（`<rect y=110 h=40>`）
 *      + 上方一个 `#009f3c` 绿底 `<rect>` 内含白色出口奔跑小人 —— 即**色带出口图标**；
 *      两者区别是水平位置（01 偏右、02 居中），即**出口图标**的两种站位；
 *    - `sub@03`：`viewBox 16x150`，仅一个 `r=5.5` 的**圆点**（`var(--mode-item)`）—— 分隔点「·」；
 *    - `sub@04`..`sub@17`：`viewBox` 宽 48~57、单个 `<path>` 是**字母字形**
 *      （`sub@04`=A 的三角横杆、`sub@06`=C 的开口弧、`sub@07`=D、`sub@10`=G、
 *      `sub@14`=K、`sub@16`=M、`sub@17`=N），下方同样带 `#78848b` 灰带 —— 色带字母 A–N；
 *    - `sub@18`=电梯（`#00a0e9` + 轿厢 `rect` + 人形）、`sub@19`=卫生间（人形 `circle`+`path`）、
 *      `sub@20`=轮椅、`sub@21`=飞机（`#00a0e9` 圆形底 + 白色飞机 `path`）——
 *      均为 `#00a0e9` 蓝色系**色带图标**；
 *    - 其余 `sub@NN` 返回 404 → 真实号段是 **01–21**。
 * ④ **官方模板**：`sub@text-custom-<时间戳>`（`type=subtext`）是用户自定义文本，
 *    与固定号段无关，走 definitions 分支。
 *
 * ## 用户规则（本次实现依据）
 * - 01 / 18 / 19 / 20 / 21 是**色带上的图标**（出口 / 电梯 / 卫生间 / 轮椅 / 飞机）：
 *   **保留原样式模式下跳过**（图标已经印在色带里，再放一个独立图标会重复）；
 *   仅语义模式下转为对应设施元素。
 * - 02 是**自定义主副文本**（原工程里出口图标位常被用户替换成站名文本）。
 * - 03 是**分割点「·」**，在**仅语义模式下跳过**（语义模式不给色带配装饰点）。
 * - 04–17 是**大写 A–N 字母大文本**：仅语义模式下**每个大文本只放一个字母并加框**；
 *   若一行放不下，改为**双行主文本按列摆放**（如 ABCDE → 第一行 ACE、第二行 BD），
 *   每个字母仍各带框。
 * - **相邻的色带内容（`sub@` 与 `line@`/`clss@`/`cls@`）合并进同一个组合框，缩放 = 1。**
 */
const nalSubBandLetterMap: Record<string, string> = {
  'sub@04.svg': 'A',
  'sub@05.svg': 'B',
  'sub@06.svg': 'C',
  'sub@07.svg': 'D',
  'sub@08.svg': 'E',
  'sub@09.svg': 'F',
  'sub@10.svg': 'G',
  'sub@11.svg': 'H',
  'sub@12.svg': 'I',
  'sub@13.svg': 'J',
  'sub@14.svg': 'K',
  'sub@15.svg': 'L',
  'sub@16.svg': 'M',
  'sub@17.svg': 'N',
};

/**
 * 色带上的**图标**素材（`sub@` 号段里的 01 / 18 / 19 / 20 / 21）。
 * 值为对应设施图标 id；`sub@01` 是出口，需要额外套绿色填充框。
 */
const nalSubBandIconAssets: Record<string, { iconId: string; framed: boolean }> = {
  'sub@01.svg': { iconId: 'exit', framed: true },
  'sub@18.svg': { iconId: 'elevator', framed: false },
  'sub@19.svg': { iconId: 'restroom', framed: false },
  'sub@20.svg': { iconId: 'wheelchair', framed: false },
  'sub@21.svg': { iconId: 'airplane', framed: false },
};

/** 色带里的分割点号（`sub@03` → 「·」），仅语义模式下跳过。 */
const NAL_SUB_BAND_DIVIDER = 'sub@03.svg';

/**
 * 判断某素材是否属于「色带内容」——即需要与相邻色带素材合并进同一组合框的元素。
 * 覆盖：`sub@` 色带信息（字母/图标/分割点/自定义文本）与线路标识
 * （`line@` / `clss@` / `cls@`）。
 */
function isNalBandAsset(assetName: string): boolean {
  return (
    assetName.startsWith('sub@') ||
    assetName.startsWith('line@') ||
    assetName.startsWith('clss@') ||
    assetName.startsWith('cls@')
  );
}

/**
 * NaL「其他 / 枢纽 / 字母」素材（`oth@`）号段。
 *
 * ## 用户规则（本次实现依据）
 * 用户给的是 **vitool 界面网格位次**（1、2、3 …），**不是 `oth@NN` 文件名编号**——
 * 两者并不同源（位次 5-8 的文件名其实是 `oth@hub01/hub03/hub04/hub05`）。
 * 因此下表一律**按位次对位**推导，不要用文件名里的数字硬套。
 *
 * - 位次 1-4（**实验系列**，裸图标）：市郊铁路（暂用火车图标）/ 铁路 / 巴士 / 飞机
 *   → `oth@01` / `oth@02` / `oth@03` / `oth@04`
 * - 位次 5-8（**经典系列**，带方框）：同上四种
 *   → `oth@hub03` / `oth@hub04` / `oth@hub05` / `oth@hub01`
 * - 位次 9：出租车 → `oth@hub02`
 * - 位次 10 / 11：分割线 → **同一个素材 `oth@yl`**（`fill: var(--mode-ydivider)`，
 *   黄 / 白由主题决定，故用户看到的「10 黄色属实验 / 11 白色属经典」是同一素材的两种主题色）
 * - 位次 12：空白 → `oth@space`
 * - 位次 13-40（**经典系列**）：**加框**大文本，带角标的用大文本的**角标功能**
 *   → `oth@cls01`..`oth@cls28`
 * - 位次 41+（**实验系列**）：**不带框**的分割点、字母 A-Z 和 1-4 下角标大文本
 *   → `oth@A` + `oth@Dot` + `oth@06`..`oth@30`（= B..Z）+ `oth@one|two|thr|fou`
 *
 * ## 四源交叉确证（详见 `.workbuddy-ai/memory/MEMORY.md`）
 * ① **包内素材清单明文**（`.tmp-manifest-ordered.json`）：`oth@` 区落在索引 40-111；
 *    位次 5-8 的 `file` 明文确实是 `hub03/hub04/hub05/hub01`，位次 9 = `hub02`，
 *    位次 13 = `oth@cls01`；`oth@03` 明文 `title` 为「火车站」。
 * ② **线上素材 SVG 实证**（`https://centralgo.site/vitool/assets/oth/oth@NN.svg`）：
 *    - `oth@01`..`oth@04` 是裸图标（无外框）；`oth@hub01`..`hub05` 带 `#0c2f54` 蓝底
 *      方框，`oth@hub02` 是 `#14964e` 绿底（出租车）、`oth@hub01` 是 `#f3d420` 黄底（机场）；
 *    - `oth@yl.svg`：5×150 竖线，`fill: var(--mode-ydivider)`；
 *    - `oth@space.svg`：空 SVG（17×150）；
 *    - `oth@cls*`：`path[0]` = 圆角外框（`M95,28c…`）、`path[1]` = 字形、`path[2]` = 角标；
 *    - `oth@06`..`oth@30` 与 `oth@A`：**无外框**字母字形（栅格化逐字识别，
 *      `oth@06`=B …… `oth@13`=I（用 `<polygon>` 画，故 ③ 的栅格脚本首次跑成空白）、
 *      `oth@30`=Z；`oth@A`=A）；
 *    - `oth@31` 及以上全部 404 → 真实号段 `01`–`30`。
 * ③ **栅格化识别**（`.tmp-render-letters.mjs`，射线法填色 + path 折线展开）：
 *    `oth@cls01`..`cls12` = A..L；`cls13`..`cls15` = A1/A2/A3；`cls16`..`cls18` = B1/B2/B3；
 *    `cls19`..`cls21` = C1/C2/C3；`cls22`..`cls24` = D1/D2/D3；`cls25`/`cls26` = E1/E2；
 *    `cls27`/`cls28` = F1/F2（`cls29`+ 404）。
 * ④ **官方模板**：1-6-1 的 g1 栏把 `way@03` / `oth@A` / `oth@Dot` / `oth@06` / `stn@23`
 *    连排，正是「字母 A + 分隔点 + 字母 B」的色带序列形态。
 */
const nalOthIconAssets: Record<string, { iconId: string; framed: boolean; fillColor?: string }> = {
  // —— 位次 1-4：实验系列（裸图标，无方框）——
  'oth@01.svg': { iconId: 'train', framed: false },
  'oth@02.svg': { iconId: 'train', framed: false },
  'oth@03.svg': { iconId: 'bus', framed: false },
  'oth@04.svg': { iconId: 'airplane', framed: false },
  // —— 位次 5-8：经典系列（带方框；色值取素材 SVG 实际 fill）——
  'oth@hub03.svg': { iconId: 'train', framed: true, fillColor: NAL_HUB_BLUE },
  'oth@hub04.svg': { iconId: 'train', framed: true, fillColor: NAL_HUB_BLUE },
  'oth@hub05.svg': { iconId: 'bus', framed: true, fillColor: NAL_HUB_BLUE },
  'oth@hub01.svg': { iconId: 'airplane', framed: true, fillColor: NAL_HUB_AIRPORT },
  // —— 位次 9：出租车（绿底）——
  'oth@hub02.svg': { iconId: 'taxi', framed: true, fillColor: NAL_HUB_TAXI },
};

/** 实验系列「不带框的字母大文本」：`oth@A` = A，`oth@06`..`oth@30` = B..Z。 */
const nalOthBareLetterMap: Record<string, string> = {
  'oth@A.svg': 'A',
  'oth@06.svg': 'B',
  'oth@07.svg': 'C',
  'oth@08.svg': 'D',
  'oth@09.svg': 'E',
  'oth@10.svg': 'F',
  'oth@11.svg': 'G',
  'oth@12.svg': 'H',
  'oth@13.svg': 'I',
  'oth@14.svg': 'J',
  'oth@15.svg': 'K',
  'oth@16.svg': 'L',
  'oth@17.svg': 'M',
  'oth@18.svg': 'N',
  'oth@19.svg': 'O',
  'oth@20.svg': 'P',
  'oth@21.svg': 'Q',
  'oth@22.svg': 'R',
  'oth@23.svg': 'S',
  'oth@24.svg': 'T',
  'oth@25.svg': 'U',
  'oth@26.svg': 'V',
  'oth@27.svg': 'W',
  'oth@28.svg': 'X',
  'oth@29.svg': 'Y',
  'oth@30.svg': 'Z',
};

/**
 * 实验系列的分割点素材 `oth@Dot` → 字符「·」。
 *
 * 它和裸字母连排成「A · B」，因此**与字母同属「可拼接文本片段」**，
 * 由 `resolveNalOthTextPiece` 统一识别。此处单独成常量是因为两处都要用：
 * `parseNalAsset` 里判定素材语义、`parseNalGroups` 里决定是否参与合并。
 */
const NAL_OTH_DOT_ASSET = 'oth@Dot.svg';

/**
 * 经典系列「加框的字母大文本」：`oth@cls01`..`oth@cls28`。
 *
 * 一段是单字母（A-L），一段是「字母 + 下角标数字」（A1/B2/…）。
 * 角标**不是独立素材**，而是同一 SVG 的 `path[2]`，因此用大文本的
 * `suffix` 字段（角标功能）表达，不额外产元素。
 */
const nalOthFramedLetterMap: Record<string, { value: string; suffix: string }> = {
  'oth@cls01.svg': { value: 'A', suffix: '' },
  'oth@cls02.svg': { value: 'B', suffix: '' },
  'oth@cls03.svg': { value: 'C', suffix: '' },
  'oth@cls04.svg': { value: 'D', suffix: '' },
  'oth@cls05.svg': { value: 'E', suffix: '' },
  'oth@cls06.svg': { value: 'F', suffix: '' },
  'oth@cls07.svg': { value: 'G', suffix: '' },
  'oth@cls08.svg': { value: 'H', suffix: '' },
  'oth@cls09.svg': { value: 'I', suffix: '' },
  'oth@cls10.svg': { value: 'J', suffix: '' },
  'oth@cls11.svg': { value: 'K', suffix: '' },
  'oth@cls12.svg': { value: 'L', suffix: '' },
  'oth@cls13.svg': { value: 'A', suffix: '1' },
  'oth@cls14.svg': { value: 'A', suffix: '2' },
  'oth@cls15.svg': { value: 'A', suffix: '3' },
  'oth@cls16.svg': { value: 'B', suffix: '1' },
  'oth@cls17.svg': { value: 'B', suffix: '2' },
  'oth@cls18.svg': { value: 'B', suffix: '3' },
  'oth@cls19.svg': { value: 'C', suffix: '1' },
  'oth@cls20.svg': { value: 'C', suffix: '2' },
  'oth@cls21.svg': { value: 'C', suffix: '3' },
  'oth@cls22.svg': { value: 'D', suffix: '1' },
  'oth@cls23.svg': { value: 'D', suffix: '2' },
  'oth@cls24.svg': { value: 'D', suffix: '3' },
  'oth@cls25.svg': { value: 'E', suffix: '1' },
  'oth@cls26.svg': { value: 'E', suffix: '2' },
  'oth@cls27.svg': { value: 'F', suffix: '1' },
  'oth@cls28.svg': { value: 'F', suffix: '2' },
};

/**
 * 经典系列「加框大文本」判据：素材号落在 `oth@clsNN` 号段内。
 * 落在号段外（`oth@cls29`+ 在线上 404）走未识别告警，避免凭空造字符。
 */
function isNalFramedLetterAsset(assetName: string): boolean {
  return /^oth@cls\d{2}\.svg$/u.test(assetName);
}

export function parseMetroWayfindingImportFiles(
  files: readonly MetroWayfindingImportFile[],
): MetroWayfindingImportPreview {
  if (!files.length) {
    throw new Error('请选择工程文件。');
  }
  if (files.length > METRO_WAYFINDING_IMPORT_MAX_FILES) {
    throw new Error(`一次最多导入 ${METRO_WAYFINDING_IMPORT_MAX_FILES} 个工程文件。`);
  }
  for (const file of files) {
    if (file.size > METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES) {
      throw new Error(`${file.name} 超过 2 MB，已停止解析。`);
    }
  }

  const parsed = files.map(parseImportDocument);
  const source = parsed[0]!.source;
  if (parsed.some((document) => document.source !== source)) {
    throw new Error('不能在一次导入中混合不同生成器的工程文件。');
  }
  if ((source === 'yct' || source === 'nal-vitool') && parsed.length > 1) {
    throw new Error(
      source === 'yct' ? 'YCT 工程文件请逐个导入。' : 'NaL 工程本身已包含全部层，请逐个导入。',
    );
  }

  const warningCollector = createWarningCollector();
  parsed.forEach((document) => warningCollector.addAll(document.warnings));

  if (source === 'yct') {
    const document = parsed[0]!;
    if (!document.layout || !document.canvas) {
      throw new Error('YCT 工程缺少画布或版式数据。');
    }
    return {
      source,
      sourceLabel: document.sourceLabel,
      styleLabel: document.styleLabel,
      projectName: document.projectName,
      files: files.map(({ name, size }) => ({ name, size })),
      canvas: document.canvas,
      layout: document.layout,
      rowSources: buildRowSources(document.fileName, document.layout.rows),
      warnings: warningCollector.values(),
    };
  }

  const flattenedRows = parsed.flatMap((document) =>
    document.rows.map((row, index) => ({
      row,
      fileName: document.fileName,
      label:
        document.rows.length > 1 ? `${document.fileName} · 第 ${index + 1} 行` : document.fileName,
    })),
  );
  if (flattenedRows.length > 2) {
    warningCollector.add(
      'row-limit',
      `当前模板最多保留两行，已忽略其余 ${flattenedRows.length - 2} 行。`,
    );
  }
  const retainedRows = flattenedRows.slice(0, 2);
  if (!retainedRows.length) {
    throw new Error('工程文件中没有可转换的导视元素。');
  }

  const lengths = parsed.map((document) => document.canvasLength);
  const canvasLength = Math.max(1, ...lengths);
  if (new Set(lengths).size > 1) {
    warningCollector.add('canvas-length-mismatch', '工程文件长度不同，已采用较长的画布长度。');
  }
  const backgroundColor = parsed[0]!.backgroundColor;
  const foregroundColor = parsed[0]!.foregroundColor;
  if (
    parsed.some(
      (document) =>
        document.backgroundColor !== backgroundColor ||
        document.foregroundColor !== foregroundColor,
    )
  ) {
    warningCollector.add('palette-mismatch', '各文件默认配色不同，已采用第一个文件的配色。');
  }

  const layout: MetroWayfindingLayout = {
    backgroundColor,
    foregroundColor,
    mode: retainedRows.length > 1 ? 'double' : 'single',
    dividerBetweenRows:
      retainedRows.length > 1 && parsed.some((document) => document.dividerBetweenRows),
    rows: retainedRows.map((item) => item.row),
  };
  const canvas: MetroWayfindingProjectCanvas = {
    widthM: canvasLength,
    heightM: retainedRows.length > 1 ? 2 : 1,
    pxPerMeter: 128,
    alignToTile: false,
    tileSizePx: 128,
  };
  const summary = summarizeMetroWayfindingLayout(layout, canvas);

  return {
    source,
    sourceLabel: parsed[0]!.sourceLabel,
    styleLabel: uniqueLabels(parsed.map((document) => document.styleLabel)).join(' / '),
    projectName: uniqueLabels(parsed.map((document) => document.projectName)).join(' + '),
    files: files.map(({ name, size }) => ({ name, size })),
    canvas,
    layout,
    rowSources: retainedRows.map((item, index) => ({
      fileName: item.fileName,
      label: item.label,
      summary: summary.rows[index]?.content ?? '空白',
      elements: item.row,
    })),
    warnings: warningCollector.values(),
  };
}

export function reorderMetroWayfindingImportRows(
  preview: MetroWayfindingImportPreview,
  fromIndex: number,
  toIndex: number,
): MetroWayfindingImportPreview {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= preview.layout.rows.length ||
    toIndex >= preview.layout.rows.length
  ) {
    return preview;
  }
  const rows = [...preview.layout.rows];
  const rowSources = [...preview.rowSources];
  [rows[fromIndex], rows[toIndex]] = [rows[toIndex]!, rows[fromIndex]!];
  [rowSources[fromIndex], rowSources[toIndex]] = [rowSources[toIndex]!, rowSources[fromIndex]!];
  return { ...preview, layout: { ...preview.layout, rows }, rowSources };
}

export function resolveMetroWayfindingImportPreview(
  preview: MetroWayfindingImportPreview,
  mode: MetroWayfindingImportMode,
): MetroWayfindingImportPreview {
  if (mode === 'source-style' || preview.source === 'yct') return preview;

  const styleOnlyWarnings = new Set([
    'nal-style-approximation',
    'chitose-style-approximation',
    'chitose-addon-approximation',
    'moert-style-approximation',
    'palette-mismatch',
  ]);
  return {
    ...preview,
    styleLabel: METRO_WAYFINDING_SEMANTIC_TARGET_STYLE,
    layout: {
      ...preview.layout,
      backgroundColor: METRO_WAYFINDING_BACKGROUND,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
      rows: preview.layout.rows.map((row) =>
        applyMetroWayfindingRowContextDefaults(
          row.flatMap(normalizeImportedElementToSemanticElements),
        ),
      ),
    },
    warnings: preview.warnings.filter((warning) => !styleOnlyWarnings.has(warning.code)),
  };
}

function normalizeImportedElementToSemanticStyle(
  element: MetroWayfindingElement,
): MetroWayfindingElement {
  if (element.type === 'facility') {
    const isNoEntry = element.iconId === 'no-entry';
    return {
      ...element,
      frameShape: isNoEntry ? 'none' : 'rectangle',
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: isNoEntry ? METRO_WAYFINDING_WARNING_FOREGROUND : undefined,
    };
  }
  if (element.type === 'arrow') {
    return {
      ...element,
      framed: false,
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  if (element.type === 'largeText') {
    return {
      ...element,
      frameShape: element.value === '·' ? 'none' : 'rectangle',
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  if (element.type === 'text') {
    return normalizeImportedTextElement(element);
  }
  if (element.type === 'combination') {
    return {
      ...element,
      children: element.children.map(
        (child) =>
          normalizeImportedElementToSemanticStyle(child) as MetroWayfindingCombinationChild,
      ),
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      stripePosition: 'left',
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  return {
    ...element,
    backgroundColor: undefined,
    foregroundColor: undefined,
  };
}

function parseImportDocument(file: MetroWayfindingImportFile): ParsedImportDocument {
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch {
    throw new Error(`${file.name} 不是有效的 JSON 工程文件。`);
  }
  if (!isObject(value)) {
    throw new Error(`${file.name} 的工程根节点无效。`);
  }
  if (value.format === METRO_WAYFINDING_PROJECT_FORMAT) {
    return parseYctDocument(file.name, value);
  }
  if (value.type === 'nalvitool') {
    return parseNalDocument(file.name, value);
  }
  if (isMoertGuideGenDocument(value)) {
    return parseMoertDocument(file.name, value);
  }
  if (Array.isArray(value.columns) || Array.isArray(value.zones)) {
    return parseChitoseDocument(file.name, value);
  }
  throw new Error(`${file.name} 不是受支持的地铁导视工程格式。`);
}

function parseYctDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  if (root.schemaVersion !== METRO_WAYFINDING_PROJECT_SCHEMA_VERSION) {
    throw new Error(`${fileName} 使用了暂不支持的 YCT 工程版本。`);
  }
  if (!isObject(root.layout) || !isObject(root.canvas)) {
    throw new Error(`${fileName} 缺少 YCT 画布或版式数据。`);
  }
  const layout = parseMetroWayfindingLayout(JSON.stringify(root.layout));
  const canvas: MetroWayfindingProjectCanvas = {
    widthM: clampNumber(root.canvas.widthM, 1, 100, layout.mode === 'vertical' ? 1 : 8),
    heightM: clampNumber(
      root.canvas.heightM,
      1,
      100,
      layout.mode === 'vertical' ? 8 : layout.mode === 'double' ? 2 : 1,
    ),
    pxPerMeter: clampNumber(root.canvas.pxPerMeter, 32, 512, 128),
    alignToTile: root.canvas.alignToTile === true,
    tileSizePx: clampNumber(root.canvas.tileSizePx, 32, 512, 128),
  };
  return {
    source: 'yct',
    sourceLabel: 'YCT 地铁导视工程',
    styleLabel: '当前模板',
    projectName: stripJsonExtension(fileName),
    fileName,
    canvasLength: layout.mode === 'vertical' ? canvas.heightM : canvas.widthM,
    canvas,
    layout,
    backgroundColor: layout.backgroundColor,
    foregroundColor: layout.foregroundColor,
    dividerBetweenRows: layout.dividerBetweenRows,
    rows: layout.rows,
    warnings: [],
  };
}

function parseNalDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  const warningCollector = createWarningCollector();
  const definitions = isObject(root.definitions) ? root.definitions : {};
  const layers = isObject(root.layers) ? root.layers : {};
  const layerEntries = Object.entries(layers)
    .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .sort(([left], [right]) => layerIndex(left) - layerIndex(right));
  const importedAssetNames = layerEntries.flatMap(([, rawGroups]) =>
    rawGroups
      .filter(isObject)
      .flatMap((group) =>
        Array.isArray(group.elements)
          ? group.elements.filter(isString).map((asset) => asset.split(/[\\/]/u).at(-1) ?? asset)
          : [],
      ),
  );
  const hasExperimentalStyle = importedAssetNames.some(
    (assetName) => assetName.startsWith('line@') || nalExperimentalStyleAssets.has(assetName),
  );
  const hasClassicStyle = importedAssetNames.some(
    (assetName) =>
      assetName.startsWith('cls@') ||
      assetName.startsWith('clss@') ||
      nalClassicStyleAssets.has(assetName),
  );
  const styleLabel =
    hasExperimentalStyle && hasClassicStyle
      ? '北京地铁混合系列（经典 / 实验）'
      : hasExperimentalStyle
        ? '北京地铁实验系列（线路号色带）'
        : hasClassicStyle
          ? '北京地铁经典系列（车头标）'
          : '北京地铁系列（未检测到系列特征）';
  if (hasExperimentalStyle && hasClassicStyle) {
    warningCollector.add(
      'nal-mixed-series',
      '工程同时包含经典系列与实验系列组件，已逐元素保留可识别的系列样式。',
    );
  }
  const rows = layerEntries.map(([, rawGroups]) =>
    parseNalGroups(rawGroups as unknown[], definitions, warningCollector),
  );
  warningCollector.add(
    'nal-style-approximation',
    '字体、双色图标和分组间距已按当前模板近似转换；线路组件已按经典填充框或实验色带恢复。',
  );
  return {
    source: 'nal-vitool',
    sourceLabel: 'NaL 导向标志设计器',
    styleLabel,
    projectName: stripJsonExtension(fileName),
    fileName,
    // `size-l` = 画布长度（沿排布方向的格数）。vitool 的口径是「内容有多长画布就多长」，
    // 因此导出值可能是 `0`（内容自适应）——夹到下限 1 得到最小画布，比回退默认 8 更贴近原意。
    canvasLength: clampNumber(root['size-l'], 1, 100, 8),
    backgroundColor: root.mode === 'a' ? NAL_BACKGROUND : METRO_WAYFINDING_BACKGROUND,
    foregroundColor: METRO_WAYFINDING_FOREGROUND,
    dividerBetweenRows: root.group === true,
    rows,
    warnings: warningCollector.values(),
  };
}

function parseNalGroups(
  rawGroups: unknown[],
  definitions: JsonObject,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const groups = rawGroups.filter(isObject);
  const result: MetroWayfindingElement[] = [];
  // 记录「哪些下标是色带组合框」——用于后续把相邻色带素材继续并进同一个框。
  // 用旁路集合而不是给元素挂临时字段，避免把非模型字段写进产出结构。
  const bandCombinationIndices = new Set<number>();
  // 记录「哪些下标是 `oth@` 大文本合并组」——同样用旁路集合。
  const othCombinationIndices = new Set<number>();
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      result.push(createSpaceElement('flex'));
    }
    const align = resolveNalGroupAlign(group.align);
    const assets = Array.isArray(group.elements) ? group.elements.filter(isString) : [];
    assets.forEach((asset) => {
      const assetName = asset.split(/[\\/]/u).at(-1) ?? asset;
      const suffixDigit = resolveNalSuffixDigit(asset);
      if (suffixDigit) {
        // 下角标素材（`oth@one|two|thr|fou`）：并入**左侧**字母大文本。
        // 写进 `suffixes`（而不是 legacy 的 `suffix`）——现在下角标可以落在
        // 任意位置，`suffix` 只是「末尾那个」的兼容镜像。
        // 若左侧已是合并组，则并入组内最后一个大文本（仍是最靠近的那个字母）。
        const target = findLastLargeTextTarget(result, othCombinationIndices);
        if (target) {
          const [elementIndex, childIndex] = target;
          if (childIndex === undefined) {
            const element = result[elementIndex] as Extract<
              MetroWayfindingElement,
              { type: 'largeText' }
            >;
            result[elementIndex] = {
              ...element,
              ...appendMetroLargeTextSuffix(element, suffixDigit),
            };
          } else {
            const combination = result[elementIndex] as MetroWayfindingCombinationElement;
            const children = [...combination.children];
            const child = children[childIndex] as Extract<
              MetroWayfindingCombinationChild,
              { type: 'largeText' }
            >;
            children[childIndex] = {
              ...child,
              ...appendMetroLargeTextSuffix(child, suffixDigit),
            };
            result[elementIndex] = { ...combination, children };
          }
          return;
        }
        const detachedSuffix = createLargeTextElement('');
        result.push({
          ...detachedSuffix,
          ...appendMetroLargeTextSuffix(detachedSuffix, suffixDigit),
        });
        return;
      }
      const elements = parseNalAsset(asset, definitions, warnings);
      if (isNalBandAsset(assetName)) {
        // 相邻的色带内容（`sub@` 与线路标）合并进**同一个组合框**。
        // 原工程里这些素材本就排在一条连续色带上，拆成多个元素会让色带断裂、
        // 字母与线路记号各自单独成框，与源观感不符。
        //
        // 组合框**不能嵌套组合框**（`MetroWayfindingCombinationChild` 词表不含
        // `combination`），因此线路标的 children 要**摊平**进本容器，并把线路的
        // 框样式提升到容器上——见 `createNalBandCombinationElement` 的说明。
        const flattened: MetroWayfindingCombinationChild[] = [];
        let route: MetroWayfindingCombinationElement | undefined;
        for (const element of elements) {
          if (element.type === 'combination') {
            route = route ?? element;
            flattened.push(
              ...element.children.map(
                (child) => applyNalGroupAlign(child, align) as MetroWayfindingCombinationChild,
              ),
            );
          } else {
            flattened.push(applyNalGroupAlign(element, align) as MetroWayfindingCombinationChild);
          }
        }
        const lastIndex = result.length - 1;
        if (flattened.length && bandCombinationIndices.has(lastIndex)) {
          const previous = result[lastIndex] as MetroWayfindingCombinationElement;
          result[lastIndex] = { ...previous, children: [...previous.children, ...flattened] };
        } else if (flattened.length) {
          result.push(createNalBandCombinationElement(flattened, route));
          bandCombinationIndices.add(result.length - 1);
        }
        // flattened 为空（色带图标在保留原样式下被跳过）：什么都不加，也不新建空框。
        return;
      }
      // 实验系列的 `oth@` 文本素材（裸字母 + 分割点「·」，位次 41+）：
      // 在**保留原样式模式**下**合并进左侧大文本的 value**，得到**一个无边框
      // 大文本**（A + · + B → "A·B"）——内容保持不变，只是把源工程里排成一排的
      // 素材收进同一个大文本，而不是各自成框。
      // 语义模式再由 `normalizeMergedLetterLargeTextToSemanticElements` 按字母拆开。
      // 只合并「无框」的裸大文本；带框的（`oth@cls*`）各自独立成框。
      // 带**下角标**的前段照样可以合并（A₁ + B → "A₁B"）：角标的 `at` 指向
      // 合并前的码点位置，拼上 B 后仍停在 A 之后——这正是「任意位置角标」
      // 对导入的价值。带角标素材（oth@one/two…）已在上游并入 `suffixes`。
      if (resolveNalOthTextPiece(assetName) !== undefined && elements.length === 1) {
        const element = elements[0]!;
        if (element.type === 'largeText' && element.frameShape === 'none') {
          const lastIndex = result.length - 1;
          const previous = lastIndex >= 0 ? result[lastIndex] : undefined;
          if (previous?.type === 'largeText' && previous.frameShape === 'none') {
            result[lastIndex] = mergeMetroLargeTextValues(previous, element);
            return;
          }
        }
      }
      result.push(...elements.map((element) => applyNalGroupAlign(element, align)));
    });
  });
  return collapseAdjacentDuplicateFacilities(result);
}

/**
 * 合并**相邻且映射到同一 `iconId`** 的设施图标，只保留第一个。
 *
 * ## 为什么要合并
 * NaL 的 `stn@` 号段里，「人工售票处(09) / 问讯处(10) / 乘客服务中心(11)」是
 * **三个不同的图形但本模板只有一个 `service` 图标**。用户在源工程里把它们排成一排，
 * 导入后就会得到三个一模一样的图标，视觉上是重复噪音。
 * 用户 2026-09-19 决定：**相邻时只保留 1 个**（判据是「任意连续同 iconId 设施」，
 * 不限于 09/10/11——例如 08 与 37 都是 `ticket`，相邻时同样合并）。
 *
 * ## 边界
 * - 只在**同一栏内相邻**时合并；跨栏（中间隔了 `space`）不合并，因为那是用户主动分段。
 * - 只合并「图标本体完全等价」的：`iconId` 相同且方向 / 变体 / 前景色一致。
 *   03/04 这类镜像对（`direction` 不同）虽然同为 `escalator`，但语义相反，**不合并**。
 * - 语义模式下组合框内的设施不参与（那里由组合框自身表达），本函数只看顶层元素。
 */
function collapseAdjacentDuplicateFacilities(
  elements: MetroWayfindingElement[],
): MetroWayfindingElement[] {
  const result: MetroWayfindingElement[] = [];
  for (const element of elements) {
    if (element.type === 'facility') {
      const previous = result.at(-1);
      if (previous?.type === 'facility' && isEquivalentFacility(previous, element)) {
        // 相邻重复：保留**先出现**的那个（源工程里第一个通常是主语义），丢弃后者。
        continue;
      }
    }
    result.push(element);
  }
  return result;
}

/**
 * 判断两个设施图标是否「本体等价」——比较影响渲染的全部字段，
 * 而不是只比 `iconId`。镜像对（如 03/04 扶梯）方向相反，必须视为**不同**图标。
 *
 * ⚠️ 函数名**不要以 `Icon` 结尾**：`scripts/sync-material-symbols-font.mjs` 用
 * `/icon$/i` 匹配「返回字体图标名的函数」，会把本函数 `return` 里的 `'none'`
 * 当成 Material Symbols 图标名收进字体子集，导致 `icons:material-symbols:check` 报
 * 「缺少：none」。这里比较的是设施字段，与字体图标无关，故用 `isEquivalentFacility`。
 */
function isEquivalentFacility(
  left: Extract<MetroWayfindingElement, { type: 'facility' }>,
  right: Extract<MetroWayfindingElement, { type: 'facility' }>,
): boolean {
  return (
    left.iconId === right.iconId &&
    (left.direction ?? 'right') === (right.direction ?? 'right') &&
    (left.variant ?? 'one-way') === (right.variant ?? 'one-way') &&
    (left.foregroundColor ?? '') === (right.foregroundColor ?? '') &&
    (left.frameShape ?? 'none') === (right.frameShape ?? 'none')
  );
}

/**
 * 找出「应当接收下角标」的最近一个大文本 —— 即当前结果里从末尾数起第一个
 * 大文本元素（可能直接是 `largeText`，也可能是合并组内最后一个 `largeText` 子元素）。
 * 返回 `[元素下标, 子元素下标]`；直接大文本时子元素下标为 `undefined`。
 */
function findLastLargeTextTarget(
  result: readonly MetroWayfindingElement[],
  combinationIndices: ReadonlySet<number>,
): [number, number | undefined] | undefined {
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const element = result[index]!;
    if (element.type === 'largeText') return [index, undefined];
    if (element.type === 'combination' && combinationIndices.has(index)) {
      for (let childIndex = element.children.length - 1; childIndex >= 0; childIndex -= 1) {
        if (element.children[childIndex]?.type === 'largeText') return [index, childIndex];
      }
    }
    // 遇到非大文本元素（文本/图标/空格）即停止——角标只跟左侧紧邻的字母走。
    if (element.type !== 'space') break;
  }
  return undefined;
}

/**
 * 取出「可参与文本拼接」的实验系列 `oth@` 素材所代表的字符。
 *
 * 覆盖位次 41+ 的裸字母（`oth@A` / `oth@06`..`oth@30`，不含带框的 `oth@cls*`）
 * 与分割点 `oth@Dot`（→「·」）。返回 `undefined` 表示该素材不参与拼接。
 *
 * 之所以让分割点也参与：源工程里「A · B」是三个排在一起的素材，
 * 保留原样式要保住的就是 "A·B" 这个字面内容，因此「·」必须拼进 value。
 */
function resolveNalOthTextPiece(assetName: string): string | undefined {
  if (assetName === NAL_OTH_DOT_ASSET) return '·';
  return nalOthBareLetterMap[assetName];
}

/**
 * 构造「色带组合框」——承载相邻色带内容（`sub@` 字母/文本 + 线路标）的容器。
 *
 * ## 为什么必须**扁平化**而不是嵌套
 * `MetroWayfindingCombinationChild` 的词表**不含 `combination`**（见
 * `metro-wayfinding.ts`），组合框不能嵌套组合框。因此当色带里出现线路标时，
 * 做法是把线路组合框的 **children 摊平进本容器**，并把线路的框样式
 * （`frameFillMode` / `frameFillColor` / `frameStroke` / `stripePosition` / `scale`）
 * **提升到容器上**——视觉上仍是「一条色带 + 一个线路记号」，但不产生非法嵌套。
 *
 * ## 两种形态
 * - **纯 `sub@` 色带**（无线路标）：无描边条带底（`stripe`），透明色
 *   `NAL_LINE_10_COLOR` 仅作占位；缩放 1（用户规则 4）。
 * - **含线路标的色带**（如 `sub@04` + `line@12`）：沿用线路标自身的框样式与缩放，
 *   这样经典风格（`clss@`）能保住 0.65 与填充框，实验风格（`line@`）保住 1 与色带底。
 */
function createNalBandCombinationElement(
  children: MetroWayfindingCombinationChild[],
  route?: MetroWayfindingCombinationElement,
): MetroWayfindingCombinationElement {
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: route ? route.scale : METRO_WAYFINDING_COMBINATION_MAX_SCALE,
    children,
    frameFillMode: route ? route.frameFillMode : 'stripe',
    frameFillColor: route ? route.frameFillColor : NAL_LINE_10_COLOR,
    frameStroke: route ? route.frameStroke : false,
    stripePosition: route ? route.stripePosition : 'bottom',
    backgroundColor: route?.backgroundColor,
    foregroundColor: route?.foregroundColor,
  };
}

/**
 * NaL 的后缀标记素材：`oth@one` / `oth@two` / `oth@thr` / `oth@fou`
 * 表示「在大字号数字后追加 1 / 2 / 3 / 4」，需并入前一个 largeText 的 suffix。
 * 词缀写法是 vitool 运行时的固定口径，返回对应数字。
 */
function resolveNalSuffixDigit(asset: string): string | undefined {
  const assetName = asset.split(/[\\/]/u).at(-1) ?? asset;
  const match = assetName.match(/^oth@(one|two|thr|fou)\.svg$/u);
  if (!match) return undefined;
  return { one: '1', two: '2', thr: '3', fou: '4' }[match[1] as 'one' | 'two' | 'thr' | 'fou'];
}

/**
 * NaL group 的 `align` 只表达「整栏相对画板怎么排」，本模板没有等距/右对齐的等价概念，
 * 因此只把可映射的语义（居中）落到文本对齐上，其余保持元素自身对齐。
 * `equidistant` 是等距排列，属于栏间距控制，不影响元素内部排版。
 */
function resolveNalGroupAlign(value: unknown): NalGroupAlign | undefined {
  return value === 'left' || value === 'center' || value === 'right' || value === 'equidistant'
    ? value
    : 'left';
}

function applyNalGroupAlign(
  element: MetroWayfindingElement,
  align: NalGroupAlign | undefined,
): MetroWayfindingElement {
  if (align !== 'center' || element.type !== 'text') return element;
  return { ...element, align: 'center' };
}

function parseNalAsset(
  asset: string,
  definitions: JsonObject,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const assetName = asset.split(/[\\/]/u).at(-1) ?? asset;
  const definition = resolveNalTextDefinition(assetName, definitions);
  if (assetName.startsWith('custom_') || definition) {
    if (!definition) {
      warnings.add('nal-missing-definition', `缺少自定义文本 ${assetName} 的定义，已忽略。`);
      return [];
    }
    // originalSvg 仅作为源工程内嵌图形保留，不参与 JSON 语义转换。
    const chineseLines = readNalTextLines(definition, 'cn');
    const englishLines = readNalTextLines(definition, 'en');
    if (!chineseLines.length && !englishLines.length) {
      warnings.add('nal-empty-definition', `自定义文本 ${assetName} 没有可读文字，已忽略。`);
      return [];
    }
    return [
      createMultilineTextElement(
        chineseLines,
        englishLines,
        definition.drct === 'end' ? 'right' : definition.drct === 'start' ? 'left' : 'center',
      ),
    ];
  }
  // 单色分割线 / 空白（`oth@yl` / `oth@space`）与其余 `oth@` 号段统一在下方
  // 「其他 / 枢纽 / 字母」分支处理（那里有完整号段表）。
  // 历史实现里的 `oth@bw` 是纯臆造，vitool 任何来源都查不到，勿再加回。
  // 色带线路标 / 车头标。新版用 `line@*`，经典用 `clss@*`，`cls@*` 是车头标。
  // 线路名一律**查 `nalRouteAssetMap`**（三源交叉验证所得），
  // 千万不要用正则从素材号里抠数字当线路号：素材号是入库流水号，
  // 例如 clss@10 才是 10 号线、而新版同一线路是 line@12，号段本身有偏移。
  const routeLineName = nalRouteAssetMap[assetName];
  if (routeLineName) {
    return [
      createNalRouteElement(
        routeLineName,
        assetName.startsWith('clss@') || assetName.startsWith('cls@'),
      ),
    ];
  }
  if (
    assetName.startsWith('line@') ||
    assetName.startsWith('clss@') ||
    assetName.startsWith('cls@')
  ) {
    // 素材真实存在但线路名未能确证（详见 nalRouteAssetMap 注释中的「已知未能确证」段）。
    // 这里**故意不猜**线路号：编号位与后缀位都留空，只保留空组合框让用户手填，
    // 避免给出一个稳定但错误的线路号。留「号线」二字会变成「号线」这种残片，
    // 因此后缀同样置空。
    const series = assetName.startsWith('line@') ? 'experimental' : 'classic';
    warnings.add(
      'nal-unconfirmed-line',
      `素材 ${assetName} 的线路号未能确证，已生成待确认的线路组合框，请在编辑器中补全线路号。`,
    );
    return [createRouteCombinationElement('', '', '', NAL_LINE_10_COLOR, series)];
  }
  // —— 色带信息（`sub@`）——
  // 号段与语义见 `nalSubBandLetterMap` 上方注释（四源交叉确证）。
  // 注意：`sub@text-custom-<时间戳>` 属于用户自定义文本，已由上方 definitions
  // 分支按 `file` 字段拦截，不会走到这里。
  //
  // 本函数产出的是**保留原样式形态**：语义模式的差异化处理统一放在
  // `normalizeImportedElementToSemanticElements`（与线路组合框同一处），
  // 以免同一规则散落两处。
  if (assetName.startsWith('sub@')) {
    // 色带上的图标（出口 / 电梯 / 卫生间 / 轮椅 / 飞机）：保留原样式模式下跳过——
    // 图标本就印在色带底条上，再放一个独立图标会与色带重复。
    if (nalSubBandIconAssets[assetName]) return [];
    // 分割点「·」：原样保留为无框大文本（语义模式在归一化阶段丢弃）。
    if (assetName === NAL_SUB_BAND_DIVIDER) {
      return [createLargeTextElement('·', 'none')];
    }
    // 大写字母 A–N：带框大文本（两种模式都保留，语义模式另加单字母单框约束）。
    const letter = nalSubBandLetterMap[assetName];
    if (letter) {
      return [createLargeTextElement(letter, 'rectangle')];
    }
    // 其余 `sub@` 号（`sub@space*` 占位等）按弹性空格处理。
    return [createSpaceElement('flex')];
  }
  const facilityMapping = nalFacilityAssetMap[assetName];
  if (facilityMapping) {
    return [createFacilityElement(facilityMapping.iconId, facilityMapping.options)];
  }
  // 明确跳过的车站设施号（真实存在但本模板不表达）：不进画布，也不报未识别告警。
  if (nalFacilitySkippedAssets.has(assetName)) {
    return [];
  }
  // —— 方向指示（way@）——
  // 四个出口图标方向各异，统一转「向上出口」。
  if (nalDirectionExitAssets.has(assetName)) {
    return [
      createFacilityElement('exit', {
        direction: 'up',
        frameShape: 'rectangle',
        frameFillMode: 'color',
        frameFillColor: NAL_EXIT_COLOR,
        foregroundColor: METRO_WAYFINDING_FOREGROUND,
      }),
    ];
  }
  // 步行小人 / 禁止通行图形：按需求忽略，不进画布（也不报未识别告警）。
  if (nalDirectionIgnoredAssets.has(assetName)) {
    return [];
  }
  // 纯文本图标（下一站 / 内环 / 外环）。
  const directionText = nalDirectionTextAssets[assetName];
  if (directionText) {
    return [createTextElement(directionText.cn, directionText.en, directionText.align)];
  }
  // 箭头 + 文本合体素材：拆成箭头图标与文本两个元素。
  // 文本放在箭柄侧（朝左的箭头文本靠左、朝右的靠右），与箭头方向一致。
  const arrowWithText = nalDirectionArrowWithTextAssets[assetName];
  if (arrowWithText) {
    return [
      createArrowElement(arrowWithText.iconId),
      createTextElement(
        NAL_DIRECTION_ARROW_TEXT.cn,
        NAL_DIRECTION_ARROW_TEXT.en,
        arrowWithText.align,
      ),
    ];
  }
  const arrowId = nalArrowAssetMap[assetName];
  if (arrowId) {
    return [createArrowElement(arrowId)];
  }
  // —— 其他 / 枢纽 / 字母（`oth@`）——
  // 号段与语义见 `nalOthIconAssets` 上方注释（四源交叉确证 + 用户规则）。
  // 本函数产出的是**保留原样式形态**；「仅语义模式下合并相邻大文本」之类的差异
  // 统一放在归一化阶段，避免同一规则散落两处。
  if (assetName.startsWith('oth@')) {
    // 位次 1-4（实验）/ 5-8（经典）/ 9（出租车）：枢纽交通方式图标。
    const hubIcon = nalOthIconAssets[assetName];
    if (hubIcon) {
      // `taxi` 不在本模板的图标词表里，退化为不显式指定图标（渲染层走兜底），
      // 但保留方框与底色，让「这是一个交通方式图标」的语义不丢。
      return [
        createFacilityElement(hubIcon.iconId, {
          frameShape: hubIcon.framed ? 'rectangle' : 'none',
          frameFillMode: hubIcon.framed && hubIcon.fillColor ? 'color' : 'none',
          ...(hubIcon.fillColor ? { frameFillColor: hubIcon.fillColor } : {}),
          ...(hubIcon.framed
            ? { foregroundColor: resolveReadableForeground(hubIcon.fillColor ?? NAL_HUB_BLUE) }
            : {}),
        }),
      ];
    }
    // 位次 10 / 11：单色分割线。黄 / 白由主题变量决定，故两种观感是同一素材。
    if (assetName === 'oth@yl.svg') {
      return [createDividerElement('#FFF100')];
    }
    // 位次 12：空白占位。
    if (assetName === 'oth@space.svg') {
      return [createSpaceElement('fixed')];
    }
    // 位次 41+（实验系列）：**不带框**的字母大文本（`oth@A` = A、`oth@06`.. = B..Z）。
    const bareLetter = nalOthBareLetterMap[assetName];
    if (bareLetter) {
      return [createLargeTextElement(bareLetter, 'none')];
    }
    // 位次 41+（实验系列）：分割点。`oth@Dot` 的图形语义无明文，按「·」处理。
    if (assetName === NAL_OTH_DOT_ASSET) {
      return [createLargeTextElement('·', 'none')];
    }
    // 位次 13-40（经典系列）：**加框**大文本，带角标的用大文本的角标功能（suffix）。
    const framedLetter = nalOthFramedLetterMap[assetName];
    if (framedLetter) {
      const element = createLargeTextElement(framedLetter.value, 'rectangle');
      // 带框字母自带角标（`oth@cls13` = A₁）：同样写进 `suffixes`，
      // 这样后续若再拼字母（A₁ + B），角标仍能停在 A 后面而不是被挤到末尾。
      return [
        framedLetter.suffix
          ? { ...element, ...appendMetroLargeTextSuffix(element, framedLetter.suffix) }
          : element,
      ];
    }
    if (isNalFramedLetterAsset(assetName)) {
      // 号段合法但线上 404（`oth@cls29`+）：不猜字符，走未识别告警让用户手填。
      warnings.add('nal-unknown-asset', `素材 ${assetName} 的字符未能确证，已忽略。`);
      return [];
    }
    // 后缀标记 `oth@one|two|thr|fou` 表示「在大字号数字后追加 1/2/3/4」，
    // 已在 parseNalGroups 里单独处理（追加到前一个 largeText 的 suffix）。
    if (/^oth@(?:one|two|thr|fou)\.svg$/u.test(assetName)) {
      return [];
    }
  }

  warnings.add('nal-unknown-asset', `未识别 NaL 组件 ${assetName}，已忽略。`);
  return [];
}

function resolveNalTextDefinition(
  assetName: string,
  definitions: JsonObject,
): NalTextDefinition | undefined {
  const directDefinition = definitions[assetName];
  if (isObject(directDefinition)) return directDefinition as NalTextDefinition;

  return Object.values(definitions).find((value): value is NalTextDefinition => {
    if (!isObject(value)) return false;
    const definitionFileName = asString(value.file).split(/[\\/]/u).at(-1);
    return definitionFileName === assetName;
  });
}

/**
 * 读取 NaL 文本块的中文 / 英文行。
 *
 * 线上导出的字段有三组（见 NalTextDefinition 注释），旧实现只认 `c-cn<数字>`，
 * 会把普通文本框的 `cn` 之外的多层内容整段丢掉。现在的口径：
 * 1. `cn` / `en` 单行字段优先；
 * 2. 回退到 `a-cn` / `a-en1` / `a-en2`（多层文本框的第一组）；
 * 3. 再回退到 `c-cn1` / `c-cn2` / `c-en1` / `c-en2`（第二组）。
 * 数字后缀按 1、2 顺序拼行，避免 `c-cn10` 排在 `c-cn2` 前面的字符串序错误。
 */
function readNalTextLines(definition: NalTextDefinition, language: 'cn' | 'en'): string[] {
  const directText = asString(definition[language]).trim();
  if (directText) return [directText];

  const candidateKeys =
    language === 'cn'
      ? (['a-cn', 'c-cn1', 'c-cn2'] as const)
      : (['a-en1', 'a-en2', 'c-en1', 'c-en2'] as const);
  const lines = candidateKeys
    .map((key) => asString(definition[key]).trim())
    .filter(Boolean)
    .slice(0, 2);
  if (lines.length) return lines;

  // 兜底：兼容历史上出现过的 `c-cn` / `c-cn2` 混用写法。
  return Object.entries(definition)
    .filter(([key]) => new RegExp(`^c-${language}\\d*$`, 'u').test(key))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => asString(value).trim())
    .filter(Boolean);
}

function parseChitoseDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  const warningCollector = createWarningCollector();
  const addonId = asString(root.addonId) || 'default';
  const columns = Array.isArray(root.columns) ? root.columns.filter(isObject) : [];
  const rowContainers = columns.length
    ? columns
    : [{ zones: Array.isArray(root.zones) ? root.zones : [] }];
  const rows = rowContainers.map((container) =>
    parseChitoseZones(Array.isArray(container.zones) ? container.zones : [], warningCollector),
  );
  if (rows.every((row) => row.length === 0)) {
    throw new Error(`${fileName} 中没有可转换的标牌组件。`);
  }
  if (addonId !== 'default') {
    warningCollector.add(
      'chitose-addon-approximation',
      `附加风格 ${addonId} 没有完整映射，已保留可识别的文本、图标和颜色。`,
    );
  }
  warningCollector.add(
    'chitose-style-approximation',
    '标牌描边、字宽和组件固定宽度已按当前地铁导视模板近似转换。',
  );
  const styleName = addonId === 'default' ? '重庆轨道交通 2017' : `附加风格 ${addonId}`;
  const signStyle = asString(root.signStyleId);
  return {
    source: 'chitose-signmaker',
    sourceLabel: 'Chitose.City Sign Maker',
    styleLabel: signStyle ? `${styleName} · ${signStyle}` : styleName,
    projectName: asString(root.projectName) || stripJsonExtension(fileName),
    fileName,
    canvasLength: resolveChitoseCanvasLength(root.canvasWidth),
    backgroundColor: CHITOSE_BACKGROUND,
    foregroundColor: CHITOSE_FOREGROUND,
    dividerBetweenRows: rows.length > 1,
    rows,
    warnings: warningCollector.values(),
  };
}

function parseChitoseZones(
  rawZones: unknown[],
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const result: MetroWayfindingElement[] = [];
  rawZones.filter(isObject).forEach((zone) => {
    const category = asString(zone.category);
    const zoneColors = chitoseZoneColors(category, asString(zone.style));
    const components = Array.isArray(zone.components) ? zone.components.filter(isObject) : [];
    components.forEach((component) => {
      result.push(...parseChitoseComponent(component, category, zoneColors, warnings));
    });
  });
  return result;
}

function parseChitoseComponent(
  component: JsonObject,
  category: string,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const classNames = asString(component.className).split(/\s+/u).filter(Boolean);
  const dataset = isObject(component.dataset) ? component.dataset : {};
  const markup = asString(component.innerHTML);
  const document = parseHtmlFragment(markup);
  const asset =
    asString(dataset.src) || document.querySelector('[data-src]')?.getAttribute('data-src') || '';
  const cn = document.querySelector('.textCN')?.textContent?.trim() ?? '';
  const en = document.querySelector('.textEN')?.textContent?.trim() ?? '';
  const largeText = document.querySelector('.largeText')?.textContent?.trim() ?? '';
  const align = resolveChitoseAlignment(dataset, document);
  const style = asString(component.style);
  const reversed = /flex-direction\s*:\s*row-reverse/iu.test(style);

  if (classNames.includes('arrow')) {
    const arrowId = mapChitoseArrowAsset(asset);
    if (!arrowId) {
      warnings.add('chitose-unknown-arrow', `未识别箭头 ${asset || '（无资源名）'}，已忽略。`);
      return [];
    }
    return [createArrowElement(arrowId, colors)];
  }
  if (classNames.includes('lineNumber')) {
    const lineNumber = largeText || asString(dataset.lineId).replace(/^L/iu, '');
    const lineColor =
      extractFirstCssColor(markup) || extractFirstCssColor(style) || METRO_WAYFINDING_FOREGROUND;
    return [
      createRouteCombinationElement(lineNumber, cn, en, lineColor, 'chongqing', align, colors),
    ];
  }
  if (classNames.includes('exitNumber')) {
    return largeText ? [createLargeTextElement(largeText, 'none', colors)] : [];
  }
  if (
    classNames.includes('toTrain') ||
    classNames.includes('exit') ||
    classNames.includes('facility')
  ) {
    const iconId = mapChitoseFacilityAsset(asset, classNames);
    const icon = iconId
      ? createChitoseFacilityElement(
          iconId,
          category,
          colors,
          resolveChitoseFacilityDirection(asset, iconId),
          resolveChitoseFacilityVariant(asset, iconId),
        )
      : undefined;
    const text = cn || en ? createTextElement(cn, en, align, colors) : undefined;
    if (!icon) {
      warnings.add('chitose-unknown-facility', `未识别设施图标 ${asset || '（无资源名）'}。`);
    }
    const orderedElements: Array<MetroWayfindingElement | undefined> = reversed
      ? [text, icon]
      : [icon, text];
    return orderedElements.filter(isWayfindingElement);
  }
  if (classNames.includes('textBox')) {
    return [createTextElement(cn, en, align, colors)];
  }
  if (classNames.includes('largeText')) {
    const value = largeText || document.body.textContent?.trim() || '';
    return value ? [createLargeTextElement(value, 'none', colors)] : [];
  }
  if (classNames.includes('dividerBar')) {
    return [createDividerElement(colors.foregroundColor, colors.backgroundColor)];
  }
  if (classNames.includes('colorBar')) {
    warnings.add('chitose-color-bar', '独立色带已近似转换为细分割线。');
    return [
      createDividerElement(
        extractFirstCssColor(style) || extractFirstCssColor(markup) || '#8A8A8A',
        colors.backgroundColor,
      ),
    ];
  }
  if (classNames.includes('icon')) {
    if (asset.toLowerCase().includes('placeholder')) {
      return [createSpaceElement(/flex\s*:\s*1/iu.test(style) ? 'flex' : 'fixed', colors)];
    }
    const arrowId = mapChitoseArrowAsset(asset);
    if (arrowId) return [createArrowElement(arrowId, colors)];
    const iconId = mapChitoseFacilityAsset(asset, classNames);
    if (iconId) {
      return [
        createChitoseFacilityElement(
          iconId,
          category,
          colors,
          resolveChitoseFacilityDirection(asset, iconId),
          resolveChitoseFacilityVariant(asset, iconId),
        ),
      ];
    }
  }

  warnings.add(
    'chitose-unknown-component',
    `未识别组件 ${asString(component.className) || asString(component.tagName) || 'unknown'}，已忽略。`,
  );
  return [];
}

function createChitoseFacilityElement(
  iconId: string,
  category: string,
  colors: ElementColors,
  direction?: MetroWayfindingIconDirection,
  variant?: MetroWayfindingIconVariant,
): MetroWayfindingFacilityElement {
  if (iconId === 'no-entry') {
    return createFacilityElement(iconId, {
      frameShape: 'none',
      foregroundColor: METRO_WAYFINDING_WARNING_FOREGROUND,
    });
  }
  const frameFillColor =
    colors.backgroundColor ??
    (category === 'facility' ? CHITOSE_FACILITY_BACKGROUND : CHITOSE_FOREGROUND);
  const foregroundColor =
    colors.foregroundColor ??
    (category === 'facility' || category === 'exit' ? CHITOSE_FOREGROUND : CHITOSE_BACKGROUND);
  return createFacilityElement(iconId, {
    frameShape: 'rectangle',
    frameFillMode: 'color',
    frameFillColor,
    foregroundColor,
    ...(direction ? { direction } : {}),
    ...(variant ? { variant } : {}),
  });
}

function resolveChitoseFacilityDirection(
  asset: string,
  iconId: string,
): MetroWayfindingIconDirection | undefined {
  const name = asset.toLowerCase();
  // 楼梯：变种（上/下/双向）与方向（左/右）已拆分为两个维度。
  // 本函数只负责“方向”；“变种”见 resolveChitoseFacilityVariant。
  if (iconId === 'stairs') {
    if (name.includes('left') || name.includes('west')) return 'left';
    if (name.includes('right') || name.includes('east')) return 'right';
    // 上楼 / 下楼 / 双向楼梯的素材默认都是朝左的（水平翻转后的图形）。
    return 'left';
  }
  if (iconId !== 'exit') return undefined;
  if (name.includes('left') || name.includes('west')) return 'left';
  if (name.includes('right') || name.includes('east')) return 'right';
  if (name.includes('up') || name.includes('north')) return 'up';
  if (name.includes('down') || name.includes('south')) return 'down';
  return undefined;
}

// 外部项目的“上/下楼 / 双向楼梯”对应本项目的楼梯变种。
function resolveChitoseFacilityVariant(
  asset: string,
  iconId: string,
): MetroWayfindingIconVariant | undefined {
  if (iconId !== 'stairs') return undefined;
  const name = asset.toLowerCase();
  if (
    /(?:two[-_ ]?way|bidirectional|both[-_ ]?directions?)[_\s-]*stairs?|stairs?[_\s-]*(?:two[-_ ]?way|bidirectional)/iu.test(
      name,
    )
  ) {
    return 'two-way';
  }
  if (/(?:stairs?|stair)[-_ ]?(?:down|lower)|downstairs/iu.test(name)) return 'down';
  if (/(?:stairs?|stair)[-_ ]?(?:up|upper)|upstairs/iu.test(name)) return 'up';
  return 'two-way';
}

function mapChitoseFacilityAsset(asset: string, classNames: string[]): string | undefined {
  const name = asset.toLowerCase();
  if (name.includes('no_entry') || name.includes('no-entry')) return 'no-entry';
  // 外部项目（千岁 signmaker）的 accessible_restroom / third_restroom 图形与“家庭卫生间”
  // （男+女+小孩）同形——这是本项目自 6d76b0f 起一以贯之的映射，勿改回无障碍卫生间。
  // 本项目的“无障碍卫生间”（男+女+轮椅）在外部项目里没有对应资源。
  if (name.includes('accessible_restroom') || name.includes('accessible-restroom')) {
    return 'family-restroom';
  }
  if (name.includes('third_restroom') || name.includes('third-restroom')) {
    return 'family-restroom';
  }
  if (name.includes('family_restroom') || name.includes('family-restroom')) {
    return 'family-restroom';
  }
  if (name.includes('restroom')) return 'restroom';
  if (name.includes('accessible_elevator') || name.includes('elevator')) return 'elevator';
  if (name.includes('accessible_ramp')) return 'wheelchair';
  if (name.includes('accessible_passage') || name.includes('accessible')) return 'wheelchair';
  // 上楼 / 下楼 / 双向楼梯已合并为单一“楼梯”图标，具体朝向由 resolveChitoseFacilityDirection 决定。
  if (
    /(?:two[-_ ]?way|bidirectional|both[-_ ]?directions?)[_\s-]*stairs?|stairs?[_\s-]*(?:two[-_ ]?way|bidirectional)/iu.test(
      name,
    )
  ) {
    return 'stairs';
  }
  if (/(?:stairs?|stair)[-_ ]?(?:down|lower)|downstairs/iu.test(name)) {
    return 'stairs';
  }
  if (/(?:stairs?|stair)[-_ ]?(?:up|upper)|upstairs/iu.test(name)) return 'stairs';
  if (name.includes('stairs')) return 'stairs';
  if (name.includes('waiting')) return 'waiting';
  if (name.includes('nursing')) return 'nursing-room';
  if (name.includes('tickets')) return 'ticket';
  if (name.includes('exit')) return 'exit';
  if (name.includes('train') || name.includes('metro') || name.includes('monorail'))
    return 'subway';
  if (classNames.includes('exit')) return 'exit';
  if (classNames.includes('toTrain')) return 'subway';
  return undefined;
}

function mapChitoseArrowAsset(asset: string): MetroWayfindingArrowElement['iconId'] | undefined {
  const name = asset.toLowerCase();
  if (!name.includes('arrow')) return undefined;
  if (/(?:u[-_ ]?turn|uturn)/iu.test(name)) {
    if (name.includes('left') || name.includes('west')) return 'u-turn-left';
    if (name.includes('right') || name.includes('east')) return 'u-turn-right';
  }
  if (/turn/iu.test(name)) {
    if (name.includes('left') && (name.includes('up') || name.includes('north'))) {
      return 'turn-left-up';
    }
    if (name.includes('left') && (name.includes('down') || name.includes('south'))) {
      return 'turn-left-down';
    }
    if (name.includes('right') && (name.includes('up') || name.includes('north'))) {
      return 'turn-right-up';
    }
    if (name.includes('right') && (name.includes('down') || name.includes('south'))) {
      return 'turn-right-down';
    }
  }
  if (/left[-_ ]?down/iu.test(name)) return 'south-west';
  if (/right[-_ ]?down/iu.test(name)) return 'south-east';
  if (/left[-_ ]?up/iu.test(name)) return 'north-west';
  if (/right[-_ ]?up/iu.test(name)) return 'north-east';
  if (name.includes('left')) return 'west';
  if (name.includes('right')) return 'east';
  if (name.includes('down')) return 'south';
  return 'north';
}

function resolveChitoseAlignment(
  dataset: JsonObject,
  document: Document,
): MetroWayfindingTextAlign {
  const manualAlign = asString(dataset.manualAlign);
  if (manualAlign === 'left' || manualAlign === 'right' || manualAlign === 'center') {
    return manualAlign;
  }
  const styleAlign = document.querySelector<HTMLElement>('[style*="text-align"]')?.style.textAlign;
  return styleAlign === 'right' || styleAlign === 'center' ? styleAlign : 'left';
}

function chitoseZoneColors(category: string, style: string): ElementColors {
  const explicitBackground = extractFirstCssColor(style);
  if (category === 'exit') {
    return {
      backgroundColor: explicitBackground || CHITOSE_EXIT_BACKGROUND,
      foregroundColor: CHITOSE_FOREGROUND,
    };
  }
  if (category === 'facility') {
    return {
      backgroundColor: explicitBackground || CHITOSE_FACILITY_BACKGROUND,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
    };
  }
  return {
    backgroundColor:
      explicitBackground && explicitBackground !== CHITOSE_BACKGROUND
        ? explicitBackground
        : undefined,
    foregroundColor: undefined,
  };
}

/**
 * MoeRT-GuideGen（guidegen.0v0.my）工程格式的解析与语义转换。
 *
 * 结构：`{ version, config: { width, showSpecLine, theme }, rows: [[{ id, type, props }]] }`。
 * 组件 `type` 形如 `themes.chongqing.components.LineNum`，`props` 随主题而异：
 * 重庆 / 成都的线路组件用 `num + lineColor + customChinese`，北京用 `lineId + colorKey + textZh`。
 * 因此按「组件名 + 属性名」双维度分派，未覆盖的组件只记告警，不中断整份导入。
 *
 * 上游仓库：https://github.com/LYXOfficial/MoeRT-GuideGen（MIT）。
 * 这里只解析工程结构，不复用其主题渲染代码、字体与图标素材。
 */
const MOERT_GUIDEGEN_KNOWN_VERSION = 1;
const MOERT_GUIDEGEN_PX_PER_METER = 128;

/** 主题 key（`themes.` 之后的部分）→ 展示名。与上游 themereg 的注册顺序一致。 */
const moertThemeLabels: Record<string, string> = {
  chongqing: '重庆轨道交通',
  chengdu: '成都地铁',
  hongkong: '港铁 MTR',
  beijing: '北京地铁（新版）',
  beijingOld: '北京地铁（旧版）',
};

/**
 * 各主题的默认底色 / 前景色 / 出口字母底板色。
 * 取自上游 `themes/<主题>/define/colors.ts`：上游把「透明」写在组件属性里，
 * 真正画出来的底色由主题常量提供，所以画布色缺失时必须回落到这里。
 */
const moertThemeDefaults: Record<
  string,
  { background: string; foreground: string; exitPlate?: string }
> = {
  chongqing: { background: '#FFFFFF', foreground: '#000000', exitPlate: '#FFC72C' },
  chengdu: { background: '#444444', foreground: '#FFFFFF', exitPlate: '#444444' },
  hongkong: { background: '#000000', foreground: '#FFFFFF', exitPlate: '#6D92AA' },
  beijing: { background: '#142134', foreground: '#FFFFFF', exitPlate: '#25AA41' },
  beijingOld: { background: '#0E3463', foreground: '#FFFFFF', exitPlate: '#25AA41' },
};

/**
 * 北京两套主题的线路色键 → 十六进制。
 * 直接取自上游 `themes/beijing(-old)/define/colors.ts`，勿凭观感调整。
 */
const moertLineColorKeys: Record<string, string> = {
  line1: '#C23A30',
  line2: '#006098',
  line3: '#E60033',
  line4: '#008E9C',
  line5: '#A6217F',
  line6: '#D29700',
  line7: '#FAC671',
  line8: '#009B6B',
  line9: '#8FC31F',
  line10: '#009BC0',
  line11: '#ED796B',
  line12: '#C76B00',
  line13: '#F9E700',
  line14: '#D5A7A1',
  line15: '#6A357D',
  line16: '#76A32D',
  line17: '#00A9A9',
  line18: '#5654A2',
  line19: '#D6ABC1',
  line22: '#F7C8CE',
  line28: '#35570B',
  lineyizhuang: '#E40077',
  linefangshan: '#E46022',
  lines1: '#B25921',
  linechangping: '#DE82B2',
  linexijiao: '#E6081B',
  linecapitalairport: '#A29BBB',
  linedaxingairport: '#004BA0',
};

/**
 * 上游箭头方向 → 本模板箭头。
 * `ahead-*`（前方向左/右）对应「先左/右后上」，`back-*` 对应「先左/右后下」，
 * 港铁的 `turn-back` 没有独立掉头方向，统一按左掉头处理（已由样式近似告警覆盖）。
 */
const moertArrowIcons: Record<string, MetroWayfindingArrowElement['iconId']> = {
  up: 'north',
  down: 'south',
  left: 'west',
  right: 'east',
  'up-left': 'north-west',
  'up-right': 'north-east',
  'down-left': 'south-west',
  'down-right': 'south-east',
  'ahead-left': 'turn-left-up',
  'ahead-right': 'turn-right-up',
  'back-left': 'turn-left-down',
  'back-right': 'turn-right-down',
  'uturn-left': 'u-turn-left',
  'uturn-right': 'u-turn-right',
  'turn-back': 'u-turn-left',
};

/**
 * 上游设施图标键 → 本模板图标 id（键为去掉 `themes.*.components.Icon.props.icon.` 前缀后的名字）。
 * 只登记语义等价的图标；没有对应物的（AED、警务以外的广播/停车/轮椅以外的特殊设施等）
 * 一律走未知图标告警，避免把不同含义硬套成同一个图形。
 */
const moertFacilityIcons: Record<string, string> = {
  // 轨道交通 / 列车
  train: 'subway',
  metro: 'subway',
  mtr: 'subway',
  monorail: 'subway',
  cr: 'train',
  coach: 'train',
  kcr: 'train',
  sp1900: 'train',
  xrl: 'train',
  // 出口
  exit: 'exit',
  exit1: 'exit',
  exit2: 'exit',
  // 电梯 / 扶梯 / 楼梯
  elevator: 'elevator',
  lift: 'elevator',
  escalator: 'escalator',
  stairs: 'stairs',
  // 卫生间
  toilet: 'restroom',
  toilets: 'restroom',
  restroom: 'restroom',
  men: 'mens-restroom',
  male: 'mens-restroom',
  restroom_men: 'mens-restroom',
  women: 'womens-restroom',
  female: 'womens-restroom',
  restroom_women: 'womens-restroom',
  thirdtoilet: 'family-restroom',
  restroom_third: 'family-restroom',
  restroom_accessible: 'accessible-restroom',
  // 无障碍
  wheelchair: 'wheelchair',
  accessibility: 'wheelchair',
  accessibility_white: 'wheelchair',
  nursing: 'nursing-room',
  nursing_room: 'nursing-room',
  ramp: 'accessible-ramp',
  lifting_platform: 'wheelchair-lift',
  elevator_accessible: 'elevator',
  // 其他服务
  waitingroom: 'waiting',
  ticket: 'ticket',
  tickets: 'ticket',
  ticket_vending: 'ticket',
  customer: 'service',
  customer_service: 'service',
  ticket_service: 'service',
  inquiry: 'service',
  help_button: 'service',
  police: 'police',
  taxi: 'taxi',
  airplane: 'airplane',
  airport: 'airplane',
  boat: 'boat',
  no: 'no-entry',
  no_entry_dark: 'no-entry',
  no_entry_light: 'no-entry',
  no_entry_cross: 'no-entry',
  no_entry_cross_framed: 'no-entry',
};

/** 只有这些设施图标支持「方向」，其余图标即使带 `_left` / `_right` 后缀也不写入方向。 */
const moertDirectionalIcons = new Set(['stairs', 'escalator', 'wheelchair', 'wheelchair-lift']);

function isMoertGuideGenDocument(root: JsonObject): boolean {
  return typeof root.version === 'number' && isObject(root.config) && Array.isArray(root.rows);
}

function parseMoertDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  const warnings = createWarningCollector();
  const config = isObject(root.config) ? root.config : {};
  const rawRows = (Array.isArray(root.rows) ? root.rows : []).filter((row): row is unknown[] =>
    Array.isArray(row),
  );
  if (!rawRows.length) {
    throw new Error(`${fileName} 中没有可转换的标牌行。`);
  }
  const themeKey = asString(config.theme).replace(/^themes\./u, '');
  if (typeof root.version === 'number' && root.version > MOERT_GUIDEGEN_KNOWN_VERSION) {
    warnings.add(
      'moert-version',
      `工程版本 ${root.version} 高于已适配的 ${MOERT_GUIDEGEN_KNOWN_VERSION}，已按尽力解析处理。`,
    );
  }
  if (!moertThemeLabels[themeKey]) {
    warnings.add(
      'moert-theme-unmapped',
      `主题 ${themeKey || '（未标注）'} 没有专门映射，已按通用组件语义转换。`,
    );
  }

  const defaults = resolveMoertCanvasColors(rawRows, themeKey);
  const rows = rawRows.map((row) =>
    row
      .filter(isObject)
      .flatMap((component) => parseMoertComponent(component, themeKey, defaults, warnings)),
  );
  if (rows.every((row) => row.length === 0)) {
    throw new Error(`${fileName} 中没有可转换的标牌组件。`);
  }
  warnings.add(
    'moert-style-approximation',
    '主题字号、字宽与组件固定宽度已按当前地铁导视模板近似转换。',
  );

  return {
    source: 'moert-guidegen',
    sourceLabel: 'MoeRT-GuideGen',
    styleLabel: moertThemeLabels[themeKey] ?? (themeKey || '未标注主题'),
    projectName: stripJsonExtension(fileName),
    fileName,
    canvasLength: resolveMoertCanvasLength(config.width),
    backgroundColor: defaults.backgroundColor ?? METRO_WAYFINDING_BACKGROUND,
    foregroundColor: defaults.foregroundColor ?? METRO_WAYFINDING_FOREGROUND,
    dividerBetweenRows: rows.length > 1,
    rows,
    warnings: warnings.values(),
  };
}

function parseMoertComponent(
  component: JsonObject,
  themeKey: string,
  defaults: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const type = asString(component.type);
  const name = type.split('.').pop() ?? '';
  const props = isObject(component.props) ? component.props : {};
  const colors = resolveMoertElementColors(props, defaults);
  const align = resolveMoertAlign(props.align);

  switch (name) {
    case 'Arrow': {
      // 北京两套主题把方向存在 `direction`，重庆 / 成都 / 港铁存在 `type`。
      const arrowType = asString(props.direction) || asString(props.type);
      const iconId = moertArrowIcons[arrowType];
      if (!iconId) {
        warnings.add('moert-unknown-arrow', `未识别箭头方向 ${arrowType || '（空）'}，已忽略。`);
        return [];
      }
      const elements: MetroWayfindingElement[] = [createArrowElement(iconId, colors)];
      // 北京箭头可附带「下一站」这类小字，开启 showText 时才输出。
      if (props.showText === true) {
        const chinese = asString(props.textZh);
        const english = asString(props.textEn);
        if (chinese || english) elements.push(createTextElement(chinese, english, align, colors));
      }
      return elements;
    }
    case 'Icon': {
      // 上游把图标存成完整 i18n 键，如 `themes.chongqing.components.Icon.props.icon.train`。
      const rawIcon = asString(props.icon).split('.').pop() ?? '';
      const icon = resolveMoertFacilityIcon(rawIcon);
      if (!icon) {
        warnings.add(
          'moert-unknown-icon',
          `未识别图标 ${rawIcon || '（空）'}（主题 ${themeKey || '未知'}），已忽略。`,
        );
        return [];
      }
      return [createFacilityElement(icon.iconId, { ...colors, direction: icon.direction })];
    }
    case 'ExitIcon': {
      // 北京主题的出口图标按版式分为 exitA/B/C、exitLongA/B 与 emergency 六种，
      // 本模板只有单一出口图标，紧急出口额外提示语义缺失。
      if (asString(props.variant) === 'emergency') {
        warnings.add('moert-emergency-exit', '紧急出口没有独立图标，已按普通出口图标转换。');
      }
      return [createFacilityElement('exit', colors)];
    }
    case 'ToTrain': {
      // 北京旧版的「去往列车」是带线路色底板的列车图形，底板色存在 plateColor 上。
      const plateColor = normalizeMoertColor(props.plateColor);
      return [
        createFacilityElement(
          'subway',
          plateColor
            ? {
                ...colors,
                frameShape: 'rectangle',
                frameFillMode: 'color',
                frameFillColor: plateColor,
                foregroundColor: resolveReadableForeground(plateColor),
              }
            : colors,
        ),
      ];
    }
    case 'LineNum':
    case 'Line':
      return parseMoertLineComponent(name, props, themeKey, align, colors, warnings);
    case 'LineText':
      return parseMoertLineTextComponent(props, themeKey, align, colors, warnings);
    case 'Platform':
      // 港铁站台号是圆形色块，用圆形外框比矩形更接近原图。
      return parseMoertFilledLargeText(
        asString(props.num) || asString(props.text),
        props.color,
        'circle',
        defaults,
        colors,
        warnings,
      );
    case 'NumAlphabet':
      return parseMoertNumAlphabet(props, colors, warnings);
    case 'StationNumber':
      return parseMoertStationNumber(props, align, colors, warnings);
    case 'Text':
    case 'StationName':
    case 'StationSign':
      return parseMoertTextComponent(props, align, colors, warnings);
    case 'DualText':
    case 'ExitName':
      return parseMoertDualText(props, align, colors);
    case 'Direction':
    case 'DirectionLoop':
      return parseMoertDirection(name, props, align, colors);
    case 'TrainDirection':
    case 'LoopNextStation':
      return parseMoertJoinedText(name, props, align, colors);
    case 'Exit':
      // 港铁出口字母的底板色不在属性里（属性写的是 transparent），由主题的 exitletter 提供。
      return parseMoertFilledLargeText(
        asString(props.letter),
        normalizeMoertColor(props.background) ?? moertThemeDefaults[themeKey]?.exitPlate,
        'rectangle',
        defaults,
        colors,
        warnings,
      );
    case 'ExitLetter':
    case 'ExitNum':
      return parseMoertExitCodes(name, props, align, defaults, colors, warnings);
    case 'Spacing':
      return [createSpaceElement('flex', colors)];
    case 'Blank': {
      // Blank 是固定像素宽的空隙（默认 20px），按 16px 一格换算成固定空白。
      const width = Number(props.width);
      const units = Number.isFinite(width)
        ? Math.max(1, Math.min(10, Math.round(width / METRO_WAYFINDING_GAP)))
        : 1;
      return [createSpaceElement('fixed', colors, units)];
    }
    case 'SpecLine':
      // 规格线在上游是可见的竖直分隔线（港铁、北京都在用），转成同色的分割线。
      return [
        createDividerElement(
          normalizeMoertColor(props.foreground) ??
            colors.foregroundColor ??
            METRO_WAYFINDING_FOREGROUND,
          colors.backgroundColor,
        ),
      ];
    case 'TwoRowContainer':
      return parseMoertTwoRowContainer(props, themeKey, defaults, warnings);
    default:
      warnings.add(
        'moert-unknown-component',
        `未识别组件 ${name || asString(component.type) || 'unknown'}，已忽略。`,
      );
      return [];
  }
}

function parseMoertLineComponent(
  name: string,
  props: JsonObject,
  themeKey: string,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const lineColor =
    normalizeMoertColor(props.lineColor) ??
    resolveMoertLineColorByKey(asString(props.colorKey)) ??
    normalizeMoertColor(props.color) ??
    METRO_WAYFINDING_FOREGROUND;
  const chinese = asString(props.chinese) || asString(props.textZh);
  const english = asString(props.english) || asString(props.textEn);
  const num = asString(props.num) || asString(props.lineId);

  // 带编号的线路标：重庆 / 成都 / 北京新版是「编号 + 号线」，北京旧版是整体填充底板。
  const numbered = name === 'LineNum' || (name === 'Line' && themeKey === 'beijingOld');
  if (numbered && num) {
    const customChinese = asString(props.customChinese);
    const customEnglish = asString(props.customEnglish);
    // 北京主题的 textZh 本身已带「号线」，若直接当后缀会渲染成「1 1号线」，这里剥掉重复编号。
    let suffix = customChinese || chinese || '号线';
    if (!customChinese && suffix.startsWith(num)) {
      suffix = suffix.slice(num.length) || '号线';
    }
    const children: MetroWayfindingCombinationChild[] = [
      createLargeTextElement(num),
      createTextElement(suffix, customEnglish || english || `Line ${num}`, align),
    ];
    if (themeKey === 'beijing') {
      // 北京新版：线路色是编号下方的一条横色带。
      return [createStripeCombinationElement(children, lineColor, 'bottom', colors)];
    }
    if (themeKey === 'beijingOld') {
      // 北京旧版：编号与文字整体压在圆角线路色底板里。
      return [createFilledCombinationElement(children, lineColor, colors)];
    }
    // 重庆 / 成都：线路色是编号左侧的竖色带。
    return [createStripeCombinationElement(children, lineColor, 'left', colors)];
  }
  if (!chinese && !english) {
    warnings.add('moert-empty-line', '线路组件缺少线路名，已忽略。');
    return [];
  }
  // 港铁 Line 是「整块线路色 + 白色线路名」，用文本内的线路色块表达；
  // 其余主题的 LineText 是「细色带 + 线路名」，用侧边色带组合框表达。
  if (name === 'Line') return [createColoredLineText(chinese, english, lineColor, align, colors)];
  return [
    createStripeCombinationElement(
      [createTextElement(chinese, english, align)],
      lineColor,
      'left',
      colors,
    ),
  ];
}

function parseMoertLineTextComponent(
  props: JsonObject,
  themeKey: string,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const chinese = asString(props.chinese) || asString(props.textZh);
  const english = asString(props.english) || asString(props.textEn);
  if (!chinese && !english) {
    warnings.add('moert-empty-line', '线路组件缺少线路名，已忽略。');
    return [];
  }
  const lineColor =
    normalizeMoertColor(props.lineColor) ??
    resolveMoertLineColorByKey(asString(props.colorKey)) ??
    METRO_WAYFINDING_FOREGROUND;
  if (themeKey === 'hongkong') {
    return [createColoredLineText(chinese, english, lineColor, align, colors)];
  }
  return [
    createStripeCombinationElement(
      [createTextElement(chinese, english, align)],
      lineColor,
      'left',
      colors,
    ),
  ];
}

function parseMoertNumAlphabet(
  props: JsonObject,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const value = asString(props.text);
  if (!value) {
    warnings.add('moert-empty-text', '数字字母组件内容为空，已忽略。');
    return [];
  }
  // `block` 是带底板的编号块，`fit` 是纯文字，分别对应矩形外框与无外框的大文本。
  return [
    createLargeTextElement(value, asString(props.type) === 'block' ? 'rectangle' : 'none', colors),
  ];
}

function parseMoertStationNumber(
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const lines = Array.isArray(props.lines) ? props.lines.filter(isObject) : [];
  const mainRows: MetroWayfindingMainSegment[][] = lines
    .map((line) => {
      const lineNumber = asString(line.lineNum);
      const stationNumber = asString(line.stationNum);
      const segments: MetroWayfindingMainSegment[] = [];
      if (lineNumber) {
        segments.push({
          kind: 'line',
          value: lineNumber.slice(0, 160),
          color: normalizeMoertColor(line.color) ?? METRO_WAYFINDING_FOREGROUND,
        });
      }
      if (stationNumber) {
        segments.push({ kind: 'text', value: stationNumber.slice(0, 160) });
      }
      return segments;
    })
    .filter((segments) => segments.length > 0);
  if (!mainRows.length) {
    warnings.add(
      'moert-station-number-missing',
      '车站编号组件缺少线路与编号数据（上游按默认值渲染），已忽略。',
    );
    return [];
  }
  return [createSegmentedTextElement(mainRows, align, colors)];
}

function parseMoertTextComponent(
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const chinese = asString(props.chinese) || asString(props.nameZh);
  const english = asString(props.english) || asString(props.nameEn);
  if (!chinese && !english) {
    warnings.add('moert-empty-text', '文本组件内容为空，已忽略。');
    return [];
  }
  // 港铁 Text 提供 small / large 两档；本模板没有字号字段，
  // small 用「全副文本行」表达，large 用默认的主 / 副文本组合。
  if (asString(props.fontsize) === 'small') {
    return [createSecondaryTextElement([chinese, english], align, colors)];
  }
  return [createTextElement(chinese, english, align, colors)];
}

function parseMoertDualText(
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
): MetroWayfindingElement[] {
  const mainLines = [asString(props.line1chinese), asString(props.line2chinese)].filter(Boolean);
  // 北京旧版 DualText 提供 showEn 开关，关掉时英文行不参与渲染。
  const showEnglish = props.showEn !== false;
  const secondaryLines = showEnglish
    ? [asString(props.line1english), asString(props.line2english)].filter(Boolean)
    : [];
  if (!mainLines.length && !secondaryLines.length) return [];
  return [createMultilineTextElement(mainLines, secondaryLines, align, colors)];
}

function parseMoertDirection(
  name: string,
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
): MetroWayfindingElement[] {
  // 环线方向的「内环 / Clockwise Loop」在源版式里位于主方向之上，按原顺序输出。
  const mainLines =
    name === 'DirectionLoop'
      ? [asString(props.tipchinese), asString(props.tochinese)].filter(Boolean)
      : [asString(props.tochinese), asString(props.viachinese)].filter(Boolean);
  const secondaryLines =
    name === 'DirectionLoop'
      ? [asString(props.tipenglish), asString(props.toenglish)].filter(Boolean)
      : [asString(props.toenglish), asString(props.viaenglish)].filter(Boolean);
  if (!mainLines.length && !secondaryLines.length) return [];
  return [createMultilineTextElement(mainLines, secondaryLines, align, colors)];
}

function parseMoertJoinedText(
  name: string,
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
): MetroWayfindingElement[] {
  // 开往方向 / 环线下一站都是「小前缀 + 站名」的两段结构，本模板没有对应容器，
  // 合并成一条文本行以保证内容不丢失。
  const main =
    name === 'TrainDirection'
      ? joinMoertText(asString(props.prefixZh), asString(props.destinationZh))
      : joinMoertText(asString(props.nextZh), asString(props.stationZh));
  const secondary =
    name === 'TrainDirection'
      ? joinMoertText(asString(props.prefixEn), asString(props.destinationEn))
      : joinMoertText(asString(props.nextEn), asString(props.stationEn));
  if (!main && !secondary) return [];
  return [createTextElement(main, secondary, align, colors)];
}

function parseMoertExitCodes(
  name: string,
  props: JsonObject,
  align: MetroWayfindingTextAlign,
  defaults: ElementColors,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const codes = Array.isArray(props.exits)
    ? props.exits
        .filter(isObject)
        .map((exit) => `${asString(exit.letter)}${asString(exit.number)}`)
        .filter(Boolean)
    : [];
  const value = codes.join('·');
  if (!value) {
    warnings.add('moert-empty-exit', '出口编号组件内容为空，已忽略。');
    return [];
  }
  const elements: MetroWayfindingElement[] = [
    createFilledLargeText(value, props.background, 'rectangle', defaults, colors),
  ];
  if (name === 'ExitNum') {
    // 北京「出入口编号」把东/西/南/北方向字直接拼在名称后面：
    // 中文按「东西南北」顺序拼接、英文按「北南东西」顺序拼成一个首字母大写的词。
    // 这里按上游 render 的实现原样复现，避免丢掉可见的方向信息。
    const directions = resolveMoertExitDirectionText(props.directions);
    const chinese = [asString(props.textZh), directions.zh].filter(Boolean).join('');
    const english = [asString(props.textEn), directions.en].filter(Boolean).join(' ');
    if (chinese || english) elements.push(createTextElement(chinese, english, align, colors));
  }
  return elements;
}

/**
 * 北京「出入口编号」的方向标注拼写规则（照上游 render 实现复现）：
 * 中文按「东、西、南、北」排序后逐字拼接；英文按「北、南、东、西」排序后
 * 拼成一个单词，只有首字母大写。
 */
const moertExitDirectionZh: Record<string, string> = {
  east: '东',
  west: '西',
  south: '南',
  north: '北',
};
const moertExitDirectionEn: Record<string, string> = {
  east: 'East',
  west: 'West',
  south: 'South',
  north: 'North',
};
const moertExitDirectionOrderZh = ['east', 'west', 'south', 'north'];
const moertExitDirectionOrderEn = ['north', 'south', 'east', 'west'];

function resolveMoertExitDirectionText(raw: unknown): { zh: string; en: string } {
  const values = Array.isArray(raw) ? raw.map(asString) : [];
  const zh = moertExitDirectionOrderZh
    .filter((direction) => values.includes(direction))
    .map((direction) => moertExitDirectionZh[direction])
    .join('');
  const words = moertExitDirectionOrderEn
    .filter((direction) => values.includes(direction))
    .map((direction) => moertExitDirectionEn[direction]);
  const en = words.length
    ? words[0] +
      words
        .slice(1)
        .map((word) => word.toLowerCase())
        .join('')
    : '';
  return { zh, en };
}

function parseMoertTwoRowContainer(
  props: JsonObject,
  themeKey: string,
  defaults: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const containerRows = (Array.isArray(props.children) ? props.children : []).filter(
    (row): row is unknown[] => Array.isArray(row),
  );
  const elements = containerRows.flatMap((row) =>
    row
      .filter(isObject)
      .flatMap((component) => parseMoertComponent(component, themeKey, defaults, warnings)),
  );
  if (elements.length) {
    warnings.add('moert-two-row-container', '双行容器已展开为同一行，容器内的上下分行不再保留。');
  }
  return elements;
}

function parseMoertFilledLargeText(
  value: string,
  rawFillColor: unknown,
  shape: 'rectangle' | 'circle',
  defaults: ElementColors,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  if (!value) {
    warnings.add('moert-empty-text', '文本组件内容为空，已忽略。');
    return [];
  }
  return [createFilledLargeText(value, rawFillColor, shape, defaults, colors)];
}

function resolveMoertAlign(value: unknown): MetroWayfindingTextAlign {
  const align = asString(value);
  return align === 'right' || align === 'center' ? align : 'left';
}

function resolveMoertFacilityIcon(
  rawIcon: string,
): { iconId: string; direction?: MetroWayfindingIconDirection } | undefined {
  const normalized = rawIcon.trim().toLowerCase();
  if (!normalized) return undefined;
  const directional = normalized.match(/^(.*)_(left|right)$/u);
  const base = directional ? (directional[1] ?? normalized) : normalized;
  const iconId = moertFacilityIcons[base];
  if (!iconId) return undefined;
  const direction = directional?.[2] as MetroWayfindingIconDirection | undefined;
  return {
    iconId,
    direction: direction && moertDirectionalIcons.has(iconId) ? direction : undefined,
  };
}

function resolveMoertLineColorByKey(key: string): string | undefined {
  return moertLineColorKeys[key.trim().toLowerCase()];
}

function resolveMoertCanvasLength(value: unknown): number {
  const width = Number(value);
  // 上游按像素标注牌面宽度，本模板以米为画布单位、默认 128 px/m。
  return Number.isFinite(width)
    ? Math.max(1, Math.min(100, Math.round(width / MOERT_GUIDEGEN_PX_PER_METER)))
    : 4;
}

/**
 * 画布底色 / 前景色取各组件 `props.background`、`props.foreground` 的众数：
 * 上游把画布颜色下沉到了组件上，没有单独的画布字段。
 * 组件的背景普遍写成 `transparent` 时（成都、港铁、北京旧版），回落到主题常量。
 */
function resolveMoertCanvasColors(rawRows: readonly unknown[][], themeKey: string): ElementColors {
  const backgrounds = new Map<string, number>();
  const foregrounds = new Map<string, number>();
  rawRows
    .flat()
    .filter(isObject)
    .forEach((component) => {
      const props = isObject(component.props) ? component.props : {};
      const background = normalizeMoertColor(props.background);
      if (background) backgrounds.set(background, (backgrounds.get(background) ?? 0) + 1);
      const foreground = normalizeMoertColor(props.foreground);
      if (foreground) foregrounds.set(foreground, (foregrounds.get(foreground) ?? 0) + 1);
    });
  const themeDefaults = moertThemeDefaults[themeKey];
  const backgroundColor = resolveMoertMostFrequent(backgrounds) ?? themeDefaults?.background;
  return {
    backgroundColor,
    foregroundColor:
      resolveMoertMostFrequent(foregrounds) ??
      themeDefaults?.foreground ??
      resolveReadableForeground(backgroundColor),
  };
}

function resolveMoertElementColors(props: JsonObject, defaults: ElementColors): ElementColors {
  const background = normalizeMoertColor(props.background);
  const foreground = normalizeMoertColor(props.foreground);
  // 与画布底色一致的组件背景不落到元素上，避免每个元素都带一层同色底块。
  // 前景色必须保留：线路组合框会据此决定文字颜色，丢掉会回退成按线路色反推的白色。
  return {
    backgroundColor: background && background !== defaults.backgroundColor ? background : undefined,
    foregroundColor: foreground,
  };
}

function resolveMoertMostFrequent(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function normalizeMoertColor(value: unknown): string | undefined {
  const raw = asString(value).trim();
  if (!raw || raw.toLowerCase() === 'transparent') return undefined;
  return cssColorToHex(raw);
}

function joinMoertText(prefix: string, value: string): string {
  return [prefix.trim(), value.trim()].filter(Boolean).join(' ');
}

function createColoredLineText(
  chinese: string,
  english: string,
  color: string,
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
): Extract<MetroWayfindingElement, { type: 'text' }> {
  if (!chinese) return createTextElement(chinese, english, align, colors);
  const element = createTextElement(chinese, english, align, colors);
  element.rows[0] = {
    id: createMetroWayfindingId('text-main-import'),
    kind: 'main',
    segments: [{ kind: 'line', value: chinese.slice(0, 160), color }],
  };
  return element;
}

function createSegmentedTextElement(
  mainRows: readonly (readonly MetroWayfindingMainSegment[])[],
  align: MetroWayfindingTextAlign,
  colors: ElementColors,
): Extract<MetroWayfindingElement, { type: 'text' }> {
  return {
    id: createMetroWayfindingId('text-import'),
    type: 'text',
    align,
    writingMode: 'horizontal',
    rows: mainRows.map((segments) => ({
      id: createMetroWayfindingId('text-main-import'),
      kind: 'main' as const,
      segments: segments.map((segment) => ({ ...segment })),
    })),
    ...colors,
  };
}

function createFilledLargeText(
  value: string,
  rawFillColor: unknown,
  shape: 'rectangle' | 'circle',
  defaults: ElementColors,
  colors: ElementColors,
): Extract<MetroWayfindingElement, { type: 'largeText' }> {
  const rawFill = normalizeMoertColor(rawFillColor);
  // 与画布同色的底板不可见，不要为它画一圈与外框等大的色块。
  const fill = rawFill && rawFill !== defaults.backgroundColor ? rawFill : undefined;
  const element = createLargeTextElement(value, fill ? shape : 'none', colors);
  if (!fill) return element;
  return {
    ...element,
    frameFillMode: 'color',
    frameFillColor: fill,
    foregroundColor: resolveReadableForeground(fill),
  };
}

/**
 * 「侧边 / 底部色带 + 内容」的组合框，用于重庆 / 成都 / 北京的线路标识。
 * 上游的线路色在这三种版式里分别是左侧竖条、下方横条、整体填充。
 */
function createStripeCombinationElement(
  children: MetroWayfindingCombinationChild[],
  color: string,
  stripePosition: MetroWayfindingCombinationStripePosition,
  colors: ElementColors,
): MetroWayfindingCombinationElement {
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: METRO_WAYFINDING_COMBINATION_MAX_SCALE,
    children,
    frameFillMode: 'stripe',
    frameFillColor: color,
    frameStroke: false,
    stripePosition,
    ...colors,
  };
}

/** 「整块线路色 + 内容」的组合框，用于北京旧版的实心线路底板。 */
function createFilledCombinationElement(
  children: MetroWayfindingCombinationChild[],
  color: string,
  colors: ElementColors,
): MetroWayfindingCombinationElement {
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: METRO_WAYFINDING_COMBINATION_MAX_SCALE,
    children,
    frameFillMode: 'color',
    frameFillColor: color,
    frameStroke: false,
    stripePosition: 'left',
    foregroundColor: colors.foregroundColor ?? resolveReadableForeground(color),
    backgroundColor: colors.backgroundColor,
  };
}

/** 全副文本行的小字文本：本模板没有字号字段，用「只含次要文本行」表达更小的字号。 */
function createSecondaryTextElement(
  lines: readonly string[],
  align: MetroWayfindingTextAlign,
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'text' }> {
  return {
    id: createMetroWayfindingId('text-import'),
    type: 'text',
    align,
    writingMode: 'horizontal',
    rows: lines.filter(Boolean).map((value) => ({
      id: createMetroWayfindingId('text-secondary-import'),
      kind: 'secondary' as const,
      value: value.slice(0, 160),
      bold: false,
    })),
    ...colors,
  };
}

function createTextElement(
  main: string,
  secondary: string,
  align: MetroWayfindingTextAlign,
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'text' }> {
  return createMultilineTextElement([main], [secondary], align, colors);
}

function createMultilineTextElement(
  mainLines: readonly string[],
  secondaryLines: readonly string[],
  align: MetroWayfindingTextAlign,
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const id = createMetroWayfindingId('text-import');
  return {
    id,
    type: 'text',
    align,
    writingMode: 'horizontal',
    rows: [
      ...mainLines.map((value) => ({
        id: createMetroWayfindingId('text-main-import'),
        kind: 'main' as const,
        segments: [{ kind: 'text' as const, value: value.slice(0, 160) }],
      })),
      ...secondaryLines.map((value) => ({
        id: createMetroWayfindingId('text-secondary-import'),
        kind: 'secondary' as const,
        value: value.slice(0, 160),
        bold: false,
      })),
    ],
    ...colors,
  };
}

/**
 * 线路组合框的缩放口径。
 *
 * 默认 0.65 是**本模板的视觉基准**（组合框高度按 0.65 倍高设计）。
 * 但**实验风格（`line@` 色带）与重庆风格（Chitose）的线路标识在原工程里就是满倍高**，
 * 沿用 0.65 会让导入后的线路记号明显偏小、与源工程观感不一致。
 * 因此这两种风格一律用 1 倍；经典风格（`clss@` / `cls@` 填充框）仍走默认值。
 */
function resolveRouteCombinationScale(style: 'classic' | 'experimental' | 'chongqing'): number {
  return style === 'classic'
    ? METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE
    : METRO_WAYFINDING_COMBINATION_MAX_SCALE;
}

function createRouteCombinationElement(
  lineNumber: string,
  suffix: string,
  secondary: string,
  color: string,
  style: 'classic' | 'experimental' | 'chongqing',
  align: MetroWayfindingTextAlign = 'left',
  colors: ElementColors = {},
): MetroWayfindingCombinationElement {
  const foregroundColor = colors.foregroundColor ?? resolveReadableForeground(color);
  const children: MetroWayfindingCombinationChild[] = [
    createLargeTextElement(lineNumber, 'none'),
    createTextElement(suffix, secondary, align),
  ];
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: resolveRouteCombinationScale(style),
    children,
    frameFillMode: style === 'classic' ? 'color' : 'stripe',
    frameFillColor: color,
    frameStroke: style === 'classic',
    stripePosition: style === 'experimental' ? 'bottom' : 'left',
    backgroundColor: colors.backgroundColor,
    foregroundColor,
  };
}

/**
 * 由**真正确证的线路名**产出 NaL 线路元素（如「10号线」「亦庄线」）。
 *
 * 两种线路名的产出形态不同：
 * - 纯数字（`10号线` / `S1号线`）：走标准线路组合框——大字号编号 +
 *   副文本「号线 / Line 10」。
 * - 非数字（`亦庄线`）：vitool 里这类是**带底色的线路名色带**，没有可拆的编号位。
 *   这里产出「填充风格的组合框 + 框内唯一一个中英双语文本」，不放任何大字号。
 *   两种导入模式形态一致（语义模式下见 `normalizeImportedElementToSemanticElements`
 *   对该形态的保留处理）。
 *
 * @param lineName 已确证的线路名，如 `10号线`、`亦庄线`
 * @param isClassic 是否经典系列（`clss@` / `cls@`），决定填充框还是实验色带
 */
function createNalRouteElement(lineName: string, isClassic: boolean): MetroWayfindingElement {
  const color = resolveNalLineColor(lineName);
  const numeric = splitNumericLineName(lineName);
  if (numeric) {
    return createRouteCombinationElement(
      numeric.number,
      numeric.suffix,
      `Line ${numeric.number}`,
      color,
      isClassic ? 'classic' : 'experimental',
    );
  }
  // 非数字线路名（如 `亦庄线`）：无编号位，整体是「填充框 + 中英线路名文本」的组合框。
  // 缩放跟随系列口径：实验系列用 1 倍，经典系列用默认值（见 resolveRouteCombinationScale）。
  const secondary = nalNamedLineTranslations[lineName] ?? lineName;
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: resolveRouteCombinationScale(isClassic ? 'classic' : 'experimental'),
    children: [createTextElement(lineName, secondary, 'center')],
    frameFillMode: 'color',
    frameFillColor: color,
    frameStroke: false,
    stripePosition: 'left',
    foregroundColor: resolveReadableForeground(color),
  };
}

function createRouteTextElement(
  lineNumber: string,
  suffix: string,
  secondary: string,
  color: string,
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const normalizedLineNumber = normalizeSemanticLineNumber(lineNumber);
  const element = createTextElement('', `Line ${normalizedLineNumber || lineNumber}`, 'left');
  element.rows[0] = {
    id: createMetroWayfindingId('text-main-import'),
    kind: 'main',
    segments: [
      { kind: 'line', value: (normalizedLineNumber || lineNumber).slice(0, 20), color },
      { kind: 'text', value: suffix.slice(0, 160) },
    ],
  };
  const secondaryRow = element.rows.find((row) => row.kind === 'secondary');
  if (secondaryRow) secondaryRow.value = secondary || `Line ${normalizedLineNumber || lineNumber}`;
  return element;
}

function normalizeImportedElementToSemanticElements(
  element: MetroWayfindingElement,
): MetroWayfindingElement[] {
  // 「A·B」这类**合并大文本**在语义模式下要拆回「A」「B」——每个字母各带一个方框。
  // 必须排在组合框分支**之前**：合并产物是顶层 largeText，不该被组合框逻辑吞掉。
  if (element.type === 'largeText') {
    const splitLetters = splitMergedLetterLargeTextToSemanticElements(element);
    if (splitLetters) return splitLetters;
  }
  if (element.type === 'combination') {
    // 「色带组合框」（相邻 `sub@` 字母/图标 + 线路标合并而来，见
    // `createNalBandCombinationElement`）在语义模式下要**按用户规则拆开**：
    // - 分割点「·」跳过（`createNalBandCombinationElement` 里可能带进来）；
    // - 每个字母大文本**单独成框**（放不下时由排版层按列摆放）；
    // - 线路标仍走「线路文本」转换。
    if (isNalBandCombinationShape(element)) {
      return normalizeNalBandCombinationToSemanticElements(element);
    }
    const lineNumber = normalizeSemanticLineNumber(
      element.children.find((child) => child.type === 'largeText')?.value ?? '',
    );
    const hasText = element.children.some((child) => child.type === 'text');
    if (lineNumber && hasText) {
      return [
        createRouteTextElement(
          lineNumber,
          '号线',
          `Line ${lineNumber}`,
          resolveSemanticLineColor(element.frameFillColor, element.foregroundColor),
        ),
      ];
    }
    // 「命名线路」组合框：由 NaL 的 `亦庄线` / `房山线` / `西郊线` 这类
    // 非数字线路名产出（见 createNalRouteElement）。它没有编号位，
    // 框内只放一个中英双语的线路名文本。**两种模式形态一致**——保留填充风格
    // （frameFillMode='color' + 线路色），只是子元素按语义模式归一化。
    // 若走 `normalizeImportedElementToSemanticStyle` 的通用分支，填充色会被抹掉，
    // 只剩一行普通文字，「这是一条线路」的语义就丢了。
    if (!lineNumber && hasText) {
      return [
        {
          ...element,
          children: element.children.map(
            (child) =>
              normalizeImportedElementToSemanticStyle(child) as MetroWayfindingCombinationChild,
          ),
        },
      ];
    }
  }
  return [normalizeImportedElementToSemanticStyle(element)];
}

/**
 * 把「合并大文本」按语义模式拆成「每个字母各带一个方框的大文本」。
 *
 * 背景：源工程里实验系列的字母是**排成一排的独立素材**（`oth@A` + `oth@Dot` +
 * `oth@06`），`parseNalGroups` 在**保留原样式模式**下把它们拼进同一个大文本的
 * `value`（→ `"A·B"`、`frameShape='none'`）以保住字面内容。
 * 语义模式下用户要的是「A」「B」两个独立方框，因此在此按「·」切开。
 *
 * 返回 `undefined` 表示**不是合并产物**，交给 `normalizeImportedElementToSemanticStyle`
 * 的通用分支处理（单个字母本来就会自动加框）。
 *
 * 判定刻意保守——三条全部满足才拆：
 * - value 里**确实含「·」**（否则是普通大文本，不该被切开）；
 * - 切出的每段都是**单个字母/数字**（防止把中文线路名之类误伤）；
 * - 元素**无角标**（带角标的是另一套语义，不参与字母合并）。
 */
function splitMergedLetterLargeTextToSemanticElements(
  element: MetroWayfindingLargeTextElement,
): MetroWayfindingElement[] | undefined {
  // 带下角标的合并文本**不拆**：拆开后角标该挂哪个字母无法从数据判定，
  // 宁可保持「A₁·B」整体，也不要猜错归属。
  if (resolveMetroLargeTextSuffixes(element).length) return undefined;
  if (!element.value.includes('·')) return undefined;
  const pieces = element.value.split('·').filter((piece) => piece.length > 0);
  if (pieces.length < 2) return undefined;
  if (!pieces.every((piece) => /^[A-Za-z0-9]$/u.test(piece))) return undefined;
  return pieces.map((piece) =>
    normalizeImportedElementToSemanticStyle({ ...element, value: piece }),
  );
}

/**
 * 判断某个组合框是否是「色带组合框」。
 *
 * 识别依据：**含 `sub@` 色带内容**（字母大文本 / 文本 / 分割点）。
 *
 * 为什么要看内容而不是看框样式：`createNalBandCombinationElement` 在合并线路标时
 * 会**沿用线路标自身的框样式**（见其说明），因此含线路标的色带框长得和普通线路框
 * 一样。只有「框里还带着色带内容」才是需要按语义规则拆开的色带组合框。
 * 不用标记字段是为了不给产出结构引入非模型字段（会被 schema 校验拒绝）。
 */
function isNalBandCombinationShape(element: MetroWayfindingCombinationElement): boolean {
  // `oth@` 裸字母在保留原样式下**拼进大文本 value**（不建组合框），
  // 因此 `none` 填充的框不含色带内容，语义模式下不走色带拆解规则。
  if (element.frameFillMode === 'none') return false;
  return element.children.some(
    (child) => child.type === 'largeText' || child.type === 'text' || child.type === 'space',
  );
}

/**
 * 把「色带组合框」按语义模式拆解。
 *
 * 用户规则（色带信息第 4 条）：
 * - 大写字母大文本：**每个大文本仅放一个字母并加框**；一行放不下则改为
 *   双行主文本**按列摆放**（如 ABCDE → 第一行 ACE、第二行 BD），每字母仍各带框。
 * - 分割点「·」在语义模式下**跳过**。
 * - 线路标转成「线路文本」（与普通线路组合框一致）。
 */
function normalizeNalBandCombinationToSemanticElements(
  element: MetroWayfindingCombinationElement,
): MetroWayfindingElement[] {
  const letters: string[] = [];
  const lineNumbers: string[] = [];
  const outputs: MetroWayfindingElement[] = [];
  let lineColor: string | undefined;
  // 线路标自带的文本子元素（内容为「号线」+「Line N」）**不单独产出**——
  // 它的信息会被下面 `createRouteTextElement` 重建进线路文本里。
  // 教训：早期版本把它当普通文本 push 出去，导致语义模式产出两个文本
  // （一个「10号线 / Line 10」、一个「号线 / Line 10」）。
  let routeTextConsumed = false;

  for (const child of element.children) {
    if (child.type === 'largeText') {
      const value = child.value.trim();
      // 分割点：语义模式跳过。
      if (value === '·') continue;
      // **单个拉丁字母 A–N 一律是色带字母，绝不当线路编号**。
      // 教训：`normalizeSemanticLineNumber('A')` 会返回 `'A'`（它允许纯字母编号，
      // 用于「S1」这类线路），若直接用它判类型，色带字母会被误转成「A号线」。
      // 色带字母的号段是已知且封闭的（见 `nalSubBandLetterMap`），这里显式排除。
      if (/^[A-N]$/u.test(value)) {
        letters.push(value);
        continue;
      }
      // 数字形态的编号（如 `15`）才是线路号，交给线路文本转换。
      const normalized = normalizeSemanticLineNumber(value);
      if (normalized) {
        lineNumbers.push(normalized);
        lineColor = resolveSemanticLineColor(element.frameFillColor, child.frameFillColor);
      } else if (value) {
        letters.push(value);
      }
      continue;
    }
    if (child.type === 'text') {
      // 线路标后的第一个文本是它的「号线 / Line N」副文本：消费掉，
      // 由 `createRouteTextElement` 重建；其后的文本（如「亦庄线」线路名）保留。
      if (lineNumbers.length && !routeTextConsumed) {
        routeTextConsumed = true;
        continue;
      }
      outputs.push(normalizeImportedElementToSemanticStyle(child));
      continue;
    }
    outputs.push(normalizeImportedElementToSemanticStyle(child));
  }

  if (lineNumbers.length) {
    outputs.unshift(
      createRouteTextElement(
        lineNumbers[0]!,
        '号线',
        lineNumbers.map((n) => `Line ${n}`).join(' / '),
        lineColor ?? NAL_LINE_10_COLOR,
      ),
    );
  }
  for (const group of splitNalBandLettersForSemanticColumns(letters)) {
    if (group.length === 1) {
      outputs.push(createLargeTextElement(group[0]!, 'rectangle'));
    } else {
      // 一行放不下：改为双行主文本，按列摆放（如 ABCDE → 第一行 ACE、第二行 BD）。
      // 每个字母仍各带框——用「每字母一个大文本子元素」表达，由排版层分列。
      outputs.push(
        createNalBandLetterColumnCombination(
          group.map((letter) => createLargeTextElement(letter, 'rectangle')),
        ),
      );
    }
  }
  return outputs;
}

/**
 * 把一串字母切成「语义模式下能一行放下的组」。
 *
 * 这个函数只做**保守的单字母分组**：字母数量 ≤ 1 时原样返回；
 * 多于 1 个时按用户规则给出的**双行按列**口径切成两组
 * （奇数个时第一组多一个，如 ABCDE → ACE / BD）。
 *
 * 之所以不在这里真正测宽：宽度依赖字体与画板尺寸，属排版层职责；
 * 这里只负责把「可能放不下」的表达形式先建好（双行按列），
 * 由排版层决定是否需要进一步拆框。
 */
function splitNalBandLettersForSemanticColumns(letters: readonly string[]): string[][] {
  if (letters.length <= 1) return letters.length ? [[letters[0]!]] : [];
  const columnCount = 2;
  const groups: string[][] = Array.from({ length: columnCount }, () => []);
  // 按列摆放：第 i 个字母落入第 (i % columnCount) 列 → 奇偶分组。
  letters.forEach((letter, index) => {
    groups[index % columnCount]!.push(letter);
  });
  return groups.filter((group) => group.length);
}

/**
 * 双行主文本形式承载多个带框字母（每个字母一个大文本子元素，按列摆放）。
 * 用无描边的 stripe 组合框作为排版容器，`scale = 1` 与色带口径一致。
 */
function createNalBandLetterColumnCombination(
  letters: MetroWayfindingCombinationChild[],
): MetroWayfindingCombinationElement {
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: METRO_WAYFINDING_COMBINATION_MAX_SCALE,
    children: letters,
    frameFillMode: 'none',
    frameStroke: false,
    stripePosition: 'bottom',
  };
}

function normalizeImportedTextElement(
  element: MetroWayfindingTextElement,
): MetroWayfindingTextElement {
  const rows = element.rows.map(normalizeImportedTextRow);
  const mainRow = rows.find(
    (row): row is Extract<MetroWayfindingTextRow, { kind: 'main' }> => row.kind === 'main',
  );
  const secondaryRow = rows.find(
    (row): row is Extract<MetroWayfindingTextRow, { kind: 'secondary' }> =>
      row.kind === 'secondary',
  );
  const mainText =
    mainRow?.segments
      .map((segment) => segment.value)
      .join('')
      .trim() ?? '';
  const secondaryText = secondaryRow?.value.trim() ?? '';
  const hasLineSegments = mainRow?.segments.some((segment) => segment.kind === 'line') ?? false;
  const lineNumbers = hasLineSegments
    ? []
    : resolveSemanticLineNumbersFromText(mainText, secondaryText);

  if (lineNumbers.length && mainRow) {
    const lineColor = resolveSemanticLineColor(element.foregroundColor, element.backgroundColor);
    const normalizedRows = rows.map((row) => {
      if (row.id === mainRow.id) {
        return {
          ...row,
          segments: [
            ...lineNumbers.map((lineNumber) => ({
              kind: 'line' as const,
              value: lineNumber,
              color: lineColor,
            })),
            { kind: 'text' as const, value: '号线' },
          ],
        };
      }
      if (row.id === secondaryRow?.id) {
        return {
          ...row,
          value: lineNumbers.map((lineNumber) => `Line ${lineNumber}`).join(' / '),
          bold: false,
        };
      }
      return row;
    });
    if (!secondaryRow) {
      normalizedRows.push({
        id: createMetroWayfindingId('text-secondary-import'),
        kind: 'secondary',
        value: lineNumbers.map((lineNumber) => `Line ${lineNumber}`).join(' / '),
        bold: false,
      });
    }
    return {
      ...element,
      align: 'left',
      rows: normalizedRows,
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }

  const isDownstairs = /(?:由此)?下楼|downstairs/iu.test(`${mainText} ${secondaryText}`);
  const isMetroWordmark = /^地\s*铁$/u.test(mainText) && /^metro$/iu.test(secondaryText);
  return {
    ...element,
    align: isDownstairs || isMetroWordmark ? 'center' : element.align,
    writingMode: isDownstairs ? 'vertical' : element.writingMode,
    rows: isMetroWordmark ? normalizeMetroWordmarkRows(rows) : rows,
    backgroundColor: undefined,
    foregroundColor: undefined,
  };
}

function normalizeImportedTextRow(row: MetroWayfindingTextRow): MetroWayfindingTextRow {
  if (row.kind === 'secondary') return { ...row, bold: false };
  return {
    ...row,
    segments: row.segments.map((segment) =>
      segment.kind === 'line'
        ? { ...segment, value: normalizeSemanticLineNumber(segment.value) }
        : segment,
    ),
  };
}

function normalizeMetroWordmarkRows(rows: MetroWayfindingTextRow[]): MetroWayfindingTextRow[] {
  return rows.map((row) =>
    row.kind === 'main'
      ? {
          ...row,
          segments: [{ kind: 'text' as const, value: '地 铁' }],
        }
      : { ...row, value: 'METRO', bold: false },
  );
}

function resolveSemanticLineNumbersFromText(mainText: string, secondaryText: string): string[] {
  const mainParts = mainText
    .split(/\s*(?:\/|、|,|，|·)\s*/u)
    .map((part) => part.match(/^([^\s]+?)\s*号线$/u)?.[1] ?? '')
    .map(normalizeSemanticLineNumber)
    .filter(Boolean);
  const secondaryParts = secondaryText
    .split(/\s*\/\s*/u)
    .map((part) => part.match(/^line\s+(.+)$/iu)?.[1] ?? '')
    .map(normalizeSemanticLineNumber)
    .filter(Boolean);
  const mainPartCount = mainText ? mainText.split(/\s*(?:\/|、|,|，|·)\s*/u).length : 0;
  const secondaryPartCount = secondaryText ? secondaryText.split(/\s*\/\s*/u).length : 0;

  if (mainParts.length === mainPartCount && secondaryParts.length === secondaryPartCount) {
    return mainParts.length ? mainParts : secondaryParts;
  }
  if (mainParts.length === mainPartCount && mainParts.every(isPlainSemanticLineNumber)) {
    return mainParts;
  }
  if (!mainText && secondaryParts.length === secondaryPartCount) return secondaryParts;
  return [];
}

function isPlainSemanticLineNumber(value: string): boolean {
  return /^(?:[a-z]?\d+[a-z]?|[一二三四五六七八九十]+)$/iu.test(value);
}

function normalizeSemanticLineNumber(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^line\s*/iu, '')
    .replace(/^l\s*/iu, '')
    .replace(/\s*号线$/u, '')
    .trim();
  if (!trimmed) return '';
  // 统一到全项目的线路编号提取口径（连续数字/字母组合，否则首字），
  // 这样导入补全出的编号与色板、示例线网的编号一致（如「S1」「环」）。
  return (extractMetroWayfindingLineNumber(trimmed) || trimmed).slice(0, 20);
}

function resolveSemanticLineColor(...colors: Array<string | undefined>): string {
  const neutralColors = new Set([
    METRO_WAYFINDING_BACKGROUND,
    METRO_WAYFINDING_FOREGROUND,
    CHITOSE_BACKGROUND,
    CHITOSE_FOREGROUND,
  ]);
  return (
    colors.find((color) => color && !neutralColors.has(color.trim().toUpperCase())) ??
    NAL_LINE_10_COLOR
  );
}

function createFacilityElement(
  iconId: string,
  options: Partial<MetroWayfindingFacilityElement> = {},
): MetroWayfindingFacilityElement {
  return {
    id: createMetroWayfindingId('facility-import'),
    type: 'facility',
    iconId,
    frameShape: 'none',
    frameFillMode: 'none',
    frameStroke: false,
    ...options,
  };
}

function createArrowElement(
  iconId: MetroWayfindingArrowElement['iconId'],
  colors: ElementColors = {},
): MetroWayfindingArrowElement {
  return {
    id: createMetroWayfindingId('arrow-import'),
    type: 'arrow',
    iconId,
    framed: false,
    frameFillMode: 'none',
    frameStroke: false,
    ...colors,
  };
}

function createLargeTextElement(
  value: string,
  frameShape: MetroWayfindingFrameShape = 'none',
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'largeText' }> {
  return {
    id: createMetroWayfindingId('large-text-import'),
    type: 'largeText',
    value: value.slice(0, 160),
    suffix: '',
    frameShape,
    frameFillMode: 'none',
    frameStroke: false,
    ...colors,
  };
}

/**
 * 拼合两个大文本：正文直接相连，后者的下角标按**前者的码点数**平移后合并。
 * 前者的角标 `at` 不动，所以「A₁ + B」得到「A₁B」而不是「AB₁」——
 * 这正是任意位置下角标对导入的意义。
 */
function mergeMetroLargeTextValues(
  previous: MetroWayfindingLargeTextElement,
  next: MetroWayfindingLargeTextElement,
): MetroWayfindingLargeTextElement {
  const value = `${previous.value}${next.value}`.slice(0, 160);
  const offset = Array.from(previous.value).length;
  const limit = Array.from(value).length;
  const suffixes = [
    ...resolveMetroLargeTextSuffixes(previous),
    ...resolveMetroLargeTextSuffixes(next).map((item) => ({
      at: Math.min(limit, item.at + offset),
      value: item.value,
    })),
  ];
  return {
    ...previous,
    value,
    suffixes,
    suffix: suffixes.filter((item) => item.at === limit).at(-1)?.value ?? '',
  };
}

function createSpaceElement(
  mode: 'fixed' | 'flex',
  colors: ElementColors = {},
  units = 1,
): Extract<MetroWayfindingElement, { type: 'space' }> {
  return {
    id: createMetroWayfindingId('space-import'),
    type: 'space',
    mode,
    units,
    ...colors,
  };
}

function createDividerElement(
  foregroundColor = METRO_WAYFINDING_FOREGROUND,
  backgroundColor?: string,
): Extract<MetroWayfindingElement, { type: 'divider' }> {
  return {
    id: createMetroWayfindingId('divider-import'),
    type: 'divider',
    foregroundColor,
    backgroundColor,
  };
}

function resolveReadableForeground(color: string | undefined): string {
  if (!color) return METRO_WAYFINDING_FOREGROUND;
  const hex = color.trim().replace(/^#/u, '');
  if (!/^[0-9a-f]{6}$/iu.test(hex)) return METRO_WAYFINDING_FOREGROUND;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 168 ? CHITOSE_FOREGROUND : METRO_WAYFINDING_FOREGROUND;
}

function buildRowSources(
  fileName: string,
  rows: readonly MetroWayfindingElement[][],
): MetroWayfindingImportRowSource[] {
  const summary = summarizeMetroWayfindingLayout({
    backgroundColor: METRO_WAYFINDING_BACKGROUND,
    foregroundColor: METRO_WAYFINDING_FOREGROUND,
    mode: rows.length > 1 ? 'double' : 'single',
    dividerBetweenRows: false,
    rows: rows.map((row) => [...row]),
  });
  return rows.map((row, index) => ({
    fileName,
    label: rows.length > 1 ? `${fileName} · 第 ${index + 1} 行` : fileName,
    summary: summary.rows[index]?.content ?? '空白',
    elements: [...row],
  }));
}

function resolveChitoseCanvasLength(value: unknown): number {
  const width = Number.parseFloat(asString(value));
  return Number.isFinite(width) ? Math.max(1, Math.min(100, Math.round(width / 90))) : 10;
}

function parseHtmlFragment(markup: string): Document {
  return new DOMParser().parseFromString(markup.slice(0, 512_000), 'text/html');
}

function extractFirstCssColor(value: string): string | undefined {
  const match = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/iu);
  return match ? cssColorToHex(match[0]) : undefined;
}

function cssColorToHex(value: string): string | undefined {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/iu)?.[1];
  if (hex) {
    return `#${
      hex.length === 3
        ? hex
            .split('')
            .map((character) => `${character}${character}`)
            .join('')
        : hex
    }`.toUpperCase();
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu);
  if (!rgb) return undefined;
  return `#${rgb
    .slice(1, 4)
    .map((channel) =>
      Math.max(0, Math.min(255, Number(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

function createWarningCollector() {
  const warnings = new Map<string, MetroWayfindingImportWarning>();
  return {
    add(code: string, message: string, count = 1) {
      const key = `${code}:${message}`;
      const current = warnings.get(key);
      warnings.set(key, { code, message, count: (current?.count ?? 0) + count });
    },
    addAll(values: readonly MetroWayfindingImportWarning[]) {
      values.forEach((warning) => this.add(warning.code, warning.message, warning.count));
    },
    values() {
      return [...warnings.values()];
    },
  };
}

function uniqueLabels(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stripJsonExtension(value: string): string {
  return value.replace(/(?:\.yct-metro-wayfinding)?\.json$/iu, '');
}

function layerIndex(value: string): number {
  return Number(value.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

/** 生成 `[start, end]` 闭区间整数数组，用于按号段推导素材名集合（勿写死枚举）。 */
function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWayfindingElement(
  value: MetroWayfindingElement | undefined,
): value is MetroWayfindingElement {
  return value !== undefined;
}
