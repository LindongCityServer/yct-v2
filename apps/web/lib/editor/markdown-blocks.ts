/**
 * Markdown 块解析与源码编辑工具。
 *
 * 公开页面与运营消息工作台共用同一份解析结果：渲染只看块内容，
 * 工作台额外使用 startLine / endLine 做定位与源码写回。
 * 所有区间均为 0 基、左闭右开的行号区间。
 */

export type MarkdownBlockType =
  'heading' | 'paragraph' | 'divider' | 'table' | 'list' | 'quote' | 'image' | 'code' | 'ui';

export type MarkdownTableAlignment = 'left' | 'center' | 'right';

interface MarkdownBlockBase {
  /** 块在原始 Markdown 中的起始行（包含）。 */
  startLine: number;
  /** 块在原始 Markdown 中的结束行（不包含）。 */
  endLine: number;
}

export type MarkdownBlock =
  | ({ type: 'heading'; level: 1 | 2 | 3 | 4; text: string } & MarkdownBlockBase)
  | ({ type: 'paragraph'; text: string; lines: string[] } & MarkdownBlockBase)
  | ({ type: 'divider' } & MarkdownBlockBase)
  | ({
      type: 'table';
      headers: string[];
      rows: string[][];
      alignments: Array<MarkdownTableAlignment | undefined>;
    } & MarkdownBlockBase)
  | ({ type: 'list'; ordered: boolean; items: string[] } & MarkdownBlockBase)
  | ({ type: 'quote'; text: string; lines: string[] } & MarkdownBlockBase)
  | ({ type: 'image'; alt: string; src: string } & MarkdownBlockBase)
  | ({ type: 'code'; language: string; body: string; closed: boolean } & MarkdownBlockBase)
  | ({ type: 'ui'; body: string; closed: boolean } & MarkdownBlockBase);

export interface MarkdownHeading {
  id: string;
  level: 1 | 2 | 3 | 4;
  text: string;
  /** 对应标题块在 parseMarkdownBlocks 结果中的下标；手工构造的目录可省略。 */
  blockIndex?: number;
}

export function splitMarkdownLines(markdown: string): string[] {
  return markdown.replace(/\r\n?/g, '\n').split('\n');
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = splitMarkdownLines(markdown);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const startLine = index;

    if (isMarkdownDivider(line)) {
      blocks.push({ type: 'divider', startLine, endLine: index + 1 });
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2].trim(),
        startLine,
        endLine: index + 1,
      });
      index += 1;
      continue;
    }

    const image = parseImageLine(line);
    if (image) {
      blocks.push({ ...image, startLine, endLine: index + 1 });
      index += 1;
      continue;
    }

    const uiFence = parseUiFenceBlock(lines, index);
    if (uiFence) {
      blocks.push({ ...uiFence.block, startLine, endLine: uiFence.nextIndex });
      index = uiFence.nextIndex;
      continue;
    }

    const codeFence = parseCodeFenceBlock(lines, index);
    if (codeFence) {
      blocks.push({ ...codeFence.block, startLine, endLine: codeFence.nextIndex });
      index = codeFence.nextIndex;
      continue;
    }

    const table = parseTableBlock(lines, index);
    if (table) {
      blocks.push({ ...table.block, startLine, endLine: table.nextIndex });
      index = table.nextIndex;
      continue;
    }

    const list = parseListBlock(lines, index);
    if (list) {
      blocks.push({ ...list.block, startLine, endLine: list.nextIndex });
      index = list.nextIndex;
      continue;
    }

    const quote = parseQuoteBlock(lines, index);
    if (quote) {
      blocks.push({ ...quote.block, startLine, endLine: quote.nextIndex });
      index = quote.nextIndex;
      continue;
    }

    const paragraph = collectParagraph(lines, index);
    blocks.push({
      type: 'paragraph',
      text: paragraph.lines.join(' '),
      lines: paragraph.lines,
      startLine,
      endLine: paragraph.nextIndex,
    });
    index = paragraph.nextIndex;
  }

  return mergeAdjacentListBlocks(blocks, lines);
}

