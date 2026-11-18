/**
 * 把问一问的 Markdown 回答整理成 QQ 纯文本。
 *
 * QQ 群聊没有 Markdown 权限（需要单独申请模板），普通文本里 Markdown 符号会原样显示，
 * 链接还可能触发 40054010「不允许发送URL」，所以默认只保留可读的文字。
 */

const SENTENCE_MARKERS = [
  '\n\n',
  '\n',
  '。',
  '！',
  '？',
  '；',
  '. ',
  '! ',
  '? ',
  '; ',
  '，',
  ', ',
  ' ',
];

const MAX_PLACE_REFS = 4;
const MAX_TRIP_REFS = 3;

/**
 * 网页操作类句子：QQ 里没有可点击的页面，这类说明只会让用户以为群里有入口。
 * 只匹配明确的动作短语，避免误伤“社交入口”这类正常表述。
 */
const WEB_ACTION_PATTERN =
  /打开(?:入口|页面|查看|链接|方案)|到页面上|页面上|路线页|点击|按钮|筛选器|逐段导航|站内已经|可自行打开|入口后/;

/** 按句删掉网页操作说明，保留其余正文；整段都被删空时回退到原文。 */
function stripWebActions(text) {
  const cleaned = text
    .split('\n')
    .map((line) => {
      const kept = line
        .split(/(?<=[。！？；])/)
        .filter((sentence) => !WEB_ACTION_PATTERN.test(sentence))
        .join('');
      // 删掉后半句后可能只剩一个“；”，收成句号，避免看起来话没说完。
      return kept.replace(/[，、；,;]+\s*$/u, '。');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || text;
}

/**
 * 把网页版的 ```ui 卡片指令转成可读的纯文本。
 *
 * 卡片本身不带名称：真正的标题、站点顺序、班次时间都在引用里，网页由卡片组件渲染。
 * QQ 没有卡片，如果直接把块丢掉，正文就会变成“附近有 3 家超市：”后面什么都没有。
 * 所以这里按引用把卡片还原成「· 地点名」「线路：A → B → C」「· 班次（08:40 → 09:20）」。
 */
export function expandUiBlocks(text, references = []) {
  const source = String(text ?? '');
  if (!/```ui/i.test(source)) {
    return source;
  }

  const byId = new Map();
  for (const reference of references) {
    if (reference && Number.isInteger(reference.id)) {
      byId.set(reference.id, reference);
    }
  }

  return source.replace(/```ui[^\n]*\n?([\s\S]*?)```/gi, (_, body) => renderUiBlock(body, byId));
}

function renderUiBlock(body, byId) {
  const lines = [];
  for (const directive of parseUiDirectives(body)) {
    if (directive.type === 'line_strip') {
      const reference = byId.get(directive.ref);
      const line = reference ? renderLine(reference) : '';
      if (line) {
        lines.push(line);
      }
      continue;
    }

    const limit = directive.type === 'place_list' ? MAX_PLACE_REFS : MAX_TRIP_REFS;
    for (const id of directive.refs.slice(0, limit)) {
      const reference = byId.get(id);
      if (!reference) {
        continue;
      }
      const line = directive.type === 'trip_card' ? renderTrip(reference) : renderPlace(reference);
      if (line) {
        lines.push(line);
      }
    }
  }

  return lines.length > 0 ? `\n${lines.join('\n')}\n` : '';
}

function parseUiDirectives(body) {
  const text = String(body ?? '').trim();
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
    .filter((directive) => directive !== null);
}

/** 与网页 ui-directives.ts 保持同一套校验：未知类型或越界编号直接忽略。 */
function parseUiDirective(raw) {
  let payload;
  try {
    payload = JSON.parse(String(raw).trim());
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.type === 'place_list' || payload.type === 'trip_card') {
    const limit = payload.type === 'place_list' ? MAX_PLACE_REFS : MAX_TRIP_REFS;
    const refs = normalizeRefs(payload.refs, limit);
    return refs.length > 0 ? { type: payload.type, refs } : null;
  }
  if (payload.type === 'line_strip') {
    const ref = normalizeRef(payload.ref);
    return ref === undefined ? null : { type: 'line_strip', ref };
  }
  return null;
}

function normalizeRefs(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
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

function normalizeRef(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 999 ? numeric : undefined;
}

function renderPlace(reference) {
  const title = referenceTitle(reference);
  return title ? `· ${title}` : '';
}

/** 班次摘要形如“工作日 · 快速 · 起点 - 终点 · 08:40 - 09:20 · 2元 · 余票 8”。 */
function renderTrip(reference) {
  const title = referenceTitle(reference);
  if (!title) {
    return '';
  }
  const match = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/.exec(String(reference.snippet ?? ''));
  return match ? `· ${title}（${match[1]} → ${match[2]}）` : `· ${title}`;
}

/** 线路摘要形如“临东站 → 猴市中北 · 经过 3 站：临东站 → 中华路 → 猴市中北”。 */
function renderLine(reference) {
  const title = referenceTitle(reference);
  if (!title) {
    return '';
  }
  const segment = String(reference.snippet ?? '')
    .split(' · ')
    .find((part) => part.startsWith('经过'));
  if (!segment) {
    return title;
  }
  const stations = segment
    .replace(/^经过\s*\d+\s*站[：:]\s*/u, '')
    .split('→')
    .map((station) => station.trim())
    .filter(Boolean)
    .slice(0, 40);
  return stations.length > 0 ? `${title}：${stations.join(' → ')}` : title;
}

function referenceTitle(reference) {
  return String(reference?.title ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 清洗后的纯文本正文，供二次精炼或调试使用。 */
export function prepareAnswerText(text, references = []) {
  return stripWebActions(toPlainText(expandUiBlocks(text, references)));
}

export function toPlainText(text, { links = false } = {}) {
  let value = String(text ?? '').replace(/\r\n?/g, '\n');

  // 防御性清理：即使服务端提示词没生效，也不要把卡片指令和追问标记当成正文发出去。
  value = value.replace(/```ui\s*[\s\S]*?```/gi, '');
  value = value.replace(/\[\[followups\]\][\s\S]*$/g, '');

  // 代码块去掉围栏，保留内容。
  value = value.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code) => code.trim());
  value = value.replace(/`([^`\n]+)`/g, '$1');

  // 表格在 QQ 里会变成一串竖线，改成「· 对象：首班 06:00，末班 21:30」。
  value = convertTables(value);

  // 图片与链接：默认只留文字，申请到 URL 权限后再用 YCT_QQ_BOT_LINKS=1 打开。
  value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) =>
    links ? `${label}（${url}）` : label,
  );
  if (!links) {
    // 中文标点不算 URL 的一部分，否则会把后面的整句一起吞掉。
    value = value.replace(/https?:\/\/[^\s<>()（）,，。！？；：、"']+/gi, '');
    value = value.replace(/\bwww\.[^\s<>()（）,，。！？；：、"']+/gi, '');
    // 站内文档也常以裸域名出现，一并去掉；只匹配常见后缀，避免误伤普通英文。
    value = value.replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|cn|top|net|org|io|me|xyz|cc|tv)\b(?:\/[^\s<>()（）,，。！？；：、"']*)?/gi,
      '',
    );
  }

  // 标题、引用、分隔线。
  value = value.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  value = value.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  value = value.replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '');

  // 强调与删除线。
  value = value.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  value = value.replace(/__([^_\n]+)__/g, '$1');
  value = value.replace(/~~([^~\n]+)~~/g, '$1');
  value = value.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?，。！？]|$)/g, '$1$2');

  // 列表符号：QQ 里用「·」比「-」更像列表。
  value = value.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1· ');
  value = value.replace(/^([ \t]*)(\d{1,2})[.)][ \t]+/gm, '$1$2. ');

  // 表格：保留行内容，去掉分隔行。
  value = value.replace(/^[ \t]*\|[\s:|-]+\|[ \t]*$/gm, '');
  value = value.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, row) =>
    row
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join('｜'),
  );

  // 引用编号 [1]、@ 标记。
  value = value.replace(/\s*\[\d{1,2}\]/g, '');
  value = value.replace(/<@[!&]?\w+>/g, '');

  // 去掉链接后可能留下空括号或标点前的空格。
  value = value.replace(/[（(]\s*[）)]/g, '');
  value = value.replace(/\s+([，。！？；：、])/g, '$1');

  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Markdown 表格转成自然语言列表。
 * 两列表格输出「· 首班：06:00」，三列以上把表头拼回值前面：
 * 「· 170路：首班 06:00，末班 21:30」。识别失败时原样保留，交给后面的兜底逻辑。
 */
