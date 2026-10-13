/**
 * CSV import. Every row goes through the same Zod schema and save function as
 * manual entry, inside its own savepoint, so a bad row never leaves partial
 * data behind. A preview runs exactly the same code and then rolls the whole
 * transaction back, so what the preview reports is what the import will do.
 */
import type { Tx } from "../server/db";
import { FIELDS, IMPORT_ENTITIES, mappingProblems, rowToInput, RowError, type ImportEntity, type ImportOptions, type ImportRef } from "../import/spec";
import { FieldError } from "../validation/common";
import { cashSessionSchema, expenseSchema, tournamentSchema, transactionSchema } from "../validation/schemas";
import { BusinessRuleError, friendlyDbError, NotFoundError } from "./common";
import { DuplicateExpenseError, saveExpense, saveTransaction } from "./money-records";
import { saveCashSession } from "./sessions";
import { saveTournament } from "./tournaments";

export const MAX_IMPORT_ROWS = 2000;

export interface ImportPayload {
  entity: ImportEntity;
  fileName: string;
  headers: string[];
  rows: string[][];
  mapping: Record<string, number>;
  options: ImportOptions;
}

export interface RowResult {
  /** Line number in the file (the header is line 1). */
  line: number;
  status: "ok" | "duplicate" | "error";
  message?: string;
  summary: string;
}

export interface ImportOutcome {
  results: RowResult[];
  batchId?: string;
  counts: { total: number; imported: number; duplicates: number; errors: number };
}

const TABLE: Record<ImportEntity, string> = { sessions: "sessions", tournaments: "tournaments", expenses: "expenses", transactions: "transactions" };

class DuplicateRow extends Error {}

async function loadRef(tx: Tx): Promise<ImportRef> {
  const [accounts, categories, gameTypes] = await Promise.all([
    tx<{ id: string; name: string }[]>`select id, name from bankroll_accounts where deleted_at is null and archived_at is null`,
    tx<{ id: string; name: string; kind: string }[]>`select id, name, kind from expense_categories where archived_at is null`,
    tx<{ id: string; name: string; shortName: string | null }[]>`select id, name, short_name from game_types where archived_at is null`,
  ]);
  return { accounts, categories, gameTypes };
}

async function save(tx: Tx, entity: ImportEntity, input: Record<string, unknown>): Promise<string> {
  switch (entity) {
    case "sessions":
      return saveCashSession(tx, cashSessionSchema.parse(input));
    case "tournaments":
      return saveTournament(tx, tournamentSchema.parse(input));
    case "expenses":
      return saveExpense(tx, expenseSchema.parse(input));
    case "transactions":
      return saveTransaction(tx, transactionSchema.parse(input));
  }
}

/** Same day, account and amounts as a record already in the books (or earlier in this file). */
async function isDuplicate(tx: Tx, entity: ImportEntity, id: string): Promise<boolean> {
  let rows: readonly unknown[] = [];
  if (entity === "sessions") {
    rows = await tx`
      select 1 from sessions n join cash_game_details nd on nd.session_id = n.id
      join sessions s on s.id <> n.id and s.deleted_at is null and s.kind = 'cash' and s.started_at = n.started_at
      join cash_game_details d on d.session_id = s.id and d.account_id = nd.account_id
        and d.buy_in_minor is not distinct from nd.buy_in_minor and d.cash_out_minor is not distinct from nd.cash_out_minor
      where n.id = ${id} limit 1`;
  } else if (entity === "tournaments") {
    rows = await tx`
      select 1 from tournaments n join tournaments t on t.id <> n.id and t.deleted_at is null
        and t.start_date = n.start_date and t.account_id = n.account_id and lower(t.name) = lower(n.name)
        and t.payout_minor is not distinct from n.payout_minor
      where n.id = ${id} limit 1`;
  } else if (entity === "transactions") {
    rows = await tx`
      select 1 from transactions n join transactions t on t.id <> n.id and t.deleted_at is null
        and t.account_id = n.account_id and t.occurred_on = n.occurred_on and t.type = n.type and t.amount_minor = n.amount_minor
      where n.id = ${id} limit 1`;
  }
  // Expenses: saveExpense itself rejects likely duplicates unless confirmed.
  return rows.length > 0;
}

function summarize(entity: ImportEntity, input: Record<string, unknown>): string {
  const s = (k: string) => (input[k] === undefined || input[k] === null ? "" : String(input[k]));
  const join = (...p: string[]) => p.filter(Boolean).join(" · ");
  switch (entity) {
    case "sessions":
      return join(s("date"), `${s("startTime")}–${s("endTime")}`, s("newVenueName") || s("newPlatformName") || s("variant"), s("bigBlind") ? `${s("smallBlind")}/${s("bigBlind")}` : "", `in ${s("buyIn")}${s("rebuys") ? ` + ${s("rebuys")}` : ""}, out ${s("cashOut")}`);
    case "tournaments": {
      const entries = (input.entries as { buyIn: string; fee?: string }[]) ?? [];
      return join(s("startDate"), s("name"), `${entries.length} × ${entries[0]?.buyIn ?? ""}${entries[0]?.fee ? ` + ${entries[0].fee}` : ""}`, s("payout") ? `won ${s("payout")}` : "");
    }
    case "expenses":
      return join(s("occurredOn"), s("amount"), s("vendor") || s("description"));
    case "transactions":
      return join(s("occurredOn"), s("type"), s("amount"), s("description"));
  }
}

