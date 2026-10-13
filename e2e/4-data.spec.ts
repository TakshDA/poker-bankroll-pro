import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ensureAccount, netProfit, signIn, toast } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await ensureAccount(page);
});

test("CSV import: preview saves nothing, import adds rows, undo removes them", async ({ page }, info) => {
  const csv = info.outputPath("sessions.csv");
  await writeFile(
    csv,
    [
      "Date,Start Time,End Time,Location,Stakes,Buy-In,Cash Out",
      "01/05/2026,8:00 PM,11:00 PM,E2E Casino,1/2,$200,$350",
      "01/06/2026,8:00 PM,11:00 PM,E2E Casino,1/2,$200,$100",
      "01/06/2026,8:00 PM,11:00 PM,E2E Casino,1/2,$200,$100",
      "01/07/2026,bad,11:00 PM,E2E Casino,1/2,$200,$100",
    ].join("\n"),
  );
  const before = await netProfit(page);
  await page.goto("/settings/import");
  await page.setInputFiles("input[type=file]", csv);
  await page.getByRole("button", { name: /Check 4 rows/ }).click();
  await expect(page.getByText("2 ready")).toBeVisible();
  await expect(page.getByRole("radio", { name: /1 duplicate/ })).toBeVisible();
  await expect(page.getByText('"bad" is not a time')).toBeVisible();
  expect(await netProfit(page)).toBe(before);

  await page.goto("/settings/import");
  await page.setInputFiles("input[type=file]", csv);
  await page.getByRole("button", { name: /Check 4 rows/ }).click();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await toast(page, "Imported 2 records");
  expect(await netProfit(page)).not.toBe(before);

  await page.goto("/settings/import");
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Undo import" }).click();
  await toast(page, "2 records removed");
  expect(await netProfit(page)).toBe(before);
});

test("backup download and restore round-trip", async ({ page }, info) => {
  const before = await netProfit(page);
  await page.goto("/settings/backup");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download backup" }).click()]);
  const file = info.outputPath("backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(await readFile(file, "utf8"));
  expect(backup.format).toBe("poker-bankroll-pro/backup");

  // Change something, then restore the backup over it.
  await page.goto("/bankroll?new=account");
  await page.fill("#acc-name", "Temporary");
  await page.fill("#acc-open", "1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/bankroll\/[0-9a-f-]{36}/);

  await page.goto("/settings/backup");
  await page.setInputFiles("input[type=file]", file);
  await page.fill("#rs-confirm", "RESTORE");
  await page.getByRole("button", { name: /Replace my data/ }).click();
  await toast(page, /Restored \d+ records/);
  await page.goto("/bankroll");
  await expect(page.getByText("Temporary")).toHaveCount(0);
  expect(await netProfit(page)).toBe(before);
});
