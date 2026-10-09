/**
 * Tabular views of a workspace for CSV / Excel / PDF export. Pure functions:
 * they read the already-loaded workspace and the shared finance formulas, so
 * an export always matches what the app shows.
 *
 * Money cells are carried as integer minor units plus a currency and are only
 * turned into decimals by the serialisers, so no float arithmetic happens here.
 */
import type { Workspace } from "../data/workspace";
import { localDate, localTime } from "../finance/dates";
import { LEDGER_CLASS, labelForKind, type LedgerEntry } from "../finance/ledger";
import { cashSessionNet, entryCost, expenseNet, tournamentAffectsBankroll, tournamentInvestment, tournamentNet, tournamentReturn } from "../finance/records";
import { SETTING_LABELS, STATUS_LABELS, TOURNAMENT_FORMAT_LABELS, TRANSACTION_LABELS } from "../format";
import { buildSessionRows } from "../views/session-rows";

export type CellType = "text" | "date" | "int" | "money" | "number";
export interface Column {
  key: string;
  label: string;
  type: CellType;
}
/** Money cells are `{ minor, currency }`; the serialiser decides how to print them. */
export interface MoneyCell {
  minor: number;
  currency: string;
}
export type Cell = string | number | MoneyCell | null;
export type Row = Record<string, Cell>;
export interface ExportTable {
  name: string;
  columns: Column[];
  rows: Row[];
  /** Columns that fit on a landscape PDF page (defaults to the first eight). */
  pdfKeys?: string[];
}

export interface ExportFilter {
  from?: string | null;
  to?: string | null;
  accountId?: string | null;
}

export const ENTITIES = ["ledger", "sessions", "tournaments", "expenses", "transactions", "transfers", "accounts"] as const;
export type Entity = (typeof ENTITIES)[number];

const c = (key: string, label: string, type: CellType = "text"): Column => ({ key, label, type });
const m = (minor: number | null | undefined, currency: string): MoneyCell | null => (minor === null || minor === undefined ? null : { minor, currency });

function inFilter(f: ExportFilter, date: string, ...accountIds: (string | null | undefined)[]) {
  if (f.from && date < f.from) return false;
  if (f.to && date > f.to) return false;
  if (f.accountId && !accountIds.includes(f.accountId)) return false;
  return true;
}

export function ledgerTable(ws: Workspace, ledger: LedgerEntry[], f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a.name]));
  return {
    name: "Ledger",
    pdfKeys: ["date", "type", "description", "account", "currency", "amount"],
    columns: [c("date", "Date", "date"), c("type", "Type"), c("class", "Class"), c("description", "Description"), c("account", "Account"), c("currency", "Currency"), c("amount", "Amount", "money"), c("source", "Source"), c("sourceId", "Source ID")],
    rows: ledger
      .filter((e) => inFilter(f, e.date, e.accountId))
      .map((e) => ({
        date: e.date,
        type: labelForKind(e.kind),
        class: LEDGER_CLASS[e.kind],
        description: e.description,
        account: acc.get(e.accountId) ?? "",
        currency: e.currency,
        amount: m(e.amountMinor, e.currency),
        source: e.sourceType,
        sourceId: e.sourceId,
      })),
  };
}

export function sessionsTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const tz = ws.settings.timezone;
  const cash = new Map(ws.dataset.cashSessions.map((s) => [s.id, s]));
  const rows = buildSessionRows(ws)
    .filter((r) => r.kind === "cash" && inFilter(f, r.date, r.accountId))
    .reverse()
    .map((r) => {
      const s = cash.get(r.id)!;
      return {
        date: r.date,
        start: r.startedAt ? localTime(r.startedAt, tz) : null,
        end: r.endedAt ? localTime(r.endedAt, tz) : null,
        endDate: r.endedAt ? localDate(r.endedAt, tz) : null,
        breakMinutes: s.breakMinutes,
        minutes: r.minutes,
        status: STATUS_LABELS[r.status] ?? r.status,
        setting: SETTING_LABELS[r.setting] ?? r.setting,
        place: r.place,
        game: r.gameType,
        stakes: r.stakes,
        account: r.accountName,
        currency: r.currency,
        buyIn: m(s.buyInMinor, r.currency),
        rebuys: m(s.rebuysMinor, r.currency),
        additional: m(s.additionalMinor, r.currency),
        cashOut: m(s.cashOutMinor, r.currency),
        rake: m(s.rakeMinor, r.currency),
        tips: m(s.tipsMinor, r.currency),
        fees: m(s.feesMinor, r.currency),
        bonus: m(s.bonusMinor, r.currency),
        rakeback: m(s.rakebackMinor, r.currency),
        net: m(s.status === "completed" ? cashSessionNet(s) : null, r.currency),
        hands: r.handsPlayed,
        tags: r.tags.join("; "),
        notes: r.notes,
        id: r.id,
      };
    });
  return {
    name: "Cash sessions",
    pdfKeys: ["date", "start", "minutes", "place", "game", "stakes", "account", "buyIn", "rebuys", "cashOut", "net"],
    columns: [
      c("date", "Date", "date"), c("start", "Start"), c("end", "End"), c("endDate", "End date", "date"), c("breakMinutes", "Break (min)", "int"), c("minutes", "Played (min)", "int"),
      c("status", "Status"), c("setting", "Setting"), c("place", "Venue / platform"), c("game", "Game"), c("stakes", "Stakes"), c("account", "Account"), c("currency", "Currency"),
      c("buyIn", "Buy-in", "money"), c("rebuys", "Rebuys", "money"), c("additional", "Additional", "money"), c("cashOut", "Cash-out", "money"), c("rake", "Rake (info)", "money"),
      c("tips", "Tips", "money"), c("fees", "Fees", "money"), c("bonus", "Bonus", "money"), c("rakeback", "Rakeback", "money"), c("net", "Net result", "money"),
      c("hands", "Hands", "int"), c("tags", "Tags"), c("notes", "Notes"), c("id", "ID"),
    ],
    rows,
  };
}

