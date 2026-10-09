import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, PageHeader } from "@/components/ui/misc";
import { AttachmentsPanel, type AttachmentRow } from "@/components/records/attachments";
import { AuditTrail, loadAudit } from "@/components/records/audit-trail";
import { getCashSession } from "@/lib/data/sessions";
import { localDate } from "@/lib/finance/dates";
import { bbPer100, cashInvested, cashSessionMinutes, cashSessionNet, expenseNet } from "@/lib/finance/records";
import { dateLabel, duration, money, SETTING_LABELS, STATUS_LABELS, TABLE_FORMAT_LABELS, timeLabel } from "@/lib/format";
import { isUuid } from "@/lib/server/db";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { SessionActions } from "./session-actions";

export const metadata = { title: "Session" };

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ws = await getWorkspace();
  const data = await readAsUser(async (tx) => {
    const s = await getCashSession(tx, id);
    if (!s) return null;
    const [attachments, audit] = await Promise.all([
      tx<AttachmentRow[]>`select id, file_name, content_type, size_bytes from attachments where session_id = ${id} order by created_at`,
      loadAudit(tx, [id]),
    ]);
    return { s, attachments, audit };
  });
  if (!data) notFound();
  const { s, attachments, audit } = data;
  const tz = ws.settings.timezone;
  const account = ws.dataset.accounts.find((a) => a.id === s.accountId);
  const cur = account?.currency ?? "CAD";
  const net = cashSessionNet(s);
  const minutes = cashSessionMinutes(s);
  const linkedExpenses = ws.dataset.expenses.filter((e) => e.sessionId === s.id);
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;
  const place = s.setting === "online" ? name(ws.platforms, s.platformId) : name(ws.venues, s.venueId);
  const stakes = s.bigBlindMinor ? `${money(s.smallBlindMinor ?? 0, cur)}/${money(s.bigBlindMinor, cur)}${s.straddleMinor ? ` (str ${money(s.straddleMinor, cur)})` : ""}` : null;
  const bb100 = net !== null ? bbPer100(net, s.bigBlindMinor, s.handsPlayed) : null;

  return (
    <>
      <PageHeader
        title={`${name(ws.gameTypes, s.gameTypeId) ?? "Cash game"}${stakes ? ` · ${stakes}` : ""}`}
        description={
          <>
            {dateLabel(localDate(s.startedAt, tz), { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {timeLabel(s.startedAt, tz)}
            {s.endedAt ? ` – ${timeLabel(s.endedAt, tz)}` : ""} · {SETTING_LABELS[s.setting]}
            {place ? ` · ${place}` : ""}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/sessions/${s.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <SessionActions id={s.id} />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <div className="flex gap-1.5">
                <Badge tone={s.status === "completed" ? "positive" : s.status === "draft" ? "warning" : "neutral"}>{STATUS_LABELS[s.status]}</Badge>
                <Badge tone="outline">{account?.name}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-fg-muted">Net result</p>
              <p className="mt-1 text-3xl font-semibold">{net === null ? <span className="text-fg-subtle">Not finished</span> : <Money amount={net} currency={cur} signed />}</p>
              {net !== null && minutes ? (
                <p className="num mt-1 text-sm text-fg-muted">
                  {money(Math.round((net * 60) / minutes), cur, { signed: true })}/h over {duration(minutes)}
                  {bb100 !== null ? ` · ${bb100.toFixed(1)} bb/100` : ""}
                </p>
              ) : null}
              <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Line label="Buy-in" value={money(s.buyInMinor, cur)} />
                <Line label="Rebuys" value={money(s.rebuysMinor, cur)} />
                <Line label="Add-ons / top-ups" value={money(s.additionalMinor, cur)} />
                <Line label="Total invested" value={money(cashInvested(s), cur)} strong />
                <Line label="Cash-out" value={money(s.cashOutMinor, cur)} strong />
                <Line label="Tips paid separately" value={`−${money(s.tipsMinor, cur)}`} />
                <Line label="Fees paid separately" value={`−${money(s.feesMinor, cur)}`} />
                <Line label="Session bonus" value={`+${money(s.bonusMinor, cur)}`} />
                <Line label="Session rakeback" value={`+${money(s.rakebackMinor, cur)}`} />
                <Line label="Rake (already in cash-out)" value={money(s.rakeMinor, cur)} muted />
              </dl>
              <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                Net = cash-out − (buy-in + rebuys + add-ons) − tips − fees + bonus + rakeback. Rake is informational because it is already reflected in the cash-out.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Line label="Duration" value={duration(minutes)} />
                <Line label="Breaks" value={s.breakMinutes ? `${s.breakMinutes} min` : "—"} />
                <Line label="Table" value={`${TABLE_FORMAT_LABELS[s.tableFormat]}${s.seats ? ` · ${s.seats} seats` : ""}`} />
                <Line label="Hands played" value={s.handsPlayed?.toLocaleString() ?? "—"} />
                <Line label="Variant" value={s.variant ?? "—"} />
                <Line label="Tags" value={s.tags.length ? s.tags.join(", ") : "—"} />
              </dl>
              {s.notes ? <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-surface-2/50 p-3 text-sm">{s.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Linked expenses</CardTitle>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/expenses?new=1&sessionId=${s.id}`}>Add expense</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {linkedExpenses.length === 0 ? (
                <p className="text-sm text-fg-subtle">No travel, food or other costs linked. These are tracked separately from the session result.</p>
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
          <AttachmentsPanel ownerType="session" ownerId={s.id} items={attachments} />
          <AuditTrail rows={audit} timeZone={tz} />
        </div>
      </div>
    </>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`num ${strong ? "font-semibold" : ""} ${muted ? "text-fg-subtle" : ""}`}>{value}</dd>
    </div>
  );
}
