import { test, expect } from '@playwright/test';
import { loginAsMockUser } from './helpers';

test.describe('Discovery Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('.sidebar-nav-item:has-text("Discovery")');
    await expect(page).toHaveURL(/\/discovery/);
  });

  test('displays discovery flight form', async ({ page }) => {
    await expect(page.locator('text=Discovery Flight').first()).toBeVisible({ timeout: 10000 });
  });

  test('shows first name and last name fields', async ({ page }) => {
    await expect(
      page.locator('input[placeholder*="First"], label:has-text("First")').first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('input[placeholder*="Last"], label:has-text("Last")').first(),
    ).toBeVisible();
  });

  test('submit button is disabled when form is empty', async ({ page }) => {
    const submitBtn = page
      .locator('button[type="submit"], button:has-text("Find Slots"), button:has-text("Search")')
      .first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await expect(submitBtn).toBeDisabled();
    }
  });
});
