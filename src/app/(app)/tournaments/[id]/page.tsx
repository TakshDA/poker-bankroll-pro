import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AttachmentsPanel, type AttachmentRow } from "@/components/records/attachments";
import { AuditTrail, loadAudit } from "@/components/records/audit-trail";
import { getTournament } from "@/lib/data/tournaments";
import { durationMinutes, localDate } from "@/lib/finance/dates";
import { percent } from "@/lib/finance/money";
import { entryCost, expenseNet, tournamentAffectsBankroll, tournamentCashed, tournamentInvestment, tournamentMinutes, tournamentNet, tournamentReturn } from "@/lib/finance/records";
import { dateLabel, duration, money, pct, SETTING_LABELS, SPEED_LABELS, STATUS_LABELS, timeLabel, TOURNAMENT_FORMAT_LABELS } from "@/lib/format";
import { isUuid } from "@/lib/server/db";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { TournamentActions } from "./tournament-actions";

export const metadata = { title: "Tournament" };

export default async function TournamentPage({ params }: PageProps<"/tournaments/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ws = await getWorkspace();
  const data = await readAsUser(async (tx) => {
    const t = await getTournament(tx, id);
    if (!t) return null;
    const [attachments, audit] = await Promise.all([
      tx<AttachmentRow[]>`select id, file_name, content_type, size_bytes from attachments where tournament_id = ${id} order by created_at`,
      loadAudit(tx, [id]),
    ]);
    return { t, attachments, audit };
  });
  if (!data) notFound();
  const { t, attachments, audit } = data;
  const tz = ws.settings.timezone;
  const account = ws.dataset.accounts.find((a) => a.id === t.accountId);
  const cur = account?.currency ?? "CAD";
  const invested = tournamentInvestment(t);
  const returned = tournamentReturn(t);
  const net = tournamentNet(t);
  const minutes = tournamentMinutes(t);
  const affects = tournamentAffectsBankroll(t);
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;
  const place = t.setting === "online" ? name(ws.platforms, t.platformId) : name(ws.venues, t.venueId);
  const linkedExpenses = ws.dataset.expenses.filter((e) => e.tournamentId === t.id);

  return (
    <>
      <PageHeader
        title={t.name}
        description={
          <>
            {dateLabel(t.startDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            {t.endDate && t.endDate !== t.startDate ? ` – ${dateLabel(t.endDate, { month: "short", day: "numeric" })}` : ""} · {SETTING_LABELS[t.setting]}
            {place ? ` · ${place}` : ""}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/tournaments/${t.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <TournamentActions id={t.id} />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={t.status === "completed" ? "positive" : t.status === "draft" ? "warning" : "neutral"}>{STATUS_LABELS[t.status]}</Badge>
                {tournamentCashed(t) ? <Badge tone="gold">In the money</Badge> : null}
                <Badge tone="outline">{account?.name}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-fg-muted">Net result</p>
              <p className="mt-1 text-3xl font-semibold">{affects ? <Money amount={net} currency={cur} signed /> : <span className="text-fg-subtle">Draft (not counted)</span>}</p>
              <p className="num mt-1 text-sm text-fg-muted">
                ROI {pct(invested > 0 ? percent(net, invested) : null, 1, true)}
                {t.finishPosition ? ` · Finished ${t.finishPosition}${t.fieldSize ? ` of ${t.fieldSize}` : ""}` : ""}
                {minutes ? ` · ${duration(minutes)} played` : ""}
              </p>
              <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Line label="Total invested" value={money(invested, cur)} strong />
                <Line label="Total returned" value={money(returned, cur)} strong />
                <Line label="Prize payout" value={money(t.payoutMinor, cur)} />
                <Line label="Bounties" value={money(t.bountiesMinor, cur)} />
                {t.status === "cancelled" ? <Line label="Refund" value={money(t.refundMinor, cur)} /> : null}
                <Line label="Entries" value={String(t.entries.length)} />
              </dl>
              <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                Net = payout + bounties{t.status === "cancelled" ? " + refund" : ""} − Σ (buy-in + fee + rebuys + add-ons) over every entry. ROI = net ÷ total invested.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Entries</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-5">#</TH>
                    <TH className="text-right">Buy-in</TH>
                    <TH className="text-right">Fee</TH>
                    <TH className="text-right">Rebuys</TH>
                    <TH className="text-right">Add-ons</TH>
                    <TH className="pr-5 text-right">Cost</TH>
                  </tr>
                </THead>
                <TBody>
                  {t.entries.map((e) => (
                    <TR key={e.entryNumber}>
                      <TD className="pl-5 text-fg-muted">{e.entryNumber === 1 ? "Entry" : `Re-entry ${e.entryNumber - 1}`}</TD>
                      <TD className="num text-right">{money(e.buyInMinor, cur)}</TD>
                      <TD className="num text-right">{money(e.feeMinor, cur)}</TD>
                      <TD className="num text-right">
                        {money(e.rebuysMinor, cur)}
                        {e.rebuyCount ? <span className="text-xs text-fg-subtle"> ×{e.rebuyCount}</span> : null}
                      </TD>
                      <TD className="num text-right">{money(e.addonsMinor, cur)}</TD>
                      <TD className="num pr-5 text-right font-medium">{money(entryCost(e), cur)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Line label="Format" value={`${TOURNAMENT_FORMAT_LABELS[t.format]}${t.isBounty ? " · Bounty" : ""}`} />
                <Line label="Speed" value={SPEED_LABELS[t.speed]} />
                <Line label="Game" value={name(ws.gameTypes, t.gameTypeId) ?? "—"} />
                <Line label="Guarantee" value={t.guaranteeMinor !== null ? money(t.guaranteeMinor, cur) : "—"} />
                <Line label="Field size" value={t.fieldSize?.toLocaleString() ?? "—"} />
                <Line label="Tags" value={t.tags.length ? t.tags.join(", ") : "—"} />
              </dl>
              {t.periods.length ? (
                <ul className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
                  {t.periods.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        <span className="font-medium">{p.dayLabel ?? "Day"}</span>
                        <span className="text-fg-muted">
                          {" "}
                          · {dateLabel(localDate(p.startedAt, tz), { weekday: "short", month: "short", day: "numeric" })} · {timeLabel(p.startedAt, tz)}
                          {p.endedAt ? ` – ${timeLabel(p.endedAt, tz)}` : " – in progress"}
                        </span>
                      </span>
                      <span className="num text-fg-muted">{duration(durationMinutes(p.startedAt, p.endedAt, p.breakMinutes))}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {t.notes ? <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-surface-2/50 p-3 text-sm">{t.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Linked expenses</CardTitle>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/expenses?new=1&tournamentId=${t.id}`}>Add expense</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {linkedExpenses.length === 0 ? (
                <p className="text-sm text-fg-subtle">No travel, hotel or other costs linked. These are tracked separately from the tournament result.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {linkedExpenses.map((e) => (
                    <li key={e.id} className="flex justify-between py-2">
                      <span>
                        {e.categoryName}
                        {e.description ? <span className="text-fg-muted"> · {e.description}</span> : null}
                      </span>
                      <Money amount={-expenseNet(e)} currency={cur} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <AttachmentsPanel ownerType="tournament" ownerId={t.id} items={attachments} />
          <AuditTrail rows={audit} timeZone={tz} />
        </div>
      </div>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`num ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
