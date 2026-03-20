import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers";

test.describe("Reservations (Schedule) Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('.sidebar-nav-item:has-text("Schedule")');
    await expect(page).toHaveURL(/\/reservations/);
  });

  test("displays reservations page", async ({ page }) => {
    await expect(
      page.locator("h1:has-text('Reservations'), h1:has-text('Schedule')").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows table or empty state", async ({ page }) => {
    const hasContent = await page
      .locator("table, text=No reservations, text=no reservations")
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
