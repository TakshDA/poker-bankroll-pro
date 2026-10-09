import Link from "next/link";
import { ListOrdered, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination } from "@/components/filter-bar";
import { dateLabel, duration, SETTING_LABELS, STATUS_LABELS } from "@/lib/format";
import { getWorkspace } from "@/lib/server/workspace";
import { pageOf, sp, validDate } from "@/lib/server/search-params";
import { buildSessionRows } from "@/lib/views/session-rows";

export const metadata = { title: "Sessions" };
const PAGE_SIZE = 50;

export default async function SessionsPage({ searchParams }: PageProps<"/sessions">) {
  const params = sp(await searchParams);
  const ws = await getWorkspace();
  const all = buildSessionRows(ws);
  const q = params.q?.toLowerCase().trim();
  const from = validDate(params.from);
  const to = validDate(params.to);
  const rows = all.filter(
    (r) =>
      (!params.type || r.kind === params.type) &&
      (!params.setting || r.setting === params.setting) &&
      (!params.status || r.status === params.status) &&
      (!params.account || r.accountId === params.account) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (!q || [r.title, r.place, r.gameType, r.notes, r.accountName, ...r.tags].some((x) => x?.toLowerCase().includes(q))),
  );
  const page = pageOf(params.page);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Sessions"
        description={`${rows.length} of ${all.length} cash sessions and tournaments`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/tournaments/new">
                <Plus /> Tournament
              </Link>
            </Button>
            <Button asChild>
              <Link href="/sessions/new">
                <Plus /> Cash session
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search game, venue, notes, tags…"
        fields={[
          { name: "type", label: "Type", options: [{ value: "cash", label: "Cash" }, { value: "tournament", label: "Tournament" }] },
          { name: "setting", label: "Where", options: Object.entries(SETTING_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "status", label: "Status", options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "account", label: "Account", options: ws.dataset.accounts.map((a) => ({ value: a.id, label: a.name })) },
        ]}
      />
      {visible.length === 0 ? (
        <EmptyState
          icon={<ListOrdered />}
          title={all.length ? "No sessions match these filters" : "No sessions yet"}
          description={all.length ? "Try clearing a filter." : "Log your first cash game or tournament to start tracking."}
          action={
            all.length ? null : (
              <Button asChild>
                <Link href="/sessions/new">Log a session</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile list */}
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {dateLabel(r.date, { month: "short", day: "numeric" })} · {r.place ?? SETTING_LABELS[r.setting]} · {duration(r.minutes)}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.netMinor !== null ? <Money amount={r.netMinor} currency={r.currency} signed className="text-sm font-semibold" /> : null}
                    {r.status !== "completed" ? (
                      <div>
                        <Badge tone="warning">{STATUS_LABELS[r.status]}</Badge>
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Card className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Game</TH>
                  <TH>Where</TH>
                  <TH>Account</TH>
                  <TH className="text-right">Duration</TH>
                  <TH className="text-right">Invested</TH>
                  <TH className="text-right">Result</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {visible.map((r) => (
                  <TR key={r.id}>
                    <TD className="text-fg-muted">{dateLabel(r.date)}</TD>
                    <TD>
                      <Link href={r.href} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                      <span className="ml-2 text-xs text-fg-subtle">{r.kind === "tournament" ? `MTT${r.finish ? ` · ${r.finish}` : ""}` : ""}</span>
                    </TD>
                    <TD className="text-fg-muted">{r.place ?? SETTING_LABELS[r.setting]}</TD>
                    <TD className="text-fg-muted">{r.accountName}</TD>
                    <TD className="num text-right text-fg-muted">{duration(r.minutes)}</TD>
                    <TD className="text-right">
                      <Money amount={r.investedMinor} currency={r.currency} colored={false} className="text-fg-muted" />
                    </TD>
                    <TD className="text-right font-medium">{r.netMinor !== null ? <Money amount={r.netMinor} currency={r.currency} signed /> : "—"}</TD>
                    <TD>{r.status !== "completed" ? <Badge tone={r.status === "cancelled" ? "neutral" : "warning"}>{STATUS_LABELS[r.status]}</Badge> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination page={page} pages={pages} basePath="/sessions" params={params} />
        </>
      )}
    </>
  );
}
