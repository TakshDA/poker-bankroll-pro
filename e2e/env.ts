import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const appPw = process.env.LOCAL_APP_DB_PASSWORD ?? "local-dev-app-pw";
export const E2E_PORT = 3100;
export const E2E_ADMIN_URL = process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/poker_bankroll_e2e";
export const E2E_APP_URL = process.env.E2E_DATABASE_URL ?? `postgres://pbp_app:${encodeURIComponent(appPw)}@localhost:5432/poker_bankroll_e2e`;
export const APP_PASSWORD = appPw;
export const USER = { email: "e2e@example.com", password: "e2e-password-123" };
