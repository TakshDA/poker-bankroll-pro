/** Display helpers safe for both server and client components. */
import { minorUnits } from "./finance/currency";
import { formatMoney, minorToDecimal, type Minor } from "./finance/money";

export function money(amount: Minor | null | undefined, currency: string, opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (amount === null || amount === undefined) return "—";
  return formatMoney(amount, currency, minorUnits(currency), opts);
}

/** Value for a money <input> (plain decimal, empty for null). */
export function moneyInput(amount: Minor | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "";
  return minorToDecimal(amount, minorUnits(currency));
}

export function pct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = value.toFixed(digits);
  return `${signed && value > 0 ? "+" : ""}${s}%`;
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function hours(minutes: number): string {
  return `${(minutes / 60).toLocaleString("en-CA", { maximumFractionDigits: 1 })}h`;
}

export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function toneOf(amount: number | null | undefined): "positive" | "negative" | "neutral" {
  if (!amount) return "neutral";
  return amount > 0 ? "positive" : "negative";
}

export const SETTING_LABELS: Record<string, string> = {
  live_casino: "Live casino",
  online: "Online",
  private_game: "Private game",
  home_game: "Home game",
};
export const TABLE_FORMAT_LABELS: Record<string, string> = {
  heads_up: "Heads-up",
  short_handed: "Short-handed",
  six_max: "6-max",
  full_ring: "Full ring",
  other: "Other",
};
export const TOURNAMENT_FORMAT_LABELS: Record<string, string> = {
  mtt: "MTT",
  sit_and_go: "Sit & Go",
  satellite: "Satellite",
  spin: "Spin / Jackpot",
  other: "Other",
};
export const SPEED_LABELS: Record<string, string> = { regular: "Regular", turbo: "Turbo", hyper: "Hyper", deep: "Deep stack", other: "Other" };
export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  completed: "Completed",
  cancelled: "Cancelled",
  in_progress: "In progress",
};
export const TRANSACTION_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  bonus: "Bonus",
  rakeback: "Rakeback",
  adjustment: "Adjustment",
};
export const BETTING_LABELS: Record<string, string> = {
  no_limit: "No-limit",
  pot_limit: "Pot-limit",
  fixed_limit: "Fixed-limit",
  spread_limit: "Spread-limit",
  mixed: "Mixed",
  other: "Other",
};
