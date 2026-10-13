import { expect, test } from "@playwright/test";
import { ensureAccount, netProfit, signIn, toast } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await ensureAccount(page);
});

test("logging a cash session updates the dashboard; trash and restore follow", async ({ page }) => {
  const before = await netProfit(page);
  await page.goto("/sessions/new");
  await page.fill("#startTime", "21:00");
  await page.fill("#endTime", "02:30");
  await page.fill("#smallBlind", "1");
  await page.fill("#bigBlind", "2");
  await page.fill("#buyIn", "300");
  await page.fill("#cashOut", "455.50");
  await page.getByRole("button", { name: "Save session" }).click();
  await page.waitForURL(/sessions\/[0-9a-f-]{36}$/);
  await expect(page.getByText("+$155.50").first()).toBeVisible();
  const url = page.url();
  expect(await netProfit(page)).not.toBe(before);

  await page.goto(url);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Trash" }).click();
  await page.waitForURL(/\/sessions$/);
  expect(await netProfit(page)).toBe(before);

  await page.goto("/settings/trash");
  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await toast(page, "Restored");
  expect(await netProfit(page)).not.toBe(before);
});

test("an invalid session is refused with a field error and keeps the input", async ({ page }) => {
  await page.goto("/sessions/new");
  await page.fill("#buyIn", "300");
  await page.fill("#cashOut", "-5");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.locator("#cashOut-error, [id$='cashOut-error']").first()).toBeVisible();
  await expect(page.locator("#buyIn")).toHaveValue("300");
});
