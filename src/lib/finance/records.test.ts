import { describe, expect, it } from "vitest";
import { cash, entry, tournament } from "./__fixtures__";
import { durationMinutes, resolveSessionTimes, localDate, resolveRange, weekStart } from "./dates";
import {
  bbPer100,
  cashInvested,
  cashSessionCounts,
  cashSessionNet,
  cashTableResult,
  tournamentCashed,
  tournamentInvestment,
  tournamentMinutes,
  tournamentNet,
} from "./records";

describe("cash-game result", () => {
  it("net = cash-out − buy-ins (rake is informational only)", () => {
    const s = cash({ accountId: "a", buyInMinor: 30000, cashOutMinor: 52500, rakeMinor: 4000 });
    expect(cashTableResult(s)).toBe(22500);
    expect(cashSessionNet(s)).toBe(22500);
  });

  it("includes rebuys and additional money in the investment", () => {
    const s = cash({ accountId: "a", buyInMinor: 30000, rebuysMinor: 30000, additionalMinor: 10000, cashOutMinor: 50000 });
    expect(cashInvested(s)).toBe(70000);
    expect(cashSessionNet(s)).toBe(-20000);
  });

  it("deducts separately paid tips/fees and adds session bonus/rakeback exactly once", () => {
    const s = cash({
      accountId: "a",
      buyInMinor: 20000,
      cashOutMinor: 25000,
      tipsMinor: 1000,
      feesMinor: 500,
      bonusMinor: 10000,
      rakebackMinor: 250,
    });
    // 25000 − 20000 − 1000 − 500 + 10000 + 250
    expect(cashSessionNet(s)).toBe(13750);
  });

  it("a total loss is −investment", () => {
    expect(cashSessionNet(cash({ accountId: "a", buyInMinor: 40000, cashOutMinor: 0 }))).toBe(-40000);
  });

  it("drafts without a cash-out have no result and do not count", () => {
    const s = cash({ accountId: "a", status: "draft", cashOutMinor: null, endedAt: null });
    expect(cashSessionNet(s)).toBeNull();
    expect(cashSessionCounts(s)).toBe(false);
    expect(cashSessionCounts(cash({ accountId: "a", status: "cancelled" }))).toBe(false);
  });

  it("bb/100 is only computed when hands and big blind are known", () => {
    expect(bbPer100(10000, 200, 1000)).toBeCloseTo(5);
    expect(bbPer100(10000, 200, null)).toBeNull();
    expect(bbPer100(10000, null, 1000)).toBeNull();
    expect(bbPer100(10000, 200, 0)).toBeNull();
  });
});

describe("session times", () => {
  it("handles sessions crossing midnight", () => {
    const r = resolveSessionTimes("2026-03-01", "22:30", "03:15", "America/Toronto");
    expect(r.crossesMidnight).toBe(true);
    expect(r.startedAt).toBe("2026-03-02T03:30:00.000Z");
    expect(r.endedAt).toBe("2026-03-02T08:15:00.000Z");
    expect(durationMinutes(r.startedAt, r.endedAt)).toBe(285);
    // booked on the day it started, in local time
    expect(localDate(r.startedAt, "America/Toronto")).toBe("2026-03-01");
  });

  it("handles same-day sessions and breaks", () => {
    const r = resolveSessionTimes("2026-03-01", "13:00", "17:30", "America/Toronto");
    expect(r.crossesMidnight).toBe(false);
    expect(durationMinutes(r.startedAt, r.endedAt, 30)).toBe(240);
  });

  it("handles a DST change inside a session (spring forward)", () => {
    // 2026-03-08 02:00 local clocks jump to 03:00 in Toronto
    const r = resolveSessionTimes("2026-03-07", "23:00", "04:00", "America/Toronto");
    expect(durationMinutes(r.startedAt, r.endedAt)).toBe(240);
  });

  it("returns null duration for unfinished or invalid sessions and 0 never negative", () => {
    expect(durationMinutes("2026-03-01T10:00:00Z", null)).toBeNull();
    expect(durationMinutes("2026-03-01T10:00:00Z", "2026-03-01T09:00:00Z")).toBeNull();
    expect(durationMinutes("2026-03-01T10:00:00Z", "2026-03-01T10:30:00Z", 45)).toBe(0);
  });

  it("resolves date range presets in the user's time zone", () => {
    const now = new Date("2026-10-09T02:00:00Z"); // Oct 8 22:00 in Toronto
    expect(resolveRange("today", "America/Toronto", 1, undefined, now)).toMatchObject({ from: "2026-10-08", to: "2026-10-08" });
    expect(resolveRange("month", "America/Toronto", 1, undefined, now)).toMatchObject({ from: "2026-10-01" });
    expect(resolveRange("year", "America/Toronto", 1, undefined, now)).toMatchObject({ from: "2026-01-01" });
    expect(resolveRange("week", "America/Toronto", 1, undefined, now)).toMatchObject({ from: "2026-10-05" });
    expect(resolveRange("all", "America/Toronto")).toMatchObject({ from: null, to: null });
    expect(resolveRange("custom", "UTC", 1, { from: "2026-05-10", to: "2026-05-01" })).toMatchObject({ from: "2026-05-01", to: "2026-05-10" });
    expect(weekStart("2026-10-11", 0)).toBe("2026-10-11");
  });
});

describe("tournament result", () => {
  it("investment includes every buy-in, re-entry, fee, rebuy and add-on", () => {
    const t = tournament({
      accountId: "a",
      entries: [
        entry({ entryNumber: 1, buyInMinor: 20000, feeMinor: 2000, rebuysMinor: 20000, rebuyCount: 1, addonsMinor: 10000 }),
        entry({ entryNumber: 2, buyInMinor: 20000, feeMinor: 2000 }),
      ],
      payoutMinor: 150000,
      bountiesMinor: 5000,
    });
    expect(tournamentInvestment(t)).toBe(74000);
    expect(tournamentNet(t)).toBe(150000 + 5000 - 74000);
    expect(tournamentCashed(t)).toBe(true);
  });

  it("bounties alone are not a cash", () => {
    const t = tournament({ accountId: "a", payoutMinor: 0, bountiesMinor: 5000 });
    expect(tournamentCashed(t)).toBe(false);
    expect(tournamentNet(t)).toBe(5000 - 11000);
  });

  it("cancelled tournaments net to refund − investment", () => {
    const t = tournament({ accountId: "a", status: "cancelled", refundMinor: 11000 });
    expect(tournamentNet(t)).toBe(0);
  });

  it("multi-day tournaments sum play time across days without double-counting money", () => {
    const t = tournament({
      accountId: "a",
      periods: [
        { id: "d1", status: "completed", startedAt: "2026-03-05T16:00:00Z", endedAt: "2026-03-06T02:00:00Z", breakMinutes: 60, dayLabel: "Day 1" },
        { id: "d2", status: "completed", startedAt: "2026-03-06T17:00:00Z", endedAt: "2026-03-06T23:00:00Z", breakMinutes: 0, dayLabel: "Day 2" },
      ],
      payoutMinor: 100000,
    });
    expect(tournamentMinutes(t)).toBe(540 + 360);
    expect(tournamentNet(t)).toBe(100000 - 11000);
  });
});
