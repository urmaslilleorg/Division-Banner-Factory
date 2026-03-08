/**
 * spreadsheet-parser.ts
 * Parses .xlsx, .xls, and .csv files into a normalised ParsedSheet structure.
 * Used by the spreadsheet import API routes.
 */

import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string;
  rowCount: number;
}

/**
 * Normalise a cell value to a clean string.
 * - Multi-code cells (e.g. "502511998\n502511999") → first code only
 * - Comma decimal prices ("24,5") → "24.5"
 * - null/undefined → ""
 */
function normaliseCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  // Multi-code: take first line only
  if (str.includes("\n")) {
    return str.split("\n")[0].trim();
  }
  // Comma decimal → dot decimal (only if it looks like a price)
  if (/^\d+,\d+$/.test(str)) {
    return str.replace(",", ".");
  }
  return str;
}

/**
 * Parse a spreadsheet buffer into a normalised ParsedSheet.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseSpreadsheet(file: Buffer, mimeType?: string): ParsedSheet {
  const workbook = XLSX.read(file, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0] || "Sheet1";
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length === 0) {
    return { headers: [], rows: [], sheetName, rowCount: 0 };
  }

  // First row = headers
  const headers: string[] = (rawRows[0] as unknown[]).map((h) =>
    normaliseCell(h)
  );

  // Remaining rows = data
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i] as unknown[];
    // Skip entirely empty rows
    const hasData = raw.some((v) => v !== "" && v !== null && v !== undefined);
    if (!hasData) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) {
        row[header] = normaliseCell(raw[idx]);
      }
    });
    rows.push(row);
  }

  return {
    headers: headers.filter(Boolean),
    rows,
    sheetName,
    rowCount: rows.length,
  };
}
