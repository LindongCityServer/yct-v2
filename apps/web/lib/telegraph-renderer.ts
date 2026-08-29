import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { appendMaterialPreviewWatermark } from './material-renderer';
import {
  buildTelegraphReceiveDocument,
  formatTelegraphDate,
  formatTelegraphRelayNumber,
  type TelegraphDraftInput,
  type TelegraphDraftResult,
  type TelegraphCell,
} from './telegraph-domain';

export interface TelegraphRenderInput {
  paper: 'send' | 'receive';
  draft: TelegraphDraftInput;
  result: TelegraphDraftResult;
  serialNumber: string;
  generatedAt: string;
  watermarkLabel: string;
}

export async function renderTelegraphPaper(input: TelegraphRenderInput): Promise<Buffer> {
  const sourceSvg =
    input.paper === 'send' ? await renderSendPaper(input) : renderReceivePaper(input);
  const watermarkOpacity = resolveTelegraphWatermarkOpacity(sourceSvg);
  const svg = appendMaterialPreviewWatermark(sourceSvg, 595, 842, {
    traceLines: [
      `${input.watermarkLabel || '未知 IP'} | ${input.serialNumber}`,
      formatTelegraphWatermarkTimestamp(input.generatedAt),
    ],
    opacity: watermarkOpacity,
  });
  return new Resvg(svg, {
    font: {
      loadSystemFonts: true,
      fontFiles: resolveTelegraphFontFiles(),
      defaultFontFamily: 'HarmonyOS Sans SC',
      sansSerifFamily: 'HarmonyOS Sans SC',
    },
  })
    .render()
    .asPng();
}

