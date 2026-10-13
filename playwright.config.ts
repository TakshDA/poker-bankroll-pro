import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_URL, E2E_PORT } from "./e2e/env";

/**
 * Browser tests against a dedicated database (rebuilt from the migrations on
 * every run) and a dedicated dev server on port 3100, so `pnpm dev` data is
 * never touched. Needs local PostgreSQL, like the integration tests.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 1000 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `pnpm exec tsx --conditions=react-server e2e/prepare-db.ts && pnpm exec next dev --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: E2E_APP_URL, AUTH_PROVIDER: "local", ALLOW_SIGNUP: "false", STORAGE_PROVIDER: "local", ATTACHMENTS_DIR: ".data/e2e-attachments" },
  },
});
