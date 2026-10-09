/**
 * Currency conversion.
 *
 * Original amounts are always preserved on their records. Conversion happens
 * only when aggregating across currencies, using user-entered dated rates:
 *
 *   1 BASE = rate QUOTE, effective from effective_date.
 *
 * Rate selection for converting an amount dated D from currency A to B:
 *   1. Same currency: no conversion.
 *   2. Use the A->B or B->A (inverted) rate with the latest effective date
 *      on or before D.
 *   3. If no rate exists on or before D, use the earliest rate after D and
 *      flag the conversion as `fallback`.
 *   4. If the pair has no rate at all the amount cannot be converted; callers
 *      exclude it from the aggregate and report the missing pair.
 *
 * Arithmetic: rates are parsed from their decimal string into an exact
 * rational (numerator/denominator BigInt). converted = amount * num/den,
 * adjusted for minor-unit digits, rounded half away from zero.
 */
import { minorUnits } from "./currency";
import { assertMinor, divRoundBig, type Minor } from "./money";

export interface ExchangeRate {
  baseCurrency: string;
  quoteCurrency: string;
  /** Decimal string exactly as stored, e.g. "1.3650000000". */
  rate: string;
  effectiveDate: string; // YYYY-MM-DD
}

interface Rational {
  num: bigint;
  den: bigint;
}

export function parseRate(rate: string): Rational {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!m) throw new Error(`Invalid exchange rate "${rate}"`);
  const frac = m[2] ?? "";
  const num = BigInt(m[1] + frac);
  if (num === BigInt(0)) throw new Error("Exchange rate must be greater than zero");
  return { num, den: BigInt(10) ** BigInt(frac.length) };
}

export type ConversionQuality = "exact" | "converted" | "fallback";

export interface Conversion {
  amount: Minor;
  quality: ConversionQuality;
}

interface PairRate {
  date: string;
  r: Rational; // multiply amount in `from` by r to get `to`
}

export class RateTable {
  private pairs = new Map<string, PairRate[]>();

  constructor(rates: ExchangeRate[]) {
    for (const rate of rates) {
      const r = parseRate(rate.rate);
      this.push(rate.baseCurrency, rate.quoteCurrency, { date: rate.effectiveDate, r });
      this.push(rate.quoteCurrency, rate.baseCurrency, { date: rate.effectiveDate, r: { num: r.den, den: r.num } });
    }
    for (const list of this.pairs.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  }

  private push(from: string, to: string, pr: PairRate) {
    const key = `${from}>${to}`;
    const list = this.pairs.get(key) ?? [];
    // A direct rate entered for the same date wins over an inverted one.
    if (!list.some((x) => x.date === pr.date)) list.push(pr);
    this.pairs.set(key, list);
  }

  hasPair(from: string, to: string): boolean {
    return from === to || this.pairs.has(`${from}>${to}`);
  }

  private pick(from: string, to: string, date: string): { r: Rational; fallback: boolean } | null {
    const list = this.pairs.get(`${from}>${to}`);
    if (!list || list.length === 0) return null;
    let chosen: PairRate | null = null;
    for (const pr of list) {
      if (pr.date <= date) chosen = pr;
      else break;
    }
    if (chosen) return { r: chosen.r, fallback: false };
    return { r: list[0].r, fallback: true };
  }

  /** Convert or return null when no rate exists for the pair. */
  convert(amount: Minor, from: string, to: string, date: string): Conversion | null {
    assertMinor(amount);
    if (from === to) return { amount, quality: "exact" };
    const picked = this.pick(from, to, date);
    if (!picked) return null;
    return { amount: convertWithRational(amount, picked.r, minorUnits(from), minorUnits(to)), quality: picked.fallback ? "fallback" : "converted" };
  }
}

function convertWithRational(amount: Minor, r: Rational, fromDigits: number, toDigits: number): Minor {
  const ten = BigInt(10);
  const num = BigInt(amount) * r.num * ten ** BigInt(toDigits);
  const den = r.den * ten ** BigInt(fromDigits);
  const out = Number(divRoundBig(num, den));
  assertMinor(out, "converted amount");
  return out;
}

/** Convert with an explicit rate string (1 from = rate to). */
export function convertMinor(amount: Minor, rate: string, from: string, to: string): Minor {
  if (from === to) return amount;
  return convertWithRational(amount, parseRate(rate), minorUnits(from), minorUnits(to));
}