function convertTables(text) {
  const lines = text.split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const headerLine = lines[index];
    if (headerLine.includes('|') && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(headerLine);
      const rows = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].includes('|')) {
        const cells = splitTableRow(lines[cursor]);
        if (cells.length < 2) {
          break;
        }
        rows.push(cells);
        cursor += 1;
      }

      if (headers.length >= 2 && rows.length > 0) {
        for (const cells of rows) {
          output.push(renderTableRow(cells, headers));
        }
        index = cursor;
        continue;
      }
    }

    output.push(headerLine);
    index += 1;
  }

  return output.join('\n');
}

function isTableSeparator(line) {
  if (!line || !line.includes('|')) {
    return false;
  }
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')));
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) {
    value = value.slice(1);
  }
  if (value.endsWith('|')) {
    value = value.slice(0, -1);
  }
  return value.split('|').map((cell) => cell.trim());
}

function renderTableRow(cells, headers) {
  const subject = (cells[0] ?? '').replace(/[：:]\s*$/, '').trim();
  if (!subject) {
    return cells.filter(Boolean).join('，');
  }

  // 两列表格本身就是「项目：值」，不需要重复表头。
  if (cells.length === 2) {
    const value = (cells[1] ?? '').trim();
    return value ? `· ${subject}：${value}` : `· ${subject}`;
  }

  const parts = [];
  for (let index = 1; index < cells.length; index += 1) {
    const value = (cells[index] ?? '').trim();
    if (!value) {
      continue;
    }
    const header = (headers[index] ?? '').replace(/\s+/g, ' ').trim();
    parts.push(header ? `${header} ${value}` : value);
  }
  return parts.length > 0 ? `· ${subject}：${parts.join('，')}` : `· ${subject}`;
}