async function renderSendPaper(input: TelegraphRenderInput): Promise<string> {
  const template = await readPublicAsset('telegraph/send-paper-template.png');
  const imageData = template.toString('base64');
  const date = formatTelegraphDate(new Date(input.generatedAt));
  const bodyCells = input.result.bodyCells;
  const recipientCells = input.result.recipientCells;

  const overlays = [
    text(135, 79, String(input.result.billableGrids), 17, '#17372b', 'middle'),
    text(135, 113, input.result.amount.toFixed(2), 17, '#17372b', 'middle'),
    text(519, 79, formatTelegraphRelayNumber(input.serialNumber), 13, '#17372b', 'middle'),
    text(519, 113, date.date, 12, '#17372b', 'middle'),
    text(519, 147, date.time.replace(':', ''), 13, '#17372b', 'middle'),
    text(58, 202, '', 12, '#17372b', 'middle'),
    text(152, 202, '电报大楼', 12, '#17372b', 'middle'),
    text(280, 202, formatTelegraphRelayNumber(input.serialNumber), 12, '#17372b', 'middle'),
    text(408, 202, String(input.result.billableGrids), 12, '#17372b', 'middle'),
    text(519, 202, date.time.replace(':', ''), 12, '#17372b', 'middle'),
    text(228, 370, input.draft.province, 13, '#17372b', 'middle'),
    text(382, 370, input.draft.city, 13, '#17372b', 'middle'),
    text(540, 370, input.draft.county || input.draft.district, 13, '#17372b', 'middle'),
    renderCellRows(recipientCells, 91, 272, 47.5, 25, 2),
    renderCellRows(bodyCells, 91, 397, 47.5, 50, 5),
    text(88, 709, input.draft.senderName, 12),
    text(190, 709, input.draft.senderAddress, 12),
    text(460, 709, date.date, 11),
    text(532, 709, '', 12, '#17372b', 'middle'),
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842"><image href="data:image/png;base64,${imageData}" width="595" height="842"/>${overlays}</svg>`;
}

function renderReceivePaper(input: TelegraphRenderInput): string {
  const document = buildTelegraphReceiveDocument(
    input.draft,
    input.result,
    input.serialNumber,
    input.generatedAt,
  );
  const allCells = document.rows.flatMap((row) => row.cells);
  let cellOffset = 0;
  const codeRows = document.rows
    .map((row, index) => {
      const rendered = row.cells.length
        ? renderReceiveCells(row.cells, 42, 134 + index * 42, 63.875, allCells, cellOffset)
        : '';
      cellOffset += row.cells.length;
      return rendered;
    })
    .join('');
  const endY = 134 + document.rows.length * 42 + 22;
  const headerCode = formatReceiveLineCode(document, 'header');
  const protocolCode = formatReceiveLineCode(document, 'protocol');
  const terminatorCode = formatReceiveLineCode(document, 'terminator');
  const content = [
    text(
      42,
      58,
      headerCode,
      14,
      '#1b1b1b',
      'start',
      "'Unifont', 'HarmonyOS Sans SC', sans-serif",
    ),
    text(
      42,
      90,
      protocolCode,
      13,
      '#1b1b1b',
      'start',
      "'Unifont', 'HarmonyOS Sans SC', sans-serif",
    ),
    codeRows,
    text(
      42,
      endY,
      terminatorCode,
      14,
      '#1b1b1b',
      'start',
      "'Unifont', 'HarmonyOS Sans SC', sans-serif",
    ),
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842"><rect width="595" height="842" fill="#ffffff"/>${content}</svg>`;
}

function formatReceiveLineCode(
  document: ReturnType<typeof buildTelegraphReceiveDocument>,
  line: 'header' | 'protocol' | 'terminator',
): string {
  return document.codeTokens
    .filter((token) => token.line === line)
    .map((token) => token.display)
    .join('');
}

function renderReceiveCells(
  cells: TelegraphCell[],
  x: number,
  y: number,
  cellWidth: number,
  allCells: TelegraphCell[],
  offset: number,
): string {
  return cells
    .map((cell, index) => {
      const cellX = x + index * cellWidth + 3;
      const globalIndex = offset + index;
      const code = formatReceiveCellCode(allCells, globalIndex);
      const value = formatReceiveCellValue(allCells, globalIndex);
      return `${text(cellX, y, code, 10, '#1b1b1b', 'start', "'Unifont', 'HarmonyOS Sans SC', sans-serif")}${text(cellX, y + 17, value, 10, '#1b1b1b', 'start', "'Unifont', 'HarmonyOS Sans SC', sans-serif")}`;
    })
    .join('');
}

function formatReceiveCellCode(cells: TelegraphCell[], index: number): string {
  const cell = cells[index];
  if (!cell) return '';
  if (!cell.alphanumericRun) return cell.code ?? '';
  return '';
}

function formatReceiveCellValue(cells: TelegraphCell[], index: number): string {
  const cell = cells[index];
  if (!cell) return '';
  if (!cell.alphanumericRun) return cell.value;
  const previousIsRun = cells[index - 1]?.alphanumericRun === cell.alphanumericRun;
  const nextIsRun = cells[index + 1]?.alphanumericRun === cell.alphanumericRun;
  return `${previousIsRun ? '' : '('}${cell.value}${nextIsRun ? '' : ')'}`;
}

function resolveTelegraphWatermarkOpacity(svg: string): number {
  // 纸面越亮，水印越淡；透明度保持在 5% 到 30% 之间。
  const colors = [...svg.matchAll(/\b(?:fill|stroke)="(#[0-9a-f]{3,8})"/gi)].map(
    (match) => match[1],
  );
  const baseBrightness = /<image\b/i.test(svg) ? 0.94 : 0.98;
  const inkBrightness = colors.length
    ? colors.reduce((total, color) => total + colorBrightness(color), 0) / colors.length
    : baseBrightness;
  const brightness = Math.max(0, Math.min(1, baseBrightness * 0.72 + inkBrightness * 0.28));
  return Number((0.3 - brightness * 0.25).toFixed(3));
}

function colorBrightness(color: string): number {
  const normalized = color.slice(1);
  const channels =
    normalized.length === 3
      ? normalized.split('').map((channel) => Number.parseInt(`${channel}${channel}`, 16))
      : [
          Number.parseInt(normalized.slice(0, 2), 16),
          Number.parseInt(normalized.slice(2, 4), 16),
          Number.parseInt(normalized.slice(4, 6), 16),
        ];
  if (channels.some((channel) => Number.isNaN(channel))) return 1;
  return (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
}

function renderCellRows(
  cells: TelegraphDraftResult['bodyCells'],
  x: number,
  y: number,
  cellWidth: number,
  rowHeight: number,
  rowCount: number,
): string {
  return cells
    .slice(0, rowCount * 10)
    .map((cell, index) => {
      const row = Math.floor(index / 10);
      const column = index % 10;
      const value = formatCellDisplay(cells, index);
      const valueY = y + row * rowHeight + (rowHeight <= 25 ? 11 : 16);
      const codeY = y + row * rowHeight + (rowHeight <= 25 ? 21 : 34);
      return `${text(
        x + column * cellWidth + cellWidth / 2,
        valueY,
        value,
        value.length > 1 ? 8 : rowHeight <= 25 ? 10 : 15,
        cell.unsupported ? '#b3261e' : '#222222',
        'middle',
      )}${text(
        x + column * cellWidth + cellWidth / 2,
        codeY,
        cell.code?.startsWith('(') ? '' : (cell.code ?? ''),
        rowHeight <= 25 ? 6 : 8,
        cell.unsupported ? '#b3261e' : '#4d4d4d',
        'middle',
        "'Unifont', 'HarmonyOS Sans SC', sans-serif",
      )}`;
    })
    .join('');
}

function formatCellDisplay(cells: TelegraphCell[], index: number): string {
  const cell = cells[index];
  if (!cell) return '';
  const isRun = /^[A-Za-z0-9]+$/.test(cell.value);
  if (!isRun) return cell.value;
  const previousIsRun = Boolean(cells[index - 1] && /^[A-Za-z0-9]+$/.test(cells[index - 1].value));
  const nextIsRun = Boolean(cells[index + 1] && /^[A-Za-z0-9]+$/.test(cells[index + 1].value));
  return `${previousIsRun ? '' : '('}${cell.value}${nextIsRun ? '' : ')'}`;
}

function formatTelegraphWatermarkTimestamp(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function text(
  x: number,
  y: number,
  value: string,
  fontSize: number,
  fill = '#222222',
  anchor: 'start' | 'middle' = 'start',
  fontFamily = "'平方韶华体', 'HarmonyOS Sans SC', sans-serif",
): string {
  return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '\"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

async function readPublicAsset(relativePath: string): Promise<Buffer> {
  const candidates = [
    path.resolve(process.cwd(), 'public', relativePath),
    path.resolve(process.cwd(), 'apps/web/public', relativePath),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      continue;
    }
  }
  throw new Error(`电报模板不存在：${relativePath}`);
}

function resolveTelegraphFontFiles(): string[] {
  return [
    resolveFontPath('telegraph-handwriting.ttf'),
    resolveFontPath('telegraph-dot-matrix.otf'),
  ];
}

function resolveFontPath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'fonts', 'telegraph', fileName),
    path.resolve(process.cwd(), 'apps/web/public/fonts/telegraph', fileName),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error(`电报字体不存在：${fileName}`);
  return match;
}
