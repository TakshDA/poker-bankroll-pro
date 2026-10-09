import Link from "next/link";
import { Receipt, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination } from "@/components/filter-bar";
import { ConfirmAction } from "@/components/forms";
import { ExportMenu } from "@/components/export-menu";
import { todayIn } from "@/lib/finance/dates";
import { expenseNet } from "@/lib/finance/records";
import { sumMinor } from "@/lib/finance/money";
import { dateLabel, moneyInput } from "@/lib/format";
import { isUuid } from "@/lib/server/db";
import { pageOf, sp, validDate } from "@/lib/server/search-params";
import { getWorkspace } from "@/lib/server/workspace";
import { buildSessionRows } from "@/lib/views/session-rows";
import type { Expense } from "@/lib/finance/types";
import { deleteExpenseAction } from "./actions";
import { EditExpenseDialog, NewExpenseDialog, type ExpenseFormOptions, type ExpenseValues } from "./expense-form";

export const metadata = { title: "Expenses" };
const PAGE_SIZE = 50;

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const params = sp(await searchParams);
  const ws = await getWorkspace();
  const today = todayIn(ws.settings.timezone);
  const accounts = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const venues = new Map(ws.venues.map((v) => [v.id, v.name]));
  const sessionRows = buildSessionRows(ws);
  const recordTitle = new Map(sessionRows.map((r) => [r.id, { label: `${dateLabel(r.date, { month: "short", day: "numeric" })} · ${r.title}`, href: r.href }]));

  const options: ExpenseFormOptions = {
    accounts: ws.dataset.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: ws.expenseCategories.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name })),
    venues: ws.venues.filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.name })),
    links: sessionRows.filter((r) => r.status !== "draft").slice(0, 200).map((r) => ({ value: `${r.kind === "cash" ? "session" : "tournament"}:${r.id}`, label: recordTitle.get(r.id)!.label })),
  };

  // Prefill from ?new=1&sessionId=… / &tournamentId=… (links from a session page).
  const linkedSession = params.sessionId && isUuid(params.sessionId) ? ws.dataset.cashSessions.find((s) => s.id === params.sessionId) : undefined;
  const linkedTournament = params.tournamentId && isUuid(params.tournamentId) ? ws.dataset.tournaments.find((t) => t.id === params.tournamentId) : undefined;
  const defaultAccount = linkedSession?.accountId ?? linkedTournament?.accountId ?? (ws.settings.defaultAccountId && accounts.has(ws.settings.defaultAccountId) ? ws.settings.defaultAccountId : options.accounts[0]?.id) ?? "";
  // Linked sessions also default to the archived/selected account even if archived.
  if (defaultAccount && !options.accounts.some((a) => a.id === defaultAccount)) {
    const a = accounts.get(defaultAccount);
    if (a) options.accounts.unshift({ id: a.id, name: a.name, currency: a.currency });
  }
  const newValues: ExpenseValues = {
    accountId: defaultAccount,
    categoryId: options.categories.find((c) => c.name.toLowerCase().startsWith("travel"))?.id ?? options.categories[0]?.id ?? "",
    amount: "",
    refunded: "",
    occurredOn: linkedSession ? sessionRows.find((r) => r.id === linkedSession.id)!.date : (linkedTournament?.startDate ?? today),
    vendor: "",
    description: "",
    link: linkedSession ? `session:${linkedSession.id}` : linkedTournament ? `tournament:${linkedTournament.id}` : "",
    venueId: linkedSession?.venueId ?? linkedTournament?.venueId ?? "",
  };

  const q = params.q?.toLowerCase().trim();
  const from = validDate(params.from);
  const to = validDate(params.to);
  const all = [...ws.dataset.expenses].reverse();
  const rows = all.filter(
    (e) =>
      (!params.category || e.categoryId === params.category) &&
      (!params.account || e.accountId === params.account) &&
      (!params.linked || (params.linked === "yes" ? !!(e.sessionId || e.tournamentId) : !(e.sessionId || e.tournamentId))) &&
      (!from || e.occurredOn >= from) &&
      (!to || e.occurredOn <= to) &&
      (!q || e.id === q || [e.description, e.vendor, e.categoryName, accounts.get(e.accountId)?.name, venues.get(e.venueId ?? "")].some((x) => x?.toLowerCase().includes(q))),
  );
  const page = pageOf(params.page);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Totals per currency, and by category (never mixing currencies).
  const byCurrency = new Map<string, { gross: number[]; refunded: number[] }>();
  const byCategory = new Map<string, { name: string; currency: string; amounts: number[] }>();
  for (const e of rows) {
    const cur = accounts.get(e.accountId)?.currency ?? "";
    const t = byCurrency.get(cur) ?? { gross: [], refunded: [] };
    t.gross.push(e.amountMinor);
    t.refunded.push(e.refundedMinor);
    byCurrency.set(cur, t);
    const k = `${e.categoryId}|${cur}`;
    const c = byCategory.get(k) ?? { name: e.categoryName, currency: cur, amounts: [] };
    c.amounts.push(expenseNet(e));
    byCategory.set(k, c);
  }
  const categories = [...byCategory.values()].map((c) => ({ ...c, total: sumMinor(c.amounts) })).sort((a, b) => b.total - a.total);

  const valuesOf = (e: Expense): ExpenseValues => {
    const cur = accounts.get(e.accountId)?.currency ?? "CAD";
    return {
      id: e.id,
      accountId: e.accountId,
      categoryId: e.categoryId,
      amount: moneyInput(e.amountMinor, cur),
      refunded: e.refundedMinor ? moneyInput(e.refundedMinor, cur) : "",
      occurredOn: e.occurredOn,
      vendor: e.vendor ?? "",
      description: e.description ?? "",
      link: e.sessionId ? `session:${e.sessionId}` : e.tournamentId ? `tournament:${e.tournamentId}` : "",
      venueId: e.venueId ?? "",
    };
  };
  const editOptions = (e: Expense): ExpenseFormOptions => {
    // Keep an archived account/category selectable when editing an old expense.
    const a = accounts.get(e.accountId);
    const accs = options.accounts.some((x) => x.id === e.accountId) || !a ? options.accounts : [...options.accounts, { id: a.id, name: a.name, currency: a.currency }];
    const cats = options.categories.some((x) => x.id === e.categoryId) ? options.categories : [...options.categories, { id: e.categoryId, name: e.categoryName }];
    return { ...options, accounts: accs, categories: cats };
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Costs outside your session results: travel, hotels, food, coaching, software. Each expense reduces its account's balance exactly once."
        actions={
          <>
            <ExportMenu entity="expenses" />
            <NewExpenseDialog values={newValues} options={options} />
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search description, vendor, category…"
        fields={[
          { name: "category", label: "Category", options: ws.expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "account", label: "Account", options: ws.dataset.accounts.map((a) => ({ value: a.id, label: a.name })) },
          { name: "linked", label: "Linked", options: [{ value: "yes", label: "Linked to a session" }, { value: "no", label: "Not linked" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={all.length ? "No expenses match these filters" : "No expenses yet"}
          description={all.length ? "Try clearing a filter." : options.accounts.length ? "Record travel, accommodation, coaching or other poker costs." : "Create a bankroll account first."}
        />
      ) : (
        <>
          <section className="mb-4 grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...byCurrency].map(([cur, t]) => {
                  const gross = sumMinor(t.gross);
                  const refunded = sumMinor(t.refunded);
                  return (
                    <dl key={cur} className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-fg-muted">Spent ({cur})</dt>
                        <dd><Money amount={gross} currency={cur} colored={false} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Refunded</dt>
                        <dd><Money amount={refunded} currency={cur} colored={false} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Net cost</dt>
                        <dd className="font-semibold text-negative"><Money amount={gross - refunded} currency={cur} colored={false} /></dd>
                      </div>
                    </dl>
                  );
                })}
                <p className="text-xs text-fg-subtle">{rows.length} expense{rows.length === 1 ? "" : "s"} shown</p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {categories.slice(0, 8).map((c) => {
                    const max = categories.filter((x) => x.currency === c.currency)[0]?.total || 1;
                    return (
                      <li key={`${c.name}-${c.currency}`} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                        <span className="truncate text-fg-muted">{c.name}</span>
                        <span className="h-2 rounded-full bg-surface-3" aria-hidden>
                          <span className="block h-2 rounded-full bg-negative/70" style={{ width: `${Math.max(2, (c.total / max) * 100)}%` }} />
                        </span>
                        <Money amount={c.total} currency={c.currency} colored={false} className="text-right" />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>
          <Card>
            <CardContent className="px-0 pb-2 pt-2">
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-4 sm:pl-5">Date</TH>
                    <TH className="hidden sm:table-cell">Category</TH>
                    <TH>Description</TH>
                    <TH className="hidden md:table-cell">Linked to</TH>
                    <TH className="hidden md:table-cell">Account</TH>
                    <TH className="text-right">Net cost</TH>
                    <TH className="pr-3" />
                  </tr>
                </THead>
                <TBody>
                  {visible.map((e) => {
                    const cur = accounts.get(e.accountId)?.currency ?? "";
                    const linked = recordTitle.get(e.sessionId ?? e.tournamentId ?? "");
                    return (
                      <TR key={e.id}>
                        <TD className="whitespace-nowrap pl-4 text-fg-muted sm:pl-5">{dateLabel(e.occurredOn, { month: "short", day: "numeric" })}</TD>
                        <TD className="hidden sm:table-cell">{e.categoryName}</TD>
                        <TD className="max-w-32 sm:max-w-64">
                          <span className="block truncate text-xs text-fg-muted sm:hidden">{e.categoryName}</span>
                          <span className="block truncate">{e.description ?? e.vendor ?? "—"}</span>
                          {e.vendor && e.description ? <span className="block truncate text-xs text-fg-subtle">{e.vendor}</span> : null}
                        </TD>
                        <TD className="hidden max-w-56 truncate md:table-cell">
                          {linked ? (
                            <Link href={linked.href} className="text-fg-muted hover:text-fg hover:underline">
                              {linked.label}
                            </Link>
                          ) : (
                            <span className="text-fg-subtle">{venues.get(e.venueId ?? "") ?? "—"}</span>
                          )}
                        </TD>
                        <TD className="hidden text-fg-muted md:table-cell">{accounts.get(e.accountId)?.name}</TD>
                        <TD className="whitespace-nowrap text-right">
                          <Money amount={-expenseNet(e)} currency={cur} signed />
                          {e.refundedMinor ? <span className="block text-xs text-fg-subtle">refunded <Money amount={e.refundedMinor} currency={cur} colored={false} /></span> : null}
                        </TD>
                        <TD className="whitespace-nowrap px-1 text-right sm:pr-3">
                          <EditExpenseDialog values={valuesOf(e)} options={editOptions(e)} />
                          <ConfirmAction action={deleteExpenseAction} id={e.id} title="Move this expense to Trash?" description="Its amount is added back to the account balance. You can restore it from Settings → Trash." confirmLabel="Move to Trash" triggerSize="icon">
                            <Trash2 aria-label="Delete expense" />
                          </ConfirmAction>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Pagination page={page} pages={pages} basePath="/expenses" params={params} />
        </>
      )}
    </>
  );
}