export function tournamentsTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const place = (id: string | null, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? null;
  const game = new Map(ws.gameTypes.map((g) => [g.id, g.shortName ?? g.name]));
  const tag = new Map(ws.tags.map((t) => [t.id, t.name]));
  const rows = ws.dataset.tournaments
    .filter((t) => inFilter(f, t.startDate, t.accountId))
    .map((t) => {
      const a = acc.get(t.accountId);
      const cur = a?.currency ?? t.currency;
      return {
        date: t.startDate,
        endDate: t.endDate,
        name: t.name,
        status: STATUS_LABELS[t.status] ?? t.status,
        setting: SETTING_LABELS[t.setting] ?? t.setting,
        place: t.setting === "online" ? place(t.platformId, ws.platforms) : place(t.venueId, ws.venues),
        game: game.get(t.gameTypeId ?? "") ?? null,
        format: TOURNAMENT_FORMAT_LABELS[t.format] ?? t.format,
        bounty: t.isBounty ? "yes" : "no",
        account: a?.name ?? "",
        currency: cur,
        entries: t.entries.length,
        buyIn: m(t.entries[0]?.buyInMinor ?? 0, cur),
        fee: m(t.entries[0]?.feeMinor ?? 0, cur),
        invested: m(tournamentInvestment(t), cur),
        payout: m(t.payoutMinor, cur),
        bounties: m(t.bountiesMinor, cur),
        refund: m(t.refundMinor, cur),
        returned: m(tournamentReturn(t), cur),
        net: m(tournamentAffectsBankroll(t) ? tournamentNet(t) : null, cur),
        fieldSize: t.fieldSize,
        finish: t.finishPosition,
        tags: t.tagIds.map((x) => tag.get(x) ?? "").filter(Boolean).join("; "),
        notes: t.notes ?? null,
        id: t.id,
      };
    });
  return {
    name: "Tournaments",
    pdfKeys: ["date", "name", "place", "format", "entries", "invested", "returned", "net", "finish", "fieldSize"],
    columns: [
      c("date", "Start date", "date"), c("endDate", "End date", "date"), c("name", "Name"), c("status", "Status"), c("setting", "Setting"), c("place", "Venue / platform"), c("game", "Game"),
      c("format", "Format"), c("bounty", "Bounty"), c("account", "Account"), c("currency", "Currency"), c("entries", "Entries", "int"), c("buyIn", "Buy-in", "money"), c("fee", "Fee", "money"),
      c("invested", "Total invested", "money"), c("payout", "Payout", "money"), c("bounties", "Bounties", "money"), c("refund", "Refund", "money"), c("returned", "Total returned", "money"),
      c("net", "Net result", "money"), c("fieldSize", "Field size", "int"), c("finish", "Finish", "int"), c("tags", "Tags"), c("notes", "Notes"), c("id", "ID"),
    ],
    rows,
  };
}

/** One row per tournament entry, useful for re-entry analysis. */
export function tournamentEntriesTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const rows: Row[] = [];
  for (const t of ws.dataset.tournaments) {
    if (!inFilter(f, t.startDate, t.accountId)) continue;
    const cur = acc.get(t.accountId)?.currency ?? t.currency;
    for (const e of t.entries)
      rows.push({ tournamentId: t.id, name: t.name, date: t.startDate, entry: e.entryNumber, currency: cur, buyIn: m(e.buyInMinor, cur), fee: m(e.feeMinor, cur), rebuyCount: e.rebuyCount, rebuys: m(e.rebuysMinor, cur), addons: m(e.addonsMinor, cur), cost: m(entryCost(e), cur) });
  }
  return {
    name: "Tournament entries",
    columns: [c("date", "Date", "date"), c("name", "Tournament"), c("entry", "Entry #", "int"), c("currency", "Currency"), c("buyIn", "Buy-in", "money"), c("fee", "Fee", "money"), c("rebuyCount", "Rebuy count", "int"), c("rebuys", "Rebuys", "money"), c("addons", "Add-ons", "money"), c("cost", "Entry cost", "money"), c("tournamentId", "Tournament ID")],
    rows,
  };
}

