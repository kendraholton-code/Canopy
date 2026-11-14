/* Engine tests — run with: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const C = require('../core');

function makeCtx(iso) {
  let now = new Date(iso || '2026-11-20T16:00:00Z');
  return { now: () => now, uuid: () => crypto.randomUUID(), set: (d) => (now = new Date(d)), advance: (ms) => (now = new Date(now.getTime() + ms)) };
}
function prod(ctx) {
  return C.seedProduction(new C.MemoryStore(), ctx);
}
function demo(ctx) {
  return C.seedDemo(new C.MemoryStore(), ctx);
}
function assignRoles(store, roles) {
  Object.keys(roles).forEach((r) => store.update('Roles', r, { email: roles[r] }));
}
function activateGroup(store, id, patch) {
  C.approve(store, makeCtx(), 't', 'Groups', id);
  store.update('Groups', id, Object.assign({ group_status: 'active', intake: 'open' }, patch));
}
const interest = (extra) => Object.assign({ action: 'submit', type: 'interest', name: 'Robin Neighbor', email: 'robin.private@example.org', participation: 'independent', consent_share_with_contact: 'yes' }, extra);
const notif = (store, pred) => store.list('Notifications').filter(pred || (() => true));

/* ---------------- meetings & time ---------------- */
test('seeds 13 future second-Saturday calls Dec 2026–Dec 2027 at 10 a.m. Chicago, all draft', () => {
  const s = prod(makeCtx());
  const future = s.list('Meetings').filter((m) => m.date >= '2026-12-01').sort((a, b) => (a.date < b.date ? -1 : 1));
  assert.equal(future.length, 13);
  assert.deepEqual(future.map((m) => m.date), ['2026-12-12', '2027-01-09', '2027-02-13', '2027-03-13', '2027-04-10', '2027-05-08', '2027-06-12', '2027-07-10', '2027-08-14', '2027-09-11', '2027-10-09', '2027-11-13', '2027-12-11']);
  future.forEach((m) => {
    assert.equal(m.status, 'draft');
    assert.equal(m.start_time, '10:00');
    assert.equal(m.meet_url, '', 'no invented Meet URL');
    const [y, mo, d] = m.date.split('-').map(Number);
    assert.equal(C.time.weekday(y, mo, d), 6);
    assert.ok(d >= 8 && d <= 14, 'second Saturday');
  });
  assert.match(s.get('Meetings', 'mtg-2027-04-10').decision_needed, /Earth Fest/);
});

test('10 a.m. Chicago keeps its wall-clock time across daylight-saving changes', () => {
  assert.equal(C.time.localToIso('2027-03-13', '10:00'), '2027-03-13T10:00:00-06:00'); // day before DST starts
  assert.equal(C.time.localToIso('2027-04-10', '10:00'), '2027-04-10T10:00:00-05:00');
  assert.equal(C.time.localToIso('2027-11-13', '10:00'), '2027-11-13T10:00:00-06:00'); // after DST ends Nov 7
  assert.equal(C.time.localToIso('2027-11-07', '01:30'), '2027-11-07T01:30:00-05:00');
  ['2026-12-12', '2027-03-13', '2027-04-10', '2027-07-10', '2027-11-13'].forEach((d) => {
    const inst = C.time.localToDate(d, '10:00');
    assert.deepEqual(C.time.toChicago(inst), { date: d, time: '10:00' });
    // Cross-check with the runtime's time-zone database.
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(inst);
    assert.equal(fmt, '10:00');
  });
  const ics = C.time.buildIcs([{ uid: 'x', date: '2027-04-10', start: '10:00', end: '11:00', title: 'Call' }], 'Canopy');
  assert.match(ics, /DTSTART;TZID=America\/Chicago:20270410T100000/);
  assert.match(ics, /BEGIN:VTIMEZONE[\s\S]*BYDAY=2SU/);
});

/* ---------------- publication & privacy ---------------- */
test('production seed publishes nothing until a steward approves; draft recap stays private', () => {
  const ctx = makeCtx();
  const s = prod(ctx);
  const snap = C.buildPublicSnapshot(s, ctx);
  assert.equal(snap.meetings.length, 0);
  assert.equal(snap.recaps.length, 0);
  assert.equal(snap.groups.length, 0);
  assert.equal(snap.organizations.length, 0);
  assert.equal(s.get('Recaps', 'rcp-2026-11-14').status, 'draft');
  assert.equal(snap.settings.MAIN_MEET_CONFIGURED, false);
});

