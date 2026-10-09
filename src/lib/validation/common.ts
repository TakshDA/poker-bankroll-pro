import { z } from "zod";
import { minorUnits } from "../finance/currency";
import { MoneyError, parseMoney, type Minor } from "../finance/money";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  id?: string;
  /** Monotonic token so forms can react to each submission. */
  ts?: number;
}

export const initialActionState: ActionState = { ok: false };

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `Must be at most ${max} characters`).optional());
export const requiredText = (max: number, label = "This field") =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `Must be at most ${max} characters`);

export const uuid = z.uuid("Invalid selection");
export const optionalUuid = z.preprocess(emptyToUndefined, z.uuid("Invalid selection").optional());

export const dateString = z
  .string({ error: "Date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
export const optionalDate = z.preprocess(emptyToUndefined, dateString.optional());
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
export const optionalTime = z.preprocess(emptyToUndefined, timeString.optional());

/** Money as typed by the user; converted to minor units once the currency is known. */
export const moneyString = z
  .string()
  .trim()
  .max(24)
  .regex(/^[+-]?[$€£¥]?\s?[\d,]*(\.\d*)?$/, "Enter a valid amount");
export const optionalMoney = z.preprocess(emptyToUndefined, moneyString.optional());

export const optionalInt = (min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: "Enter a whole number" }).int("Enter a whole number").min(min, `Must be at least ${min}`).max(max, `Must be at most ${max}`).optional(),
  );

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export class FieldError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

/** Convert a validated money string to minor units in a currency. */
export function toMinor(
  value: string | undefined,
  currency: string,
  field: string,
  opts: { allowNegative?: boolean; required?: boolean; defaultValue?: Minor } = {},
): Minor {
  if (value === undefined || value === "") {
    if (opts.required) throw new FieldError(field, "Amount is required");
    return opts.defaultValue ?? 0;
  }
  try {
    const n = parseMoney(value, minorUnits(currency));
    if (!opts.allowNegative && n < 0) throw new FieldError(field, "Amount cannot be negative");
    return n;
  } catch (e) {
    if (e instanceof FieldError) throw e;
    throw new FieldError(field, e instanceof MoneyError ? e.message : "Invalid amount");
  }
}

export function toMinorOrNull(value: string | undefined, currency: string, field: string): Minor | null {
  if (value === undefined || value === "") return null;
  return toMinor(value, currency, field);
}

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      const arr = (out[key] as string[] | undefined) ?? [];
      arr.push(v);
      out[key] = arr;
    } else out[k] = v;
  }
  return out;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Parse comma-separated tag names into a clean unique list. */
export function parseTagList(input: string | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 20);
}
