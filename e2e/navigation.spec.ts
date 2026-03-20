import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test("navigates to Queue page", async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("Queue")');
    await expect(page).toHaveURL(/\/queue/);
  });

  test("navigates to Schedule (Reservations) page", async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("Schedule")');
    await expect(page).toHaveURL(/\/reservations/);
  });

  test("navigates to Discovery page", async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("Discovery")');
    await expect(page).toHaveURL(/\/discovery/);
  });

  test("navigates to Templates page", async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("Templates")');
    await expect(page).toHaveURL(/\/templates/);
  });

  test("navigates to Policies page", async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("Policies")');
    await expect(page).toHaveURL(/\/policies/);
  });

  test("highlights active nav item", async ({ page }) => {
    const dashboardNav = page.locator(
      '.sidebar-nav-item:has-text("Dashboard")',
    );
    await expect(dashboardNav).toHaveClass(/active/);

    await page.click('.sidebar-nav-item:has-text("Queue")');
    await expect(page).toHaveURL(/\/queue/);
    const queueNav = page.locator('.sidebar-nav-item:has-text("Queue")');
    await expect(queueNav).toHaveClass(/active/);
  });

  test("topbar shows current page name", async ({ page }) => {
    await expect(page.locator(".app-topbar-title")).toContainText("Dashboard");
    await page.click('.sidebar-nav-item:has-text("Queue")');
    await expect(page.locator(".app-topbar-title")).toContainText("Queue");
  });
});