/** 按语义边界切成不超过 limit 的若干段；找不到合适边界时硬切。 */
export function splitText(text, limit) {
  const segments = [];
  let rest = String(text ?? '').trim();
  while (rest.length > limit) {
    const cut = findCut(rest, limit);
    const head = rest.slice(0, cut).trim();
    if (head) {
      segments.push(head);
    }
    rest = rest.slice(cut).trim();
  }
  if (rest) {
    segments.push(rest);
  }
  return segments;
}

function findCut(text, limit) {
  const window = text.slice(0, limit);
  for (const marker of SENTENCE_MARKERS) {
    const index = window.lastIndexOf(marker);
    if (index >= Math.floor(limit * 0.6)) {
      return index + marker.length;
    }
  }
  // 不要从代理对中间切开。
  const code = window.charCodeAt(limit - 1);
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

/**
 * 生成最终要发送的文本段。
 * maxSegments 由被动回复次数决定：群聊 5 次、单聊 4 次；先发提示会占用一次。
 */
export function composeAnswer({
  text,
  references = [],
  followups = [],
  segmentChars = 900,
  maxChars = 0,
  appendSources = true,
  followupSuggestions = false,
  links = false,
  maxSegments = 4,
}) {
  // 卡片先按引用还原成文字，再走 Markdown 清洗；QQ 没有卡片组件。
  let plain = toPlainText(expandUiBlocks(text, references), { links });
  if (!plain) {
    return [];
  }
  // 聊天模式：先按句去掉网页操作，再按整句挑重点；实在没有句子边界才硬切。
  if (maxChars > 0) {
    plain = stripWebActions(plain);
    if (plain.length > maxChars) {
      plain = condenseAnswer(plain, maxChars);
    }
    if (plain.length > maxChars) {
      plain = truncateAtSentence(plain, maxChars);
    }
  }

  const segments = splitText(plain, segmentChars);
  const extras = [];
  if (appendSources) {
    const titles = unique(
      references
        .map((reference) => (typeof reference?.title === 'string' ? reference.title : ''))
        .filter(Boolean)
        .map(shortTitle),
    ).slice(0, 3);
    if (titles.length > 0) {
      extras.push(`参考：${titles.join('、')}`);
    }
  }
  if (followupSuggestions) {
    const items = unique(
      followups.filter((item) => typeof item === 'string').map(shortTitle),
    ).slice(0, 2);
    if (items.length > 0) {
      extras.push(`还可以问：${items.join(' / ')}`);
    }
  }

  for (const extra of extras) {
    const last = segments[segments.length - 1];
    if (last && last.length + extra.length + 2 <= segmentChars) {
      segments[segments.length - 1] = `${last}\n\n${extra}`;
    } else if (segments.length < maxSegments) {
      segments.push(extra);
    }
  }

  if (segments.length <= maxSegments) {
    return segments;
  }

  const kept = segments.slice(0, maxSegments);
  const lastIndex = kept.length - 1;
  const note = '（回答较长，已截断）';
  kept[lastIndex] =
    kept[lastIndex].length + note.length <= segmentChars
      ? `${kept[lastIndex]}${note}`
      : `${kept[lastIndex].slice(0, Math.max(1, segmentChars - 1))}…`;
  return kept;
}

function shortTitle(value) {
  const title = String(value).replace(/\s+/g, ' ').trim();
  return title.length > 24 ? `${title.slice(0, 24)}…` : title;
}

/**
 * 超长回答按“整句取舍”精炼，而不是从中间截断：
 * 保留开头的结论句，再按原顺序补充要点和列表项，后面的解释段落整段舍弃。
 * 这样句子是完整的，读者不会看到半句话或省略号。
 */
function condenseAnswer(text, maxChars) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const units = [];
  blocks.forEach((block, blockIndex) => {
    for (const line of block
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)) {
      if (/^[·•\-*]\s/.test(line)) {
        units.push({ blockIndex, bullet: true, text: line });
        continue;
      }
      for (const sentence of line
        .split(/(?<=[。！？!?])/)
        .map((item) => item.trim())
        .filter(Boolean)) {
        units.push({ blockIndex, bullet: false, text: sentence });
      }
    }
  });

  if (units.length === 0) {
    return text;
  }

  // 第一条通常是“结论”，无论如何先保留。
  const selected = [units[0]];
  let length = units[0].text.length;
  const bulletCounts = new Map();
  if (units[0].bullet) {
    bulletCounts.set(units[0].blockIndex, 1);
  }

  for (let index = 1; index < units.length; index += 1) {
    const unit = units[index];
    const previous = selected[selected.length - 1];
    if (unit.bullet && (bulletCounts.get(unit.blockIndex) ?? 0) >= 3) {
      continue;
    }
    const separator =
      unit.blockIndex === previous.blockIndex ? (unit.bullet || previous.bullet ? 1 : 0) : 2;
    if (length + separator + unit.text.length > maxChars) {
      continue;
    }
    selected.push(unit);
    length += separator + unit.text.length;
    if (unit.bullet) {
      bulletCounts.set(unit.blockIndex, (bulletCounts.get(unit.blockIndex) ?? 0) + 1);
    }
  }

  // “两点提醒：”这类标题如果后面一条都没保留，就不要单独留下标题。
  const kept = selected.filter((unit) => {
    if (unit.bullet || !/[：:]\s*$/.test(unit.text)) {
      return true;
    }
    return selected.some((other) => other.blockIndex === unit.blockIndex && other.bullet);
  });

  return kept.length > 0 ? joinUnits(kept) : units[0].text;
}

