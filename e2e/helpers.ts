import { Page } from '@playwright/test';

/**
 * Login helper — authenticates as a mock user and navigates to dashboard.
 */
export async function loginAsMockUser(page: Page, email = 'sarah@skywest.edu') {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', 'testpass');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
}
