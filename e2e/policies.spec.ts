import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers";

test.describe("Policies Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('.sidebar-nav-item:has-text("Policies")');
    await expect(page).toHaveURL(/\/policies/);
  });

  test("displays scheduling policies title", async ({ page }) => {
    await expect(
      page.locator("h1:has-text('Policies'), h1:has-text('Scheduling')").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows waitlist priority weights section", async ({ page }) => {
    await expect(
      page.locator("text=Waitlist").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows search window configuration", async ({ page }) => {
    await expect(
      page.locator("text=Search Window").first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
