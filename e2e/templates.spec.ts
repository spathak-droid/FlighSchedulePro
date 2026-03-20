import { test, expect } from '@playwright/test';
import { loginAsMockUser } from './helpers';

test.describe('Templates Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('.sidebar-nav-item:has-text("Templates")');
    await expect(page).toHaveURL(/\/templates/);
  });

  test('displays notification templates title', async ({ page }) => {
    await expect(
      page.locator("h1:has-text('Templates'), h1:has-text('Notification')").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows template sections', async ({ page }) => {
    // Should show at least one template type section
    const hasTemplates = await page
      .locator('text=Waitlist, text=Reschedule, text=Discovery')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasTemplates).toBeTruthy();
  });
});