test('a steward approval publishes without code; unpublish removes it; who/when is recorded', () => {
  const ctx = makeCtx();
  const s = prod(ctx);
  C.approve(s, ctx, 'steward.one@example.org', 'Meetings', 'mtg-2026-12-12');
  let snap = C.buildPublicSnapshot(s, ctx);
  assert.equal(snap.meetings.length, 1);
  assert.equal(snap.meetings[0].join_url, '', 'shows "link coming soon" until configured');
  const row = s.get('Meetings', 'mtg-2026-12-12');
  assert.equal(row.approved_by, 'steward.one@example.org');
  assert.ok(row.approved_at);
  C.setSetting(s, 'MAIN_MEET_URL', 'https://meet.google.com/abc-defg-hij');
  assert.equal(C.buildPublicSnapshot(s, ctx).meetings[0].join_url, 'https://meet.google.com/abc-defg-hij');
  C.unpublish(s, ctx, 'steward.two@example.org', 'Meetings', 'mtg-2026-12-12');
  snap = C.buildPublicSnapshot(s, ctx);
  assert.equal(snap.meetings.length, 0);
  assert.ok(s.list('Audit').some((a) => a.actor === 'steward.two@example.org' && /unpublished/.test(a.action)));
});

test('cancelled meeting stays visible with reason and no join link', () => {
  const ctx = makeCtx();
  const s = prod(ctx);
  C.setSetting(s, 'MAIN_MEET_URL', 'https://meet.google.com/abc-defg-hij');
  C.approve(s, ctx, 'st', 'Meetings', 'mtg-2027-04-10');
  C.cancel(s, ctx, 'st', 'Meetings', 'mtg-2027-04-10', 'Moved for Earth Fest');
  const m = C.buildPublicSnapshot(s, ctx).meetings[0];
  assert.equal(m.cancelled, true);
  assert.equal(m.join_url, '');
  assert.equal(m.cancelled_reason, 'Moved for Earth Fest');
});

test('private emails, tokens, notes and restricted events never appear in public JSON or iCal', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.handlePost(s, ctx, interest({ group_id: 'grp-01', note: 'secret-note-123' }), null);
  C.handlePost(s, ctx, { action: 'submit', type: 'event', title: 'Tree planting', organizer: 'Neighbors', date: '2026-12-05', start_time: '10:00', venue: 'Park', city: 'DeKalb', county: 'DeKalb', relevance: 'Trees', submitter_name: 'Al', submitter_email: 'al.private@example.org' }, null);
  // approve everything pending to stress the allowlist
  C.schema.editorial.forEach((t) => s.list(t).forEach((r) => r.status === 'pending' && C.approve(s, ctx, 'st', t, r.id)));
  const json = JSON.stringify(C.buildPublicSnapshot(s, ctx));
  const ics = C.buildPublicIcs(s, ctx, '');
  ['robin.private@example.org', 'al.private@example.org', 'sam.private@example.org', 'private.person@example.org', 'submitter.private@example.org', 'steward.private@example.org', 'secret-note-123', 'intake.steward@example.org', 'events.steward@example.org'].forEach((secret) => {
    assert.ok(!json.includes(secret), 'JSON leaks ' + secret);
    assert.ok(!ics.includes(secret), 'ICS leaks ' + secret);
  });
  assert.ok(!json.includes('Private planning session'), 'restricted event leaked');
  assert.ok(!ics.includes('Private planning session'));
  assert.ok(!json.includes('Private Example'), 'person without directory consent listed');
  assert.ok(!/token_hash|private_email|submitter_email|contact_email|email_norm|steward_note|source_excerpt/.test(json));
  assert.deepEqual(C.privacyAudit(s, ctx), { ok: true, leaks: [] });
});

test('privacy audit catches a leak if a steward pastes a private email into a public field', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  s.update('Organizations', 'org-demo-repair', { description: 'Contact sam.private@example.org' });
  const r = C.privacyAudit(s, ctx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.leaks, ['sam.private@example.org']);
});

