import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const DIR = '/Users/san/Desktop/Gauntlet/FlighSchedulePro/test-screenshots';
mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('sw.js')) errors.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', e => errors.push(`PAGE: ${e.message}`));

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'sarah@skywest.edu');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Discovery flow
  console.log('=== DISCOVERY FLOW ===');
  await page.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Fill form
  const inputs = await page.locator('form input[type="text"]').all();
  await inputs[0].fill('Jane');
  await inputs[1].fill('Doe');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill('jane.doe@example.com');
  await page.waitForTimeout(500);

  console.log('  Filled form');

  // Submit
  const submitBtn = page.locator('form button[type="submit"]');
  await submitBtn.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${DIR}/disc-01-results.png`, fullPage: true });

  // Check results
  const slotCount = await page.locator('button:has-text("Confirm Booking")').count();
  console.log(`  Slots found: ${slotCount}`);

  if (slotCount > 0) {
    // Click first Confirm Booking
    const confirmBtn = page.locator('button:has-text("Confirm Booking")').first();
    const beforeErrors = errors.length;
    await confirmBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${DIR}/disc-02-confirmed.png`, fullPage: true });

    const newErrors = errors.slice(beforeErrors);
    if (newErrors.length > 0) {
      console.log(`  CONFIRM FAILED:`);
      for (const e of newErrors) console.log(`    ${e}`);
    } else {
      console.log('  CONFIRM OK — no network errors');
    }

    // Check confirmation card
    const confirmationVisible = await page.locator('text=Booking Confirmed').isVisible().catch(() => false);
    console.log(`  Confirmation card visible: ${confirmationVisible}`);

    const emailSent = await page.locator('text=email sent, text=Confirmation email').isVisible().catch(() => false);
    console.log(`  Email sent notice: ${emailSent}`);

    const bookAnotherBtn = await page.locator('button:has-text("Book Another")').isVisible().catch(() => false);
    console.log(`  Book Another button: ${bookAnotherBtn}`);

    // Verify other slots are gone (expired)
    const remainingSlots = await page.locator('button:has-text("Confirm Booking")').count();
    console.log(`  Remaining slots after booking: ${remainingSlots} (should be 0)`);
  }

  console.log(`\nTotal errors: ${errors.length}`);
  for (const e of errors) console.log(`  ${e}`);

  await browser.close();
}

run().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
