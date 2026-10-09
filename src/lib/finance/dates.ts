/**
 * Time-zone aware date helpers. Results are bucketed by the calendar date in
 * the user's configured time zone (a session that starts at 23:00 and ends at
 * 03:00 belongs to the day it started).
 */
import { TZDate } from "@date-fns/tz";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** ISO instant -> "YYYY-MM-DD" in the given time zone. */
export function localDate(iso: string | Date, timeZone: string): string {
  let f = dateFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, f);
  }
  return f.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** ISO instant -> "HH:mm" in the given time zone. */
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function parseYmd(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseHm(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Invalid time "${time}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time "${time}"`);
  return [h, min];
}

/** Local wall-clock date + time in a time zone -> UTC ISO string. */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = parseYmd(date);
  const [h, mi] = parseHm(time);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, timeZone).getTime()).toISOString();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseYmd(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve a session's start/end instants from the form fields. If the end
 * time is not after the start time on the same date, the session is taken to
 * cross midnight and ends on the following day.
 */
export function resolveSessionTimes(
  date: string,
  startTime: string,
  endTime: string | null | undefined,
  timeZone: string,
): { startedAt: string; endedAt: string | null; crossesMidnight: boolean } {
  const startedAt = zonedToUtc(date, startTime, timeZone);
  if (!endTime) return { startedAt, endedAt: null, crossesMidnight: false };
  let endedAt = zonedToUtc(date, endTime, timeZone);
  let crossesMidnight = false;
  if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    endedAt = zonedToUtc(addDays(date, 1), endTime, timeZone);
    crossesMidnight = true;
  }
  return { startedAt, endedAt, crossesMidnight };
}

/** Played minutes = (end - start) - breaks. Null when not finished/invalid. */
export function durationMinutes(startedAt: string, endedAt: string | null, breakMinutes = 0): number | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!(ms > 0)) return null;
  const minutes = Math.floor(ms / 60000) - Math.max(0, breakMinutes);
  return minutes > 0 ? minutes : 0;
}

export function todayIn(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Monday-or-Sunday based week start for a YYYY-MM-DD date. */
export function weekStart(date: string, weekStartsOn = 1): string {
  const [y, m, d] = parseYmd(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export type RangePreset = "today" | "week" | "month" | "year" | "all" | "custom";

export interface DateRange {
  preset: RangePreset;
  from: string | null; // inclusive YYYY-MM-DD, null = unbounded
  to: string | null; // inclusive
}

export function resolveRange(
  preset: RangePreset,
  timeZone: string,
  weekStartsOn = 1,
  custom?: { from?: string | null; to?: string | null },
  now = new Date(),
): DateRange {
  const today = todayIn(timeZone, now);
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week":
      return { preset, from: weekStart(today, weekStartsOn), to: today };
    case "month":
      return { preset, from: `${today.slice(0, 7)}-01`, to: today };
    case "year":
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      const from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : null;
      const to = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : null;
      if (from && to && from > to) return { preset, from: to, to: from };
      return { preset, from, to };
    }
    default:
      return { preset: "all", from: null, to: null };
  }
}

export function inRange(date: string, range: Pick<DateRange, "from" | "to">): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}
