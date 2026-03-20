import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
const DIR = '/Users/san/Desktop/Gauntlet/FlighSchedulePro/test-screenshots';
mkdirSync(DIR, { recursive: true });

const bugs = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Capture ALL network errors
  const networkErrors = [];
  page.on('response', (resp) => {
    if (resp.status() >= 400 && !resp.url().includes('sw.js') && !resp.url().includes('favicon')) {
      networkErrors.push({ url: resp.url(), status: resp.status() });
    }
  });
  page.on('pageerror', (err) => bugs.push(`PAGE ERROR: ${err.message}`));

  // Login
  console.log('=== LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'sarah@skywest.edu');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log(`  Logged in, URL: ${page.url()}`);

  // TEST 1: Queue — Approve a suggestion
  console.log('\n=== QUEUE: APPROVE ===');
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const approveBtn = page.locator('td button').first();
  if (await approveBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await approveBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`APPROVE: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
    } else {
      console.log('  OK: Approve succeeded');
    }
    await page.screenshot({ path: `${DIR}/action-01-approve.png` });
  } else {
    console.log('  SKIP: No approve button visible');
  }

  // TEST 2: Queue — Decline a suggestion
  console.log('\n=== QUEUE: DECLINE ===');
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Decline button is the red X, second button in actions
  const declineBtn = page.locator('td button').nth(1);
  if (await declineBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await declineBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`DECLINE: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
    } else {
      console.log('  OK: Decline succeeded');
    }
    await page.screenshot({ path: `${DIR}/action-02-decline.png` });
  }

  // TEST 3: Disruption — Rescan
  console.log('\n=== DISRUPTIONS: RESCAN ===');
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const rescanBtn = page.locator('button:has-text("Rescan"), button:has-text("rescan")').first();
  if (await rescanBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await rescanBtn.click();
    await page.waitForTimeout(5000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`RESCAN: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Rescan succeeded');
    }
    await page.screenshot({ path: `${DIR}/action-03-rescan.png` });
  } else {
    console.log('  SKIP: No rescan button visible');
  }

  // TEST 4: Disruption — Resolve
  console.log('\n=== DISRUPTIONS: RESOLVE ===');
  const resolveBtn = page.locator('button:has-text("Resolve")').first();
  if (await resolveBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await resolveBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`RESOLVE DISRUPTION: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Resolve succeeded');
    }
    await page.screenshot({ path: `${DIR}/action-04-resolve.png` });
  } else {
    console.log('  SKIP: No resolve button visible');
  }

  // TEST 5: Dashboard — Resolve flight alert
  console.log('\n=== FLIGHT ALERTS: RESOLVE ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const alertResolveBtn = page.locator('button:has-text("Resolve")').first();
  if (await alertResolveBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await alertResolveBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`RESOLVE ALERT: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Alert resolve succeeded');
    }
    await page.screenshot({ path: `${DIR}/action-05-alert-resolve.png` });
  } else {
    console.log('  SKIP: No alert resolve button');
  }

  // TEST 6: Discovery — Find slots + Confirm booking
  console.log('\n=== DISCOVERY: FIND + CONFIRM ===');
  await page.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const inputs = await page.locator('form input[type="text"]').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('TestAction');
    await inputs[1].fill('Pilot');
    // Set email for notification test
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('test@example.com');
    }
    const submitBtn = page.locator('form button[type="submit"]');
    if (!(await submitBtn.isDisabled())) {
      const beforeErrors = networkErrors.length;
      await submitBtn.click();
      await page.waitForTimeout(8000);
      const newErrors = networkErrors.slice(beforeErrors);
      if (newErrors.length > 0) {
        bugs.push(`DISCOVERY FIND: Network errors: ${JSON.stringify(newErrors)}`);
        console.log(`  FIND FAIL: ${JSON.stringify(newErrors)}`);
      } else {
        console.log('  FIND OK');
      }

      // Confirm booking
      const confirmBtn = page.locator('button:has-text("Confirm Booking")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        const beforeConfirm = networkErrors.length;
        await confirmBtn.click();
        await page.waitForTimeout(5000);
        const confirmErrors = networkErrors.slice(beforeConfirm);
        if (confirmErrors.length > 0) {
          bugs.push(`CONFIRM BOOKING: Network errors: ${JSON.stringify(confirmErrors)}`);
          console.log(`  CONFIRM FAIL: ${JSON.stringify(confirmErrors)}`);
          for (const e of confirmErrors) console.log(`    ${e.status} ${e.url}`);
        } else {
          console.log('  CONFIRM OK');
        }
        await page.screenshot({ path: `${DIR}/action-06-confirmed.png`, fullPage: true });
      }
    }
  }

  // TEST 7: Policies — Save
  console.log('\n=== POLICIES: SAVE ===');
  await page.goto(`${BASE}/policies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const saveBtn = page.locator('button:has-text("Save Policies")');
  if (await saveBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await saveBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`SAVE POLICIES: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Policies saved');
    }
  }

  // TEST 8: Feature flag toggle
  console.log('\n=== FEATURE FLAGS: TOGGLE ===');
  const flagToggle = page.locator('.dark-toggle').last();
  if (await flagToggle.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await flagToggle.click();
    await page.waitForTimeout(2000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`FEATURE FLAG TOGGLE: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Flag toggled');
    }
  }

  // TEST 9: Insights refresh
  console.log('\n=== INSIGHTS: REFRESH ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const refreshBtn = page.locator('button:has-text("Refresh")').first();
  if (await refreshBtn.isVisible().catch(() => false)) {
    const beforeErrors = networkErrors.length;
    await refreshBtn.click();
    await page.waitForTimeout(3000);
    const newErrors = networkErrors.slice(beforeErrors);
    if (newErrors.length > 0) {
      bugs.push(`INSIGHTS REFRESH: Network errors: ${JSON.stringify(newErrors)}`);
      console.log(`  FAIL: ${JSON.stringify(newErrors)}`);
      for (const e of newErrors) console.log(`    ${e.status} ${e.url}`);
    } else {
      console.log('  OK: Insights refreshed');
    }
  }

  // SUMMARY
  console.log('\n\n========================================');
  console.log(`BUGS FOUND: ${bugs.length}`);
  console.log('========================================');
  for (let i = 0; i < bugs.length; i++) {
    console.log(`  ${i + 1}. ${bugs[i]}`);
  }

  console.log(`\nAll network errors during session: ${networkErrors.length}`);
  for (const e of networkErrors) {
    console.log(`  ${e.status} ${e.url}`);
  }

  await browser.close();
}

run().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