test('demo content is hidden unless SHOW_DEMO_CONTENT = yes', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  assert.ok(C.buildPublicSnapshot(s, ctx).events.every((e) => e.demo));
  C.setSetting(s, 'SHOW_DEMO_CONTENT', 'no');
  const snap = C.buildPublicSnapshot(s, ctx);
  assert.equal(snap.events.length, 0);
  assert.equal(snap.organizations.length, 0);
});

/* ---------------- events: pending, correction, cancellation ---------------- */
test('event submission is pending; correction updates the right record; cancellation leaves upcoming views', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const res = C.handlePost(s, ctx, { action: 'submit', type: 'event', client_id: 'e1', title: 'Seed Library Day', organizer: 'Example Native Garden Club (DEMO)', date: '2026-12-19', start_time: '1:00 pm', end_time: '15:00', venue: 'Library', city: 'Genoa', county: 'DeKalb', relevance: 'Native seeds', submitter_name: 'Kim', submitter_email: 'kim@example.org' }, null).body;
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending_review');
  const ev = s.get('Events', res.reference);
  assert.equal(ev.status, 'pending');
  assert.equal(ev.start_time, '13:00');
  assert.equal(ev.organization_id, 'org-demo-garden');
  assert.ok(!C.buildPublicSnapshot(s, ctx).events.some((e) => e.id === ev.id), 'pending event is not public');
  assert.equal(notif(s, (n) => n.kind === 'event_review').length, 1);

  C.approve(s, ctx, 'events steward', 'Events', ev.id);
  assert.ok(C.buildPublicSnapshot(s, ctx).events.some((e) => e.id === ev.id));

  // Organizer correction through the private link from their acknowledgement email.
  const ack = notif(s, (n) => n.kind === 'acknowledgement' && n.related === 'Events:' + ev.id)[0];
  const token = /manage\?t=([a-f0-9]+)/.exec(ack.body)[1];
  const info = C.tokenInfo(s, ctx, 'manage', token);
  assert.equal(info.event.title, 'Seed Library Day');
  const cor = C.handlePost(s, ctx, { action: 'token', kind: 'manage', token, op: 'correct', changes: { venue: 'Genoa Public Library, Room B', title: 'Seed Library Day' } }, null).body;
  assert.equal(cor.ok, true);
  const other = s.list('Events').find((e) => e.id === 'evt-demo-1');
  C.applyCorrection(s, ctx, 'events steward', cor.reference);
  assert.equal(s.get('Events', ev.id).venue, 'Genoa Public Library, Room B');
  assert.equal(s.get('Events', 'evt-demo-1').venue, other.venue, 'other records untouched');
  assert.equal(s.get('Corrections', cor.reference).state, 'resolved');

  // Cancellation via private link removes it from upcoming views.
  C.handlePost(s, ctx, { action: 'token', kind: 'manage', token, op: 'cancel', reason: 'Weather' }, null);
  assert.equal(s.get('Events', ev.id).status, 'cancelled');
  assert.ok(!C.buildPublicSnapshot(s, ctx).events.some((e) => e.id === ev.id));
  assert.equal(C.tokenInfo(s, ctx, 'manage', 'not-a-real-token-xxxxxxxxxxxx').ok, false);
});

test('expired events leave upcoming views automatically but remain in history', () => {
  const ctx = makeCtx('2026-11-20T16:00:00Z');
  const s = demo(ctx);
  const snap = C.buildPublicSnapshot(s, ctx);
  const past = snap.events.filter((e) => new Date(e.end_iso) < ctx.now());
  assert.ok(past.length >= 1);
  assert.equal(s.get('Events', 'evt-demo-3').status, 'approved', 'not deleted or archived');
});

test('event validation rejects bad input with field messages', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, { action: 'submit', type: 'event', title: '', date: '2026-02-30', start_time: '25:00', county: 'Mars', source_url: 'javascript:alert(1)', submitter_email: 'nope' }, null).body;
  assert.equal(r.ok, false);
  ['title', 'organizer', 'date', 'start_time', 'venue', 'county', 'relevance', 'source_url', 'submitter_name', 'submitter_email'].forEach((f) => assert.ok(r.errors[f], 'missing error for ' + f));
});

