import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = ["/", "/sessions", "/sessions/new", "/bankroll", "/expenses", "/analytics", "/calendar", "/goals", "/reports", "/settings", "/settings/import", "/settings/lists"];

test("no page scrolls sideways on a phone", async ({ page }) => {
  await signIn(page);
  for (const path of PAGES) {
    await page.goto(path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test("bottom navigation reaches Settings", async ({ page }) => {
  await signIn(page);
  await page.getByRole("navigation").getByRole("button", { name: /More/ }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
