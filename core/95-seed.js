/*
 * Seed data. Production seed = real planning content, all DRAFT (nothing public until a
 * steward approves). No invented URLs, contacts, memberships or schedules.
 * Demo seed = clearly labelled demo records with example.org test recipients.
 * Unverified transcript names are NOT in this file: they go only into the private
 * Verification tab (imported from a CSV kept outside the repository).
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;
  var T = C.time;

  C.DEFAULT_SETTINGS = [
    ['SITE_NAME', 'Canopy', 'Public name (pending coalition approval).'],
    ['SITE_TAGLINE', 'Second Saturdays for a More Sustainable DeKalb County, Illinois', 'Public tagline (pending coalition approval).'],
    ['SITE_URL', '', 'Public site address, e.g. https://canopy.decarbondekalb.com — used in email links. PLACEHOLDER.'],
    ['MAIN_MEET_URL', '', 'The same Google Meet link every month. Empty = site shows “Link coming soon”. PLACEHOLDER.'],
    ['ORG_FORM_URL', '', 'Ava’s existing Google Form (optional). Empty = site uses its built-in form only. PLACEHOLDER.'],
    ['FORM_MAPPING', '', 'Optional JSON mapping our fields to the Google Form question titles.'],
    ['LIVE_SENDING', 'no', 'yes = emails are really sent. Keep "no" until roles and test recipients are confirmed.'],
    ['TEST_RECIPIENT', '', 'If set, every live email goes to this one inbox instead (for testing).'],
    ['REPLY_TO', '', 'Reply-to address on automatic emails (a shared coalition inbox).'],
    ['SUBMISSIONS_ENABLED', 'yes', 'no = pause all public forms (site shows a pause message).'],
    ['SHOW_DEMO_CONTENT', 'no', 'yes = demo records appear on the public site, labelled DEMO.'],
    ['SITE_NOTICE', 'Prototype — content is draft until coalition stewards approve it.', 'Banner text on every page. Empty = no banner.'],
    ['CORRECTIONS_EMAIL_PUBLIC', '', 'Optional public email for corrections, shown in the footer.'],
    ['PLATFORM_NOTE', 'Canopy is coalition-led. DeCarbon DeKalb provides the Google Meet platform and shared technical infrastructure; it does not own, lead or govern Canopy. Candidate-support organizing happens elsewhere, outside this site and its rooms.', 'Shown in the footer.'],
    ['BACKUP_FOLDER_ID', '', 'Drive folder for weekly backups (created automatically on first backup).'],
    ['BACKUP_KEEP', '26', 'How many weekly backups to keep.']
  ];

  C.CHECKPOINTS = {
    '2026-12-12': 'Purpose, participation, steward roles, directory and dashboard preview',
    '2027-01-09': 'Shared priorities, gaps and upcoming dates',
    '2027-02-13': 'Cross-organization resources and spring readiness',
    '2027-03-13': 'Spring coordination; repair-fair leads and access',
    '2027-04-10': 'Spring updates; check potential Earth Fest conflict',
    '2027-05-08': 'Repair-fair status and summer collaboration',
    '2027-06-12': 'Countywide reach and participation gaps',
    '2027-07-10': 'Midyear usefulness and workload check',
    '2027-08-14': 'Fall opportunities and shared resources',
    '2027-09-11': 'Fall coordination and partnerships',
    '2027-10-09': 'Annual priorities and one-year learning',
    '2027-11-13': 'Next-year planning and steward continuity',
    '2027-12-11': 'Year-end learning and 2028 handoff'
  };

  C.GROUP_SLOTS = [
    ['Repair and reuse', 'Rotating repair, mending and reuse events; hosts, fixers, venues and access.', 'Active discussion; ownership needs reconciliation'],
    ['Calendar and communications', 'The shared sustainability calendar, reminders and recaps.', 'Existing infrastructure commitments'],
    ['Storytelling and community learning', 'Sharing local stories and learning together.', 'Raised on both the retreat and first-call transcripts'],
    ['Native landscapes and microforests', 'Native plantings, seed skills and a possible small dense-forest demonstration.', 'Retreat project report-back'],
    ['Transportation and access', 'Passenger rail, local transit and getting people to events.', 'Raised at the retreat'],
    ['Sustainability plans and public learning', 'Following through on adopted sustainability and watershed plans; government literacy.', 'Retreat discussion'],
    ['Data centers and resource use', 'Learning about data-center proposals and their energy/water use, within Canopy’s sustainability scope.', 'Retreat policy discussion; keep within current scope'],
    ['Youth and practical skills', 'Vocational, repair and native-seed skills with young people.', 'Retreat ideas'],
    ['Open collaboration room A', 'Reserve room for any Canopy collaboration. Agree a time with others first.', 'Reserve; no standing group implied'],
    ['Open collaboration room B', 'Reserve room for any Canopy collaboration. Agree a time with others first.', 'Reserve; no standing group implied']
  ];

  function base(ctx, extra) {
    var now = U.nowIso(ctx);
    return Object.assign({ status: 'draft', visibility: 'public', verification: 'unverified', created_at: now, updated_at: now, updated_by: 'seed' }, extra);
  }

  C.seedProduction = function (store, ctx) {
    var have = function (table, key) {
      return !!store.get(table, key);
    };
    C.DEFAULT_SETTINGS.forEach(function (s) {
      if (!have('Settings', s[0])) store.insert('Settings', { key: s[0], value: s[1], notes: s[2] });
    });
    C.schema.ROLES.forEach(function (r) {
      if (!have('Roles', r[0])) store.insert('Roles', { role: r[0], label: r[1], person_name: '', email: '', backup_email: '', notes: 'Not yet assigned — a coalition decision.' });
    });
    T.secondSaturdays(2026, 12, 13).forEach(function (date) {
      var id = 'mtg-' + date;
      if (have('Meetings', id)) return;
      store.insert('Meetings', base(ctx, {
        id: id, date: date, start_time: '10:00', end_time: '11:00', title: 'Canopy monthly call',
        checkpoint: C.CHECKPOINTS[date] || '', agenda: '', meet_url: '',
        decision_needed: date === '2027-04-10' ? 'Possible Earth Fest conflict: the September 2026 calendar proposal lists Earth Fest tentatively on April 10, 2027 (not verified). Coalition to decide whether to keep, move or cancel this call.' : '',
        source_ref: 'Second-Saturday 10–11 a.m. pattern retained on Nov 14, 2026 call',
        verification: date === '2026-12-12' ? 'verified' : 'unverified',
        steward_note: date === '2026-12-12' ? 'Next call stated on the Nov 14 call. Approve once the join link and facilitator are confirmed.' : 'Planning date; no invitation created.'
      }));
    });
    if (!have('Meetings', 'mtg-2026-11-14')) {
      store.insert('Meetings', base(ctx, {
        id: 'mtg-2026-11-14', date: '2026-11-14', start_time: '10:00', end_time: '11:00', title: 'Canopy first call', checkpoint: 'Repair fairs, central calendar, organizational names and mission/vision',
        source_ref: 'Nov 14, 2026 transcript', verification: 'verified'
      }));
    }
    if (!have('Recaps', 'rcp-2026-11-14')) {
      store.insert('Recaps', base(ctx, {
        id: 'rcp-2026-11-14', meeting_id: 'mtg-2026-11-14', title: 'First Canopy call — November 14, 2026',
        summary:
          'Participants agreed that continued virtual access and countywide reach matter. People asked for an organizational directory and a shared calendar. ' +
          'An organizational Google Form has been started to collect names, organizations, mission statements and optional logos. Invitations were hard to find, and the invitation list needs reconciling. ' +
          'Repair fairs need further coordination; possible venues and partners were mentioned as leads only, not commitments. Organizations will be invited to share upcoming work and asks.',
        decisions: 'Next call: Saturday, December 12, 2026, 10–11 a.m. Central Time on Google Meet. Calls continue on second Saturdays at 10 a.m.',
        next_steps: 'Circulate a short purpose/participation proposal before December 12. Share the directory form link. Preview the calendar and directory site.',
        source_ref: 'Nov 14, 2026 transcript (draft synthesis — not approved minutes)',
        steward_note: 'DRAFT. A named steward must approve before publication. Do not add names, motives or casual remarks from the transcript.'
      }));
    }
    var actions = [
      ['Share the existing organizational Form link; review fields and consent before duplicating it', 'Ava (said the form exists)', 'Obtain URL; review fields and consent'],
      ['Send follow-up notes and action items', 'Ava (sending); Kendra offered compilation support', 'One approved recap with next-call link, form, asks and owners'],
      ['Reconcile the retreat invitation roster', 'Not yet assigned (Amy’s list referenced)', 'Reconcile invitees, attendees, affiliations and opt-ins'],
      ['Create a repair-fair shared sheet', 'Ava (offered)', 'Capture hosts, skills, teaching/repair preference, availability and leads'],
      ['Confirm library repair pilot timing (reported: May earliest)', 'Not yet assigned', 'Confirm directly before publishing dates or capabilities'],
      ['Explore NIU mending-club interest', 'Emily (reported interest)', 'Explore April/student availability; no commitment inferred'],
      ['Seek interest from a possible community partner (contact to verify)', 'Sid (possible email contact)', 'Verify name/contact, then ask about interest'],
      ['Connect with the Kishwaukee green team', 'Cynthia offered a connection (declined coordinating)', 'Confirm contact and availability'],
      ['Build the calendar and directory prototype with a submission and approval path', 'Kendra (technical support)', 'Group preview at the December call; appoint nontechnical stewards'],
      ['Clarify overlap between business recognition programs (CEC, STARR, Green Awards)', 'Not yet assigned', 'Ask a representative before creating another program'],
      ['Circulate a short call purpose/participation proposal', 'Not yet assigned', 'For decision at the December call']
    ];
    actions.forEach(function (a, i) {
      var id = 'act-2026-11-14-' + (i + 1);
      if (have('ActionItems', id)) return;
      store.insert('ActionItems', base(ctx, { id: id, meeting_id: 'mtg-2026-11-14', description: a[0], owner_display: a[1], progress: 'open', next_step: a[2], source_ref: 'Nov 14 draft action register', source_excerpt: 'See transcript; owner as stated only.' }));
    });
    C.GROUP_SLOTS.forEach(function (g, i) {
      var slot = i + 1;
      var id = 'grp-' + (slot < 10 ? '0' : '') + slot;
      if (have('Groups', id)) return;
      store.insert('Groups', base(ctx, {
        id: id, slot: String(slot), label: g[0], label_note: 'Proposed label for coalition review. ' + g[2] + '.', purpose: g[1], group_status: 'reserve', enrollment_mode: 'contact_led', intake: 'paused',
        capacity: '', convenor_display: '', contact_email: '', public_contact: '', meet_url: '', notes_url: '', next_gathering: '', time_expectation: '', current_needs: '',
        welcome_message: '', room_convention: 'Reusable room: agree a time with others first and note it in the shared notes. A link being available does not mean someone is in the room.'
      }));
    });
    var reqs = [
      ['collaboration', 'Repair-fair hosts, fixers and venue leads', 'Rotating repair/mending events across the county. Venue ideas so far are leads, not partners. County coverage, transport and access matter more than venue count.', 'grp-01', 'Shared sheet offered; ownership of an ongoing series not yet established.'],
      ['need', 'Clarify business recognition programs', 'Several programs (CEC, STARR, Green Awards) were discussed with uncertainty about overlap.', '', 'Ask a program representative to explain overlap.'],
      ['need', 'Calendar and communications stewards', 'Nontechnical volunteers to review calendar submissions, directory listings and corrections (a few minutes a week).', 'grp-02', 'Coalition to name stewards and backups.']
    ];
    reqs.forEach(function (r, i) {
      var id = 'req-seed-' + (i + 1);
      if (have('Requests', id)) return;
      store.insert('Requests', base(ctx, { id: id, kind: r[0], title: r[1], description: r[2], group_id: r[3], progress: 'open', next_step: r[4], owner_display: '' }));
    });
    if (!have('Organizations', 'org-decarbon-dekalb')) {
      store.insert('Organizations', base(ctx, {
        id: 'org-decarbon-dekalb', name: 'DeCarbon DeKalb', description: 'Provides the Google Meet platform and shared technical infrastructure for Canopy. It does not own, lead or govern Canopy.',
        locality: 'DeKalb County', service_area: 'DeKalb County', interests: 'Calendar; Infrastructure', verification: 'unverified', steward_note: 'Confirm description and public contact with DeCarbon before approving.'
      }));
    }
    return store;
  };

  /** Demo content: labelled, uses example.org (reserved, undeliverable) addresses. */
  C.seedDemo = function (store, ctx) {
    C.seedProduction(store, ctx);
    var actor = 'demo setup';
    C.setSetting(store, 'SHOW_DEMO_CONTENT', 'yes');
    C.setSetting(store, 'SITE_NOTICE', 'DEMO — sample data, nothing is sent, and real join links are not configured yet.');
    var roleMail = {
      intake_steward: 'intake.steward@example.org', events_steward: 'events.steward@example.org', directory_steward: 'directory.steward@example.org',
      facilitator: 'facilitator@example.org', communications_steward: 'comms.steward@example.org', exceptions_steward: 'exceptions@example.org'
    };
    Object.keys(roleMail).forEach(function (r) {
      store.update('Roles', r, { person_name: 'Demo ' + r.replace(/_/g, ' '), email: roleMail[r], notes: 'DEMO test recipient' });
    });
    store.list('Meetings').forEach(function (m) {
      if (m.status === 'draft') C.approve(store, ctx, actor, 'Meetings', m.id);
    });
    store.update('Meetings', 'mtg-2026-12-12', { agenda: '1. Welcome, purpose and access needs\n2. Organizational round: one update, one date, one ask/offer\n3. Purpose and participation proposal\n4. Directory and calendar preview\n5. Owners, next steps and recap' });
    C.approve(store, ctx, actor, 'Recaps', 'rcp-2026-11-14');
    store.list('ActionItems').forEach(function (a) {
      C.approve(store, ctx, actor, 'ActionItems', a.id);
    });
    store.list('Requests').forEach(function (a) {
      C.approve(store, ctx, actor, 'Requests', a.id);
    });
    store.list('Groups').forEach(function (g) {
      C.approve(store, ctx, actor, 'Groups', g.id);
    });
    store.update('Groups', 'grp-01', {
      group_status: 'active', enrollment_mode: 'contact_led', intake: 'open', convenor_display: 'Demo convenor', contact_email: 'repair.contact@example.org',
      public_contact: 'repair.contact@example.org (DEMO)', time_expectation: 'About 2 hours a month', current_needs: 'People who can fix small appliances, mend clothes, or welcome visitors (DEMO).',
      next_gathering: 'To be agreed by the group', welcome_message: 'The group meets online by arrangement. (DEMO)', demo: 'yes'
    });
    store.update('Groups', 'grp-03', {
      group_status: 'active', enrollment_mode: 'open', intake: 'open', convenor_display: 'Demo storyteller', contact_email: 'stories.contact@example.org',
      time_expectation: 'Drop in when you can', current_needs: 'Anyone who wants to collect or share local sustainability stories (DEMO).',
      welcome_message: 'Welcome! Add a story idea to the shared notes whenever you like. (DEMO)', demo: 'yes'
    });
    store.update('Groups', 'grp-04', { group_status: 'active', enrollment_mode: 'contact_led', intake: 'open', convenor_display: 'Not yet assigned', contact_email: '', time_expectation: 'Seasonal', current_needs: 'A convenor (DEMO).', demo: 'yes' });

    var today = ctx.now();
    function plusDays(n) {
      return T.toChicago(new Date(today.getTime() + n * 86400000)).date;
    }
    var orgs = [
      ['org-demo-repair', 'Example Repair Collective (DEMO)', 'Volunteer fixers who host occasional repair events.', 'Sycamore', 'Repair; Reuse'],
      ['org-demo-garden', 'Example Native Garden Club (DEMO)', 'Neighbors growing native plants and sharing seeds.', 'Kirkland', 'Native landscapes; Youth']
    ];
    orgs.forEach(function (o) {
      if (store.get('Organizations', o[0])) return;
      store.insert('Organizations', base(ctx, { id: o[0], name: o[1], description: o[2], locality: o[3], service_area: 'DeKalb County', interests: o[4], website: 'https://example.org/', public_email: 'hello@example.org', demo: 'yes', verification: 'verified' }));
      C.approve(store, ctx, actor, 'Organizations', o[0]);
    });
    if (!store.get('People', 'per-demo-1')) {
      store.insert('People', base(ctx, { id: 'per-demo-1', display_name: 'Sam Example (DEMO)', private_email: 'sam.private@example.org', email_norm: 'sam.private@example.org', locality: 'DeKalb', public_contact: 'sam.public@example.org', directory_consent: 'yes', contact_publish_consent: 'yes', interests: 'Repair; Storytelling', demo: 'yes', verification: 'verified' }));
      store.insert('Affiliations', base(ctx, { id: 'aff-demo-1', person_id: 'per-demo-1', organization_id: 'org-demo-repair', org_name_reported: 'Example Repair Collective (DEMO)', role_title: 'Volunteer', authorized_to_represent: 'yes', demo: 'yes', verification: 'verified' }));
      C.approve(store, ctx, actor, 'People', 'per-demo-1');
      C.approve(store, ctx, actor, 'Affiliations', 'aff-demo-1');
      // A person who did NOT consent to the directory: approved, but must never be listed.
      store.insert('People', base(ctx, { id: 'per-demo-2', display_name: 'Private Example (DEMO)', private_email: 'private.person@example.org', email_norm: 'private.person@example.org', locality: 'Genoa', directory_consent: 'no', demo: 'yes' }));
      C.approve(store, ctx, actor, 'People', 'per-demo-2');
    }
    var evs = [
      ['evt-demo-1', 'Community Repair Café (DEMO)', 'Example Repair Collective (DEMO)', plusDays(10), '13:00', '16:00', 'Example Library meeting room', 'Sycamore', 'DeKalb', '', 'Keeps useful things out of the landfill.', 'Free', 'Step-free entrance; accessible restroom.'],
      ['evt-demo-2', 'Native Seed Swap (online, DEMO)', 'Example Native Garden Club (DEMO)', plusDays(24), '18:30', '19:30', '', '', 'Online', 'https://example.org/online-room', 'Native plants support pollinators and stormwater absorption.', 'Free', 'Live captions on request.'],
      ['evt-demo-3', 'Past Cleanup Walk (DEMO)', 'Example Native Garden Club (DEMO)', plusDays(-12), '09:00', '11:00', 'Example Park', 'DeKalb', 'DeKalb', '', 'Litter cleanup along a waterway.', 'Free', 'Uneven ground.'],
      ['evt-demo-4', 'Cancelled Workshop (DEMO)', 'Example Repair Collective (DEMO)', plusDays(5), '10:00', '12:00', 'Example Hall', 'Genoa', 'DeKalb', '', 'Hands-on skills workshop.', '$5 suggested', '']
    ];
    evs.forEach(function (e) {
      if (store.get('Events', e[0])) return;
      store.insert('Events', base(ctx, { id: e[0], title: e[1], organizer: e[2], date: e[3], start_time: e[4], end_time: e[5], venue: e[6], city: e[7], county: e[8], online_url: e[9], relevance: e[10], cost: e[11], accessibility: e[12], source_url: 'https://example.org/event', submitter_name: 'Demo submitter', submitter_email: 'submitter.private@example.org', demo: 'yes', verification: 'verified' }));
      C.approve(store, ctx, actor, 'Events', e[0]);
    });
    C.cancel(store, ctx, actor, 'Events', 'evt-demo-4', 'Organizer unavailable (DEMO)');
    // A restricted planning date: approved but must never appear in public output.
    if (!store.get('Events', 'evt-demo-private')) {
      store.insert('Events', base(ctx, { id: 'evt-demo-private', title: 'Private planning session (DEMO restricted)', organizer: 'Stewards', date: plusDays(7), start_time: '19:00', end_time: '20:00', venue: 'Private', city: 'DeKalb', county: 'DeKalb', relevance: 'Internal', visibility: 'restricted', demo: 'yes', submitter_email: 'steward.private@example.org' }));
      C.approve(store, ctx, actor, 'Events', 'evt-demo-private');
    }
    if (!store.get('Updates', 'upd-demo-1')) {
      store.insert('Updates', base(ctx, { id: 'upd-demo-1', meeting_id: 'mtg-2026-12-12', display_name: 'Sam Example (DEMO)', org_display: 'Example Repair Collective (DEMO)', update_text: 'We have two new volunteer fixers.', upcoming_date: 'Repair café in a few weeks', ask_offer: 'Looking for a venue in the south of the county.', publish_consent: 'yes', demo: 'yes' }));
      C.approve(store, ctx, actor, 'Updates', 'upd-demo-1');
    }
    return store;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