/* ---------------- get involved ---------------- */
test('unaffiliated contact-led request: saved, acknowledged truthfully, routed to the group contact only', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-01', note: 'I can fix lamps' }), null).body;
  assert.equal(r.status, 'routed');
  assert.equal(r.membership_state, 'interested');
  assert.match(r.message, /not a member yet/);
  const mem = s.get('Memberships', r.reference);
  assert.equal(mem.state, 'interested');
  assert.equal(mem.routed_to, 'repair.contact@example.org');
  const toContact = notif(s, (n) => n.to === 'repair.contact@example.org');
  assert.equal(toContact.length, 1);
  assert.match(toContact[0].body, /I can fix lamps/);
  assert.match(toContact[0].body, /respond\?t=/);
  const ack = notif(s, (n) => n.to === 'robin.private@example.org');
  assert.equal(ack.length, 1);
  assert.doesNotMatch(ack[0].body, /you are now a member/i);
  assert.equal(s.list('Affiliations').filter((a) => a.person_id === mem.person_id).length, 0, 'no organization required');
  assert.equal(s.get('People', mem.person_id).directory_consent, 'no', 'interest does not publish anyone');
  assert.ok(s.list('Submissions').some((x) => x.id && x.type === 'interest'), 'raw submission persisted');
});

test('open-enrollment group adds the person immediately and says so', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-03' }), null).body;
  assert.equal(r.status, 'joined');
  assert.equal(r.membership_state, 'active');
  assert.match(r.message, /on the Storytelling and community learning roster/);
  assert.equal(notif(s, (n) => n.kind === 'group_join_fyi').length, 1);
  assert.match(notif(s, (n) => n.kind === 'acknowledgement')[0].body, /Welcome to the group|Welcome!|roster/);
});

test('returning participant: second group reuses the same person; duplicate request creates nothing new', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.handlePost(s, ctx, interest({ group_id: 'grp-01', client_id: 'a' }), null);
  const n1 = notif(s).length;
  const second = C.handlePost(s, ctx, interest({ group_id: 'grp-03', client_id: 'b', name: 'Robin N.' }), null).body;
  assert.equal(s.list('People').filter((p) => p.email_norm === 'robin.private@example.org').length, 1);
  assert.equal(second.status, 'joined');
  const n2 = notif(s).length;
  const dup = C.handlePost(s, ctx, interest({ group_id: 'grp-01', client_id: 'c' }), null).body;
  assert.equal(dup.status, 'duplicate');
  assert.equal(notif(s).length, n2, 'no email flood on duplicate');
  assert.ok(n2 > n1);
  assert.equal(s.list('Memberships').filter((m) => m.group_id === 'grp-01').length, 1);
  assert.match(s.list('People').find((p) => p.email_norm === 'robin.private@example.org').steward_note, /Robin N\./, 'name difference noted, not overwritten');
});

test('retrying the same submission (same client_id) is idempotent', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const a = C.handlePost(s, ctx, interest({ group_id: 'grp-01', client_id: 'same-id' }), null).body;
  const count = [s.list('Memberships').length, notif(s).length, s.list('Submissions').length];
  const b = C.handlePost(s, ctx, interest({ group_id: 'grp-01', client_id: 'same-id' }), null).body;
  assert.equal(b.reference, a.reference);
  assert.equal(b.replayed, true);
  assert.deepEqual([s.list('Memberships').length, notif(s).length, s.list('Submissions').length], count);
});

test('no group contact and no intake steward: recorded honestly, nobody (not Kendra) is emailed', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  s.update('Roles', 'intake_steward', { email: '' });
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-04' }), null).body; // grp-04 has no contact
  assert.equal(r.status, 'recorded_unassigned');
  assert.match(r.message, /no one has been assigned to follow up yet/);
  const sent = notif(s);
  assert.equal(sent.length, 1, 'only the acknowledgement');
  assert.equal(sent[0].to, 'robin.private@example.org');
  assert.ok(C.reviewQueue(s, ctx).unassigned.length >= 1, 'visible to stewards');
});

test('help-me-find-a-place routes to the designated intake steward', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'help' }), null).body;
  assert.equal(r.status, 'routed');
  assert.equal(notif(s, (n) => n.kind === 'intake_request')[0].to, 'intake.steward@example.org');
});

test('closed or full groups waitlist instead of silently dropping', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  s.update('Groups', 'grp-03', { capacity: '1' });
  C.handlePost(s, ctx, interest({ group_id: 'grp-03', email: 'first@example.org' }), null);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-03', email: 'second@example.org' }), null).body;
  assert.equal(r.status, 'waitlisted');
  assert.match(r.message, /isn’t taking new people right now/);
  s.update('Groups', 'grp-01', { intake: 'paused' });
  assert.equal(C.handlePost(s, ctx, interest({ group_id: 'grp-01', email: 'third@example.org' }), null).body.status, 'waitlisted');
});

