import { describe, expect, it } from "vitest";
import { dueReminders, type PlanLike } from "./reminders";

const plan = (over: Partial<PlanLike> = {}): PlanLike => ({ id: "p", plannedDate: "2026-10-09", startTime: "19:00:00", reminderMinutesBefore: 60, status: "planned", title: "Friday 2/5", kind: "cash", ...over });
const tz = "America/Toronto"; // 19:00 EDT = 23:00 UTC

describe("dueReminders", () => {
  it("is due inside the reminder window in the user's time zone", () => {
    expect(dueReminders([plan()], tz, new Date("2026-10-09T21:59:00Z"))).toHaveLength(0);
    const due = dueReminders([plan()], tz, new Date("2026-10-09T22:15:00Z"));
    expect(due).toHaveLength(1);
    expect(due[0].minutesUntil).toBe(45);
    expect(dueReminders([plan()], tz, new Date("2026-10-10T00:30:00Z"))[0].minutesUntil).toBe(-90);
    expect(dueReminders([plan()], tz, new Date("2026-10-10T01:01:00Z"))).toHaveLength(0);
  });

  it("ignores plans without a time or reminder, and finished plans", () => {
    const now = new Date("2026-10-09T22:30:00Z");
    expect(dueReminders([plan({ startTime: null }), plan({ reminderMinutesBefore: null }), plan({ status: "done" }), plan({ status: "skipped" })], tz, now)).toHaveLength(0);
  });
});
