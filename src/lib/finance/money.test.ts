import { describe, expect, it } from "vitest";
import { convertMinor, RateTable } from "./fx";
import {
  averageMinor,
  divRoundMinor,
  formatMoney,
  minorToDecimal,
  MoneyError,
  parseMoney,
  percent,
  perHourMinor,
  sumMinor,
} from "./money";

describe("parseMoney", () => {
  it("parses plain, grouped and symbol-prefixed amounts exactly", () => {
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("$300")).toBe(30000);
    expect(parseMoney("-$12.05")).toBe(-1205);
    expect(parseMoney("$-12.05")).toBe(-1205);
    expect(parseMoney(".5")).toBe(50);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("-0")).toBe(0);
    expect(parseMoney("12.")).toBe(1200);
  });

  it("avoids float artefacts like 0.1 + 0.2", () => {
    expect(parseMoney("0.1") + parseMoney("0.2")).toBe(parseMoney("0.3"));
    expect(parseMoney("1.15")).toBe(115); // float(1.15*100) = 114.99999999999999
    expect(parseMoney("4.35")).toBe(435);
  });

  it("respects currency minor units", () => {
    expect(parseMoney("1500", 0)).toBe(1500);
    expect(() => parseMoney("15.5", 0)).toThrow(MoneyError);
  });

  it("rejects invalid input and excess precision", () => {
    expect(() => parseMoney("abc")).toThrow(MoneyError);
    expect(() => parseMoney("1.234")).toThrow(MoneyError);
    expect(() => parseMoney("1.2.3")).toThrow(MoneyError);
    expect(() => parseMoney("")).toThrow(MoneyError);
    expect(() => parseMoney("--5")).toThrow(MoneyError);
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(() => parseMoney("999999999999999999")).toThrow(MoneyError);
  });
});

describe("arithmetic helpers", () => {
  it("sums integers and rejects non-integers", () => {
    expect(sumMinor([100, -50, 25])).toBe(75);
    expect(() => sumMinor([100, 0.5])).toThrow(MoneyError);
  });

  it("rounds half away from zero", () => {
    expect(divRoundMinor(5, 2)).toBe(3);
    expect(divRoundMinor(-5, 2)).toBe(-3);
    expect(divRoundMinor(4, 3)).toBe(1);
    expect(divRoundMinor(-4, 3)).toBe(-1);
    expect(averageMinor([100, 101])).toBe(101);
    expect(averageMinor([])).toBeNull();
  });

  it("computes hourly rate in minor units, null for zero hours", () => {
    expect(perHourMinor(10000, 120)).toBe(5000);
    expect(perHourMinor(10000, 90)).toBe(6667);
    expect(perHourMinor(-10000, 90)).toBe(-6667);
    expect(perHourMinor(10000, 0)).toBeNull();
  });

  it("returns null percentages for zero denominators", () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(1, 4)).toBe(25);
  });
});

describe("formatting", () => {
  it("formats decimals without float error", () => {
    expect(minorToDecimal(-5)).toBe("-0.05");
    expect(minorToDecimal(123456)).toBe("1234.56");
    expect(minorToDecimal(1500, 0)).toBe("1500");
    expect(formatMoney(123456, "CAD")).toBe("$1,234.56");
    expect(formatMoney(-1205, "USD")).toBe("-$12.05");
    expect(formatMoney(1205, "USD", 2, { signed: true })).toBe("+$12.05");
    expect(formatMoney(0, "USD", 2, { signed: true })).toBe("$0.00");
  });
});

describe("currency conversion", () => {
  it("converts with exact rational arithmetic and half-up rounding", () => {
    expect(convertMinor(10000, "1.3650", "USD", "CAD")).toBe(13650);
    expect(convertMinor(1, "1.365", "USD", "CAD")).toBe(1); // 1.365 -> 1
    expect(convertMinor(3, "1.5", "USD", "CAD")).toBe(5); // 4.5 -> 5
    expect(convertMinor(-3, "1.5", "USD", "CAD")).toBe(-5);
    expect(convertMinor(10000, "150.25", "USD", "JPY")).toBe(15025); // 100.00 USD -> 15025 JPY
  });

  it("picks the latest rate on or before the date, inverting when needed", () => {
    const table = new RateTable([
      { baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.30", effectiveDate: "2026-01-01" },
      { baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.40", effectiveDate: "2026-06-01" },
    ]);
    expect(table.convert(10000, "USD", "CAD", "2026-03-01")).toEqual({ amount: 13000, quality: "converted" });
    expect(table.convert(10000, "USD", "CAD", "2026-07-01")).toEqual({ amount: 14000, quality: "converted" });
    // inverse: 14000 CAD at 1.40 -> 10000 USD
    expect(table.convert(14000, "CAD", "USD", "2026-07-01")).toEqual({ amount: 10000, quality: "converted" });
    // before any rate: earliest rate, flagged as fallback
    expect(table.convert(10000, "USD", "CAD", "2025-01-01")).toEqual({ amount: 13000, quality: "fallback" });
    // same currency is exact; unknown pair is null
    expect(table.convert(500, "CAD", "CAD", "2026-01-01")).toEqual({ amount: 500, quality: "exact" });
    expect(table.convert(500, "EUR", "CAD", "2026-01-01")).toBeNull();
  });
});
