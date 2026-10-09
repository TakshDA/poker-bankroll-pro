/**
 * Apply database migrations.
 *
 *   pnpm db:migrate            # uses DATABASE_ADMIN_URL from .env.local
 *
 * With DB_LOCAL_SHIM=true (local Postgres) the Supabase compatibility shim and
 * the local `pbp_app` role are created first. Never enable the shim against a
 * real Supabase project; there the `auth` schema and roles already exist.
 */
import "dotenv/config";
import { config } from "dotenv";
import { ensureDatabase, migrate } from "./lib/migrate";

config({ path: ".env.local", override: true });

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is not set (see .env.example)");
  const localShim = process.env.DB_LOCAL_SHIM === "true";
  if (localShim) await ensureDatabase(adminUrl);
  await migrate({ adminUrl, localShim, appPassword: process.env.LOCAL_APP_DB_PASSWORD });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
