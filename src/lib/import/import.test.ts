import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRows } from "./csv";
import { cleanMoneyCell, parseDateCell, parseDurationCell, parseStakesCell, parseTimeCell } from "./normalize";
import { guessMapping, rowToInput, RowError, type ImportOptions, type ImportRef } from "./spec";

const ACC = "11111111-1111-4111-8111-111111111111";
const ACC2 = "22222222-2222-4222-8222-222222222222";
const CAT = "33333333-3333-4333-8333-333333333333";
const ref: ImportRef = {
  accounts: [
    { id: ACC, name: "Live CAD" },
    { id: ACC2, name: "Online USD" },
  ],
  categories: [{ id: CAT, name: "Travel", kind: "travel" }],
  gameTypes: [{ id: "44444444-4444-4444-8444-444444444444", name: "No-Limit Hold'em", shortName: "NLHE" }],
};
const opts: ImportOptions = { dateOrder: "mdy", decimalMark: ".", defaultAccountId: ACC, defaultSetting: "live_casino", defaultCategoryId: CAT, includeDuplicates: false };

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF and a BOM", () => {
    const text = '﻿Date,Notes,Amount\r\n2026-10-01,"Line one\nline ""two""",12.50\r\n\r\n2026-10-02,plain,3\r\n';
    const csv = parseCsv(text);
    expect(csv.headers).toEqual(["Date", "Notes", "Amount"]);
    expect(csv.rows).toEqual([
      ["2026-10-01", 'Line one\nline "two"', "12.50"],
      ["2026-10-02", "plain", "3"],
    ]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
  });
  it("keeps commas inside quoted amounts", () => {
    expect(parseCsvRows('"$1,234.50",x')).toEqual([["$1,234.50", "x"]]);
  });
});

describe("cell normalisation", () => {
  it("reads dates in the chosen order and rejects impossible ones", () => {
    expect(parseDateCell("2026-10-09", "mdy")).toBe("2026-10-09");
    expect(parseDateCell("10/09/2026", "mdy")).toBe("2026-10-09");
    expect(parseDateCell("10/09/2026", "dmy")).toBe("2026-09-10");
    expect(parseDateCell("9.10.26", "dmy")).toBe("2026-10-09");
    expect(parseDateCell("Oct 9, 2026", "mdy")).toBe("2026-10-09");
    expect(parseDateCell("9 October 2026", "mdy")).toBe("2026-10-09");
    expect(parseDateCell("2026-10-09 19:30", "mdy")).toBe("2026-10-09");
    expect(parseDateCell("02/30/2026", "mdy")).toBeNull();
    expect(parseDateCell("yesterday", "mdy")).toBeNull();
  });
  it("reads 12- and 24-hour times", () => {
    expect(parseTimeCell("19:30")).toBe("19:30");
    expect(parseTimeCell("7:30 PM")).toBe("19:30");
    expect(parseTimeCell("12am")).toBe("00:00");
    expect(parseTimeCell("12:15 p.m.")).toBe("12:15");
    expect(parseTimeCell("25:00")).toBeNull();
    expect(parseTimeCell("7")).toBeNull();
  });
  it("reads durations", () => {
    expect(parseDurationCell("4.5")).toBe(270);
    expect(parseDurationCell("4,5", ",")).toBe(270);
    expect(parseDurationCell("4:30")).toBe(270);
    expect(parseDurationCell("4h30")).toBe(270);
    expect(parseDurationCell("90m")).toBe(90);
  });
  it("cleans money without floating point", () => {
    expect(cleanMoneyCell("$1,234.50")).toBe("1234.50");
    expect(cleanMoneyCell("(45.00)")).toBe("-45.00");
    expect(cleanMoneyCell("-CA$ 12")).toBe("-12");
    expect(cleanMoneyCell("1.234,50 €", ",")).toBe("1234.50");
    expect(cleanMoneyCell(".5")).toBe("0.5");
    expect(cleanMoneyCell("12abc3")).toBeNull();
    expect(cleanMoneyCell("1.2.3")).toBeNull();
  });
  it("reads stakes", () => {
    expect(parseStakesCell("NL $1/$2")).toEqual({ smallBlind: "1", bigBlind: "2" });
    expect(parseStakesCell("0.25/0.50")).toEqual({ smallBlind: "0.25", bigBlind: "0.50" });
    expect(parseStakesCell("NL200")).toBeNull();
  });
});

