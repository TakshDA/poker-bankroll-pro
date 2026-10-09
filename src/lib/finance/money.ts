/**
 * Money primitives. All money in the application is an integer number of
 * minor units (e.g. cents) of a known currency. Arithmetic on balances only
 * ever adds or subtracts integers, and every operation asserts the values are
 * safe integers so silent floating-point drift is impossible. Division and
 * currency conversion go through BigInt with explicit, documented rounding
 * (round half away from zero).
 */

export type Minor = number;

export class MoneyError extends Error {}

export function assertMinor(value: number, label = "amount"): asserts value is Minor {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of minor units (got ${value})`);
  }
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) {
    assertMinor(v);
    total += v;
  }
  assertMinor(total, "sum");
  return total;
}

export function addMinor(...values: Minor[]): Minor {
  return sumMinor(values);
}

/** a - b with overflow protection. */
export function subMinor(a: Minor, b: Minor): Minor {
  assertMinor(a);
  assertMinor(b);
  const r = a - b;
  assertMinor(r, "difference");
  return r;
}

/** Integer division of bigints rounding half away from zero. */
export function divRoundBig(n: bigint, d: bigint): bigint {
  if (d === BigInt(0)) throw new MoneyError("Division by zero");
  const negative = n < BigInt(0) !== d < BigInt(0);
  const an = n < BigInt(0) ? -n : n;
  const ad = d < BigInt(0) ? -d : d;
  let q = an / ad;
  const r = an % ad;
  if (r * BigInt(2) >= ad) q += BigInt(1);
  return negative ? -q : q;
}

/** Round(numerator / denominator) for minor units, half away from zero. */
export function divRoundMinor(numerator: Minor, denominator: number): Minor {
  assertMinor(numerator);
  if (!Number.isSafeInteger(denominator) || denominator === 0) {
    throw new MoneyError("Denominator must be a non-zero integer");
  }
  const r = Number(divRoundBig(BigInt(numerator), BigInt(denominator)));
  assertMinor(r);
  return r;
}

/** Average of minor amounts (rounded half away from zero), null when empty. */
export function averageMinor(values: Minor[]): Minor | null {
  if (values.length === 0) return null;
  return divRoundMinor(sumMinor(values), values.length);
}

/** Minor units earned per hour given total minutes. Null when minutes <= 0. */
export function perHourMinor(amount: Minor, minutes: number): Minor | null {
  if (!(minutes > 0)) return null;
  assertMinor(amount);
  return Number(divRoundBig(BigInt(amount) * BigInt(60), BigInt(Math.round(minutes))));
}

/**
 * Percentage as a plain number for display (e.g. ROI 12.34). This is a ratio,
 * not a balance, so a float result is appropriate. Null when undefined.
 */
export function percent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

const DECIMAL_RE = /^(\d+)(?:\.(\d*))?$/;

/**
 * Parse user input like "1,234.50", "$12", "-3.5" into minor units without
 * using floating point. Rejects more fractional digits than the currency has.
 */
export function parseMoney(input: string, minorDigits = 2): Minor {
  let s = String(input).trim().replace(/[,\s_]/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/^[A-Za-z$€£¥₹₱₩]+/, "");
  if (s.startsWith("-") && !negative) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith(".")) s = `0${s}`;
  const m = DECIMAL_RE.exec(s);
  if (!m) throw new MoneyError(`"${input}" is not a valid amount`);
  const [, whole, frac = ""] = m;
  if (frac.length > minorDigits) {
    throw new MoneyError(`"${input}" has more than ${minorDigits} decimal places`);
  }
  const big = BigInt(whole + frac.padEnd(minorDigits, "0"));
  const n = Number(negative ? -big : big);
  assertMinor(n);
  return n === 0 ? 0 : n;
}

/** Minor units -> plain decimal string ("-1234.50"), no grouping or symbol. */
export function minorToDecimal(amount: Minor, minorDigits = 2): string {
  assertMinor(amount);
  const negative = amount < 0;
  const s = Math.abs(amount).toString().padStart(minorDigits + 1, "0");
  const whole = minorDigits ? s.slice(0, -minorDigits) : s;
  const frac = minorDigits ? s.slice(-minorDigits) : "";
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export interface FormatOptions {
  /** Prefix positive values with "+" (useful for results). */
  signed?: boolean;
  /** Compact notation for chart axes ("$1.2K"). */
  compact?: boolean;
  locale?: string;
}

/**
 * Format for display. Uses Intl on the decimal string, which is exact for any
 * value up to 2^53 minor units.
 */
export function formatMoney(amount: Minor, currency: string, minorDigits = 2, opts: FormatOptions = {}): string {
  assertMinor(amount);
  const { signed = false, compact = false, locale = "en-CA" } = opts;
  const decimal = minorToDecimal(amount, minorDigits);
  // Compact: whole units below 1,000 ("$67"), one decimal above ("$1.2K").
  const compactDigits = Math.abs(amount) < 1000 * 10 ** minorDigits ? 0 : 1;
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    // "symbol" in en-CA keeps currencies distinct: $ (CAD), US$, A$, €…
    currencyDisplay: "symbol",
    minimumFractionDigits: compact ? 0 : minorDigits,
    maximumFractionDigits: compact ? compactDigits : minorDigits,
    notation: compact ? "compact" : "standard",
    signDisplay: signed ? "exceptZero" : "auto",
  });
  // Intl accepts numeric strings exactly (ES2023 "Intl.NumberFormat v3").
  return fmt.format(decimal as unknown as number);
}