test('sharing consent is required before details go to a contact', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-01', consent_share_with_contact: '' }), null).body;
  assert.equal(r.ok, false);
  assert.ok(r.errors.consent_share_with_contact);
  assert.equal(notif(s).length, 0);
});

test('self-reported affiliations never create organizations or imply endorsement', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const orgs = s.list('Organizations').length;
  C.handlePost(s, ctx, interest({ group_id: 'grp-01', participation: 'organization', affiliations: [{ name: 'Example Repair Collective (DEMO)' }, { name: 'Brand New Group' }] }), null);
  assert.equal(s.list('Organizations').length, orgs);
  const affs = s.list('Affiliations').filter((a) => a.verification === 'self_reported');
  assert.equal(affs.length, 2);
  assert.equal(affs.find((a) => a.org_name_reported === 'Example Repair Collective (DEMO)').organization_id, 'org-demo-repair');
  assert.equal(affs.find((a) => a.org_name_reported === 'Brand New Group').organization_id, '');
  assert.ok(affs.every((a) => a.status === 'pending'));
});

test('contact can welcome via private link; participant can withdraw; both are truthful', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), null).body;
  const route = notif(s, (n) => n.kind === 'group_interest')[0];
  const respond = /respond\?t=([a-f0-9]+)/.exec(route.body)[1];
  assert.equal(C.tokenInfo(s, ctx, 'respond', respond).label, 'Repair and reuse');
  const w = C.handlePost(s, ctx, { action: 'token', kind: 'respond', token: respond, decision: 'welcome', message: 'See you Saturday' }, null).body;
  assert.match(w.message, /active member/);
  assert.equal(s.get('Memberships', r.reference).state, 'active');
  assert.match(notif(s, (n) => n.kind === 'membership_active')[0].body, /See you Saturday/);
  const ack = notif(s, (n) => n.kind === 'acknowledgement' && n.related === 'Memberships:' + r.reference)[0];
  const withdraw = /withdraw\?t=([a-f0-9]+)/.exec(ack.body)[1];
  C.handlePost(s, ctx, { action: 'token', kind: 'withdraw', token: withdraw }, null);
  assert.equal(s.get('Memberships', r.reference).state, 'withdrawn');
  assert.equal(notif(s, (n) => n.kind === 'membership_withdrawn')[0].to, 'repair.contact@example.org');
  const again = C.handlePost(s, ctx, { action: 'token', kind: 'withdraw', token: withdraw }, null).body;
  assert.match(again.message, /already withdrawn/);
});

/* ---------------- notifications ---------------- */
test('LIVE_SENDING off: nothing is sent, notifications are marked simulated', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const sent = [];
  C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), { send: (m) => sent.push(m) });
  assert.equal(sent.length, 0);
  assert.ok(notif(s).every((n) => n.status === 'simulated'));
});

test('live sending with TEST_RECIPIENT redirects every message to the test inbox', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.setSetting(s, 'LIVE_SENDING', 'yes');
  C.setSetting(s, 'TEST_RECIPIENT', 'tester@example.org');
  const sent = [];
  C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), { send: (m) => sent.push(m) });
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.to === 'tester@example.org'));
  assert.ok(sent.some((m) => m.subject.includes('[TEST → repair.contact@example.org]')));
  assert.ok(notif(s).every((n) => n.status === 'sent'));
});

