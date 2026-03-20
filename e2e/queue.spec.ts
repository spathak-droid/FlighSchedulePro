import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers";

test.describe("Queue Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('.sidebar-nav-item:has-text("Queue")');
    await expect(page).toHaveURL(/\/queue/);
  });

  test("displays page title", async ({ page }) => {
    await expect(page.locator("h1:has-text('Approval Queue')")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows filter bar", async ({ page }) => {
    await expect(
      page.locator('select, [class*="filter"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("displays suggestions or empty state", async ({ page }) => {
    // Either shows suggestion rows or an empty state message
    const hasContent = await page
      .locator("table tbody tr, [class*='empty'], text=No suggestions")
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
