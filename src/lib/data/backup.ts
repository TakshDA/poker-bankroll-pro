/**
 * Full JSON backup of the signed-in user's data. Runs inside withUser(), so
 * RLS limits every table to that user. Rows are returned exactly as stored
 * (snake_case columns, integer minor units), including soft-deleted rows, so
 * the file is a faithful copy that can be restored or audited.
 *
 * Attachment files themselves are not embedded; only their metadata is.
 */
import type { Tx } from "../server/db";

/** Parent tables before children, which is also a safe restore order. */
export const BACKUP_TABLES = [
  "user_settings",
  "exchange_rates",
  "venues",
  "platforms",
  "game_types",
  "stake_levels",
  "tags",
  "bankroll_categories",
  "expense_categories",
  "bankroll_accounts",
  "import_batches",
  "transactions",
  "transfers",
  "tournaments",
  "tournament_entries",
  "sessions",
  "cash_game_details",
  "session_tags",
  "tournament_tags",
  "expenses",
  "goals",
  "planned_sessions",
  "notes",
  "attachments",
] as const;

export const BACKUP_FORMAT = "poker-bankroll-pro/backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportBackup(tx: Tx): Promise<Backup> {
  const tables: Backup["tables"] = {};
  for (const t of BACKUP_TABLES) {
    // to_jsonb(...)::text bypasses the client's camelCase transform, keeping
    // the stored column names. `t` comes from the constant list above.
    const rows = await tx.unsafe<{ j: string }[]>(`select to_jsonb(x)::text as j from public.${t} x order by 1`);
    tables[t] = rows.map((r) => JSON.parse(r.j));
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}
