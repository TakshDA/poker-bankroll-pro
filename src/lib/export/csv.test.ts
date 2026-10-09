import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import type { ExportTable } from "./tables";

const table = (rows: ExportTable["rows"]): ExportTable => ({
  name: "t",
  columns: [
    { key: "text", label: "Text", type: "text" },
    { key: "amount", label: "Amount", type: "money" },
    { key: "n", label: "N", type: "int" },
  ],
  rows,
});

describe("toCsv", () => {
  it("writes money as exact decimals in each currency's minor units", () => {
    const csv = toCsv(table([
      { text: "a", amount: { minor: -1250, currency: "CAD" }, n: 3 },
      { text: "b", amount: { minor: 1000, currency: "JPY" }, n: null },
      { text: "c", amount: { minor: 1, currency: "USD" }, n: 0 },
    ]));
    expect(csv).toBe("Text,Amount,N\r\na,-12.50,3\r\nb,1000,\r\nc,0.01,0\r\n");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(table([{ text: 'He said "hi", then\nleft', amount: null, n: null }]))).toBe('Text,Amount,N\r\n"He said ""hi"", then\nleft",,\r\n');
  });

  it("neutralises spreadsheet formulas in text cells only", () => {
    const csv = toCsv(table([
      { text: "=HYPERLINK(\"x\")", amount: { minor: -500, currency: "CAD" }, n: -1 },
      { text: "+1", amount: null, n: null },
      { text: "@SUM(A1)", amount: null, n: null },
      { text: "-2", amount: null, n: null },
    ]));
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('"\'=HYPERLINK(""x"")",-5.00,-1');
    expect(lines[2]).toBe("'+1,,");
    expect(lines[3]).toBe("'@SUM(A1),,");
    expect(lines[4]).toBe("'-2,,");
  });
});
