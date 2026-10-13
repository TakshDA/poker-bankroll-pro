import { dropDatabase, ensureDatabase, migrate } from "../scripts/lib/migrate";
import { createLocalUser } from "../src/lib/auth/local-store";
import { createSql } from "../src/lib/server/db";
import { APP_PASSWORD, E2E_ADMIN_URL, E2E_APP_URL, USER } from "./env";

/** Fresh database from the real migrations, with one signed-up user. Runs before the e2e dev server starts. */
async function setup() {
  await dropDatabase(E2E_ADMIN_URL);
  await ensureDatabase(E2E_ADMIN_URL, () => {});
  await migrate({ adminUrl: E2E_ADMIN_URL, localShim: true, appPassword: APP_PASSWORD, log: () => {} });
  const sql = createSql(E2E_APP_URL);
  try {
    await createLocalUser(sql, USER.email, USER.password);
  } finally {
    await sql.end();
  }
}

setup().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
