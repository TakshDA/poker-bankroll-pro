/**
 * Statistics over poker results: streaks, variance, distributions, rolling
 * averages and Monte Carlo projections. Measured values (streaks, sums) are
 * exact; estimates (standard deviation, confidence intervals, simulations)
 * are floats and are always labelled as estimates in the UI.
 */
import { assertMinor, type Minor } from "./money";

export interface StreakSummary {
  longestWin: number;
  longestLoss: number;
  current: { type: "win" | "loss" | "none"; length: number };
}

/**
 * Streaks over chronologically ordered results. A break-even result (0) ends
 * both a winning and a losing streak.
 */
export function streaks(nets: Minor[]): StreakSummary {
  let longestWin = 0;
  let longestLoss = 0;
  let curType: "win" | "loss" | "none" = "none";
  let curLen = 0;
  for (const n of nets) {
    const t = n > 0 ? "win" : n < 0 ? "loss" : "none";
    if (t === "none") {
      curType = "none";
      curLen = 0;
      continue;
    }
    if (t === curType) curLen++;
    else {
      curType = t;
      curLen = 1;
    }
    if (t === "win") longestWin = Math.max(longestWin, curLen);
    else longestLoss = Math.max(longestLoss, curLen);
  }
  return { longestWin, longestLoss, current: { type: curType, length: curLen } };
}

export interface VarianceStats {
  n: number;
  meanMinor: number;
  stdDevMinor: number; // sample standard deviation per result
  /** Hour-weighted win rate and its standard deviation per hour. */
  hourlyMinor: number | null;
  stdDevPerHourMinor: number | null;
  /** 95% confidence interval for the true hourly rate (estimate). */
  hourlyCi95: [number, number] | null;
  totalHours: number;
}

/**
 * Variance analysis. Uses the standard poker method of estimating the
 * standard deviation per hour from session results weighted by duration:
 *   w   = Σr / ΣT                       (hourly rate)
 *   σ_h = sqrt( Σ T_i (r_i/T_i − w)² / (n − 1) )
 *   CI95 = w ± 1.96 σ_h / sqrt(ΣT)
 * Requires at least 2 results (and hours) or returns nulls.
 */
export function varianceStats(results: { netMinor: Minor; minutes: number }[]): VarianceStats {
  const n = results.length;
  const nets = results.map((r) => r.netMinor);
  const mean = n ? nets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(nets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const timed = results.filter((r) => r.minutes > 0);
  const totalHours = timed.reduce((a, r) => a + r.minutes / 60, 0);
  let hourly: number | null = null;
  let sdh: number | null = null;
  let ci: [number, number] | null = null;
  if (timed.length > 1 && totalHours > 0) {
    hourly = timed.reduce((a, r) => a + r.netMinor, 0) / totalHours;
    const w = hourly;
    const ss = timed.reduce((a, r) => {
      const t = r.minutes / 60;
      return a + t * (r.netMinor / t - w) ** 2;
    }, 0);
    sdh = Math.sqrt(ss / (timed.length - 1));
    const half = (1.96 * sdh) / Math.sqrt(totalHours);
    ci = [w - half, w + half];
  }
  return { n, meanMinor: mean, stdDevMinor: sd, hourlyMinor: hourly, stdDevPerHourMinor: sdh, hourlyCi95: ci, totalHours };
}

export interface HistogramBin {
  from: Minor;
  to: Minor;
  count: number;
}

/** Profit distribution histogram with "nice" bin widths. */
export function histogram(nets: Minor[], targetBins = 12): HistogramBin[] {
  if (nets.length === 0) return [];
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  if (min === max) return [{ from: min, to: max, count: nets.length }];
  const raw = (max - min) / targetBins;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const width = Math.max(1, Math.round(step));
  const start = Math.floor(min / width) * width;
  const bins: HistogramBin[] = [];
  for (let from = start; from <= max; from += width) bins.push({ from, to: from + width, count: 0 });
  for (const v of nets) {
    const idx = Math.min(bins.length - 1, Math.floor((v - start) / width));
    bins[idx].count++;
  }
  return bins;
}

/** Trailing moving average (float, display only). */
export function rollingAverage(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/** Deterministic PRNG (mulberry32) so simulations are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MonteCarloInput {
  /** Historical results to resample from (minor units, base currency). */
  sample: Minor[];
  startingBankrollMinor: Minor;
  futureSessions: number;
  paths?: number;
  /** Ruin = balance falls to or below this level at any point. */
  ruinThresholdMinor?: Minor;
  seed?: number;
}

export interface MonteCarloResult {
  steps: { session: number; p5: Minor; p25: Minor; p50: Minor; p75: Minor; p95: Minor }[];
  riskOfRuinPct: number;
  finalMedianMinor: Minor;
  probabilityOfProfitPct: number;
  paths: number;
  assumptions: string[];
}

export const MONTE_CARLO_MIN_SAMPLE = 20;

/**
 * Bootstrap Monte Carlo: each simulated future session draws one of the
 * user's own historical results at random (with replacement). Sums stay in
 * integer minor units. This is an ESTIMATE that assumes future results are
 * independent and distributed like past results at the same stakes.
 */
export function monteCarlo(input: MonteCarloInput): MonteCarloResult | null {
  const { sample, startingBankrollMinor, futureSessions } = input;
  if (sample.length < MONTE_CARLO_MIN_SAMPLE || futureSessions < 1) return null;
  sample.forEach((v) => assertMinor(v));
  const paths = Math.min(Math.max(input.paths ?? 2000, 100), 10000);
  const ruin = input.ruinThresholdMinor ?? 0;
  const rand = mulberry32(input.seed ?? 42);
  const sessions = Math.min(futureSessions, 1000);
  const checkpoints = Math.min(sessions, 50);
  const every = sessions / checkpoints;
  const marks = Array.from({ length: checkpoints }, (_, i) => Math.round((i + 1) * every));
  const atMark: Minor[][] = marks.map(() => []);
  let ruined = 0;
  let profitable = 0;
  for (let p = 0; p < paths; p++) {
    let bal = startingBankrollMinor;
    let hitRuin = bal <= ruin;
    let mi = 0;
    for (let s = 1; s <= sessions; s++) {
      bal += sample[Math.floor(rand() * sample.length)];
      if (bal <= ruin) hitRuin = true;
      if (marks[mi] === s) {
        atMark[mi].push(bal);
        mi++;
      }
    }
    if (hitRuin) ruined++;
    if (bal > startingBankrollMinor) profitable++;
  }
  const pct = (arr: Minor[], q: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  };
  const steps = marks.map((m, i) => ({
    session: m,
    p5: pct(atMark[i], 0.05),
    p25: pct(atMark[i], 0.25),
    p50: pct(atMark[i], 0.5),
    p75: pct(atMark[i], 0.75),
    p95: pct(atMark[i], 0.95),
  }));
  return {
    steps,
    riskOfRuinPct: (ruined / paths) * 100,
    finalMedianMinor: steps[steps.length - 1].p50,
    probabilityOfProfitPct: (profitable / paths) * 100,
    paths,
    assumptions: [
      `Resamples your ${sample.length} recorded results with replacement`,
      "Assumes future sessions are independent and resemble past sessions",
      "Assumes the same stakes, game mix and skill level as your history",
      "Ignores deposits, withdrawals and expenses",
    ],
  };
}
