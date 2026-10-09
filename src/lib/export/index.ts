import "server-only";
import type { Workspace } from "../data/workspace";
import { accountBalances } from "../finance/ledger";
import type { FinanceContext } from "../finance/metrics";
import { minorUnits } from "../finance/currency";
import { minorToDecimal } from "../finance/money";
import {
  accountsTable,
  expensesTable,
  ledgerTable,
  sessionsTable,
  tournamentEntriesTable,
  tournamentsTable,
  transactionsTable,
  transfersTable,
  type Entity,
  type ExportFilter,
  type ExportTable,
} from "./tables";

export function tableFor(entity: Entity, ws: Workspace, ctx: FinanceContext, f: ExportFilter): ExportTable {
  switch (entity) {
    case "ledger":
      return ledgerTable(ws, ctx.ledger, f);
    case "sessions":
      return sessionsTable(ws, f);
    case "tournaments":
      return tournamentsTable(ws, f);
    case "expenses":
      return expensesTable(ws, f);
    case "transactions":
      return transactionsTable(ws, f);
    case "transfers":
      return transfersTable(ws, f);
    case "accounts":
      return accountsTable(ws, accountBalances(ws.dataset, ctx.ledger));
  }
}

/** Every table, for the multi-sheet workbook. */
export function allTables(ws: Workspace, ctx: FinanceContext, f: ExportFilter): ExportTable[] {
  return [
    accountsTable(ws, accountBalances(ws.dataset, ctx.ledger)),
    ledgerTable(ws, ctx.ledger, f),
    sessionsTable(ws, f),
    tournamentsTable(ws, f),
    tournamentEntriesTable(ws, f),
    transactionsTable(ws, f),
    transfersTable(ws, f),
    expensesTable(ws, f),
  ];
}

/** Primary money column used for PDF totals. */
export const TOTAL_KEY: Partial<Record<Entity, string>> = { ledger: "amount", sessions: "net", tournaments: "net", expenses: "net", transactions: "amount", accounts: "balance" };

/** JSON rendering of a table: money keeps exact minor units next to a decimal string. */
export function tableToJson(t: ExportTable) {
  return t.rows.map((r) =>
    Object.fromEntries(
      t.columns.map((c) => {
        const v = r[c.key] ?? null;
        if (v && typeof v === "object") return [c.key, { amountMinor: v.minor, currency: v.currency, amount: minorToDecimal(v.minor, minorUnits(v.currency)) }];
        return [c.key, v];
      }),
    ),
  );
}
