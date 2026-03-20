import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const SCREENSHOTS_DIR = '/Users/san/Desktop/Gauntlet/FlighSchedulePro/test-screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const errors = [];
const warnings = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ page: page.url(), message: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    errors.push({ page: page.url(), message: err.message });
  });

  // 1. LOGIN PAGE
  console.log('\n=== LOGIN PAGE ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-login.png`, fullPage: true });
  console.log('  Screenshot: 01-login.png');

  // Login
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  const passwordInput = page.locator('input[type="password"]');

  if (await emailInput.count() > 0) {
    await emailInput.fill('sarah@skywest.edu');
    await passwordInput.fill('password');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-login-filled.png` });

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login")');
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-after-login.png`, fullPage: true });
      console.log(`  After login URL: ${page.url()}`);
    } else {
      console.log('  WARNING: No submit button found');
      warnings.push({ page: 'login', message: 'No submit button found' });
    }
  } else {
    console.log('  WARNING: No email input found');
    warnings.push({ page: 'login', message: 'No email input found' });
  }

  // 2. DASHBOARD
  console.log('\n=== DASHBOARD ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-dashboard.png`, fullPage: true });
  console.log('  Screenshot: 04-dashboard.png');

  // Check for visible elements
  const statCards = await page.locator('.stat-card').count();
  console.log(`  Stat cards visible: ${statCards}`);

  // Check weather widget
  const weatherText = await page.locator('text=Weather, text=VFR, text=IFR, text=MVFR').count();
  console.log(`  Weather elements: ${weatherText}`);

  // Check insights panel
  const insightsText = await page.locator('text=Inactive, text=Checkride, text=At Risk').count();
  console.log(`  Insights elements: ${insightsText}`);

  // Check flight alerts
  const alertsText = await page.locator('text=Flight Alert, text=Overdue, text=Maintenance').count();
  console.log(`  Alert elements: ${alertsText}`);

  // 3. QUEUE PAGE
  console.log('\n=== QUEUE PAGE ===');
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-queue.png`, fullPage: true });
  console.log('  Screenshot: 05-queue.png');

  const tableRows = await page.locator('tr.suggestion-row, table tbody tr').count();
  console.log(`  Table rows: ${tableRows}`);

  // Check disruption banner
  const disruptionBanner = await page.locator('text=disruption, text=Disruption, text=maintenance').count();
  console.log(`  Disruption elements: ${disruptionBanner}`);

  // Try approve button
  const approveBtn = await page.locator('button:has-text("Approve"), button[title*="Approve"]').first();
  if (await approveBtn.isVisible().catch(() => false)) {
    console.log('  Approve button found and visible');
  }

  // Try expanding a suggestion rationale
  const expandBtn = await page.locator('button[aria-expanded], .suggestion-row button, td button').first();
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-queue-expanded.png`, fullPage: true });
    console.log('  Screenshot: 06-queue-expanded.png (rationale expanded)');

    // Check for AI badge
    const aiBadge = await page.locator('text=AI').count();
    console.log(`  AI badge visible: ${aiBadge > 0}`);
  }

  // 4. DISCOVERY PAGE
  console.log('\n=== DISCOVERY PAGE ===');
  await page.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-discovery.png`, fullPage: true });
  console.log('  Screenshot: 07-discovery.png');

  // Fill and submit discovery form
  const fnInput = page.locator('input[placeholder*="John"], input:near(:text("First Name"))').first();
  const lnInput = page.locator('input[placeholder*="Smith"], input:near(:text("Last Name"))').first();

  if (await fnInput.isVisible().catch(() => false)) {
    await fnInput.fill('Test');
    await lnInput.fill('Pilot');

    const findBtn = page.locator('button:has-text("Find Available"), button[type="submit"]').first();
    if (await findBtn.isVisible().catch(() => false)) {
      await findBtn.click();
      await page.waitForTimeout(5000); // Wait for solver
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-discovery-results.png`, fullPage: true });
      console.log('  Screenshot: 08-discovery-results.png');

      // Check if results show names not IDs
      const instName = await page.locator('text=James Wilson, text=Lisa Park, text=David Kim').count();
      const instId = await page.locator('text=inst-001, text=inst-002, text=inst-003').count();
      console.log(`  Instructor names visible: ${instName}`);
      console.log(`  Instructor IDs visible (BAD): ${instId}`);
      if (instId > 0) warnings.push({ page: 'discovery', message: 'Still showing instructor IDs instead of names' });

      // Check confirm booking button
      const confirmBtn = page.locator('button:has-text("Confirm Booking")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        console.log('  Confirm Booking button visible');
        await confirmBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-discovery-after-confirm.png`, fullPage: true });
        console.log('  Screenshot: 09-discovery-after-confirm.png');

        // Check for error toast
        const errorToast = await page.locator('.dark-toast-error, text=Failed, text=error').count();
        if (errorToast > 0) {
          const toastText = await page.locator('.dark-toast-error, [class*="toast"]').textContent().catch(() => '');
          console.log(`  ERROR: Confirm booking failed: ${toastText}`);
          warnings.push({ page: 'discovery', message: `Confirm booking error: ${toastText}` });
        } else {
          console.log('  Confirm booking appears successful');
        }
      }
    }
  }

  // 5. POLICIES PAGE
  console.log('\n=== POLICIES PAGE ===');
  await page.goto(`${BASE}/policies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-policies.png`, fullPage: true });
  console.log('  Screenshot: 10-policies.png');

  // Check for feature flags section
  const flagSection = await page.locator('text=Feature Flags, text=feature flag').count();
  console.log(`  Feature flags section: ${flagSection > 0}`);

  // Check for automation section
  const autoSection = await page.locator('text=Auto-Approve, text=Automation').count();
  console.log(`  Automation section: ${autoSection > 0}`);

  // 6. TEMPLATES PAGE
  console.log('\n=== TEMPLATES PAGE ===');
  await page.goto(`${BASE}/templates`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/11-templates.png`, fullPage: true });
  console.log('  Screenshot: 11-templates.png');

  const templateCards = await page.locator('text=Waitlist, text=Reschedule, text=Discovery, text=Next Lesson').count();
  console.log(`  Template type labels: ${templateCards}`);

  // Check for old template types
  const oldTypes = await page.locator('text=suggestion_ready, text=booking_confirmed, text=cancellation_notice, text=waitlist_update').count();
  if (oldTypes > 0) {
    console.log(`  WARNING: Old template types still visible: ${oldTypes}`);
    warnings.push({ page: 'templates', message: 'Old template type names still showing' });
  }

  // 7. CHECK ALL CONSOLE ERRORS
  console.log('\n\n========================================');
  console.log('RESULTS SUMMARY');
  console.log('========================================');

  console.log(`\nConsole Errors: ${errors.length}`);
  for (const e of errors) {
    console.log(`  [${e.page}] ${e.message.substring(0, 150)}`);
  }

  console.log(`\nWarnings: ${warnings.length}`);
  for (const w of warnings) {
    console.log(`  [${w.page}] ${w.message}`);
  }

  console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);

  await browser.close();
}

run().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