/** 空行分隔的同类型列表合并为一个块，避免一段列表被拆成多行块。 */
function mergeAdjacentListBlocks(blocks: MarkdownBlock[], lines: string[]): MarkdownBlock[] {
  const merged: MarkdownBlock[] = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (previous?.type === 'list' && block.type === 'list' && previous.ordered === block.ordered) {
      const gap = lines.slice(previous.endLine, block.startLine);
      if (gap.every((line) => !line.trim())) {
        merged[merged.length - 1] = {
          ...previous,
          endLine: block.endLine,
          items: [...previous.items, ...block.items],
        };
        continue;
      }
    }
    merged.push(block);
  }

  return merged;
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  return extractMarkdownHeadingsFromBlocks(parseMarkdownBlocks(markdown));
}

export function extractMarkdownHeadingsFromBlocks(blocks: MarkdownBlock[]): MarkdownHeading[] {
  const usedIds = new Map<string, number>();

  return blocks.flatMap((block, blockIndex) => {
    if (block.type !== 'heading') {
      return [];
    }

    const text = markdownInlineText(block.text);
    const baseId = markdownHeadingId(text);
    const occurrence = (usedIds.get(baseId) ?? 0) + 1;
    usedIds.set(baseId, occurrence);

    return [
      {
        id: occurrence === 1 ? baseId : `${baseId}-${occurrence}`,
        level: block.level,
        text,
        blockIndex,
      },
    ];
  });
}

/** 可见正文字符数：排除代码块与 ui 指令，避免把机器内容算进文案长度。 */
export function countMarkdownVisibleCharacters(blocks: MarkdownBlock[]): number {
  return blocks.reduce((total, block) => total + markdownBlockPlainText(block).length, 0);
}

export function markdownBlockPlainText(block: MarkdownBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return markdownInlineText(block.text);
    case 'list':
      return block.items.map(markdownInlineText).join(' ');
    case 'table':
      return [...block.headers, ...block.rows.flat()].map(markdownInlineText).join(' ');
    case 'image':
      return block.alt;
    case 'divider':
    case 'code':
    case 'ui':
    default:
      return '';
  }
}

export function getMarkdownBlockSourceLines(markdown: string, block: MarkdownBlock): string[] {
  return splitMarkdownLines(markdown).slice(block.startLine, block.endLine);
}

/** 只替换目标块占用的行，其余内容原样保留。 */
export function replaceMarkdownBlockSource(
  markdown: string,
  block: MarkdownBlock,
  nextLines: string[],
): string {
  const lines = splitMarkdownLines(markdown);
  lines.splice(block.startLine, block.endLine - block.startLine, ...nextLines);
  return lines.join('\n');
}

export function serializeHeadingBlock(level: 1 | 2 | 3 | 4, text: string): string[] {
  const safeText = text.replace(/\s*\n+\s*/g, ' ').trim();
  return [`${'#'.repeat(level)} ${safeText}`];
}

export function serializeImageBlock(alt: string, src: string): string[] {
  return [`![${alt.replace(/[\r\n]+/g, ' ').trim()}](${src.trim()})`];
}

export function serializeListBlock(ordered: boolean, items: string[]): string[] {
  return items
    .map((item) => item.replace(/[\r\n]+/g, ' ').trim())
    .filter(Boolean)
    .map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${item}`);
}

export function serializeCodeBlock(language: string, body: string, closed: boolean): string[] {
  const open = `\`\`\`${language.trim()}`.trimEnd();
  const lines = [open, ...body.split('\n')];
  if (closed) {
    lines.push('```');
  }
  return lines;
}

export function serializeUiBlock(body: string, closed: boolean): string[] {
  const lines = ['```ui', ...body.split('\n')];
  if (closed) {
    lines.push('```');
  }
  return lines;
}

export function moveMarkdownBlock(markdown: string, fromIndex: number, offset: -1 | 1): string {
  const blocks = parseMarkdownBlocks(markdown);
  const targetIndex = fromIndex + offset;
  if (
    fromIndex < 0 ||
    fromIndex >= blocks.length ||
    targetIndex < 0 ||
    targetIndex >= blocks.length
  ) {
    return markdown;
  }

  const sources = blocks.map((block) => getMarkdownBlockSourceLines(markdown, block).join('\n'));
  const [moved] = sources.splice(fromIndex, 1);
  sources.splice(targetIndex, 0, moved);
  return rebuildMarkdownFromBlockSources(sources);
}

