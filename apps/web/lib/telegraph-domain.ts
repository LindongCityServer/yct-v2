import { cccToHanzi, hanziToCcc } from './telegraph-codebook';
import { toUppercasePinyin } from './chinese-pinyin';

export const TELEGRAPH_RATE = 0.14;
export const TELEGRAPH_MAX_BODY_GRIDS = 50;
export const TELEGRAPH_MAX_RECIPIENT_GRIDS = 20;

export interface TelegraphDraftInput {
  province: string;
  city: string;
  county: string;
  district: string;
  recipientInfo: string;
  body: string;
  senderName: string;
  senderAddress: string;
}

export interface TelegraphCell {
  value: string;
  code?: string;
  unsupported?: boolean;
  alphanumericRun?: string;
}

export interface TelegraphDraftResult {
  destination: string;
  recipient: string;
  recipientCells: TelegraphCell[];
  bodyCells: TelegraphCell[];
  billableGrids: number;
  amount: number;
  codeText: string;
  unsupportedCharacters: string[];
}

export interface TelegraphReceiveRow {
  cells: TelegraphCell[];
  code: string;
  text: string;
  compressed: boolean;
}

export type TelegraphReceiveCodeTokenKind = 'literal' | 'digit' | 'space';
export type TelegraphReceiveSpaceKind = 'character' | 'word' | 'line';

export interface TelegraphReceiveCodeToken {
  display: string;
  kind: TelegraphReceiveCodeTokenKind;
  line: 'header' | 'protocol' | 'content' | 'terminator';
  progressIndex: number | null;
  cellIndex?: number;
  code?: string;
  source?: string;
  digitIndex?: number;
  digitCount?: number;
  spaceKind?: TelegraphReceiveSpaceKind;
}

export interface TelegraphReceiveDocument {
  relayNumber: string;
  header: string;
  protocolLine: string;
  codeText: string;
  codeTokens: TelegraphReceiveCodeToken[];
  rows: TelegraphReceiveRow[];
  terminator: string;
}

export function evaluateTelegraphDraft(input: TelegraphDraftInput): TelegraphDraftResult {
  const destination = [input.province, input.city, input.county, input.district]
    .map((value) => (value ?? '').trim())
    .filter(Boolean)
    .join('');
  const recipient = (input.recipientInfo ?? '').trim();
  const recipientCells = splitTelegraphCells(input.recipientInfo ?? '');
  const bodyCells = splitTelegraphCells(input.body);
  const destinationCells = splitTelegraphCells(destination);
  const allCells = [...destinationCells, ...recipientCells, ...bodyCells];
  const unsupportedCharacters = unique(
    allCells.filter((cell) => cell.unsupported).map((cell) => cell.value),
  );
  const billableGrids = allCells.length;

  return {
    destination,
    recipient,
    recipientCells,
    bodyCells,
    billableGrids,
    amount: Number((billableGrids * TELEGRAPH_RATE).toFixed(2)),
    codeText: formatCodeText([...destinationCells, ...recipientCells, ...bodyCells]),
    unsupportedCharacters,
  };
}

export function splitTelegraphCells(value: string): TelegraphCell[] {
  const cells: TelegraphCell[] = [];
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (isAsciiAlphanumeric(character)) {
      let end = index;
      while (end < value.length && isAsciiAlphanumeric(value[end])) end += 1;
      const run = value.slice(index, end);
      const runId = `${index}:${end}:${run}`;
      for (let offset = 0; offset < run.length; offset += 5) {
        cells.push({ value: run.slice(offset, offset + 5), alphanumericRun: runId });
      }
      index = end;
      continue;
    }
    if (isAscii(character)) {
      cells.push({ value: character, code: `(${character})` });
      index += 1;
      continue;
    }
    cells.push({
      value: character,
      code: hanziToCcc[character],
      unsupported: !hanziToCcc[character],
    });
    index += 1;
  }
  return cells;
}

