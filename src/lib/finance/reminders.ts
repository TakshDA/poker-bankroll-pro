/**
 * In-app reminders for planned sessions. A reminder is due from
 * (start − reminderMinutesBefore) until two hours after the planned start,
 * while the plan is still "planned". No push/e-mail is sent.
 */
import { zonedToUtc } from "./dates";

export interface PlanLike {
  id: string;
  plannedDate: string;
  startTime: string | null;
  reminderMinutesBefore: number | null;
  status: string;
  title: string | null;
  kind: string;
}

export interface DueReminder {
  id: string;
  date: string;
  title: string;
  startsAt: string;
  minutesUntil: number;
}

export const REMINDER_GRACE_MINUTES = 120;

export function dueReminders(plans: PlanLike[], timeZone: string, now = new Date()): DueReminder[] {
  const out: DueReminder[] = [];
  for (const p of plans) {
    if (p.status !== "planned" || !p.startTime || p.reminderMinutesBefore === null) continue;
    const startsAt = zonedToUtc(p.plannedDate, p.startTime.slice(0, 5), timeZone);
    const minutesUntil = Math.round((Date.parse(startsAt) - now.getTime()) / 60000);
    if (minutesUntil <= p.reminderMinutesBefore && minutesUntil >= -REMINDER_GRACE_MINUTES) {
      out.push({ id: p.id, date: p.plannedDate, title: p.title ?? (p.kind === "cash" ? "Cash game" : "Tournament"), startsAt, minutesUntil });
    }
  }
  return out.sort((a, b) => a.minutesUntil - b.minutesUntil);
}
