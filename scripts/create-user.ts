/**
 * Create a user for the local auth provider (the app has no public sign-up).
 *   pnpm user:create you@example.com          # prompts for a password
 *   PBP_PASSWORD=... pnpm user:create you@example.com
 */
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { createSql } from "../src/lib/server/db";
import { createLocalUser } from "../src/lib/auth/local-store";

config({ path: ".env.local", quiet: true });

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: pnpm user:create <email>");
  let password = process.env.PBP_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 10 chars): ");
    rl.close();
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = createSql(url);
  try {
    const user = await createLocalUser(sql, email, password);
    console.log(`Created user ${user.email}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
