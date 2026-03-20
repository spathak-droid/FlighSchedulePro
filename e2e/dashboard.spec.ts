import { test, expect } from '@playwright/test';
import { loginAsMockUser } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test('displays page title and subtitle', async ({ page }) => {
    await expect(page.locator("h1:has-text('Flight Schedule')")).toBeVisible();
    await expect(page.locator('text=Manage your upcoming')).toBeVisible();
  });

  test('shows four stat cards', async ({ page }) => {
    await expect(page.locator('.stat-card')).toHaveCount(4, { timeout: 10000 });
  });

  test('displays weekly flight hours chart', async ({ page }) => {
    await expect(page.locator('text=Weekly Flight Hours')).toBeVisible({ timeout: 10000 });
  });

  test('displays acceptance rate gauge', async ({ page }) => {
    await expect(page.locator('text=Acceptance Rate')).toBeVisible({ timeout: 10000 });
  });

  test('displays quick shortcuts section', async ({ page }) => {
    await expect(page.locator('text=Quick Shortcuts')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('text=Reschedule Flight')).toBeVisible();
    await expect(page.locator('text=Export Logbook')).toBeVisible();
    await expect(page.locator('text=Request Pilot')).toBeVisible();
  });

  test('sidebar shows navigation items', async ({ page }) => {
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Queue')).toBeVisible();
    await expect(page.locator('text=Schedule')).toBeVisible();
    await expect(page.locator('text=Discovery')).toBeVisible();
  });

  test('sidebar Book New Flight button navigates to discovery', async ({ page }) => {
    await page.click('text=Book New Flight');
    await expect(page).toHaveURL(/\/discovery/);
  });
});