export function duplicateMarkdownBlock(markdown: string, index: number): string {
  const blocks = parseMarkdownBlocks(markdown);
  if (index < 0 || index >= blocks.length) {
    return markdown;
  }

  const sources = blocks.map((block) => getMarkdownBlockSourceLines(markdown, block).join('\n'));
  sources.splice(index + 1, 0, sources[index]);
  return rebuildMarkdownFromBlockSources(sources);
}

export function removeMarkdownBlock(markdown: string, index: number): string {
  const blocks = parseMarkdownBlocks(markdown);
  if (index < 0 || index >= blocks.length) {
    return markdown;
  }

  const sources = blocks
    .filter((_, blockIndex) => blockIndex !== index)
    .map((block) => getMarkdownBlockSourceLines(markdown, block).join('\n'));
  return rebuildMarkdownFromBlockSources(sources);
}

export function insertMarkdownBlock(
  markdown: string,
  atIndex: number,
  sourceLines: string[],
): string {
  const blocks = parseMarkdownBlocks(markdown);
  const sources = blocks.map((block) => getMarkdownBlockSourceLines(markdown, block).join('\n'));
  const safeIndex = Math.max(0, Math.min(atIndex, sources.length));
  sources.splice(safeIndex, 0, sourceLines.join('\n'));
  return rebuildMarkdownFromBlockSources(sources);
}

/** 重建时统一用空行分隔块；块内部源码保持原样。 */
function rebuildMarkdownFromBlockSources(sources: string[]): string {
  const normalized = sources.filter((source) => source.trim().length > 0);
  return normalized.length > 0 ? `${normalized.join('\n\n')}\n` : '';
}

function parseTableBlock(
  lines: string[],
  startIndex: number,
):
  | {
      block: Omit<Extract<MarkdownBlock, { type: 'table' }>, 'startLine' | 'endLine'>;
      nextIndex: number;
    }
  | undefined {
  const headers = parseMarkdownTableRow(lines[startIndex]);
  const separator = parseMarkdownTableRow(lines[startIndex + 1] ?? '');
  if (
    !headers ||
    headers.length === 0 ||
    !separator ||
    separator.length !== headers.length ||
    !separator.every(isMarkdownTableSeparatorCell)
  ) {
    return undefined;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = parseMarkdownTableRow(lines[index]);
    if (!row) {
      break;
    }
    rows.push(headers.map((_, cellIndex) => row[cellIndex] ?? ''));
    index += 1;
  }

  return {
    block: {
      type: 'table',
      headers,
      rows,
      alignments: separator.map(parseMarkdownTableAlignment),
    },
    nextIndex: index,
  };
}

function parseMarkdownTableRow(line: string | undefined): string[] | undefined {
  if (!line || !line.includes('|')) {
    return undefined;
  }

  let source = line.trim();
  if (source.startsWith('|')) {
    source = source.slice(1);
  }
  if (source.endsWith('|') && !source.endsWith('\\|')) {
    source = source.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) {
    cell += '\\';
  }
  cells.push(cell.trim());
  return cells.length > 0 ? cells : undefined;
}

function isMarkdownTableSeparatorCell(value: string): boolean {
  return /^:?-{3,}:?$/.test(value.trim());
}

function parseMarkdownTableAlignment(value: string): MarkdownTableAlignment | undefined {
  const trimmed = value.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return undefined;
}

