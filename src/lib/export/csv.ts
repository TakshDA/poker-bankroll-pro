/**
 * RFC 4180 CSV writer. Money is written as a plain decimal in its own
 * currency (e.g. "-12.50"), never as a float. Text cells that a spreadsheet
 * would treat as a formula are prefixed with an apostrophe (CSV injection).
 */
import { minorUnits } from "../finance/currency";
import { minorToDecimal } from "../finance/money";
import type { Cell, Column, ExportTable } from "./tables";

const FORMULA_START = /^[=+\-@\t\r]/;

export function cellToText(cell: Cell, col: Column): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") return minorToDecimal(cell.minor, minorUnits(cell.currency));
  if (typeof cell === "number") return String(cell);
  if (col.type === "text" && FORMULA_START.test(cell)) return `'${cell}`;
  return cell;
}

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map((c) => quote(c.label)).join(",")];
  for (const row of table.rows) lines.push(table.columns.map((c) => quote(cellToText(row[c.key] ?? null, c))).join(","));
  return lines.join("\r\n") + "\r\n";
}
