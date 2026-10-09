import { dropDatabase, ensureDatabase, migrate } from "../../scripts/lib/migrate";
import { APP_PASSWORD, TEST_ADMIN_URL } from "./env";

/** Fresh database per test run, built from the real migrations. */
export default async function setup() {
  await dropDatabase(TEST_ADMIN_URL);
  await ensureDatabase(TEST_ADMIN_URL, () => {});
  await migrate({ adminUrl: TEST_ADMIN_URL, localShim: true, appPassword: APP_PASSWORD, log: () => {} });
}
