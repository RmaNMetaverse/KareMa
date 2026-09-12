import ExcelJS from 'exceljs';
import type { BoardProgress, BoardProgressReport, ListProgress } from './boardProgress';

const PRIMARY = 'FF4F46E5';
const PRIMARY_LIGHT = 'FFEDE9FE';
const SUCCESS_LIGHT = 'FFDCFCE7';
const WARNING_LIGHT = 'FFFEF3C7';
const TEXT = 'FF172033';
const MUTED = 'FF64748B';
const LINE = 'FFE2E8F0';
const FONT = 'Arial';

const LIST_HEADERS = [
  'List',
  'Progress',
  'Completed units',
  'Remaining units',
  'Total units',
  'Cards done',
  'Cards total',
  'Subtasks done',
  'Subtasks total',
  'Checklist items done',
  'Checklist items total',
];

const BOARD_HEADERS = [
  'Board',
  'Progress',
  'Completed units',
  'Remaining units',
  'Total units',
  'Cards done',
  'Cards total',
  'Subtasks done',
  'Subtasks total',
  'Checklist items done',
  'Checklist items total',
];

function metricRow(item: BoardProgress | ListProgress) {
  return [
    item.progress / 100,
    item.completedUnits,
    item.remainingUnits,
    item.totalUnits,
    item.cards.completed,
    item.cards.total,
    item.subtasks.completed,
    item.subtasks.total,
    item.checklistItems.completed,
    item.checklistItems.total,
  ];
}

function listRow(list: ListProgress) {
  return [list.title, ...metricRow(list)];
}

function boardRow(board: BoardProgress) {
  return [board.title, ...metricRow(board)];
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, lastColumn: number) {
  sheet.mergeCells(2, 1, 2, lastColumn);
  const cell = sheet.getCell(2, 1);
  cell.value = title;
  cell.font = { name: FONT, size: 16, bold: true, color: { argb: TEXT } };
  cell.alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 26;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 25;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: PRIMARY } } };
  });
}

function styleDataRows(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  progressColumn = 2,
  lastColumn = 11
) {
  if (endRow < startRow) return;
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.height = 22;
    row.font = { name: FONT, size: 10, color: { argb: TEXT } };
    row.alignment = { vertical: 'middle' };
    row.eachCell((cell, column) => {
      cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      if (column > 1) cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (column === progressColumn) cell.numFmt = '0%';
      else if (column > progressColumn && column <= lastColumn) cell.numFmt = '#,##0';
    });
    if ((rowNumber - startRow) % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  }
}

function setTableWidths(sheet: ExcelJS.Worksheet, firstLabel = 30) {
  sheet.getColumn(1).width = firstLabel;
  sheet.getColumn(2).width = 12;
  for (let column = 3; column <= 11; column++) sheet.getColumn(column).width = 17;
}

function addContext(
  sheet: ExcelJS.Worksheet,
  generatedAt: string,
  lastColumn: number,
  boardName?: string
) {
  sheet.mergeCells(3, 1, 3, lastColumn);
  const generated = sheet.getCell(3, 1);
  generated.value = `Generated ${new Date(generatedAt).toLocaleString('en-US')}`;
  generated.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };

  sheet.mergeCells(4, 1, 4, lastColumn);
  const method = sheet.getCell(4, 1);
  method.value = boardName
    ? `Progress for ${boardName} counts each active card, subtask card and checklist item as one work unit.`
    : 'Progress counts each active card, subtask card and checklist item as one work unit.';
  method.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
}

