import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const LOCAL_DIR = path.join(ROOT, "db", "local");

export interface MigrateOptions {
  /** Connection string with schema-owner privileges. */
  adminUrl: string;
  /** Apply the local Supabase shim + local app role (never on Supabase). */
  localShim: boolean;
  /** Password for the local `pbp_app` login role (local only). */
  appPassword?: string;
  log?: (msg: string) => void;
}

/** Create the target database if it does not exist (local only). */
export async function ensureDatabase(adminUrl: string, log = console.log) {
  const url = new URL(adminUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
  url.pathname = "/postgres";
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) {
      await sql.unsafe(`create database "${dbName}"`);
      log(`Created database ${dbName}`);
    }
  } finally {
    await sql.end();
  }
}

export async function dropDatabase(adminUrl: string) {
  const url = new URL(adminUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
  url.pathname = "/postgres";
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`drop database if exists "${dbName}" with (force)`);
  } finally {
    await sql.end();
  }
}

export async function migrate({ adminUrl, localShim, appPassword, log = console.log }: MigrateOptions) {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    if (localShim) {
      for (const file of (await readdir(LOCAL_DIR)).filter((f) => f.endsWith(".sql")).sort()) {
        await sql.unsafe(await readFile(path.join(LOCAL_DIR, file), "utf8"));
        log(`Applied local shim ${file}`);
      }
      if (appPassword) {
        // Identifier is fixed; the password is passed as a literal via format().
        await sql`select set_config('pbp.tmp_pw', ${appPassword}, false)`;
        await sql.unsafe(`do $$ begin execute format('alter role pbp_app password %L', current_setting('pbp.tmp_pw')); end $$`);
        await sql`select set_config('pbp.tmp_pw', '', false)`;
      }
    }

    await sql.unsafe(`
      create schema if not exists app_meta;
      revoke all on schema app_meta from public;
      create table if not exists app_meta.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    const applied = new Set(
      (await sql<{ version: string }[]>`select version from app_meta.schema_migrations`).map((r) => r.version),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into app_meta.schema_migrations (version) values (${file})`;
      });
      log(`Applied migration ${file}`);
      count++;
    }
    if (count === 0) log("Database schema is up to date");
  } finally {
    await sql.end();
  }
}