export function formatCodeText(cells: TelegraphCell[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < cells.length) {
    const cell = cells[index];
    if (isAsciiAlphanumericText(cell.value)) {
      let segment = '';
      while (index < cells.length && isAsciiAlphanumericText(cells[index].value)) {
        segment += cells[index].value;
        index += 1;
      }
      parts.push(`(${segment})`);
      continue;
    }
    if (!cell.code) {
      parts.push(/^[\x20-\x7E]+$/.test(cell.value) ? `(${cell.value})` : '????');
    } else {
      parts.push(cell.code);
    }
    index += 1;
  }
  return parts.join(' ');
}

export function buildTelegraphReceiveDocument(
  input: TelegraphDraftInput,
  result: TelegraphDraftResult,
  serialNumber: string,
  generatedAt: string,
): TelegraphReceiveDocument {
  const date = new Date(generatedAt);
  const destination = (input.city || input.county || input.district || input.province).trim();
  const destinationPinyin = toUppercasePinyin(destination) || 'UNKNOWN';
  const relayNumber = formatTelegraphRelayNumber(serialNumber);
  const recipientRows = chunkCells(result.recipientCells, 8);
  const bodyRows = chunkCells(result.bodyCells, 8);
  const rows = [...recipientRows, [], ...bodyRows].map((cells) => ({
    cells,
    code: formatCodeText(cells),
    text: cells.map((cell) => cell.value).join(''),
    compressed: cells.length > 0 && cells.some((cell) => cell.alphanumericRun),
  }));
  const day = Number.isNaN(date.getTime()) ? 1 : date.getDate();
  const time = Number.isNaN(date.getTime())
    ? '0000'
    : `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  const header = `ZCZC ${relayNumber}`;
  const protocolLine = `P ${destinationPinyin} ${destination || 'UNKNOWN'} ${relayNumber} ${result.billableGrids} ${day} ${time}`;
  const codeTokens = buildReceiveCodeTokens(
    header,
    protocolLine,
    [...result.recipientCells, ...result.bodyCells],
    'NNNN',
  );

  return {
    relayNumber,
    header,
    protocolLine,
    codeText: codeTokens.map((token) => token.display).join(''),
    codeTokens,
    rows,
    terminator: 'NNNN',
  };
}

export function inferTelegraphCharacter(code: string, visibleDigits: number): string {
  const normalized = code.replace(/\D/g, '').slice(0, 4);
  if (!normalized || visibleDigits <= 0 || visibleDigits >= normalized.length) return '';
  const prefix = normalized.slice(0, visibleDigits);
  const suffixWidth = normalized.length - visibleDigits;
  const rangeStart = Number(prefix) * 10 ** suffixWidth;
  const rangeEnd = rangeStart + 10 ** suffixWidth - 1;
  const codebook = cccToHanzi as Record<string, string>;
  // 从后缀全 0 开始递增，但始终限制在当前已显示前缀的区间内。
  for (let candidate = rangeStart; candidate <= rangeEnd; candidate += 1) {
    const padded = String(candidate).padStart(normalized.length, '0');
    if (codebook[padded]) return codebook[padded];
  }
  return '';
}

export function formatTelegraphDate(date: Date): { date: string; time: string } {
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function createTelegraphSerial(date = new Date()): string {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `YCT-${stamp}-${String(Date.now()).slice(-5)}`;
}

export function formatTelegraphRelayNumber(serialNumber: string): string {
  return `YCT${extractRelaySequence(serialNumber)}`;
}

function isAscii(value: string | undefined): boolean {
  return Boolean(value && /^[\x20-\x7E]$/.test(value));
}

function isAsciiAlphanumeric(value: string | undefined): boolean {
  return Boolean(value && /^[A-Za-z0-9]$/.test(value));
}

function isAsciiAlphanumericText(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function extractRelaySequence(serialNumber: string): string {
  const digits = serialNumber.replace(/\D/g, '');
  return (digits.slice(-4) || '0001').padStart(4, '0');
}

function chunkCells(cells: TelegraphCell[], size: number): TelegraphCell[][] {
  const rows: TelegraphCell[][] = [];
  for (let index = 0; index < cells.length; index += size) {
    rows.push(cells.slice(index, index + size));
  }
  return rows;
}

function buildReceiveCodeTokens(
  header: string,
  protocolLine: string,
  contentCells: TelegraphCell[],
  terminator: string,
): TelegraphReceiveCodeToken[] {
  const tokens: TelegraphReceiveCodeToken[] = [];
  appendReceiveTextTokens(tokens, header, 'header');
  appendReceiveTextTokens(tokens, '\n', 'header');
  appendReceiveTextTokens(tokens, protocolLine, 'protocol');
  appendReceiveTextTokens(tokens, '\n', 'protocol');
  appendReceiveCellTokens(tokens, contentCells);
  appendReceiveTextTokens(tokens, '\n', 'content');
  appendReceiveTextTokens(tokens, terminator, 'terminator');
  let progressIndex = 0;
  return tokens.map((token) => {
    if (token.kind === 'space') return token;
    const next = { ...token, progressIndex };
    progressIndex += 1;
    return next;
  });
}

function appendReceiveTextTokens(
  tokens: TelegraphReceiveCodeToken[],
  value: string,
  line: TelegraphReceiveCodeToken['line'],
): void {
  for (const character of value) {
    if (/\s/.test(character)) {
      tokens.push({
        display: character,
        kind: 'space',
        line,
        progressIndex: null,
        spaceKind: character === '\n' ? 'line' : 'word',
      });
      continue;
    }
    const code = hanziToCcc[character];
    if (code) {
      for (const [digitIndex, digit] of code.split('').entries()) {
        tokens.push({
          display: digit,
          kind: 'digit',
          line,
          progressIndex: null,
          source: character,
          code,
          digitIndex,
          digitCount: code.length,
        });
      }
      continue;
    }
    tokens.push({ display: character, kind: 'literal', line, progressIndex: null });
  }
}

function appendReceiveCellTokens(
  tokens: TelegraphReceiveCodeToken[],
  cells: TelegraphCell[],
): void {
  let previousRun: string | undefined;
  cells.forEach((cell, cellIndex) => {
    if (/^\s$/.test(cell.value)) {
      tokens.push({
        display: cell.value,
        kind: 'space',
        line: 'content',
        progressIndex: null,
        cellIndex,
        spaceKind: 'word',
      });
      previousRun = undefined;
      return;
    }
    if (cell.alphanumericRun) {
      if (cell.alphanumericRun !== previousRun) {
        tokens.push({ display: '(', kind: 'literal', line: 'content', progressIndex: null });
      }
      for (const character of cell.value) {
        tokens.push({
          display: character,
          kind: 'literal',
          line: 'content',
          progressIndex: null,
          cellIndex,
          source: cell.value,
        });
      }
      const nextRun = cells[cellIndex + 1]?.alphanumericRun;
      if (nextRun !== cell.alphanumericRun) {
        tokens.push({ display: ')', kind: 'literal', line: 'content', progressIndex: null });
      }
      previousRun = cell.alphanumericRun;
    } else {
      previousRun = undefined;
      const code = cell.code?.replace(/\D/g, '') ?? '';
      if (code) {
        for (const [digitIndex, digit] of code.split('').entries()) {
          tokens.push({
            display: digit,
            kind: 'digit',
            line: 'content',
            progressIndex: null,
            cellIndex,
            source: cell.value,
            code,
            digitIndex,
            digitCount: code.length,
          });
        }
      } else {
        for (const character of cell.value) {
          tokens.push({
            display: character,
            kind: 'literal',
            line: 'content',
            progressIndex: null,
            cellIndex,
            source: cell.value,
          });
        }
      }
    }
    const nextRun = cells[cellIndex + 1]?.alphanumericRun;
    const nextCell = cells[cellIndex + 1];
    if (
      cellIndex < cells.length - 1 &&
      !/^\s$/.test(nextCell?.value) &&
      (!cell.alphanumericRun || nextRun !== cell.alphanumericRun)
    ) {
      tokens.push({
        display: ' ',
        kind: 'space',
        line: 'content',
        progressIndex: null,
        spaceKind: 'character',
      });
    }
  });
}
