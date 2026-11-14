/*
 * Browser tests against the local server (real HTTP, real site code, engine in Node).
 * Run: node --test tests/e2e.test.js   (uses the pre-installed Playwright Chromium)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const PORT = 8799;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.CANOPY_SHOTS || '';
let server, browser;

async function steward(op, args) {
  const r = await fetch(BASE + 'dev/steward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) });
  return r.json();
}

test.before(async () => {
  const data = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-')), 'store.json');
  server = spawn(process.execPath, [path.join(__dirname, '..', 'local', 'server.js'), '--fresh', '--port', String(PORT), '--data', data], { stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => /local server/.test(String(d)) && resolve());
    server.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  browser = await chromium.launch();
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function phone() {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const responses = [];
  page.on('response', async (r) => {
    if (r.url().startsWith(BASE + 'api')) {
      try { responses.push(await r.text()); } catch (e) {}
    }
  });
  page.on('pageerror', (e) => { throw e; });
  return { context, page, responses };
}

async function noHorizontalScroll(page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `horizontal scroll: ${sw} > ${iw}`);
}

test('phone: next call shows an honest missing-link state and calendar options', async () => {
  const { context, page } = await phone();
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Next Canopy call' }).waitFor();
  assert.ok(await page.getByText('Join link coming soon').first().isVisible());
  assert.equal(await page.locator('a[href^="https://meet.google.com"]').count(), 0, 'no invented Meet link');
  assert.ok(await page.getByRole('button', { name: /Download calendar file/ }).isVisible());
  assert.ok(await page.getByText(/DEMO — sample data/).isVisible());
  await noHorizontalScroll(page);
  // Mobile menu
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Community calendar' }).click();
  await page.getByRole('heading', { name: 'Community calendar' }).waitFor();
  await noHorizontalScroll(page);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'calendar-phone.png'), fullPage: true });
  await context.close();
});

test('keyboard: skip link first, visible focus, error summary is announced and focused', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '#/forms/interest?group=grp-01');
  await page.getByRole('heading', { name: /Get involved: Repair and reuse/ }).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to main content');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await page.getByRole('button', { name: 'Send my request' }).focus();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, 'none', 'focus is visible');
  await page.keyboard.press('Enter');
  const summary = page.locator('#error-summary');
  await summary.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'error-summary');
  assert.match(await summary.textContent(), /Your name is required/);
  assert.equal(await page.locator('#f-email').getAttribute('aria-invalid'), 'true');
  await context.close();
});

test('unaffiliated person joins a contact-led group on a phone with no account; private email never reaches the browser', async () => {
  const { context, page, responses } = await phone();
  await page.goto(BASE + '#/get-involved');
  await page.getByRole('link', { name: 'I’m interested in Repair and reuse' }).click();
  await page.locator('#f-name').fill('Robin E2E');
  await page.locator('#f-email').fill('robin.e2e.private@example.org');
  await page.locator('#f-note').fill('Can fix bikes');
  await page.locator('#f-consent_share_with_contact').check();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'interest-form-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Send my request' }).click();
  const result = page.locator('#form-result');
  await result.getByText('Received').waitFor();
  assert.match(await result.textContent(), /not a member yet/);
  // Same person, second (open) group: joins immediately with a different truthful message.
  await page.goto(BASE + '#/forms/interest?group=grp-03');
  await page.locator('#f-name').fill('Robin E2E');
  await page.locator('#f-email').fill('robin.e2e.private@example.org');
  await page.locator('#f-consent_share_with_contact').check();
  await page.getByRole('button', { name: 'Send my request' }).click();
  await result.getByText(/roster/).waitFor();
  const t = (await steward('list')).tables;
  assert.equal(t.People.filter((p) => p.email_norm === 'robin.e2e.private@example.org').length, 1);
  assert.deepEqual(t.Memberships.map((m) => m.state).sort(), ['active', 'interested']);
  assert.ok(t.Notifications.some((n) => n.to === 'repair.contact@example.org' && n.status === 'simulated'));
  // Privacy: no API response and no page data contains the private address.
  await page.goto(BASE + '#/directory?tab=people');
  await page.getByRole('heading', { name: /Organizations/ }).waitFor();
  const html = await page.content();
  const storage = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  for (const blob of responses.concat([html, storage])) {
    assert.ok(!blob.includes('robin.e2e.private@example.org'), 'private email leaked');
    assert.ok(!blob.includes('sam.private@example.org'));
    assert.ok(!blob.includes('repair.contact@example.org"') || !/contact_email/.test(blob));
    assert.ok(!/private_email|submitter_email|token_hash/.test(blob));
  }
  assert.ok(await page.getByText('Sam Example (DEMO)').isVisible());
  assert.equal(await page.getByText('Private Example').count(), 0, 'no directory consent → not listed');
  await context.close();
});

test('event: submission is pending, steward approves without code, cancellation removes it', async () => {
  const { context, page } = await phone();
  await page.goto(BASE + '#/forms/event');
  await page.locator('#f-title').fill('E2E Mending Circle');
  await page.locator('#f-organizer').fill('Neighbors');
  await page.locator('#f-date').fill('2026-12-19');
  await page.locator('#f-start_time').fill('13:00');
  await page.locator('#f-venue').fill('Community room');
  await page.locator('#f-city').fill('Sandwich');
  await page.locator('#f-county').selectOption('DeKalb');
  await page.locator('#f-relevance').fill('Mending keeps clothes in use.');
  await page.locator('#f-submitter_name').fill('Kim');
  await page.locator('#f-submitter_email').fill('kim.private@example.org');
  await page.getByRole('button', { name: 'Submit event for review' }).click();
  await page.locator('#form-result').getByText(/pending review/).waitFor();
  await page.goto(BASE + '#/calendar');
  await page.getByRole('heading', { name: 'Upcoming events' }).waitFor();
  assert.equal(await page.getByText('E2E Mending Circle').count(), 0, 'pending is not public');
  // Steward view (demo stand-in for the Admin sheet menu)
  await page.goto(BASE + '#/steward');
  const row = page.locator('tr', { hasText: 'E2E Mending Circle' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.goto(BASE + '#/calendar');
  await page.getByRole('heading', { name: 'E2E Mending Circle' }).waitFor();
  await page.goto(BASE + '#/steward');
  await page.locator('tr', { hasText: 'E2E Mending Circle' }).getByRole('button', { name: 'Cancel' }).click();
  await page.locator('tr', { hasText: 'E2E Mending Circle' }).getByText('cancelled').waitFor();
  await page.goto(BASE + '#/calendar');
  await page.getByRole('heading', { name: 'Upcoming events' }).waitFor();
  assert.equal(await page.getByText('E2E Mending Circle').count(), 0, 'cancelled leaves upcoming view');
  assert.equal(await page.getByText('Cancelled Workshop (DEMO)').count(), 0);
  assert.equal(await page.getByText('Private planning session').count(), 0, 'restricted event hidden');
  await context.close();
});

test('stable room and join routes: honest when unset, forward when configured', async () => {
  const { context, page } = await phone();
  await page.route('https://meet.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Fake Meet</h1>' }));
  await page.goto(BASE + 'r/1/');
  await page.getByText(/There is no link for the “Repair and reuse” room yet/).waitFor();
  await page.goto(BASE + 'join/');
  await page.getByText(/no link for the .* call yet/).waitFor();
  await steward('patch', { table: 'Groups', id: 'grp-01', patch: { meet_url: 'https://meet.google.com/aaa-bbbb-ccc' } });
  await steward('setting', { key: 'MAIN_MEET_URL', value: 'https://meet.google.com/xyz-abcd-efg' });
  await page.goto(BASE + 'r/1/');
  await page.waitForURL('https://meet.google.com/aaa-bbbb-ccc');
  await page.goto(BASE + 'join/');
  await page.waitForURL('https://meet.google.com/xyz-abcd-efg');
  await page.goto(BASE);
  await page.getByRole('link', { name: /Join the Sat, Dec 12 call on Google Meet/ }).waitFor();
  await steward('setting', { key: 'MAIN_MEET_URL', value: '' });
  await steward('patch', { table: 'Groups', id: 'grp-01', patch: { meet_url: '' } });
  await context.close();
});

test('empty and not-found states; meetings search; screenshots', async () => {
  const { context, page } = await phone();
  await page.goto(BASE + '#/meetings/nope');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  await page.goto(BASE + '#/meetings?q=repair');
  await page.getByRole('heading', { name: 'Meetings & notes' }).waitFor();
  assert.ok(await page.getByRole('link', { name: /March 13, 2027/ }).isVisible(), 'search finds the repair-fair checkpoint');
  await page.goto(BASE + '#/meetings/mtg-2026-11-14');
  await page.getByRole('heading', { name: /Recap/ }).waitFor();
  assert.ok(await page.getByText(/Owner: Not yet assigned/).first().isVisible());
  await page.goto(BASE + '#/rooms');
  await page.getByRole('heading', { name: 'Working-group rooms' }).waitFor();
  assert.equal(await page.locator('article').count(), 10);
  await noHorizontalScroll(page);
  if (SHOTS) {
    for (const [hash, name] of [['', 'home'], ['#/get-involved', 'get-involved'], ['#/rooms', 'rooms'], ['#/directory', 'directory']]) {
      await page.goto(BASE + hash);
      await page.locator('main h1').waitFor();
      await page.screenshot({ path: path.join(SHOTS, name + '-phone.png'), fullPage: true });
    }
  }
  await context.close();
});

test('public API privacy self-check passes after all of the above', async () => {
  const r = await steward('privacy');
  assert.deepEqual(r, { ok: true, leaks: [] });
});