function joinUnits(units) {
  let output = '';
  let previous = null;
  for (const unit of units) {
    if (!output) {
      output = unit.text;
    } else if (unit.blockIndex !== previous.blockIndex) {
      output += `\n\n${unit.text}`;
    } else if (unit.bullet || previous.bullet) {
      output += `\n${unit.text}`;
    } else {
      output += unit.text;
    }
    previous = unit;
  }
  return output;
}

function truncateAtSentence(text, maxChars) {
  const window = text.slice(0, maxChars);
  const minimum = Math.floor(maxChars * 0.6);

  // 优先在句末截断；“两点提醒：”这类只有冒号的标题行不能作为结尾。
  let cut = -1;
  for (const marker of ['。', '！', '？']) {
    cut = Math.max(cut, window.lastIndexOf(marker));
  }
  if (cut >= minimum) {
    // 已经是完整句子，不要再补省略号，否则看起来很像是没写完。
    return text.slice(0, Math.min(cut + 1, maxChars)).trimEnd();
  }

  let newline = window.lastIndexOf('\n');
  while (newline >= 1 && /[：:]\s*$/.test(window.slice(0, newline))) {
    newline = window.lastIndexOf('\n', newline - 1);
  }
  if (newline >= minimum) {
    return finishSentence(text.slice(0, Math.min(newline, maxChars)));
  }

  const weakCut = Math.max(window.lastIndexOf('；'), window.lastIndexOf('，'));
  if (weakCut >= minimum) {
    return finishSentence(text.slice(0, Math.min(weakCut, maxChars)));
  }

  // 整段没有任何标点时只能硬切，用省略号表示后面还有内容。
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/** 在换行或逗号处截断时，把尾巴收成一个完整句子。 */
function finishSentence(value) {
  const head = value
    .trimEnd()
    .replace(/[，、；：,;:]+$/u, '')
    .trimEnd();
  return /[。！？!?]$/u.test(head) ? head : `${head}。`;
}

function unique(values) {
  return [...new Set(values)];
}

export const helpText = [
  '我是雨城通「问一问」的 QQ 版，可以回答临东市服务器、地图地点、公交地铁线路、班次、运营公告和 Wiki 的问题。',
  '',
  '在群里 @我 直接提问即可；在单聊里直接发消息。',
  '发送「新对话」可以清空上下文，发送「菜单」「功能」「关于机器人」查看说明。',
  '',
  '快捷指令（加不加 / 都可以）：',
  '指令入口可点：/随机、/掷骰子、/天气、/历史、/人数、/随机地点',
  '计算 (1+2)*3、随机数 1-100、掷骰子 2d6',
  '掷骰子、2个6面骰、3d6+2',
  '上海天气、天气 上海、对对联 春风拂柳',
  '随机地点、手气不错、在线人数',
  '查IP 8.8.8.8、历史上的今天、在线人数',
  '汉字编码 临东、电码 临东',
  '',
  '群互动：',
  '签到、签到榜',
  '发言统计 [天数]、发言榜 [天数]',
  '今日运势、重置运势（仅供娱乐）',
  '',
  '回答由站内资料整理，时间敏感信息请以雨城通页面为准。',
].join('\n');

export const aboutText = [
  '我是雨城通「问一问」的 QQ 机器人，通过 QQ 官方机器人接口接收群聊 @ 和单聊消息。',
  '问一问的回答来自雨城通站内资料，天气、IP 和历史事件的快捷指令使用外部公开接口。',
  '签到、发言统计和今日运势只保存在机器人本地的 JSON 文件里，不会同步到网页账号。',
  '发送「菜单」或「/帮助」查看全部指令，发送「新对话」清空上下文。',
].join('\n');
