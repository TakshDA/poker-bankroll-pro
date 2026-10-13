import { expect, test } from "@playwright/test";
import { ensureAccount, signIn, toast } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("theme switch applies at once and is remembered", async ({ page }) => {
  await page.locator("aside").getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("aside").getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("preferences save and persist", async ({ page }) => {
  await page.goto("/settings");
  await page.fill("#pf-name", "E2E Player");
  await page.selectOption("#pf-week", "0");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await toast(page, "Preferences saved");
  await page.reload();
  await expect(page.locator("#pf-name")).toHaveValue("E2E Player");
  await expect(page.locator("#pf-week")).toHaveValue("0");
});

test("exchange rates: validation, add and delete", async ({ page }) => {
  await page.goto("/settings/currencies");
  await page.getByRole("button", { name: "Add rate" }).first().click();
  await page.selectOption("#rt-base", "USD");
  await page.selectOption("#rt-quote", "CAD");
  await page.fill("#rt-rate", "-1");
  await page.getByRole("button", { name: "Save rate" }).click();
  await expect(page.locator("#rt-rate-error")).toBeVisible();
  await page.fill("#rt-rate", "1.365");
  await page.getByRole("button", { name: "Save rate" }).click();
  await toast(page, "Rate saved");
  await expect(page.getByText("1 USD = 1.365 CAD")).toBeVisible();
  await page.getByRole("button", { name: "Delete rate 1 USD = 1.365 CAD" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Rate deleted");
});

test("lists: add, rename, archive and delete a venue", async ({ page }) => {
  await ensureAccount(page);
  await page.goto("/settings/lists?tab=venues");
  await page.getByRole("button", { name: "Add venue" }).click();
  await page.fill("#li-name", "E2E Room");
  await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "Added");
  await page.getByRole("button", { name: "Edit E2E Room" }).click();
  await page.fill("#li-name", "E2E Card Room");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E2E Card Room")).toBeVisible();
  await page.getByRole("button", { name: "Archive E2E Card Room" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("row", { name: /E2E Card Room/ }).getByText("Archived")).toBeVisible();
  await page.getByRole("button", { name: "Delete E2E Card Room" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("E2E Card Room")).toHaveCount(0);
});

test("goals: a daily loss limit appears with progress", async ({ page }) => {
  await page.goto("/goals?new=1");
  await page.fill("#gl-name", "Stop at 200");
  await page.fill("#gl-target", "200");
  await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "Goal added");
  await expect(page.getByRole("progressbar", { name: "Stop at 200 progress" })).toBeVisible();
});