/** Schema field names that differ from the import field they come from. */
const ALIASES: Record<string, string> = { occurredOn: "date", startDate: "date", accountId: "account", categoryId: "category", entries: "buyIn", finishPosition: "position", handsPlayed: "hands", newVenueName: "location", newPlatformName: "location" };
const labelOf = (entity: ImportEntity, key: string) => FIELDS[entity].find((f) => f.key === (ALIASES[key] ?? key))?.label ?? key;

function errorMessage(e: unknown, entity: ImportEntity): string {
  if (e instanceof RowError) return e.message;
  if (e instanceof FieldError) return `${labelOf(entity, e.field)}: ${e.message}`;
  if (e instanceof BusinessRuleError || e instanceof NotFoundError) return e.message;
  const zod = e as { issues?: { path: PropertyKey[]; message: string }[] };
  if (Array.isArray(zod?.issues) && zod.issues[0]) {
    const key = String(zod.issues[0].path[0] ?? "");
    const label = key ? labelOf(entity, key) : "";
    return label ? `${label}: ${zod.issues[0].message}` : zod.issues[0].message;
  }
  return friendlyDbError(e) ?? "Could not save this row";
}

/** Import (or, when the caller rolls back, preview) a parsed CSV file. */
export async function runImport(tx: Tx, payload: ImportPayload): Promise<ImportOutcome> {
  if (!IMPORT_ENTITIES.includes(payload.entity)) throw new BusinessRuleError("Unknown import type");
  if (payload.rows.length > MAX_IMPORT_ROWS) throw new BusinessRuleError(`Import up to ${MAX_IMPORT_ROWS} rows at a time. Split the file and import each part.`);
  const missing = mappingProblems(payload.entity, payload.mapping);
  if (missing.length) throw new BusinessRuleError(`Choose a column for: ${missing.join("; ")}`);

  const ref = await loadRef(tx);
  const [batch] = await tx<{ id: string }[]>`
    insert into import_batches (entity, file_name, total_rows, mapping)
    values (${payload.entity}, ${payload.fileName.slice(0, 255) || "import.csv"}, ${payload.rows.length},
            ${tx.json({ mapping: payload.mapping, headers: payload.headers, options: { ...payload.options } } as never)})
    returning id`;

  const results: RowResult[] = [];
  for (let i = 0; i < payload.rows.length; i++) {
    const line = i + 2;
    let input: Record<string, unknown>;
    try {
      input = rowToInput(payload.entity, payload.rows[i], payload.mapping, payload.options, ref, payload.headers);
    } catch (e) {
      results.push({ line, status: "error", message: errorMessage(e, payload.entity), summary: payload.rows[i].join(", ").slice(0, 120) });
      continue;
    }
    const summary = summarize(payload.entity, input);
    try {
      await tx.savepoint(async (sp) => {
        const id = await save(sp as unknown as Tx, payload.entity, input);
        if (!payload.options.includeDuplicates && (await isDuplicate(sp as unknown as Tx, payload.entity, id))) throw new DuplicateRow();
        await sp`update ${sp(TABLE[payload.entity])} set import_batch_id = ${batch.id} where id = ${id}`;
      });
      results.push({ line, status: "ok", summary });
    } catch (e) {
      if (e instanceof DuplicateRow || e instanceof DuplicateExpenseError) results.push({ line, status: "duplicate", message: "Matches a record you already have", summary });
      else results.push({ line, status: "error", message: errorMessage(e, payload.entity), summary });
    }
  }
  const counts = {
    total: results.length,
    imported: results.filter((r) => r.status === "ok").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
  };
  await tx`update import_batches set imported_rows = ${counts.imported}, duplicate_rows = ${counts.duplicates}, error_rows = ${counts.errors} where id = ${batch.id}`;
  return { results, batchId: batch.id, counts };
}

export interface ImportBatch {
  id: string;
  entity: ImportEntity;
  fileName: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  createdAt: string;
  undoneAt: string | null;
}

export async function listImports(tx: Tx): Promise<ImportBatch[]> {
  return tx<ImportBatch[]>`
    select id, entity, file_name, total_rows, imported_rows, duplicate_rows, error_rows, created_at, undone_at
    from import_batches where imported_rows > 0 order by created_at desc limit 50`;
}

/**
 * Remove every record an import created (including ones edited since) and
 * return attachment paths to delete once the transaction commits.
 */
export async function undoImport(tx: Tx, batchId: string): Promise<{ paths: string[]; removed: number }> {
  const [batch] = await tx<{ id: string }[]>`select id from import_batches where id = ${batchId} and undone_at is null`;
  if (!batch) throw new NotFoundError("Import not found or already undone");
  const files = await tx<{ storagePath: string }[]>`
    select storage_path from attachments
    where session_id in (select id from sessions where import_batch_id = ${batchId} or tournament_id in (select id from tournaments where import_batch_id = ${batchId}))
       or tournament_id in (select id from tournaments where import_batch_id = ${batchId})
       or expense_id in (select id from expenses where import_batch_id = ${batchId})`;
  let removed = 0;
  for (const t of ["expenses", "transactions", "sessions", "tournaments"] as const) {
    removed += (await tx`delete from ${tx(t)} where import_batch_id = ${batchId} returning id`).length;
  }
  await tx`update import_batches set undone_at = now() where id = ${batchId}`;
  return { paths: files.map((f) => f.storagePath), removed };
}