test('failed delivery retries with backoff, then escalates once to the exceptions steward', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.setSetting(s, 'LIVE_SENDING', 'yes');
  const sent = [];
  const flaky = { send: (m) => { if (m.to === 'repair.contact@example.org') throw new Error('Invalid recipient'); sent.push(m); } };
  C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), flaky);
  let failing = notif(s, (n) => n.to === 'repair.contact@example.org')[0];
  assert.equal(failing.status, 'retry');
  C.processOutbox(s, ctx, flaky, {});
  assert.equal(s.get('Notifications', failing.id).attempts, '1', 'backoff: not retried immediately');
  for (let i = 0; i < 3; i++) { ctx.advance(31 * 60000); C.processOutbox(s, ctx, flaky, {}); }
  failing = s.get('Notifications', failing.id);
  assert.equal(failing.status, 'failed');
  assert.equal(failing.escalated, 'escalated');
  const esc = notif(s, (n) => n.kind === 'escalation');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].to, 'exceptions@example.org');
  assert.equal(esc[0].status, 'sent');
  ctx.advance(3600000);
  C.processOutbox(s, ctx, flaky, {});
  assert.equal(notif(s, (n) => n.kind === 'escalation').length, 1, 'escalates once');
  // Steward fixes the address and recovers the notification without code.
  s.update('Notifications', failing.id, { to: 'fixed.contact@example.org' });
  C.retryFailed(s, ctx, 'steward', [failing.id]);
  C.processOutbox(s, ctx, flaky, {});
  assert.equal(s.get('Notifications', failing.id).status, 'sent');
});

test('without an exceptions steward, a failure is flagged in the sheet instead of emailing anyone', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  s.update('Roles', 'exceptions_steward', { email: '' });
  C.setSetting(s, 'LIVE_SENDING', 'yes');
  const boom = { send: () => { throw new Error('quota'); } };
  C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), boom);
  for (let i = 0; i < 4; i++) { ctx.advance(3600000); C.processOutbox(s, ctx, boom, {}); }
  assert.ok(notif(s).every((n) => n.status === 'failed' && n.escalated === 'no_exceptions_steward_assigned'));
  assert.equal(C.reviewQueue(s, ctx).failed.length, 2);
});

/* ---------------- intake hygiene ---------------- */
test('honeypot spam is absorbed without records; rate limit protects the inbox', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, interest({ group_id: 'grp-01', website_hp: 'http://spam' }), null).body;
  assert.equal(r.ok, true);
  assert.equal(s.list('Memberships').length, 0);
  for (let i = 0; i < 12; i++) C.handlePost(s, ctx, { action: 'submit', type: 'correction', description: 'x' + i, email: 'loud@example.org' }, null);
  const limited = C.handlePost(s, ctx, { action: 'submit', type: 'correction', description: 'again', email: 'loud@example.org' }, null).body;
  assert.equal(limited.code, 'rate_limited');
});

test('submissions can be paused from Settings', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.setSetting(s, 'SUBMISSIONS_ENABLED', 'no');
  assert.equal(C.handlePost(s, ctx, interest({ group_id: 'grp-01' }), null).body.code, 'paused');
});

test('directory listing never overwrites an existing verified organization', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const before = s.get('Organizations', 'org-demo-repair');
  const r = C.handlePost(s, ctx, { action: 'submit', type: 'organization', name: 'Pat', email: 'pat@example.org', org_name: 'Example Repair Collective (DEMO)', locality: 'DeKalb', description: 'New text', public_email: 'pat.public@example.org', authorized: 'yes' }, null).body;
  assert.equal(r.ok, true);
  assert.deepEqual(s.get('Organizations', 'org-demo-repair'), before);
  const created = s.get('Organizations', r.reference);
  assert.equal(created.duplicate_of, 'org-demo-repair');
  assert.equal(created.status, 'pending');
  assert.equal(created.public_email, '', 'public email only with explicit consent');
});

test('monthly update reaches the facilitator and is published only with consent', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const r = C.handlePost(s, ctx, { action: 'submit', type: 'update', name: 'Lee', email: 'lee@example.org', update_text: 'We planted 40 trees', consent_publish: '' }, null).body;
  assert.equal(r.ok, true);
  assert.equal(notif(s, (n) => n.kind === 'update_received')[0].to, 'facilitator@example.org');
  C.approve(s, ctx, 'fac', 'Updates', r.reference);
  assert.ok(!JSON.stringify(C.buildPublicSnapshot(s, ctx)).includes('40 trees'));
  assert.equal(s.get('Updates', r.reference).meeting_id, 'mtg-2026-12-12');
});