describe("column guessing", () => {
  it("maps common tracker headers", () => {
    const m = guessMapping("sessions", ["Date", "Start Time", "End Time", "Location", "Game", "Stakes", "Buy-In", "Cash Out", "Notes"]);
    expect(m).toMatchObject({ date: 0, startTime: 1, endTime: 2, location: 3, game: 4, stakes: 5, buyIn: 6, cashOut: 7, notes: 8 });
  });
  it("never maps one column to two fields", () => {
    const m = guessMapping("transactions", ["Date", "Amount", "Type"]);
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });
});

describe("row to form input", () => {
  const headers = ["Date", "Start", "Hours", "Where", "Game", "Stakes", "Buy-in", "Cash-out", "Account"];
  const mapping = { date: 0, startTime: 1, duration: 2, location: 3, game: 4, stakes: 5, buyIn: 6, cashOut: 7, account: 8 };

  it("builds a cash session, crossing midnight from a duration", () => {
    const input = rowToInput("sessions", ["10/09/2026", "10:30 PM", "4.5", "Casino Rama", "NLHE", "1/2", "$300", "$455.50", "live cad"], mapping, opts, ref, headers);
    expect(input).toMatchObject({ date: "2026-10-09", startTime: "22:30", endTime: "03:00", newVenueName: "Casino Rama", gameTypeId: ref.gameTypes[0].id, smallBlind: "1", bigBlind: "2", buyIn: "300", cashOut: "455.50", accountId: ACC, setting: "live_casino" });
  });
  it("turns a profit-only row into a buy-in or cash-out without changing the net", () => {
    const m = { date: 0, duration: 1, profit: 2 };
    expect(rowToInput("sessions", ["2026-10-09", "3", "-120"], m, opts, ref, ["d", "h", "p"])).toMatchObject({ buyIn: "120", cashOut: "0" });
    expect(rowToInput("sessions", ["2026-10-09", "3", "85.25"], m, opts, ref, ["d", "h", "p"])).toMatchObject({ buyIn: "0", cashOut: "85.25" });
  });
  it("names the column that is wrong", () => {
    const bad = () => rowToInput("sessions", ["10/09/2026", "nope", "4", "", "", "", "100", "50", ""], mapping, opts, ref, headers);
    expect(bad).toThrow(RowError);
    expect(bad).toThrow(/"nope" is not a time/);
    expect(() => rowToInput("sessions", ["10/09/2026", "", "4", "", "", "", "100", "50", "Nope"], mapping, opts, ref, headers)).toThrow(/No account named "Nope"/);
    expect(() => rowToInput("sessions", ["2026-13-01", "", "4", "", "", "", "100", "50", ""], mapping, opts, ref, headers)).toThrow(/not a date/);
  });
  it("builds tournaments with re-entries", () => {
    const input = rowToInput("tournaments", ["2026-10-04", "Sunday $20", "online", "Online USD", "18.40", "1.60", "3", "120"], { date: 0, name: 1, setting: 2, account: 3, buyIn: 4, fee: 5, entries: 6, payout: 7 }, opts, ref, []);
    expect(input).toMatchObject({ name: "Sunday $20", setting: "online", accountId: ACC2, payout: "120", startDate: "2026-10-04" });
    expect(input.entries).toHaveLength(3);
    expect((input.entries as { buyIn: string; fee: string }[])[2]).toMatchObject({ buyIn: "18.40", fee: "1.60" });
  });
  it("reads transaction types and signs", () => {
    const m = { date: 0, amount: 1, type: 2 };
    expect(rowToInput("transactions", ["2026-10-01", "-200", ""], m, opts, ref, [])).toMatchObject({ type: "withdrawal", amount: "200" });
    expect(rowToInput("transactions", ["2026-10-01", "500", "Cash in"], m, opts, ref, [])).toMatchObject({ type: "deposit", amount: "500" });
    expect(rowToInput("transactions", ["2026-10-01", "25", "Rakeback"], m, opts, ref, [])).toMatchObject({ type: "rakeback" });
    expect(rowToInput("transactions", ["2026-10-01", "-5", "adjustment"], m, opts, ref, [])).toMatchObject({ type: "adjustment", amount: "-5" });
  });
  it("matches expense categories by name or type, else the default", () => {
    const m = { date: 0, amount: 1, category: 2 };
    const other = { ...opts, defaultCategoryId: "55555555-5555-4555-8555-555555555555" };
    expect(rowToInput("expenses", ["2026-10-01", "40", "travel"], m, other, ref, [])).toMatchObject({ categoryId: CAT, amount: "40" });
    expect(rowToInput("expenses", ["2026-10-01", "40", "Snacks"], m, other, ref, [])).toMatchObject({ categoryId: other.defaultCategoryId });
  });
});
