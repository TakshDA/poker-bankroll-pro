import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const appPw = process.env.LOCAL_APP_DB_PASSWORD ?? "local-dev-app-pw";
export const TEST_ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/poker_bankroll_test";
export const TEST_APP_URL = process.env.TEST_DATABASE_URL ?? `postgres://pbp_app:${encodeURIComponent(appPw)}@localhost:5432/poker_bankroll_test`;
export const APP_PASSWORD = appPw;
