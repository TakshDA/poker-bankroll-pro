import Link from "next/link";
import { Coins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CumulativeChart, SignedBars } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";
import { Stat } from "@/components/stat";
import { minorUnits } from "@/lib/finance/currency";
import { inRange } from "@/lib/finance/dates";
import { bbPer100ForGroup, groupResults, type GroupRow } from "@/lib/finance/metrics";
import { averageMinor, minorToDecimal, percent, perHourMinor, sumMinor } from "@/lib/finance/money";
import type { PokerResult } from "@/lib/finance/results";
import { duration, money, pct, SETTING_LABELS, TABLE_FORMAT_LABELS } from "@/lib/format";
import { rangeFromParams } from "@/lib/server/range";
import { sp } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";

export const metadata = { title: "Cash games" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CashPage({ searchParams }: PageProps<"/cash">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const range = rangeFromParams(params, ws.settings);
  const base = ws.settings.baseCurrency;

  const cash = ctx.allResults.filter((r) => r.kind === "cash" && inRange(r.date, range)).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const net = sumMinor(cash.map((r) => r.netMinor));
  const minutes = cash.reduce((a, r) => a + r.minutes, 0);
  const wins = cash.filter((r) => r.netMinor > 0).length;
  const bb = bbPer100ForGroup(cash);
  const rake = sumMinor(cash.map((r) => r.rakeMinor));
  const totalHands = cash.reduce((a, r) => a + (r.handsPlayed ?? 0), 0);

  const cumulative: { date: string; net: number }[] = cash.length ? [{ date: cash[0].date, net: 0 }] : [];
  for (const r of cash) cumulative.push({ date: r.date, net: (cumulative.at(-1)?.net ?? 0) + r.netMinor });

  const stakeLabel = new Map(ws.stakeLevels.map((s) => [s.id, s.label]));
  const stakeKey = (r: PokerResult) => {
    if (r.stakeLevelId) return `id:${r.stakeLevelId}`;
    if (!r.bigBlindMinor) return null;
    const d = minorUnits(r.currency);
    const t = (m: number) => {
      const s = minorToDecimal(m, d);
      return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
    };
    return `bl:${t(r.smallBlindMinor ?? 0)}/${t(r.bigBlindMinor)} ${r.currency}`;
  };
  const byStakes = groupResults(cash, stakeKey, (k) => (k.startsWith("id:") ? (stakeLabel.get(k.slice(3)) ?? "Deleted stake") : k.slice(3)));
  const nameOf = (k: string) => ws.venues.find((v) => v.id === k)?.name ?? ws.platforms.find((p) => p.id === k)?.name ?? "Unknown";
  const byPlace = groupResults(cash, (r) => (r.setting === "online" ? r.platformId : r.venueId), nameOf);
  const byGame = groupResults(cash, (r) => r.gameTypeId, (k) => ws.gameTypes.find((g) => g.id === k)?.name ?? "Unknown");
  const byFormat = groupResults(cash, (r) => r.tableFormat, (k) => TABLE_FORMAT_LABELS[k] ?? k);
  const bySetting = groupResults(cash, (r) => r.setting, (k) => SETTING_LABELS[k] ?? k);
  const byWeekday = groupResults(cash, (r) => String(new Date(`${r.date}T12:00:00Z`).getUTCDay()), (k) => WEEKDAYS[Number(k)]).sort((a, b) => Number(a.key) - Number(b.key));
  const lengthBucket = (m: number) => (m < 120 ? "0" : m < 240 ? "1" : m < 360 ? "2" : "3");
  const byLength = groupResults(cash, (r) => lengthBucket(r.minutes), (k) => ["Under 2h", "2–4h", "4–6h", "6h+"][Number(k)]).sort((a, b) => Number(a.key) - Number(b.key));

  return (
    <>
      <PageHeader
        title="Cash games"
        description={`Results from ${cash.length} completed cash session${cash.length === 1 ? "" : "s"} in this period, in ${base}.`}
        actions={
          <>
            <RangePicker current={range} />
            <Button asChild>
              <Link href="/sessions/new">
                <Plus /> Cash session
              </Link>
            </Button>
          </>
        }
      />
      {ctx.missingCurrencies.length ? (
        <Alert tone="warning" className="mb-4">
          Results in {ctx.missingCurrencies.join(", ")} have no exchange rate into {base} and are left out. <Link href="/settings/currencies" className="underline">Add a rate</Link>.
        </Alert>
      ) : null}
      {cash.length === 0 ? (
        <EmptyState
          icon={<Coins />}
          title="No completed cash sessions in this period"
          description="Log a session or pick a wider date range."
          action={
            <Button asChild>
              <Link href="/sessions/new">Log a cash session</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat large className="col-span-2 lg:col-span-1" label="Cash profit" value={money(net, base, { signed: true })} tone={net > 0 ? "positive" : net < 0 ? "negative" : "neutral"} sub={`${cash.length} sessions · ${wins} winning (${pct(percent(wins, cash.length), 0)})`} info="Σ cash-out − buy-ins − rebuys − add-ons − tips − fees + session bonus + rakeback." />
            <Stat label="Hourly" value={minutes ? money(perHourMinor(net, minutes) ?? 0, base, { signed: true }) : "—"} sub={`${(minutes / 60).toFixed(1)}h played`} info="Cash profit ÷ hours played (breaks excluded)." />
            <Stat
              label="bb/100"
              value={bb.bbPer100 !== null ? bb.bbPer100.toFixed(1) : "—"}
              tone={bb.bbPer100 === null ? "neutral" : bb.bbPer100 >= 0 ? "positive" : "negative"}
              sub={bb.handsCovered ? `${bb.handsCovered.toLocaleString()} hands with blinds recorded` : "Record hands played and blinds"}
              info="Σ (net ÷ big blind) ÷ Σ hands × 100, using each session's own currency and big blind. Sessions without hands or a big blind are left out."
            />
            <Stat label="Avg session" value={money(averageMinor(cash.map((r) => r.netMinor)) ?? 0, base, { signed: true })} sub={`Avg length ${duration(Math.round(minutes / cash.length))}`} />
            <Stat label="Rake paid (info)" value={money(rake, base)} sub="Already reflected in cash-outs" info="Rake you recorded. It is not deducted again: it is already inside each cash-out." />
            <Stat label="Hands" value={totalHands ? totalHands.toLocaleString() : "—"} sub={totalHands && minutes ? `${Math.round(totalHands / (minutes / 60))} hands/hour` : undefined} />
            <Stat label="Best session" tone="positive" value={money(Math.max(...cash.map((r) => r.netMinor)), base, { signed: true })} />
            <Stat label="Worst session" tone="negative" value={money(Math.min(...cash.map((r) => r.netMinor)), base, { signed: true })} />
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cumulative cash profit</CardTitle>
              </CardHeader>
              <CardContent>
                <CumulativeChart data={cumulative} currency={base} valueKey="net" label="Cumulative profit" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Profit by stakes</CardTitle>
              </CardHeader>
              <CardContent>
                <SignedBars data={byStakes.map((r) => ({ label: r.label, net: r.netMinor }))} currency={base} xKey="label" valueKey="net" label="Net profit" horizontal />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Profit by day of week</CardTitle>
              </CardHeader>
              <CardContent>
                <SignedBars data={byWeekday.map((r) => ({ label: r.label, net: r.netMinor }))} currency={base} xKey="label" valueKey="net" label="Net profit" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Profit by session length</CardTitle>
              </CardHeader>
              <CardContent>
                <SignedBars data={byLength.map((r) => ({ label: r.label, net: r.netMinor }))} currency={base} xKey="label" valueKey="net" label="Net profit" />
              </CardContent>
            </Card>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <GroupCard title="By stakes" rows={byStakes} currency={base} showBb />
            <GroupCard title="By venue / platform" rows={byPlace} currency={base} />
            <GroupCard title="By game" rows={byGame} currency={base} showBb />
            <GroupCard title="By table format" rows={byFormat} currency={base} showBb />
            <GroupCard title="Live vs online" rows={bySetting} currency={base} />
          </section>
        </>
      )}
    </>
  );
}

function GroupCard({ title, rows, currency, showBb }: { title: string; rows: GroupRow[]; currency: string; showBb?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <THead>
            <tr>
              <TH className="pl-5" />
              <TH className="text-right">#</TH>
              <TH className="hidden text-right sm:table-cell">Hours</TH>
              <TH className="hidden text-right sm:table-cell">Win %</TH>
              <TH className="text-right">{showBb ? "bb/100" : "Hourly"}</TH>
              <TH className="pr-5 text-right">Net</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD className="max-w-28 truncate pl-5 sm:max-w-36">{r.label}</TD>
                <TD className="num text-right text-fg-muted">{r.count}</TD>
                <TD className="num hidden text-right text-fg-muted sm:table-cell">{(r.minutes / 60).toFixed(1)}</TD>
                <TD className="num hidden text-right text-fg-muted sm:table-cell">{pct(r.winRatePct, 0)}</TD>
                <TD className="num text-right">{showBb ? (r.bbPer100 !== null ? r.bbPer100.toFixed(1) : "—") : r.hourlyMinor !== null ? money(r.hourlyMinor, currency, { signed: true }) : "—"}</TD>
                <TD className="pr-5 text-right font-medium">
                  <Money amount={r.netMinor} currency={currency} signed />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