function addIndividualSheet(
  workbook: ExcelJS.Workbook,
  report: BoardProgressReport,
  board: BoardProgress
) {
  const sheet = workbook.addWorksheet('Board report', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 10 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  styleTitle(sheet, `${board.title} progress report`, 11);
  addContext(sheet, report.generatedAt, 11, board.title);

  sheet.getRow(6).values = ['Progress', 'Completed units', 'Remaining units', 'Total units'];
  sheet.getRow(7).values = [
    board.progress / 100,
    board.completedUnits,
    board.remainingUnits,
    board.totalUnits,
  ];
  for (let column = 1; column <= 4; column++) {
    const heading = sheet.getCell(6, column);
    heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY_LIGHT } };
    heading.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } };
    heading.alignment = { horizontal: 'center', vertical: 'middle' };
    const value = sheet.getCell(7, column);
    value.font = { name: FONT, size: 14, bold: true, color: { argb: TEXT } };
    value.alignment = { horizontal: 'center', vertical: 'middle' };
    value.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: column === 2 ? SUCCESS_LIGHT : column === 3 ? WARNING_LIGHT : 'FFF8FAFC' },
    };
  }
  sheet.getCell('A7').numFmt = '0%';
  sheet.getRow(7).height = 27;

  sheet.getRow(10).values = LIST_HEADERS;
  styleHeader(sheet.getRow(10));
  board.lists.forEach((list) => sheet.addRow(listRow(list)));
  const lastDataRow = 10 + board.lists.length;
  styleDataRows(sheet, 11, lastDataRow);
  setTableWidths(sheet, 30);
  sheet.autoFilter = { from: 'A10', to: `K${Math.max(lastDataRow, 10)}` };

  if (board.lists.length === 0) {
    sheet.mergeCells('A11:K11');
    const empty = sheet.getCell('A11');
    empty.value = 'No active lists';
    empty.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
  }
}

function addFullReportSheets(workbook: ExcelJS.Workbook, report: BoardProgressReport) {
  const summary = workbook.addWorksheet('Board summary', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  styleTitle(summary, 'Board progress report', 11);
  addContext(summary, report.generatedAt, 11);
  summary.getRow(6).values = BOARD_HEADERS;
  styleHeader(summary.getRow(6));
  report.boards.forEach((board) => summary.addRow(boardRow(board)));
  const summaryLast = 6 + report.boards.length;
  styleDataRows(summary, 7, summaryLast);
  setTableWidths(summary, 30);
  summary.autoFilter = { from: 'A6', to: `K${Math.max(summaryLast, 6)}` };

  const detail = workbook.addWorksheet('List detail', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  styleTitle(detail, 'List progress by board', 12);
  addContext(detail, report.generatedAt, 12);
  detail.getRow(6).values = ['Board', ...LIST_HEADERS];
  styleHeader(detail.getRow(6));
  for (const board of report.boards) {
    for (const list of board.lists) detail.addRow([board.title, ...listRow(list)]);
  }
  const listCount = report.boards.reduce((sum, board) => sum + board.lists.length, 0);
  const detailLast = 6 + listCount;
  styleDataRows(detail, 7, detailLast, 3, 12);
  detail.getColumn(1).width = 30;
  detail.getColumn(2).width = 30;
  detail.getColumn(3).width = 12;
  for (let column = 4; column <= 12; column++) detail.getColumn(column).width = 17;
  detail.autoFilter = { from: 'A6', to: `L${Math.max(detailLast, 6)}` };
}

export async function createProgressXlsx(
  report: BoardProgressReport,
  board?: BoardProgress
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KareMa';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.company = 'KareMa';

  if (board) addIndividualSheet(workbook, report, board);
  else addFullReportSheets(workbook, report);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function createProgressCsv(report: BoardProgressReport, board?: BoardProgress) {
  const headers = [
    'Board',
    'Board progress',
    'Board completed units',
    'Board remaining units',
    'Board total units',
    ...LIST_HEADERS,
  ];
  const selected = board ? [board] : report.boards;
  const rows: unknown[][] = [];

  for (const item of selected) {
    const boardCells = [
      item.title,
      `${item.progress}%`,
      item.completedUnits,
      item.remainingUnits,
      item.totalUnits,
    ];
    if (item.lists.length === 0) rows.push([...boardCells, '', '', '', '', '', '', '', '', '', '', '']);
    else {
      for (const list of item.lists) {
        rows.push([...boardCells, list.title, `${list.progress}%`, ...metricRow(list).slice(1)]);
      }
    }
  }

  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function safeReportFilename(title?: string) {
  const base = (title || 'all-boards')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'board'}-progress`;
}