/** ```ui 代码块：模型用它下发结构化卡片指令。 */
const uiFenceOpenPattern = /^```\s*ui\s*$/i;
const codeFenceClosePattern = /^```\s*$/;
const codeFenceOpenPattern = /^```\s*([A-Za-z0-9_+-]*)\s*$/;

function parseUiFenceBlock(
  lines: string[],
  startIndex: number,
):
  | {
      block: Omit<Extract<MarkdownBlock, { type: 'ui' }>, 'startLine' | 'endLine'>;
      nextIndex: number;
    }
  | undefined {
  if (!uiFenceOpenPattern.test(lines[startIndex].trim())) {
    return undefined;
  }

  const bodyLines: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    if (codeFenceClosePattern.test(lines[index].trim())) {
      return {
        block: { type: 'ui', body: bodyLines.join('\n'), closed: true },
        nextIndex: index + 1,
      };
    }
    bodyLines.push(lines[index]);
    index += 1;
  }

  // 流式过程中代码块还没闭合：吞掉剩余内容，等闭合后再交给卡片组件。
  return {
    block: { type: 'ui', body: bodyLines.join('\n'), closed: false },
    nextIndex: index,
  };
}

function parseCodeFenceBlock(
  lines: string[],
  startIndex: number,
):
  | {
      block: Omit<Extract<MarkdownBlock, { type: 'code' }>, 'startLine' | 'endLine'>;
      nextIndex: number;
    }
  | undefined {
  const open = codeFenceOpenPattern.exec(lines[startIndex].trim());
  if (!open) {
    return undefined;
  }

  const bodyLines: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    if (codeFenceClosePattern.test(lines[index].trim())) {
      return {
        block: { type: 'code', language: open[1] ?? '', body: bodyLines.join('\n'), closed: true },
        nextIndex: index + 1,
      };
    }
    bodyLines.push(lines[index]);
    index += 1;
  }

  return {
    block: { type: 'code', language: open[1] ?? '', body: bodyLines.join('\n'), closed: false },
    nextIndex: index,
  };
}

function parseImageLine(
  line: string,
): Omit<Extract<MarkdownBlock, { type: 'image' }>, 'startLine' | 'endLine'> | undefined {
  const markdownImage = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
  if (markdownImage) {
    return {
      type: 'image',
      alt: markdownImage[1].trim(),
      src: markdownImage[2].trim(),
    };
  }

  const legacyImage = /^原始图片：(\S+)$/.exec(line);
  if (legacyImage) {
    return {
      type: 'image',
      alt: '原始图片',
      src: legacyImage[1].trim(),
    };
  }

  return undefined;
}

function parseListBlock(
  lines: string[],
  startIndex: number,
):
  | {
      block: Omit<Extract<MarkdownBlock, { type: 'list' }>, 'startLine' | 'endLine'>;
      nextIndex: number;
    }
  | undefined {
  const first = parseListItem(lines[startIndex]);
  if (!first) {
    return undefined;
  }

  const items: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const item = parseListItem(lines[index]);
    if (!item || item.ordered !== first.ordered) {
      break;
    }
    items.push(item.text);
    index += 1;
  }

  return {
    block: {
      type: 'list',
      ordered: first.ordered,
      items,
    },
    nextIndex: index,
  };
}

function parseListItem(line: string): { ordered: boolean; text: string } | undefined {
  const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
  if (unordered) {
    return {
      ordered: false,
      text: unordered[1].trim(),
    };
  }

  const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
  if (ordered) {
    return {
      ordered: true,
      text: ordered[1].trim(),
    };
  }

  return undefined;
}

function parseQuoteBlock(
  lines: string[],
  startIndex: number,
):
  | {
      block: Omit<Extract<MarkdownBlock, { type: 'quote' }>, 'startLine' | 'endLine'>;
      nextIndex: number;
    }
  | undefined {
  if (!/^\s*>\s?/.test(lines[startIndex])) {
    return undefined;
  }

  const quoteLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
    quoteLines.push(lines[index].replace(/^\s*>\s?/, '').trim());
    index += 1;
  }

  return {
    block: {
      type: 'quote',
      text: quoteLines.join(' '),
      lines: quoteLines,
    },
    nextIndex: index,
  };
}

function collectParagraph(
  lines: string[],
  startIndex: number,
): { lines: string[]; nextIndex: number } {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (
      !line ||
      isMarkdownDivider(line) ||
      /^(#{1,4})\s+(.+)$/.test(line) ||
      parseImageLine(line) ||
      /^```/.test(line) ||
      parseListItem(line) ||
      /^\s*>\s?/.test(line)
    ) {
      break;
    }

    if (parseTableBlock(lines, index)) {
      break;
    }

    paragraphLines.push(line);
    index += 1;
  }

  return {
    lines: paragraphLines,
    nextIndex: index,
  };
}

function isMarkdownDivider(line: string): boolean {
  return /^(?:-{3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}

function markdownInlineText(text: string): string {
  return text
    .replace(/!?\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function markdownHeadingId(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'section';
}
