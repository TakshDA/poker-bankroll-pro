import { expect, type Page } from "@playwright/test";
import { USER } from "./env";

export async function signIn(page: Page, email = USER.email, password = USER.password) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]", { hasText: text }).first()).toBeVisible();
}

/** The "Net poker profit" headline on the all-time dashboard, e.g. "+$155.50". */
export async function netProfit(page: Page): Promise<string> {
  await page.goto("/?range=all");
  const text = await page.getByRole("region", { name: "Headline metrics" }).innerText();
  return /NET POKER PROFIT[^\n]*\n+\s*([+-]?\$[\d,.]+)/i.exec(text)?.[1] ?? text;
}

export async function ensureAccount(page: Page, name = "Live CAD", opening = "5000") {
  await page.goto("/bankroll");
  if (await page.getByText(name, { exact: true }).first().isVisible().catch(() => false)) return;
  await page.goto("/bankroll?new=account");
  await page.fill("#acc-name", name);
  await page.fill("#acc-open", opening);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/bankroll\/[0-9a-f-]{36}/);
}
