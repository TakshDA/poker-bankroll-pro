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

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export const MAX_RESTORE_ROWS = 200_000;

export class BackupFileError extends Error {}

/** Check the file's shape before touching the database. */
export function parseBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) throw new BackupFileError("This is not a Poker Bankroll Pro backup file.");
  if (typeof b.version !== "number" || b.version < 1 || b.version > BACKUP_VERSION) throw new BackupFileError("This backup was made by a newer version of the app.");
  if (!b.tables || typeof b.tables !== "object") throw new BackupFileError("The backup has no tables.");
  let total = 0;
  const tables: Backup["tables"] = {};
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) continue; // ignore unknown tables
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new BackupFileError(`The "${name}" table in the backup is damaged.`);
    total += rows.length;
    tables[name] = rows as Record<string, unknown>[];
  }
  if (total > MAX_RESTORE_ROWS) throw new BackupFileError(`The backup has more than ${MAX_RESTORE_ROWS.toLocaleString()} rows.`);
  if ((tables.user_settings?.length ?? 0) > 1) throw new BackupFileError("The backup has more than one settings row.");
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: String(b.exportedAt ?? ""), tables };
}

export interface RestoreSummary {
  rows: number;
  perTable: Record<string, number>;
  skippedAttachments: number;
  /** Storage paths no longer referenced; delete them after the transaction commits. */
  orphanedFiles: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Replace ALL of the signed-in user's data with the backup, atomically.
 * Every record gets a fresh id (references inside the backup are rewritten to
 * match), so a backup can be restored into the same or a different account.
 * Attachment rows are kept only when their file is still in storage.
 */
export async function restoreBackup(tx: Tx, backup: Backup): Promise<RestoreSummary> {
  const [{ uid }] = await tx<{ uid: string }[]>`select auth.uid() as uid`;
  const existingFiles = new Set((await tx<{ storagePath: string }[]>`select storage_path from attachments`).map((r) => r.storagePath));

  const colRows = await tx<{ tableName: string; columnName: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name = any(${BACKUP_TABLES as unknown as string[]}) and is_generated = 'NEVER'`;
  const columns = new Map<string, Set<string>>();
  for (const c of colRows) (columns.get(c.tableName) ?? columns.set(c.tableName, new Set()).get(c.tableName)!).add(c.columnName);

  // Fresh ids for every record, so restoring never collides with another account's rows.
  const ids = new Map<string, string>();
  for (const t of BACKUP_TABLES) {
    for (const r of backup.tables[t] ?? []) if (typeof r.id === "string" && UUID_RE.test(r.id)) ids.set(r.id, crypto.randomUUID());
  }
  const remap = (t: string, r: Record<string, unknown>) => {
    const cols = columns.get(t)!;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!cols.has(k)) continue;
      out[k] = k === "user_id" ? uid : typeof v === "string" && ids.has(v) ? ids.get(v) : v;
    }
    return out;
  };

  // Children first, so foreign keys never block the wipe. Settings are updated, not deleted.
  for (const t of [...BACKUP_TABLES].reverse()) if (t !== "user_settings") await tx.unsafe(`delete from public.${t}`);

  const perTable: Record<string, number> = {};
  let skippedAttachments = 0;
  const keptFiles = new Set<string>();
  for (const t of BACKUP_TABLES) {
    if (t === "user_settings") continue;
    let rows = backup.tables[t] ?? [];
    if (t === "attachments") {
      const before = rows.length;
      rows = rows.filter((r) => typeof r.storage_path === "string" && existingFiles.has(r.storage_path));
      skippedAttachments = before - rows.length;
      for (const r of rows) keptFiles.add(r.storage_path as string);
    }
    if (!rows.length) continue;
    const mapped = rows.map((r) => remap(t, r));
    const cols = [...new Set(mapped.flatMap((r) => Object.keys(r)))].map((c) => `"${c}"`).join(", ");
    for (let i = 0; i < mapped.length; i += 500) {
      // jsonb_populate_recordset casts every value to the column's real type.
      await tx.unsafe(`insert into public.${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [mapped.slice(i, i + 500) as never]);
    }
    perTable[t] = rows.length;
  }

  const settings = backup.tables.user_settings?.[0];
  if (settings) {
    // The app reads the time zone on every page; refuse one it cannot use.
    if (settings.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: String(settings.timezone) });
      } catch {
        throw new BackupFileError("The backup's time zone setting is not valid.");
      }
    }
    const s = remap("user_settings", settings);
    const cols = Object.keys(s).filter((c) => !["user_id", "created_at", "updated_at"].includes(c));
    if (cols.length) {
      await tx.unsafe(
        `update public.user_settings u set ${cols.map((c) => `"${c}" = r."${c}"`).join(", ")}
         from jsonb_populate_record(null::public.user_settings, $1::jsonb) r where u.user_id = auth.uid()`,
        [s as never],
      );
    }
    perTable.user_settings = 1;
  }
  const rows = Object.values(perTable).reduce((a, b) => a + b, 0);
  return { rows, perTable, skippedAttachments, orphanedFiles: [...existingFiles].filter((f) => !keptFiles.has(f)) };
}
