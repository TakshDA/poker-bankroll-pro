import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { BalanceChart, CumulativeChart, SignedBars } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";
import { Stat } from "@/components/stat";
import { computeDashboard } from "@/lib/finance/metrics";
import { dateLabel, duration, hours, money, pct, SETTING_LABELS, toneOf } from "@/lib/format";
import { getAlerts } from "@/lib/server/alerts";
import { rangeFromParams } from "@/lib/server/range";
import { sp } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";
import { buildSessionRows } from "@/lib/views/session-rows";

export const metadata = { title: "Dashboard" };

const shortDate = (d: string) => dateLabel(d, { month: "short", day: "numeric" });

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const params = sp(await searchParams);
  const [{ ws, ctx }, alerts] = await Promise.all([getFinance(), getAlerts()]);
  const range = rangeFromParams(params, ws.settings);
  const m = computeDashboard(ctx, range);
  const cur = m.baseCurrency;
  const fmt = (v: number | null | undefined, signed = false) => money(v, cur, { signed });

  if (ws.dataset.accounts.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome${ws.settings.displayName ? `, ${ws.settings.displayName}` : ""}`} description="Set up your bankroll to start tracking." />
        <EmptyState
          icon={<Wallet />}
          title="Create your first bankroll account"
          description="Accounts hold your poker money (e.g. “Live CAD”, “Online USD”). Sessions, deposits and expenses are booked to an account."
          action={
            <Button asChild>
              <Link href="/bankroll?new=account">Create account</Link>
            </Button>
          }
        />
      </>
    );
  }

  const today = m.today;
  const upcoming = ws.planned.filter((p) => p.status === "planned" && p.plannedDate >= today).slice(0, 5);
  const recent = buildSessionRows(ws).slice(0, 8);
  const rangeLabel =
    range.preset === "all" ? "All time" : range.from === range.to ? dateLabel(range.from!) : `${range.from ? dateLabel(range.from) : "Start"} – ${range.to ? dateLabel(range.to) : "Today"}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${rangeLabel} · amounts in ${cur}`}
        actions={<RangePicker current={range} />}
      />

      {alerts.filter((a) => a.severity !== "info").length > 0 ? (
        <div className="mb-5 space-y-2">
          {alerts
            .filter((a) => a.severity !== "info")
            .slice(0, 3)
            .map((a) => (
              <Alert key={a.id} tone={a.severity === "critical" ? "negative" : "warning"} title={a.title}>
                {a.message}{" "}
                {a.href ? (
                  <Link href={a.href} className="underline">
                    Review
                  </Link>
                ) : null}
              </Alert>
            ))}
        </div>
      ) : null}
      {m.missingCurrencies.length ? (
        <Alert tone="info" className="mb-5" title="Some records are not included in totals">
          No exchange rate to {cur} for {m.missingCurrencies.join(", ")}. <Link className="underline" href="/settings/currencies">Add a rate</Link> to include them.
        </Alert>
      ) : null}

      <section aria-label="Headline metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          large
          className="col-span-2 lg:col-span-1"
          label="Current bankroll"
          value={fmt(m.currentBankroll.amountMinor)}
          tone="gold"
          sub={`${m.accounts.filter((a) => !a.account.archived).length} account(s)${m.currentBankroll.usedFallbackRate ? " · some rates estimated" : ""}`}
          info="Opening balances + deposits − withdrawals + poker results + bonuses/rakeback − expenses ± adjustments, across all accounts (converted to your base currency). Transfers net to zero. Not affected by the date filter."
        />
        <Stat
          large
          className="col-span-2 lg:col-span-1"
          label="Net poker profit"
          value={fmt(m.netPokerProfitMinor, true)}
          tone={toneOf(m.netPokerProfitMinor)}
          sub="After expenses · excludes deposits & withdrawals"
          info="Cash results + tournament results + standalone bonuses/rakeback − expenses, for the selected period."
        />
        <Stat label="Cash-game profit" value={fmt(m.cashProfitMinor, true)} tone={toneOf(m.cashProfitMinor)} sub={`${hours(m.cashMinutes)} played`} />
        <Stat label="Tournament profit" value={fmt(m.tournamentProfitMinor, true)} tone={toneOf(m.tournamentProfitMinor)} sub={`${m.tournaments.count} completed`} info="Payouts + bounties − total investment (buy-ins, fees, re-entries, rebuys, add-ons). Includes money committed to tournaments still in progress." />
        <Stat label="Expenses" value={fmt(m.expensesMinor)} sub={`Rake paid (info): ${fmt(m.rakePaidMinor)}`} info="Travel, food, coaching and other costs recorded in Expenses (net of refunds). Rake, tips and fees on sessions are inside session results and are not counted here again." />
        <Stat label="Hours played" value={hours(m.totalMinutes)} sub={`${m.completedCount} completed sessions`} />
        <Stat
          label="Hourly rate"
          value={m.hourlyMinor === null ? "—" : `${fmt(m.hourlyMinor, true)}/h`}
          tone={toneOf(m.hourlyMinor)}
          sub={m.cashHourlyMinor !== null ? `Cash only: ${fmt(m.cashHourlyMinor, true)}/h` : "No timed sessions"}
          info="(Cash + tournament results) ÷ hours played. Shown only when hours > 0."
        />
        <Stat label="Avg session" value={fmt(m.avgResultMinor, true)} tone={toneOf(m.avgResultMinor)} sub={`Bonuses & rakeback: ${fmt(m.pokerIncomeMinor + m.sessionBonusMinor)}`} info="Average result of completed cash sessions and completed tournaments." />
        <Stat label="Winning sessions" value={pct(m.winningPct)} sub={`${m.winningCount} of ${m.completedCount}`} info="Winning completed sessions ÷ completed sessions with a valid result × 100%." />
        <Stat label="Tournament ROI" value={pct(m.tournaments.roiPct, 1, true)} tone={toneOf(m.tournaments.roiPct)} sub={`Invested ${fmt(m.tournaments.investmentMinor)}`} info="Net tournament profit ÷ total tournament investment × 100%, completed tournaments only." />
        <Stat label="ITM" value={pct(m.tournaments.itmPct)} sub={`${m.tournaments.cashes} cashes / ${m.tournaments.count}`} info="Tournaments with a prize payout ÷ completed tournaments × 100%. Bounties alone do not count as a cash." />
        <Stat
          label="Streaks"
          value={
            <span>
              <span className="text-positive">W{m.streaks.longestWin}</span> <span className="text-fg-subtle">/</span> <span className="text-negative">L{m.streaks.longestLoss}</span>
            </span>
          }
          sub={m.streaks.current.type === "none" ? "No current streak" : `Current: ${m.streaks.current.length} ${m.streaks.current.type === "win" ? "winning" : "losing"}`}
          info="Longest run of consecutive winning / losing completed sessions. A break-even session ends a streak."
        />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cumulative net profit</CardTitle>
              <CardDescription>Poker results + bonuses − expenses</CardDescription>
            </div>
            <Money amount={m.netPokerProfitMinor} currency={cur} signed className="text-sm font-semibold" />
          </CardHeader>
          <CardContent>
            {m.cumulative.length > 1 ? (
              <CumulativeChart data={m.cumulative.map((p) => ({ date: p.date, profit: p.cumulativeMinor }))} currency={cur} valueKey="profit" label="Cumulative profit" />
            ) : (
              <p className="py-16 text-center text-sm text-fg-subtle">Record at least two days of results to see a trend.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Best &amp; worst</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {m.best ? (
              <>
                <ResultLine label="Best session" r={m.best} cur={cur} />
                {m.worst && m.worst.id !== m.best.id ? <ResultLine label="Worst session" r={m.worst} cur={cur} /> : null}
              </>
            ) : (
              <p className="text-fg-subtle">No completed sessions in this period.</p>
            )}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-fg-muted">Max drawdown (poker results)</p>
              <p className="num mt-1 text-lg font-semibold text-negative">{m.profitDrawdown.maxDrawdownMinor ? `−${fmt(m.profitDrawdown.maxDrawdownMinor)}` : fmt(0)}</p>
              <p className="text-xs text-fg-subtle">
                {m.profitDrawdown.maxDrawdownFrom && m.profitDrawdown.maxDrawdownTo ? `${shortDate(m.profitDrawdown.maxDrawdownFrom)} → ${shortDate(m.profitDrawdown.maxDrawdownTo)}` : "Largest peak-to-trough drop in cumulative profit"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Bankroll growth</CardTitle>
              <CardDescription>Combined balance, including deposits &amp; withdrawals</CardDescription>
            </div>
            <span className="text-xs text-fg-muted">Peak {fmt(m.bankrollDrawdown.peakMinor)}</span>
          </CardHeader>
          <CardContent>
            {m.balanceHistory.length > 1 ? (
              <BalanceChart data={m.balanceHistory.map((p) => ({ date: p.date, balance: p.balanceMinor }))} currency={cur} />
            ) : (
              <p className="py-16 text-center text-sm text-fg-subtle">Not enough history yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Monthly performance</CardTitle>
              <CardDescription>Net poker profit per month</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.monthly.length ? (
              <SignedBars data={m.monthly.map((r) => ({ month: r.month, net: r.netMinor }))} currency={cur} xKey="month" valueKey="net" label="Net profit" format="month" />
            ) : (
              <p className="py-16 text-center text-sm text-fg-subtle">No results in this period.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sessions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-fg-subtle">
                No sessions yet.
                <Button asChild size="sm">
                  <Link href="/sessions/new">
                    <Plus /> Log your first session
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {shortDate(r.date)} · {r.place ?? SETTING_LABELS[r.setting]} · {duration(r.minutes)}
                        </p>
                      </div>
                      {r.netMinor !== null ? <Money amount={r.netMinor} currency={r.currency} signed className="text-sm font-semibold" /> : <Badge tone="warning">{r.status === "draft" ? "Draft" : r.status}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-fg-muted" /> Upcoming
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/calendar">Plan</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              {upcoming.length === 0 ? (
                <p className="text-sm text-fg-subtle">No planned sessions.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {upcoming.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span className="truncate">{p.title ?? (p.kind === "cash" ? "Cash game" : "Tournament")}</span>
                      <span className="whitespace-nowrap text-fg-muted">
                        {shortDate(p.plannedDate)}
                        {p.startTime ? ` ${p.startTime}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/bankroll">Manage</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              <ul className="space-y-2 text-sm">
                {m.accounts
                  .filter((a) => !a.account.archived)
                  .map((a) => (
                    <li key={a.account.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate">
                        {a.belowMinimum ? <AlertTriangle className="size-3.5 text-negative" aria-label="Below minimum" /> : null}
                        {a.account.name}
                      </span>
                      <Money amount={a.balanceMinor} currency={a.account.currency} colored={false} />
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}

function ResultLine({ label, r, cur }: { label: string; r: { id: string; kind: string; date: string; netMinor: number; name: string | null }; cur: string }) {
  return (
    <Link href={r.kind === "cash" ? `/sessions/${r.id}` : `/tournaments/${r.id}`} className="flex items-center justify-between gap-3 hover:opacity-80">
      <div>
        <p className="text-xs text-fg-muted">{label}</p>
        <p className="truncate">
          {r.name ?? "Cash game"} · {shortDate(r.date)}
        </p>
      </div>
      <Money amount={r.netMinor} currency={cur} signed className="font-semibold" />
    </Link>
  );
}
