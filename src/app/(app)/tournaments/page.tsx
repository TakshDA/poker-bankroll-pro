import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CumulativeChart, SignedBars } from "@/components/charts";
import { ExportMenu } from "@/components/export-menu";
import { FilterBar, Pagination } from "@/components/filter-bar";
import { RangePicker } from "@/components/range-picker";
import { Stat } from "@/components/stat";
import { minorUnits } from "@/lib/finance/currency";
import { inRange } from "@/lib/finance/dates";
import { BUY_IN_LEVELS, buyInLevel, groupTournaments, summarizeTournaments, type TournamentGroupRow } from "@/lib/finance/metrics";
import { perHourMinor, sumMinor } from "@/lib/finance/money";
import { dateLabel, money, pct, SETTING_LABELS, STATUS_LABELS, TOURNAMENT_FORMAT_LABELS } from "@/lib/format";
import { rangeFromParams } from "@/lib/server/range";
import { pageOf, sp } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";
import { buildSessionRows } from "@/lib/views/session-rows";

export const metadata = { title: "Tournaments" };
const PAGE_SIZE = 50;

export default async function TournamentsPage({ searchParams }: PageProps<"/tournaments">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const range = rangeFromParams(params, ws.settings);
  const base = ws.settings.baseCurrency;
  const digits = minorUnits(base);

  const inR = ctx.allResults.filter((r) => r.kind === "tournament" && inRange(r.date, range));
  const summary = summarizeTournaments(inR);
  const done = inR.filter((r) => r.countsInStats).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const pendingNet = sumMinor(inR.filter((r) => !r.countsInStats).map((r) => r.netMinor));
  const pendingCount = inR.filter((r) => !r.countsInStats).length;
  const minutes = done.reduce((a, r) => a + r.minutes, 0);
  const biggest = done.reduce<(typeof done)[number] | null>((b, r) => (r.payoutMinor + r.bountiesMinor > (b ? b.payoutMinor + b.bountiesMinor : 0) ? r : b), null);

  // Starts from zero so a single result still draws a line.
  const cumulative: { date: string; net: number }[] = done.length ? [{ date: done[0].date, net: 0 }] : [];
  for (const r of done) cumulative.push({ date: r.date, net: (cumulative.at(-1)?.net ?? 0) + r.netMinor });

  const levelLabel = (k: string) => {
    const i = Number(k);
    const lo = BUY_IN_LEVELS[i];
    const hi = BUY_IN_LEVELS[i + 1];
    const f = (major: number) => money(major * 10 ** digits, base, { compact: true });
    return hi ? `${f(lo)}–${f(hi)}` : `${f(lo)}+`;
  };
  const byFormat = groupTournaments(inR, (r) => r.format, (k) => TOURNAMENT_FORMAT_LABELS[k] ?? k).sort((a, b) => b.netMinor - a.netMinor);
  const byLevel = groupTournaments(inR, (r) => String(buyInLevel(r.faceBuyInMinor, digits)), levelLabel).sort((a, b) => Number(a.key) - Number(b.key));
  const byPlace = groupTournaments(inR, (r) => (r.setting === "online" ? r.platformId : r.venueId), (k) => ws.venues.find((v) => v.id === k)?.name ?? ws.platforms.find((p) => p.id === k)?.name ?? "Unknown").sort((a, b) => b.netMinor - a.netMinor);
  const byBounty = groupTournaments(inR, (r) => (r.isBounty ? "bounty" : "regular"), (k) => (k === "bounty" ? "Bounty / KO" : "Regular"));

  // List (all statuses), filtered.
  const q = params.q?.toLowerCase().trim();
  const fmt = new Map(ws.dataset.tournaments.map((t) => [t.id, t.format]));
  const listAll = buildSessionRows(ws).filter((r) => r.kind === "tournament");
  const list = listAll.filter(
    (r) =>
      inRange(r.date, range) &&
      (!params.status || r.status === params.status) &&
      (!params.format || fmt.get(r.id) === params.format) &&
      (!params.setting || r.setting === params.setting) &&
      (!params.account || r.accountId === params.account) &&
      (!q || [r.title, r.place, r.notes, ...r.tags].some((x) => x?.toLowerCase().includes(q))),
  );
  const page = pageOf(params.page);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Tournaments"
        description={`ROI, ITM and results across ${summary.count} completed tournament${summary.count === 1 ? "" : "s"} in this period. Amounts in ${base}.`}
        actions={
          <>
            <RangePicker current={range} />
            <ExportMenu entity="tournaments" />
            <Button asChild>
              <Link href="/tournaments/new">
                <Plus /> Tournament
              </Link>
            </Button>
          </>
        }
      />
      {ctx.missingCurrencies.length ? (
        <Alert tone="warning" className="mb-4">
          Results in {ctx.missingCurrencies.join(", ")} have no exchange rate into {base} and are left out of these totals. <Link href="/settings/currencies" className="underline">Add a rate</Link>.
        </Alert>
      ) : null}
      {listAll.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="No tournaments yet"
          description="Log MTTs, sit & gos, satellites and spins with re-entries, bounties and multi-day play."
          action={
            <Button asChild>
              <Link href="/tournaments/new">Log a tournament</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              large
              className="col-span-2 lg:col-span-1"
              label="Net profit"
              tone={summary.netMinor > 0 ? "positive" : summary.netMinor < 0 ? "negative" : "neutral"}
              value={money(summary.netMinor, base, { signed: true })}
              sub={pendingCount ? `${money(pendingNet, base, { signed: true })} more from ${pendingCount} in-progress/cancelled (in bankroll, not in stats)` : `${summary.count} completed`}
              info="Σ (payout + bounties + refund − total investment) over completed tournaments."
            />
            <Stat label="ROI" value={pct(summary.roiPct, 1, true)} tone={summary.roiPct === null ? "neutral" : summary.roiPct >= 0 ? "positive" : "negative"} info="Net profit ÷ total investment (all entries, fees, rebuys and add-ons)." sub={`Invested ${money(summary.investmentMinor, base)}`} />
            <Stat label="In the money" value={pct(summary.itmPct)} sub={`${summary.cashes} of ${summary.count} cashed`} info="Tournaments with a prize payout above zero ÷ completed tournaments. Bounties alone do not count." />
            <Stat label="Avg buy-in" value={summary.avgBuyInMinor !== null ? money(summary.avgBuyInMinor, base) : "—"} sub={`${summary.entries} entries · avg cost ${summary.avgInvestmentMinor !== null ? money(summary.avgInvestmentMinor, base) : "—"}`} info="Face buy-in = first entry's buy-in + fee. Average cost includes re-entries, rebuys and add-ons." />
            <Stat label="Biggest return" info="Largest payout + bounties from one tournament." tone="gold" value={biggest ? money(biggest.payoutMinor + biggest.bountiesMinor, base) : "—"} sub={biggest ? `${biggest.name ?? ""} · ${dateLabel(biggest.date, { month: "short", day: "numeric" })}` : undefined} />
            <Stat label="Avg cash" value={summary.avgCashMinor !== null ? money(summary.avgCashMinor, base) : "—"} sub={`Payouts ${money(summary.payoutMinor, base)}`} />
            <Stat label="Bounties won" value={money(summary.bountiesMinor, base)} />
            <Stat className="col-span-2 lg:col-span-1" label="Hourly" value={minutes ? money(perHourMinor(summary.netMinor, minutes) ?? 0, base, { signed: true }) : "—"} sub={minutes ? `${(minutes / 60).toFixed(1)}h recorded` : "Add playing days to track hours"} info="Net profit of completed tournaments with recorded playing time ÷ hours played." />
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cumulative tournament profit</CardTitle>
              </CardHeader>
              <CardContent>{cumulative.length ? <CumulativeChart data={cumulative} currency={base} valueKey="net" label="Cumulative profit" /> : <p className="text-sm text-fg-subtle">No completed tournaments in this period.</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Profit by buy-in level</CardTitle>
              </CardHeader>
              <CardContent>{byLevel.length ? <SignedBars data={byLevel.map((r) => ({ label: r.label, net: r.netMinor }))} currency={base} xKey="label" valueKey="net" label="Net profit" /> : <p className="text-sm text-fg-subtle">No data.</p>}</CardContent>
            </Card>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <GroupCard title="By format" rows={byFormat} currency={base} />
            <GroupCard title="By buy-in level" rows={byLevel} currency={base} />
            <GroupCard title="By venue / platform" rows={byPlace} currency={base} />
            <GroupCard title="Bounty vs regular" rows={byBounty} currency={base} />
          </section>

          <h2 className="mb-3 mt-8 text-sm font-semibold">All tournaments</h2>
          <FilterBar
            showDates={false}
            searchPlaceholder="Search name, venue, notes, tags…"
            fields={[
              { name: "status", label: "Status", options: ["completed", "in_progress", "draft", "cancelled"].map((v) => ({ value: v, label: STATUS_LABELS[v] })) },
              { name: "format", label: "Format", options: Object.entries(TOURNAMENT_FORMAT_LABELS).map(([value, label]) => ({ value, label })) },
              { name: "setting", label: "Where", options: Object.entries(SETTING_LABELS).map(([value, label]) => ({ value, label })) },
              { name: "account", label: "Account", options: ws.dataset.accounts.map((a) => ({ value: a.id, label: a.name })) },
            ]}
          />
          {list.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-fg-muted">No tournaments match these filters.</p>
          ) : (
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-4 sm:pl-5">Date</TH>
                    <TH>Tournament</TH>
                    <TH className="hidden md:table-cell">Where</TH>
                    <TH className="hidden text-right sm:table-cell">Invested</TH>
                    <TH className="hidden text-right lg:table-cell">Finish</TH>
                    <TH className="pr-4 text-right sm:pr-5">Result</TH>
                  </tr>
                </THead>
                <TBody>
                  {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                    <TR key={r.id}>
                      <TD className="pl-4 text-fg-muted sm:pl-5">{dateLabel(r.date, { month: "short", day: "numeric", year: "2-digit" })}</TD>
                      <TD className="max-w-44 sm:max-w-72">
                        <Link href={r.href} className="block truncate font-medium hover:underline">
                          {r.title}
                        </Link>
                        {r.status !== "completed" ? <Badge tone={r.status === "draft" ? "warning" : "neutral"}>{STATUS_LABELS[r.status]}</Badge> : null}
                      </TD>
                      <TD className="hidden max-w-48 truncate text-fg-muted md:table-cell">{r.place ?? SETTING_LABELS[r.setting]}</TD>
                      <TD className="hidden text-right sm:table-cell">
                        <Money amount={r.investedMinor} currency={r.currency} colored={false} className="text-fg-muted" />
                      </TD>
                      <TD className="num hidden text-right text-fg-muted lg:table-cell">{r.finish ?? "—"}</TD>
                      <TD className="pr-4 text-right font-medium sm:pr-5">{r.netMinor !== null ? <Money amount={r.netMinor} currency={r.currency} signed /> : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          <Pagination page={page} pages={pages} basePath="/tournaments" params={params} />
        </>
      )}
    </>
  );
}

function GroupCard({ title, rows, currency }: { title: string; rows: TournamentGroupRow[]; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {rows.length === 0 ? (
          <p className="px-5 text-sm text-fg-subtle">No completed tournaments.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="pl-5" />
                <TH className="hidden text-right sm:table-cell">#</TH>
                <TH className="hidden text-right sm:table-cell">Invested</TH>
                <TH className="text-right">ITM</TH>
                <TH className="text-right">ROI</TH>
                <TH className="pr-5 text-right">Net</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.key}>
                  <TD className="max-w-28 truncate pl-5 sm:max-w-36">{r.label}</TD>
                  <TD className="num hidden text-right text-fg-muted sm:table-cell">{r.count}</TD>
                  <TD className="num hidden text-right text-fg-muted sm:table-cell">{money(r.investmentMinor, currency, { compact: true })}</TD>
                  <TD className="num text-right text-fg-muted">{pct(r.itmPct, 0)}</TD>
                  <TD className="num text-right">{pct(r.roiPct, 0, true)}</TD>
                  <TD className="pr-5 text-right font-medium">
                    <Money amount={r.netMinor} currency={currency} signed />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
