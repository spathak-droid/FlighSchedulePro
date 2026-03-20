import { test, expect } from '@playwright/test';
import { loginAsMockUser } from './helpers';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form with email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  });

  test('logs in with valid mock credentials', async ({ page }) => {
    await loginAsMockUser(page);
    await expect(page).toHaveURL(/\/dashboard/);
    const token = await page.evaluate(() => localStorage.getItem('fsp_auth_token'));
    expect(token).toBeTruthy();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bad@email.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 10000 });
  });

  test('logout clears token and redirects to login', async ({ page }) => {
    await loginAsMockUser(page);
    await page.click('button:has-text("Sign Out")');
    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('fsp_auth_token'));
    expect(token).toBeNull();
  });
});