/* ---------------- change sets ---------------- */
test('change sets preview a diff and apply all-or-nothing; routing addresses are locked', () => {
  const ctx = makeCtx();
  const s = prod(ctx);
  const good = { title: 'Dec call', operations: [
    { op: 'update', table: 'Meetings', id: 'mtg-2026-12-12', changes: { agenda: '1. Welcome', status: 'approved' } },
    { op: 'add', table: 'ActionItems', record: { meeting_id: 'mtg-2026-12-12', description: 'Draft roles proposal', owner_display: 'Not yet assigned' } },
    { op: 'remove', table: 'Requests', id: 'req-seed-2' }
  ] };
  const pre = C.previewChangeSet(s, good);
  assert.equal(pre.ok, true);
  assert.match(pre.text, /CHANGE Meetings mtg-2026-12-12: agenda "" → "1\. Welcome"/);
  assert.equal(s.get('Meetings', 'mtg-2026-12-12').agenda, '', 'preview changes nothing');
  const bad = { operations: good.operations.concat([{ op: 'update', table: 'Groups', id: 'grp-01', changes: { contact_email: 'attacker@example.org' } }]) };
  const res = C.applyChangeSet(s, ctx, 'kendra', bad);
  assert.equal(res.ok, false);
  assert.match(res.errors.join(' '), /contact_email/);
  assert.equal(s.get('Meetings', 'mtg-2026-12-12').agenda, '', 'nothing applied');
  const ok = C.applyChangeSet(s, ctx, 'kendra', good);
  assert.equal(ok.applied, 3);
  assert.equal(s.get('Meetings', 'mtg-2026-12-12').approved_by, 'kendra');
  assert.equal(s.get('Requests', 'req-seed-2').status, 'archived', 'remove archives, never deletes');
  assert.equal(s.list('ActionItems').filter((a) => a.description === 'Draft roles proposal')[0].status, 'draft');
  assert.equal(C.applyChangeSet(s, ctx, 'k', { operations: [{ op: 'add', table: 'Submissions', record: {} }] }).ok, false);
});

/* ---------------- Google Form reuse ---------------- */
test('Google Form responses map to pending directory submissions without assumed consent', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const p = C.mapFormResponse({ 'Your name': ['Ava'], 'Email address': ['ava@example.org'], 'Organization name': ['Example Org'], 'Mission statement': ['Help'], 'Logo (optional)': [''] }, '');
  assert.equal(p.name, 'Ava');
  assert.equal(p.email, 'ava@example.org');
  assert.equal(p.org_name, 'Example Org');
  assert.equal(p.consent_directory, 'no');
  p.action = 'submit';
  p.client_id = 'gform-1';
  const r = C.handlePost(s, ctx, p, null).body;
  assert.equal(r.ok, true);
  assert.equal(s.get('Organizations', r.reference).status, 'pending');
  const mapped = C.mapFormResponse({ Q1: 'Bo', Q2: 'bo@example.org' }, JSON.stringify({ name: 'Q1', email: 'Q2' }));
  assert.equal(mapped.name, 'Bo');
  assert.equal(mapped.as_individual, 'yes');
});

test('portable SHA-256 matches Node crypto', () => {
  ['', 'abc', 'Canopy — ünïcødé 🌳', 'x'.repeat(1000)].forEach((v) => {
    assert.equal(C.util.sha256(v), crypto.createHash('sha256').update(v, 'utf8').digest('hex'));
  });
});

test('collaborators post action-item updates without Sheet access; a steward applies them', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  const id = 'act-2026-11-14-4';
  const bad = C.handlePost(s, ctx, { action: 'submit', type: 'item_update', item_id: id, name: '' }, null).body;
  assert.equal(bad.ok, false);
  const r = C.handlePost(s, ctx, { action: 'submit', type: 'item_update', item_id: id, name: 'Ava', email: 'ava.private@example.org', progress: 'in_progress', next_step: 'Sheet shared with 6 fixers', note: 'Looking for a Genoa host' }, null).body;
  assert.equal(r.status, 'pending_review');
  assert.equal(s.get('ActionItems', id).progress, 'open', 'nothing public changes before review');
  const n = notif(s, (x) => x.kind === 'item_update')[0];
  assert.equal(n.to, 'facilitator@example.org');
  assert.match(n.body, /Looking for a Genoa host/);
  C.applyCorrection(s, ctx, 'facilitator', r.reference);
  assert.equal(s.get('ActionItems', id).progress, 'in_progress');
  assert.equal(s.get('ActionItems', id).next_step, 'Sheet shared with 6 fixers');
  assert.ok(!JSON.stringify(C.buildPublicSnapshot(s, ctx)).includes('ava.private@example.org'));
  // draft items cannot be updated from outside
  s.update('ActionItems', id, { status: 'draft' });
  assert.equal(C.handlePost(s, ctx, { action: 'submit', type: 'item_update', item_id: id, name: 'X', note: 'y' }, null).body.ok, false);
});

