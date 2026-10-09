import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DrawdownChart, FanChart, HistogramChart, ResultsWithAverage } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";
import { Stat } from "@/components/stat";
import { minorUnits } from "@/lib/finance/currency";
import { inRange, monthKey, todayIn } from "@/lib/finance/dates";
import { combinedBalance, drawdown } from "@/lib/finance/ledger";
import { parseMoney, percent, sumMinor } from "@/lib/finance/money";
import { histogram, MONTE_CARLO_MIN_SAMPLE, monteCarlo, rollingAverage, streaks, varianceStats } from "@/lib/finance/stats";
import { duration, money, monthLabel, pct } from "@/lib/format";
import { rangeFromParams } from "@/lib/server/range";
import { sp } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";

export const metadata = { title: "Analytics" };

const HORIZONS = [50, 100, 250, 500, 1000];
const ROLLING = 10;

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const range = rangeFromParams(params, ws.settings);
  const base = ws.settings.baseCurrency;
  const digits = minorUnits(base);
  const kind = params.kind === "cash" || params.kind === "tournament" ? params.kind : "all";

  const results = ctx.allResults
    .filter((r) => r.countsInStats && inRange(r.date, range) && (kind === "all" || r.kind === kind))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const nets = results.map((r) => r.netMinor);

  if (results.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" actions={<RangePicker current={range} />} />
        <KindTabs kind={kind} params={params} />
        <EmptyState icon={<BarChart3 />} title="No completed results in this period" description="Analytics appear once you have completed sessions or tournaments." />
      </>
    );
  }

  // ---- Measured ---------------------------------------------------------
  const v = varianceStats(results.map((r) => ({ netMinor: r.netMinor, minutes: r.minutes })));
  const st = streaks(nets);
  const total = sumMinor(nets);
  const wins = nets.filter((n) => n > 0).length;
  const avg = rollingAverage(nets, ROLLING);
  const rolling = results.map((r, i) => ({ i: i + 1, date: r.date, net: r.netMinor, avg: avg[i] === null ? null : Math.round(avg[i]!) }));
  const series: { date: string; value: number }[] = [];
  for (const r of results) series.push({ date: r.date, value: (series.at(-1)?.value ?? 0) + r.netMinor });
  const dd = drawdown(series);
  const ddSeries: { date: string; drawdown: number; peak: number }[] = [];
  for (const p of series) {
    const peak = Math.max(ddSeries.at(-1)?.peak ?? 0, p.value);
    ddSeries.push({ date: p.date, drawdown: p.value - peak, peak });
  }
  const months = new Map<string, number[]>();
  for (const r of results) months.set(monthKey(r.date), [...(months.get(monthKey(r.date)) ?? []), r.netMinor]);
  const monthRows = [...months].map(([m, xs]) => ({ month: m, count: xs.length, net: sumMinor(xs), wins: xs.filter((x) => x > 0).length })).reverse();

  // ---- Estimates --------------------------------------------------------
  const horizon = HORIZONS.includes(Number(params.horizon)) ? Number(params.horizon) : 100;
  const bankroll = combinedBalance(ctx.ds, todayIn(ws.settings.timezone), ctx.ledger, ctx.rates).amountMinor;
  let ruinMinor = 0;
  let ruinError: string | null = null;
  if (params.ruin) {
    try {
      ruinMinor = parseMoney(params.ruin, digits);
    } catch {
      ruinError = "Enter a valid amount for the ruin level";
    }
  }
  const startMinor = params.start ? safeParse(params.start, digits) ?? bankroll : bankroll;
  const mc = monteCarlo({ sample: nets, startingBankrollMinor: startMinor, futureSessions: horizon, ruinThresholdMinor: ruinMinor, paths: 2000, seed: 7 });
  // Hours needed for the 95% CI to exclude zero at the current rate (estimate).
  const hoursForConfidence = v.hourlyMinor && v.stdDevPerHourMinor && v.hourlyMinor !== 0 ? Math.ceil((1.96 * v.stdDevPerHourMinor / Math.abs(v.hourlyMinor)) ** 2) : null;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${results.length} completed ${kind === "all" ? "results" : kind === "cash" ? "cash sessions" : "tournaments"} in ${base}. Measured values come straight from your records; estimates are clearly labelled.`}
        actions={<RangePicker current={range} />}
      />
      <KindTabs kind={kind} params={params} />
      {ctx.missingCurrencies.length ? (
        <Alert tone="warning" className="mb-4">
          Results in {ctx.missingCurrencies.join(", ")} have no exchange rate into {base} and are left out.
        </Alert>
      ) : null}

      <SectionTitle badge="Measured" tone="positive">
        From your recorded results
      </SectionTitle>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net result" value={money(total, base, { signed: true })} tone={total > 0 ? "positive" : total < 0 ? "negative" : "neutral"} sub={`${wins} of ${results.length} winning (${pct(percent(wins, results.length), 0)})`} />
        <Stat label="Average result" value={money(Math.round(v.meanMinor), base, { signed: true })} sub={`Std dev ${money(Math.round(v.stdDevMinor), base)} per result`} info="Sample standard deviation of individual results: how much one session or tournament typically swings." />
        <Stat label="Hourly" value={v.hourlyMinor !== null ? money(Math.round(v.hourlyMinor), base, { signed: true }) : "—"} sub={`${v.totalHours.toFixed(1)}h with recorded time`} info="Total result ÷ total hours, over results with recorded playing time." />
        <Stat label="Std dev / hour" value={v.stdDevPerHourMinor !== null ? money(Math.round(v.stdDevPerHourMinor), base) : "—"} info="Hour-weighted standard deviation of your hourly results. Larger means bigger swings." />
        <Stat label="Longest win streak" value={String(st.longestWin)} tone="positive" sub={st.current.type !== "none" ? `Current: ${st.current.length} ${st.current.type === "win" ? "winning" : "losing"}` : undefined} />
        <Stat label="Longest losing streak" value={String(st.longestLoss)} tone="negative" />
        <Stat label="Max drawdown" value={money(-dd.maxDrawdownMinor, base)} tone="negative" sub={dd.maxDrawdownFrom && dd.maxDrawdownTo ? `${dd.maxDrawdownFrom} → ${dd.maxDrawdownTo}` : undefined} info="Largest drop in cumulative results from a previous peak, in this period." />
        <Stat label="Current drawdown" value={money(-dd.currentDrawdownMinor, base)} tone={dd.currentDrawdownMinor ? "negative" : "neutral"} sub={`Peak ${money(dd.peakMinor, base, { signed: true })}`} />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Results with {ROLLING}-result average</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsWithAverage data={rolling} currency={base} window={ROLLING} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribution of results</CardTitle>
          </CardHeader>
          <CardContent>
            <HistogramChart data={histogram(nets)} currency={base} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Drawdown from peak</CardTitle>
          </CardHeader>
          <CardContent>
            <DrawdownChart data={ddSeries} currency={base} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By month</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto px-0 pb-2">
            <Table>
              <THead>
                <tr>
                  <TH className="pl-5">Month</TH>
                  <TH className="text-right">Results</TH>
                  <TH className="text-right">Win %</TH>
                  <TH className="pr-5 text-right">Net</TH>
                </tr>
              </THead>
              <TBody>
                {monthRows.map((m) => (
                  <TR key={m.month}>
                    <TD className="pl-5">{monthLabel(m.month)}</TD>
                    <TD className="num text-right text-fg-muted">{m.count}</TD>
                    <TD className="num text-right text-fg-muted">{pct(percent(m.wins, m.count), 0)}</TD>
                    <TD className={`num pr-5 text-right font-medium ${m.net > 0 ? "text-positive" : m.net < 0 ? "text-negative" : ""}`}>{money(m.net, base, { signed: true })}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <SectionTitle badge="Estimate" tone="warning">
        Statistical projections. These are not predictions or guarantees.
      </SectionTitle>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          className="col-span-2"
          label="Likely true hourly (95% range)"
          value={v.hourlyCi95 ? `${money(Math.round(v.hourlyCi95[0]), base, { signed: true })} to ${money(Math.round(v.hourlyCi95[1]), base, { signed: true })}` : "—"}
          info="Hourly ± 1.96 × (std dev per hour ÷ √hours). Assumes results are independent. A wide range means your sample is still small."
          sub={v.hourlyCi95 ? (v.hourlyCi95[0] > 0 ? "The range is above zero: a winning record so far." : v.hourlyCi95[1] < 0 ? "The range is below zero." : "The range includes zero: too early to tell if you are a winning player here.") : "Needs at least 2 results with time recorded"}
        />
        <Stat
          className="col-span-2"
          label="Hours for a confident win rate"
          value={hoursForConfidence !== null ? `≈ ${hoursForConfidence.toLocaleString()}h` : "—"}
          sub={hoursForConfidence !== null ? `You have ${v.totalHours.toFixed(0)}h. At the current rate and swings, this many hours puts the 95% range clear of zero.` : undefined}
          info="(1.96 × std dev per hour ÷ hourly)². Changes as your results change."
        />
      </section>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Monte Carlo bankroll simulation</CardTitle>
            <p className="mt-1 text-xs text-fg-muted">Replays your own results in random order thousands of times to show a range of possible futures.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            {Object.entries(params)
              .filter(([k]) => !["horizon", "ruin", "start"].includes(k))
              .map(([k, val]) => (
                <input key={k} type="hidden" name={k} value={val} />
              ))}
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Future results
              <Select name="horizon" defaultValue={String(horizon)}>
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Starting bankroll ({base})
              <Input name="start" inputMode="decimal" defaultValue={params.start ?? (bankroll / 10 ** digits).toFixed(digits)} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Ruin level ({base})
              <Input name="ruin" inputMode="decimal" defaultValue={params.ruin ?? "0"} aria-invalid={!!ruinError} />
            </label>
            <Button type="submit" variant="secondary">
              Run simulation
            </Button>
          </form>
          {ruinError ? <p className="mb-3 text-sm text-negative">{ruinError}</p> : null}
          {mc ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Mini label="Median ending bankroll" value={money(mc.finalMedianMinor, base)} />
                <Mini label="Chance of finishing up" value={pct(mc.probabilityOfProfitPct, 0)} />
                <Mini label="Chance of hitting ruin level" value={pct(mc.riskOfRuinPct, 1)} tone={mc.riskOfRuinPct >= 5 ? "negative" : undefined} />
                <Mini label="5th–95th percentile" value={`${money(mc.steps.at(-1)!.p5, base, { compact: true })} – ${money(mc.steps.at(-1)!.p95, base, { compact: true })}`} />
              </div>
              <FanChart data={[{ session: 0, p5: startMinor, p25: startMinor, p50: startMinor, p75: startMinor, p95: startMinor }, ...mc.steps]} currency={base} />
              <details className="mt-3 text-xs text-fg-muted">
                <summary className="cursor-pointer">Assumptions ({mc.paths.toLocaleString()} simulated paths)</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {mc.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                  <li>Starting bankroll {money(startMinor, base)}; ruin means the balance touches {money(ruinMinor, base)} at any point.</li>
                </ul>
              </details>
            </>
          ) : (
            <p className="text-sm text-fg-subtle">
              Needs at least {MONTE_CARLO_MIN_SAMPLE} completed results in this filter (you have {results.length}). Fewer results would make the simulation misleading.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-fg-subtle">
        Tracked time: {duration(Math.round(v.totalHours * 60))}. Drafts, in-progress and cancelled events are excluded from these statistics. See the <Link href="/ledger" className="underline">ledger</Link> for every balance movement.
      </p>
    </>
  );
}

function safeParse(v: string, digits: number): number | null {
  try {
    return parseMoney(v, digits);
  } catch {
    return null;
  }
}

function SectionTitle({ badge, tone, children }: { badge: string; tone: "positive" | "warning"; children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-center gap-2 first:mt-0">
      <Badge tone={tone}>{badge}</Badge>
      <p className="text-sm text-fg-muted">{children}</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "negative" }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`num mt-1 text-lg font-semibold ${tone === "negative" ? "text-negative" : ""}`}>{value}</p>
    </div>
  );
}

function KindTabs({ kind, params }: { kind: string; params: Record<string, string> }) {
  const href = (k: string) => {
    const q = new URLSearchParams(params);
    if (k === "all") q.delete("kind");
    else q.set("kind", k);
    return `/analytics${q.size ? `?${q}` : ""}`;
  };
  return (
    <nav aria-label="Result type" className="mb-5 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">
      {[
        ["all", "All results"],
        ["cash", "Cash"],
        ["tournament", "Tournaments"],
      ].map(([k, label]) => (
        <Link key={k} href={href(k)} aria-current={kind === k ? "page" : undefined} className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-xs font-medium ${kind === k ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
