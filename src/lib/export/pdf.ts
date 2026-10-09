import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, sumMinor } from "../finance/money";
import { minorUnits } from "../finance/currency";
import { cellToText } from "./csv";
import type { Column, ExportTable, MoneyCell } from "./tables";

const PAGE: [number, number] = [842, 595]; // A4 landscape, points
const MARGIN = 36;
const ROW_H = 15;
const FONT_SIZE = 8;

/** Keep only characters the standard Helvetica (WinAnsi) font can draw. */
function safe(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  return out;
}

function fit(font: PDFFont, text: string, width: number): string {
  if (font.widthOfTextAtSize(text, FONT_SIZE) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, FONT_SIZE) > width) t = t.slice(0, -1);
  return `${t}...`;
}

function display(cell: unknown, col: Column): string {
  if (cell && typeof cell === "object") {
    const mc = cell as MoneyCell;
    return formatMoney(mc.minor, mc.currency, minorUnits(mc.currency));
  }
  return cellToText((cell ?? null) as never, { ...col, type: "date" }); // no CSV apostrophe in a PDF
}

/**
 * Printable report: title, scope line, per-currency totals for the primary
 * money column, then the table split across as many pages as needed.
 */
export async function toPdf(table: ExportTable, opts: { title: string; scope: string; generatedAt: string; totalKey?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setCreator("Poker Bankroll Pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cols = (table.pdfKeys ?? table.columns.slice(0, 8).map((c) => c.key)).map((k) => table.columns.find((c) => c.key === k)!).filter(Boolean);

  const usable = PAGE[0] - MARGIN * 2;
  const weights = cols.map((c) => (c.type === "money" ? 1.1 : c.type === "int" ? 0.6 : c.type === "date" ? 0.85 : c.key === "description" || c.key === "name" ? 2.2 : 1.2));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / totalW) * usable);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const right = (c: Column) => c.type === "money" || c.type === "int" || c.type === "number";
  const muted = rgb(0.4, 0.4, 0.4);

  let page: PDFPage = doc.addPage(PAGE);
  let y = PAGE[1] - MARGIN;
  const text = (p: PDFPage, s: string, x: number, yy: number, f = font, size = FONT_SIZE, color = rgb(0.1, 0.1, 0.1)) => p.drawText(safe(f, s), { x, y: yy, size, font: f, color });

  text(page, opts.title, MARGIN, y - 4, bold, 16);
  y -= 24;
  text(page, safe(font, `${opts.scope}  |  Generated ${opts.generatedAt}  |  ${table.rows.length} rows`), MARGIN, y, font, 9, muted);
  y -= 16;

  const totalKey = opts.totalKey;
  if (totalKey) {
    const byCur = new Map<string, number[]>();
    for (const r of table.rows) {
      const v = r[totalKey];
      if (v && typeof v === "object") byCur.set(v.currency, [...(byCur.get(v.currency) ?? []), v.minor]);
    }
    const label = table.columns.find((c) => c.key === totalKey)?.label ?? "Total";
    const parts = [...byCur].map(([cur, xs]) => formatMoney(sumMinor(xs), cur, minorUnits(cur), { signed: true }));
    if (parts.length) {
      text(page, `${label} total: ${parts.join("   ")}`, MARGIN, y, bold, 10);
      y -= 18;
    }
  }

  const header = () => {
    page.drawRectangle({ x: MARGIN - 2, y: y - 4, width: usable + 4, height: ROW_H, color: rgb(0.92, 0.92, 0.92) });
    cols.forEach((c, i) => {
      const s = fit(bold, safe(bold, c.label), widths[i] - 6);
      const w = bold.widthOfTextAtSize(s, FONT_SIZE);
      text(page, s, right(c) ? xs[i] + widths[i] - 4 - w : xs[i] + 2, y, bold);
    });
    y -= ROW_H;
  };
  header();
  for (const row of table.rows) {
    if (y < MARGIN + ROW_H) {
      page = doc.addPage(PAGE);
      y = PAGE[1] - MARGIN;
      header();
    }
    cols.forEach((c, i) => {
      const s = fit(font, safe(font, display(row[c.key], c)), widths[i] - 6);
      const w = font.widthOfTextAtSize(s, FONT_SIZE);
      const v = row[c.key];
      const color = v && typeof v === "object" && c.key === totalKey ? (v.minor < 0 ? rgb(0.7, 0.1, 0.1) : v.minor > 0 ? rgb(0.05, 0.45, 0.25) : undefined) : undefined;
      text(page, s, right(c) ? xs[i] + widths[i] - 4 - w : xs[i] + 2, y, font, FONT_SIZE, color);
    });
    page.drawLine({ start: { x: MARGIN - 2, y: y - 4 }, end: { x: MARGIN + usable + 2, y: y - 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    y -= ROW_H;
  }
  if (table.rows.length === 0) text(page, "No records match this export.", MARGIN, y, font, 10, muted);

  const pages = doc.getPages();
  pages.forEach((p, i) => text(p, `Page ${i + 1} of ${pages.length}`, PAGE[0] - MARGIN - 60, MARGIN / 2, font, 8, muted));
  return doc.save();
}