/* ---------------- community calendar ---------------- */
const calEvent = (extra) => Object.assign({ action: 'submit', type: 'event', title: 'Native Seed Swap', organizer: 'Kishwaukee neighbors', date: '2026-12-20', start_time: '10:00', venue: 'Library', city: 'Sycamore', county: 'DeKalb', category: 'Native plants & nature', relevance: 'Seeds', submitter_name: 'Pat', submitter_email: 'pat.private@example.org' }, extra);

test('trusted publishers publish directly with their personal link; others are reviewed', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  C.setSetting(s, 'SITE_URL', 'https://canopy.decarbondekalb.com');
  const { link } = C.createPublisherKey(s, ctx, 'steward', 'per-demo-1');
  const key = /key=([a-f0-9]+)/.exec(link)[1];
  assert.match(link, /\/calendar\/#\/submit\?key=/);
  assert.ok(notif(s, (n) => n.kind === 'publisher_link' && n.to === 'sam.private@example.org').length === 1);
  const pub = C.handlePost(s, ctx, calEvent({ publisher_key: key, client_id: 't1' }), null).body;
  assert.equal(pub.status, 'published');
  const ev = s.get('Events', pub.reference);
  assert.equal(ev.status, 'approved');
  assert.equal(ev.published_via, 'trusted publisher');
  assert.match(ev.approved_by, /Sam Example/);
  assert.ok(C.buildPublicSnapshot(s, ctx).events.some((e) => e.id === ev.id && e.category === 'Native plants & nature'));
  assert.equal(notif(s, (n) => n.kind === 'event_published').length, 1, 'steward told, no action needed');
  // a typed email of a trusted person is NOT enough
  const spoof = C.handlePost(s, ctx, calEvent({ title: 'Other', submitter_email: 'sam.private@example.org', client_id: 't2' }), null).body;
  assert.equal(spoof.status, 'pending_review');
  // wrong key → reviewed, told why
  const wrong = C.handlePost(s, ctx, calEvent({ title: 'Third', publisher_key: 'x'.repeat(32), client_id: 't3' }), null).body;
  assert.equal(wrong.status, 'pending_review');
  assert.match(wrong.message, /wasn’t recognized/);
  // a trusted duplicate (same title/date) is held for review
  const dup = C.handlePost(s, ctx, calEvent({ publisher_key: key, client_id: 't4' }), null).body;
  assert.equal(dup.status, 'pending_review');
  // revoking stops it; key hash never public
  C.revokePublisher(s, ctx, 'steward', 'per-demo-1');
  assert.equal(C.handlePost(s, ctx, calEvent({ title: 'Fourth', publisher_key: key, client_id: 't5' }), null).body.status, 'pending_review');
  assert.equal(C.privacyAudit(s, ctx).ok, true);
});

test('northern Illinois counties, topics, optional source link, and filtered feeds', () => {
  const ctx = makeCtx();
  const s = demo(ctx);
  assert.ok(C.COUNTIES.includes('McHenry') && C.COUNTIES[0] === 'DeKalb');
  const noSource = C.handlePost(s, ctx, calEvent({ county: 'McHenry', title: 'Woodstock cleanup', category: 'Volunteering & cleanups' }), null).body;
  assert.equal(noSource.ok, true, 'source link is optional');
  assert.equal(C.handlePost(s, ctx, calEvent({ category: 'Not a topic' }), null).body.errors.category !== undefined, true);
  C.approve(s, ctx, 'st', 'Events', noSource.reference);
  const all = C.handleGet(s, ctx, { action: 'ics', which: 'events' }).body;
  const mchenry = C.handleGet(s, ctx, { action: 'ics', which: 'events', county: 'McHenry' }).body;
  const repair = C.handleGet(s, ctx, { action: 'ics', which: 'events', category: 'Repair & reuse' }).body;
  assert.match(all, /Woodstock cleanup/);
  assert.match(mchenry, /Woodstock cleanup/);
  assert.doesNotMatch(mchenry, /Repair Café/);
  assert.match(repair, /Repair Café/);
  assert.doesNotMatch(repair, /Woodstock/);
  assert.match(all, /X-WR-CALNAME:DeKalb County\\, Illinois Community Sustainability Calendar/);
});
