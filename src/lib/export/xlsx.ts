import "server-only";
import ExcelJS from "exceljs";
import { minorUnits } from "../finance/currency";
import { minorToDecimal } from "../finance/money";
import type { ExportTable } from "./tables";

/**
 * Excel workbook, one sheet per table. Money becomes a numeric cell with the
 * currency's decimal places (the exact decimal string is parsed, so 12.50 is
 * stored as 12.5, not an accumulated float). Strings are written as shared strings (ExcelJS only
 * writes a formula for an explicit { formula } value), so "=1+1" stays text.
 */
export async function toXlsx(tables: ExportTable[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Poker Bankroll Pro";
  wb.created = new Date();
  for (const t of tables) {
    const ws = wb.addWorksheet(t.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = t.columns.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(10, c.label.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    for (const row of t.rows) {
      const values: Record<string, ExcelJS.CellValue> = {};
      for (const c of t.columns) {
        const v = row[c.key];
        if (v === null || v === undefined) values[c.key] = null;
        else if (typeof v === "object") values[c.key] = Number(minorToDecimal(v.minor, minorUnits(v.currency)));
        else if (c.type === "date" && typeof v === "string") values[c.key] = v; // ISO date text keeps it timezone-free
        else values[c.key] = v;
      }
      const r = ws.addRow(values);
      t.columns.forEach((c, i) => {
        const v = row[c.key];
        const cell = r.getCell(i + 1);
        if (v && typeof v === "object") {
          const d = minorUnits(v.currency);
          cell.numFmt = d === 0 ? "#,##0;[Red]-#,##0" : `#,##0.${"0".repeat(d)};[Red]-#,##0.${"0".repeat(d)}`;
        }
      });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
