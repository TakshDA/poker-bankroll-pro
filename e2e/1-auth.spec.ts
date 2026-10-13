import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { USER } from "./env";

test("signed-out visitors are sent to sign in, and wrong passwords are refused", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login/);
  await page.fill("#email", USER.email);
  await page.fill("#password", "not-the-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("sign in and sign out", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL("/");
  await expect(page.locator("aside").getByText("e2e@example.com")).toBeVisible();
  await page.locator("aside").getByRole("button", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("data API gives nothing without a session", async ({ request }) => {
  const res = await request.get("/api/export?entity=backup&format=json", { maxRedirects: 0 });
  expect([307, 401]).toContain(res.status());
  expect(await res.text()).not.toContain("poker-bankroll-pro/backup");
});