export function expensesTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const venue = new Map(ws.venues.map((v) => [v.id, v.name]));
  return {
    name: "Expenses",
    pdfKeys: ["date", "category", "description", "account", "currency", "amount", "refunded", "net"],
    columns: [c("date", "Date", "date"), c("category", "Category"), c("kind", "Kind"), c("description", "Description"), c("vendor", "Vendor"), c("account", "Account"), c("currency", "Currency"), c("amount", "Amount", "money"), c("refunded", "Refunded", "money"), c("net", "Net cost", "money"), c("venue", "Venue"), c("sessionId", "Session ID"), c("tournamentId", "Tournament ID"), c("id", "ID")],
    rows: ws.dataset.expenses
      .filter((e) => inFilter(f, e.occurredOn, e.accountId))
      .map((e) => {
        const cur = acc.get(e.accountId)?.currency ?? "";
        return { date: e.occurredOn, category: e.categoryName, kind: e.categoryKind, description: e.description, vendor: e.vendor ?? null, account: acc.get(e.accountId)?.name ?? "", currency: cur, amount: m(e.amountMinor, cur), refunded: m(e.refundedMinor, cur), net: m(expenseNet(e), cur), venue: venue.get(e.venueId ?? "") ?? null, sessionId: e.sessionId, tournamentId: e.tournamentId, id: e.id };
      }),
  };
}

export function transactionsTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  return {
    name: "Transactions",
    pdfKeys: ["date", "type", "account", "currency", "amount", "description"],
    columns: [c("date", "Date", "date"), c("type", "Type"), c("account", "Account"), c("currency", "Currency"), c("amount", "Amount", "money"), c("description", "Description"), c("id", "ID")],
    rows: ws.dataset.transactions
      .filter((t) => inFilter(f, t.occurredOn, t.accountId))
      .map((t) => {
        const cur = acc.get(t.accountId)?.currency ?? "";
        return { date: t.occurredOn, type: TRANSACTION_LABELS[t.type] ?? t.type, account: acc.get(t.accountId)?.name ?? "", currency: cur, amount: m(t.amountMinor, cur), description: t.description, id: t.id };
      }),
  };
}

export function transfersTable(ws: Workspace, f: ExportFilter = {}): ExportTable {
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  return {
    name: "Transfers",
    pdfKeys: ["date", "from", "fromAmount", "to", "toAmount", "description"],
    columns: [c("date", "Date", "date"), c("from", "From account"), c("fromCurrency", "From currency"), c("fromAmount", "Amount sent", "money"), c("to", "To account"), c("toCurrency", "To currency"), c("toAmount", "Amount received", "money"), c("description", "Description"), c("id", "ID")],
    rows: ws.dataset.transfers
      .filter((t) => inFilter(f, t.occurredOn, t.fromAccountId, t.toAccountId))
      .map((t) => {
        const a = acc.get(t.fromAccountId);
        const b = acc.get(t.toAccountId);
        return { date: t.occurredOn, from: a?.name ?? "", fromCurrency: a?.currency ?? "", fromAmount: m(t.fromAmountMinor, a?.currency ?? ""), to: b?.name ?? "", toCurrency: b?.currency ?? "", toAmount: m(t.toAmountMinor, b?.currency ?? ""), description: t.description, id: t.id };
      }),
  };
}

export function accountsTable(ws: Workspace, balances: Map<string, number>): ExportTable {
  const cat = new Map(ws.bankrollCategories.map((x) => [x.id, x.name]));
  return {
    name: "Accounts",
    pdfKeys: ["name", "category", "currency", "opening", "balance", "min", "goal", "archived"],
    columns: [c("name", "Account"), c("category", "Category"), c("currency", "Currency"), c("opening", "Opening balance", "money"), c("openingDate", "Opening date", "date"), c("balance", "Current balance", "money"), c("min", "Minimum balance", "money"), c("goal", "Goal balance", "money"), c("archived", "Archived"), c("id", "ID")],
    rows: ws.dataset.accounts
      .map((a) => ({ name: a.name, category: cat.get(a.categoryId ?? "") ?? null, currency: a.currency, opening: m(a.openingBalanceMinor, a.currency), openingDate: a.openingDate, balance: m(balances.get(a.id) ?? 0, a.currency), min: m(a.minBalanceMinor, a.currency), goal: m(a.goalBalanceMinor, a.currency), archived: a.archived ? "yes" : "no", id: a.id })),
  };
}
