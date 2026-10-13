/**
 * Turn loosely formatted spreadsheet cells into the strict strings the form
 * schemas accept. Each function returns null when the cell cannot be read, so
 * the caller can report which column was wrong. Pure (browser and server).
 */
/** Cells longer than this are never a date, time, amount or stake; refusing them keeps matching cheap. */
const MAX_CELL = 64;
const tooLong = (cell: string) => cell.length > MAX_CELL;

export type DateOrder = "ymd" | "mdy" | "dmy";
export type DecimalMark = "." | ",";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function monthOf(name: string): number | undefined {
  const n = name.toLowerCase();
  return MONTHS[n] ?? (n.length >= 3 ? MONTHS[n.slice(0, 3)] : undefined);
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso) ? iso : null;
}

/** Split "2026-10-09 19:30" or "2026-10-09T19:30:00" into date and time parts. */
export function splitDateTime(cell: string): { date: string; time: string | null } {
  if (tooLong(cell)) return { date: cell, time: null };
  const s = cell.trim();
  const m = /^(.+?)[T\s]+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)$/i.exec(s);
  return m ? { date: m[1], time: m[2] } : { date: s, time: null };
}

export function parseDateCell(cell: string, order: DateOrder): string | null {
  if (tooLong(cell)) return null;
  const s = splitDateTime(cell).date.replace(/,/g, " ").trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const a = +m[1];
    const b = +m[2];
    if (order === "dmy" || (order === "ymd" && a > 12)) return validYmd(y, b, a);
    return validYmd(y, a, b);
  }
  // "Oct 9 2026", "October 9 2026", "9 Oct 2026"
  m = /^([a-z]+)\.?\s+(\d{1,2})\s+(\d{4})$/i.exec(s);
  if (m && monthOf(m[1])) return validYmd(+m[3], monthOf(m[1])!, +m[2]);
  m = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(s);
  if (m && monthOf(m[2])) return validYmd(+m[3], monthOf(m[2])!, +m[1]);
  return null;
}

/** "19:30", "7:30 PM", "7pm", "19:30:00" -> "19:30". */
export function parseTimeCell(cell: string): string | null {
  if (tooLong(cell)) return null;
  const s = cell.trim().toLowerCase().replace(/\./g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (!m[2] && !m[3]) return null; // a bare number is not a time
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Hours played: "4.5", "4,5" (comma mark), "4:30", "4h30", "270m". Returns minutes. */
export function parseDurationCell(cell: string, mark: DecimalMark = "."): number | null {
  if (tooLong(cell)) return null;
  const s = cell.trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d{1,3}):(\d{2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d{1,3})\s*h(?:ours?|rs?)?\s*(?:(\d{1,2})\s*(?:m(?:ins?)?)?)?$/.exec(s);
  if (m) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  m = /^(\d{1,5})\s*m(?:in(?:utes?)?)?$/.exec(s);
  if (m) return +m[1];
  const num = Number(mark === "," ? s.replace(",", ".") : s);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 60) : null;
}

/**
 * "$1,234.50", "(45.00)", "-45", "CA$ 12", "1.234,50" (comma mark) -> a plain
 * decimal string like "1234.50" or "-45". Null when it is not a number.
 */
export function cleanMoneyCell(cell: string, mark: DecimalMark = "."): string | null {
  if (tooLong(cell)) return null;
  let s = cell.trim().replace(/[\s ']/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Optional sign, currency code/symbol before or after, trailing minus. Letters
  // anywhere else (e.g. "12abc3") make the cell unreadable rather than guessed.
  const m = /^([+-]?)([A-Za-z]{0,3}[$€£¥]?)([+-]?)([\d.,]+)([$€£¥]?[A-Za-z]{0,3})(-?)$/.exec(s);
  if (!m) return null;
  if ([m[1], m[3], m[6]].filter((x) => x === "-").length % 2 === 1) negative = !negative;
  let n = m[4];
  n = mark === "," ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(n)) return null;
  if (n.startsWith(".")) n = `0${n}`;
  return negative && Number(n) !== 0 ? `-${n}` : n;
}

/** "1/2", "$0.25/$0.50", "NL 1/2" -> small and big blind decimal strings. */
export function parseStakesCell(cell: string, mark: DecimalMark = "."): { smallBlind: string; bigBlind: string } | null {
  if (tooLong(cell)) return null;
  const m = /([\d.,]+)\s*\/\s*\D{0,3}([\d.,]+)/.exec(cell.replace(/[$€£¥]/g, ""));
  if (!m) return null;
  const sb = cleanMoneyCell(m[1], mark);
  const bb = cleanMoneyCell(m[2], mark);
  return sb && bb ? { smallBlind: sb, bigBlind: bb } : null;
}

export function parseBoolCell(cell: string): boolean {
  return /^(y|yes|true|1|x|✓)$/i.test(cell.trim());
}

/** Integer cells such as "1,234" or "12". */
export function parseIntCell(cell: string): string | null {
  if (tooLong(cell)) return null;
  const s = cell.trim().replace(/[,\s]/g, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? String(Number(s)) : null;
}
