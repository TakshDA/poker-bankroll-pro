/**
 * RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes,
 * CRLF/LF, UTF-8 BOM). The delimiter is detected from the header line:
 * comma, semicolon or tab. Pure: runs in the browser and on the server.
 */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t"]) {
    // Count delimiters outside quotes.
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const all = parseCsvRows(text, delimiter);
  const headers = (all[0] ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: all.slice(1), delimiter };
}
