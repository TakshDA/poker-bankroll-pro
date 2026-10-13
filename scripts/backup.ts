/**
 * Write one user's full JSON backup to a file (the same file the app's
 * "Full backup" download produces). Runs as that user under RLS.
 *   pnpm backup you@example.com                 # ./backups/poker-bankroll-<email>-<date>.json
 *   pnpm backup you@example.com path/to/file.json
 * Uses DATABASE_URL from .env.local or the environment.
 */
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportBackup } from "../src/lib/data/backup";
import { createSql, withUser } from "../src/lib/server/db";

config({ path: ".env.local", quiet: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: pnpm backup <email> [output.json]");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = createSql(url);
  try {
    const users = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
    if (!users[0]) throw new Error(`No user with email ${email}`);
    const backup = await withUser(users[0].id, exportBackup, sql);
    const out = process.argv[3] ?? path.join("backups", `poker-bankroll-${email.replace(/[^a-z0-9]+/g, "-")}-${backup.exportedAt.slice(0, 10)}.json`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(backup, null, 2), { mode: 0o600 });
    const rows = Object.values(backup.tables).reduce((n, t) => n + t.length, 0);
    console.log(`Wrote ${rows} rows across ${Object.keys(backup.tables).length} tables to ${out}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
