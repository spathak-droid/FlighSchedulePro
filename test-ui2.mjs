import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const DIR = '/Users/san/Desktop/Gauntlet/FlighSchedulePro/test-screenshots';
mkdirSync(DIR, { recursive: true });

const bugs = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'sarah@skywest.edu');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Discovery — fill form properly with required fields
  console.log('=== DISCOVERY ===');
  await page.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Fill first name and last name using the actual input fields
  const inputs = await page.locator('form input[type="text"]').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('Test');
    await inputs[1].fill('Pilot');
  }
  await page.waitForTimeout(500);

  // Check if submit button is enabled now
  const submitBtn = page.locator('form button[type="submit"]');
  const isDisabled = await submitBtn.isDisabled();
  console.log(`  Submit button disabled: ${isDisabled}`);

  if (!isDisabled) {
    await submitBtn.click();
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${DIR}/12-discovery-results.png`, fullPage: true });

    // Check for IDs vs names
    const html = await page.content();
    if (html.includes('inst-001') || html.includes('inst-002') || html.includes('inst-003')) {
      bugs.push('Discovery: Still showing instructor IDs (inst-001) instead of names');
    }
    if (html.includes('ac-001') || html.includes('ac-002') || html.includes('ac-003')) {
      bugs.push('Discovery: Still showing aircraft IDs (ac-001) instead of registrations');
    }

    // Check score display
    if (html.includes('5000%') || html.includes('9250%')) {
      bugs.push('Discovery: Match scores still showing multiplied values (5000%, 9250%)');
    }

    const nameCount = (html.match(/James Wilson|Lisa Park|David Kim/g) || []).length;
    console.log(`  Instructor names found: ${nameCount}`);
    const regCount = (html.match(/N172SP|N152AB|N182RG/g) || []).length;
    console.log(`  Aircraft registrations found: ${regCount}`);
  } else {
    bugs.push('Discovery: Submit button still disabled after filling firstName + lastName');
  }

  // Policies
  console.log('\n=== POLICIES ===');
  await page.goto(`${BASE}/policies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/13-policies.png`, fullPage: true });

  const policiesHtml = await page.content();
  if (!policiesHtml.includes('Feature Flags') && !policiesHtml.includes('feature-flag')) {
    bugs.push('Policies: Feature Flags section not visible');
  }
  if (!policiesHtml.includes('Auto-Approve') && !policiesHtml.includes('auto-approve')) {
    bugs.push('Policies: Automation/Auto-Approve section not visible');
  }
  const toggleCount = await page.locator('.dark-toggle, button[class*="toggle"]').count();
  console.log(`  Toggle switches: ${toggleCount}`);

  // Templates
  console.log('\n=== TEMPLATES ===');
  await page.goto(`${BASE}/templates`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/14-templates.png`, fullPage: true });

  const templatesHtml = await page.content();
  const hasWaitlist = templatesHtml.includes('Waitlist');
  const hasReschedule = templatesHtml.includes('Reschedule');
  const hasDiscovery = templatesHtml.includes('Discovery');
  const hasNextLesson = templatesHtml.includes('Next Lesson');
  console.log(`  Template types: waitlist=${hasWaitlist} reschedule=${hasReschedule} discovery=${hasDiscovery} next_lesson=${hasNextLesson}`);

  // Check for old types
  if (templatesHtml.includes('suggestion_ready') || templatesHtml.includes('booking_confirmed')) {
    bugs.push('Templates: Old template type names (suggestion_ready, booking_confirmed) still showing');
  }
  if (!hasWaitlist && !hasReschedule) {
    bugs.push('Templates: New template types (waitlist, reschedule) not showing — templates may not be seeded correctly');
  }

  // Dashboard deep check
  console.log('\n=== DASHBOARD DEEP CHECK ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/15-dashboard-full.png`, fullPage: true });

  const dashHtml = await page.content();

  // Check for "Invalid Date" anywhere
  const invalidDateCount = (dashHtml.match(/Invalid Date/g) || []).length;
  if (invalidDateCount > 0) {
    bugs.push(`Dashboard: "${invalidDateCount}" instances of "Invalid Date" displayed`);
  }

  // Check for NaN
  const nanCount = (dashHtml.match(/\bNaN\b/g) || []).length;
  if (nanCount > 0) {
    bugs.push(`Dashboard: "${nanCount}" instances of "NaN" displayed`);
  }

  // Check for "undefined"
  const undefinedCount = (dashHtml.match(/>undefined</g) || []).length;
  if (undefinedCount > 0) {
    bugs.push(`Dashboard: "${undefinedCount}" instances of "undefined" displayed`);
  }

  // Check pending count
  const pendingMatch = dashHtml.match(/Pending[\s\S]*?(\d+)/);
  console.log(`  Pending count displayed: ${pendingMatch?.[1] ?? 'not found'}`);

  // Check acceptance rate
  const rateMatch = dashHtml.match(/(\d+\.?\d*)%/);
  console.log(`  Acceptance rate: ${rateMatch?.[1] ?? 'not found'}%`);

  // Activity feed check
  console.log('\n=== ACTIVITY FEED (sidebar) ===');
  const activityItems = await page.locator('.activity-feed-item').count();
  console.log(`  Activity feed items: ${activityItems}`);

  // Check for "Invalid Date" in activity
  const activityDates = await page.locator('.activity-feed-item').allTextContents();
  const invalidDates = activityDates.filter(t => t.includes('Invalid Date'));
  if (invalidDates.length > 0) {
    bugs.push(`Activity Feed: ${invalidDates.length} items show "Invalid Date"`);
  }

  // Scroll the dashboard to see everything
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/16-dashboard-bottom.png`, fullPage: false });

  // SUMMARY
  console.log('\n\n========================================');
  console.log('BUGS FOUND');
  console.log('========================================');

  // Add console errors as bugs
  const uniqueErrors = [...new Set(consoleErrors)];
  for (const e of uniqueErrors) {
    if (!e.includes('favicon') && !e.includes('404')) {
      bugs.push(`Console error: ${e.substring(0, 150)}`);
    }
  }

  if (bugs.length === 0) {
    console.log('  No bugs found!');
  } else {
    for (let i = 0; i < bugs.length; i++) {
      console.log(`  ${i + 1}. ${bugs[i]}`);
    }
  }

  console.log(`\nTotal console errors: ${consoleErrors.length}`);
  console.log(`Screenshots in: ${DIR}`);

  await browser.close();
}

run().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
