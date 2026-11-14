/*
 * Intake: every public form posts here.
 *   1. validate (and silently absorb honeypot spam)
 *   2. idempotency: the same client_id never processes twice (retries are safe)
 *   3. persist the raw submission BEFORE anything else
 *   4. create/match normalised records, record consent
 *   5. queue notifications (sending happens after, through the outbox)
 * Everything a submission creates starts as pending/unverified. Nothing becomes public
 * until a steward approves it.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;
  var T = C.time;

  C.CONSENT_TEXT = {
    share_with_contact: 'Share my name, email and note with the contact for this request so they can follow up.',
    updates: 'Send me occasional Canopy updates (monthly call reminders and recaps).',
    directory: 'Show my name and locality in the public Canopy directory once a steward approves it.',
    contact_publish: 'Publish the public contact I provided (never my private email unless I typed it there).'
  };

  // DeKalb first, then northern Illinois counties (alphabetical), then online/regional.
  var COUNTIES = ['DeKalb', 'Boone', 'Bureau', 'Carroll', 'Cook', 'DuPage', 'Grundy', 'Henry', 'Jo Daviess', 'Kane', 'Kankakee', 'Kendall', 'Lake', 'LaSalle', 'Lee',
    'Livingston', 'Marshall', 'McHenry', 'Ogle', 'Putnam', 'Stephenson', 'Whiteside', 'Will', 'Winnebago', 'Online', 'Regional / multiple'];
  C.COUNTIES = COUNTIES;
  C.CATEGORIES = ['Energy & climate', 'Food & gardening', 'Native plants & nature', 'Repair & reuse', 'Waste & recycling', 'Water', 'Transportation',
    'Learning & civic life', 'Volunteering & cleanups', 'Family & youth', 'Arts & community', 'Other'];

  function fail(errors, message) {
    return { ok: false, code: 'validation', errors: errors, message: message || 'Please check the highlighted fields.' };
  }

  function siteLink(settings, hash) {
    var base = U.str(settings.SITE_URL).replace(/#.*$/, '').replace(/\/$/, '');
    return (base || '[SITE_URL not configured]') + '/#/' + hash;
  }

  function firstName(n) {
    return U.str(n).split(/\s+/)[0] || 'there';
  }

  /* ---------------- people, consent, affiliations ---------------- */

  function recordConsent(store, ctx, personId, kind, value, subId) {
    store.insert('Consents', {
      id: U.makeId('con', ctx),
      person_id: personId,
      kind: kind,
      value: U.yn(value),
      text_shown: C.CONSENT_TEXT[kind] || kind,
      source_submission_id: subId,
      recorded_at: U.nowIso(ctx)
    });
  }

  /**
   * Match by private email only (never by name). Existing verified values are never
   * overwritten by an unverified submission; differences are noted for a steward.
   * Explicit consent answers always apply — withdrawing consent must take effect.
   */
  C.upsertPerson = function (store, ctx, p, subId) {
    var email = U.normEmail(p.email);
    var existing = store.list('People').filter(function (r) {
      return r.email_norm === email && !r.duplicate_of;
    })[0];
    var consentPatch = {};
    ['directory', 'contact_publish', 'updates'].forEach(function (k) {
      if (p['consent_' + k] !== undefined && p['consent_' + k] !== '') consentPatch[k + '_consent'] = U.yn(p['consent_' + k]);
    });
    var person;
    if (existing) {
      var patch = Object.assign({ updated_at: U.nowIso(ctx) }, consentPatch);
      if (!existing.locality && p.locality) patch.locality = U.clip(p.locality, 120);
      if (!existing.public_contact && p.public_contact) patch.public_contact = U.clip(p.public_contact, 200);
      if (p.name && U.norm(p.name) !== U.norm(existing.display_name)) {
        patch.steward_note = U.clip((existing.steward_note ? existing.steward_note + ' | ' : '') + subId + ' used the name "' + U.clip(p.name, 80) + '"', 2000);
      }
      person = store.update('People', existing.id, patch);
      person._matched = true;
    } else {
      person = store.insert(
        'People',
        Object.assign(
          {
            id: U.makeId('per', ctx),
            display_name: U.clip(p.name, 120),
            private_email: email,
            email_norm: email,
            locality: U.clip(p.locality, 120),
            public_contact: U.clip(p.public_contact, 200),
            directory_consent: 'no',
            contact_publish_consent: 'no',
            updates_consent: 'no',
            accessibility_notes: U.clip(p.accessibility, 500),
            status: 'pending',
            visibility: 'public',
            verification: 'self_reported',
            source_ref: subId,
            created_at: U.nowIso(ctx),
            updated_at: U.nowIso(ctx)
          },
          consentPatch
        )
      );
    }
    ['directory', 'contact_publish', 'updates'].forEach(function (k) {
      if (consentPatch[k + '_consent']) recordConsent(store, ctx, person.id, k, consentPatch[k + '_consent'], subId);
    });
    return person;
  };

  C.findOrgByName = function (store, name) {
    var n = U.norm(name);
    if (!n) return null;
    return (
      store.list('Organizations').filter(function (o) {
        return U.norm(o.name) === n && !o.duplicate_of && o.status !== 'archived';
      })[0] || null
    );
  };

  /** Self-reported affiliations. Never creates an organisation or implies endorsement. */
  C.addAffiliations = function (store, ctx, personId, affs, subId) {
    var existing = store.list('Affiliations').filter(function (a) {
      return a.person_id === personId;
    });
    var created = [];
    (affs || []).slice(0, 5).forEach(function (a) {
      var name = U.clip(typeof a === 'string' ? a : a.name, 160);
      if (!name) return;
      var org = C.findOrgByName(store, name);
      var dup = existing.filter(function (e) {
        return (org && e.organization_id === org.id) || U.norm(e.org_name_reported) === U.norm(name);
      })[0];
      if (dup) return;
      var row = store.insert('Affiliations', {
        id: U.makeId('aff', ctx),
        person_id: personId,
        organization_id: org ? org.id : '',
        org_name_reported: name,
        role_title: U.clip(a.role_title, 120),
        authorized_to_represent: a.authorized ? U.str(a.authorized) : 'unsure',
        status: 'pending',
        visibility: 'public',
        verification: 'self_reported',
        source_ref: subId,
        created_at: U.nowIso(ctx),
        updated_at: U.nowIso(ctx)
      });
      existing.push(row);
      created.push(row.id);
    });
    return created;
  };

  /* ---------------- handlers ---------------- */

  var handlers = {};

  handlers.interest = function (store, ctx, p, sub, settings) {
    var errors = {};
    if (!U.str(p.name)) errors.name = 'Please tell us what to call you.';
    if (!U.isEmail(p.email)) errors.email = 'Please enter an email address we can use to follow up (it stays private).';
    if (!U.yes(p.consent_share_with_contact)) errors.consent_share_with_contact = 'We need your permission to pass your request to the person who will follow up.';
    var helpPath = !p.group_id || p.group_id === 'help';
    var group = null;
    if (!helpPath) {
      group = store.get('Groups', U.str(p.group_id));
      if (!group || group.status !== 'approved') errors.group_id = 'That group could not be found. Choose another, or “Help me find a place”.';
    }
    if (Object.keys(errors).length) return fail(errors);

    var person = C.upsertPerson(store, ctx, p, sub.id);
    recordConsent(store, ctx, person.id, 'share_with_contact', 'yes', sub.id);
    var participation = U.str(p.participation);
    var affs = participation === 'organization' ? p.affiliations || [] : [];
    var affIds = C.addAffiliations(store, ctx, person.id, affs, sub.id);
    var groupId = helpPath ? '' : group.id;
    var label = helpPath ? 'finding a place to contribute' : group.label;

    // Duplicate / returning participant: one open membership per person+group.
    var open = store.list('Memberships').filter(function (m) {
      return m.person_id === person.id && m.group_id === groupId && ['interested', 'acknowledged', 'active', 'waitlisted'].indexOf(m.state) >= 0;
    })[0];
    if (open) {
      return {
        ok: true,
        status: 'duplicate',
        reference: open.id,
        message:
          'You already have a request for ' + label + ' (current status: ' + open.state + '). We did not create a second one or send another notification. ' +
          'If something has changed, use the correction link at the bottom of any page.',
        refs: ['Memberships:' + open.id, 'People:' + person.id]
      };
    }

    var state, routing, routedTo = '', message, ackBody;
    var contact = group && U.isEmail(group.contact_email) ? U.normEmail(group.contact_email) : '';
    var intake = C.roleEmail(store, 'intake_steward');
    var activeCount = group
      ? store.list('Memberships').filter(function (m) {
          return m.group_id === group.id && m.state === 'active';
        }).length
      : 0;
    var full = group && +group.capacity > 0 && activeCount >= +group.capacity;
    var closed = group && (group.group_status !== 'active' || group.intake !== 'open' || full);

    if (helpPath) {
      state = 'interested';
      routing = intake ? 'intake_steward' : 'unassigned';
      routedTo = intake;
    } else if (closed) {
      state = 'waitlisted';
      routing = intake ? 'intake_steward' : 'unassigned';
      routedTo = intake;
    } else if (group.enrollment_mode === 'open') {
      state = 'active';
      routing = contact ? 'group_contact_fyi' : 'none_needed';
      routedTo = contact;
    } else {
      state = 'interested';
      routing = contact ? 'group_contact' : intake ? 'intake_steward' : 'unassigned';
      routedTo = contact || intake;
    }

    var withdrawToken = U.newToken(ctx);
    var respondToken = U.newToken(ctx);
    var mem = store.insert('Memberships', {
      id: U.makeId('mem', ctx),
      person_id: person.id,
      group_id: groupId,
      state: state,
      routing: routing,
      routed_to: routedTo,
      note: U.clip(p.note, 1000),
      share_consent: 'yes',
      source_submission_id: sub.id,
      withdraw_token_hash: U.tokenHash(withdrawToken),
      respond_token_hash: routedTo ? U.tokenHash(respondToken) : '',
      created_at: U.nowIso(ctx),
      updated_at: U.nowIso(ctx)
    });

    var withdrawLink = siteLink(settings, 'withdraw?t=' + withdrawToken);
    var respondLink = siteLink(settings, 'respond?t=' + respondToken);
    var affText = participation === 'organization' ? (affs.map(function (a) { return typeof a === 'string' ? a : a.name; }).join('; ') || 'none given') + ' (self-reported, not verified)' : participation === 'canopy' ? 'Participating through Canopy' : 'Independent community member';
    var details =
      'Name: ' + person.display_name + '\nEmail: ' + U.normEmail(p.email) + '\nAffiliation: ' + affText + '\nInterest: ' + label + (p.note ? '\nNote: ' + U.clip(p.note, 1000) : '') +
      '\n\nThey gave permission to share these details with you for this request only. Please do not add them to other lists without asking.';

    if (state === 'active') {
      message = 'You’re on the ' + group.label + ' roster. We’ve emailed you the welcome information' + (group.meet_url ? ' and the room link' : '') + '. No account is needed.';
      ackBody =
        'Hi ' + firstName(person.display_name) + ',\n\nYou’re now on the roster for the Canopy working group “' + group.label + '”.\n\n' +
        (group.welcome_message ? group.welcome_message + '\n\n' : '') +
        (group.next_gathering ? 'Next gathering: ' + group.next_gathering + '\n' : 'No next gathering is scheduled yet.\n') +
        (group.meet_url ? 'Room link: ' + group.meet_url + '\n(A reusable link does not mean someone is waiting in the room — agree a time with the group.)\n' : '') +
        (group.notes_url ? 'Shared notes: ' + group.notes_url + '\n' : '') +
        '\nIf you change your mind, leave the group here: ' + withdrawLink;
      if (contact) {
        C.queueNotification(store, ctx, {
          kind: 'group_join_fyi', to: contact, subject: '[Canopy] New member joined ' + group.label, related: 'Memberships:' + mem.id, dedupe_key: 'fyi:' + mem.id,
          body: 'Someone joined the ' + group.label + ' group through open enrollment. They have received the welcome information.\n\n' + details
        });
      }
    } else {
      var who = routing === 'group_contact' ? 'the ' + group.label + ' group’s contact' : routing === 'intake_steward' ? 'the Canopy steward who welcomes newcomers' : '';
      var prefix = state === 'waitlisted' ? 'The ' + group.label + ' group isn’t taking new people right now, so we recorded your interest for later. ' : '';
      message =
        prefix +
        (who
          ? 'We’ve sent your request to ' + who + '. You are not a member yet — they will follow up with you by email.'
          : 'Your interest is recorded, but no one has been assigned to follow up yet. A coalition steward will see it when requests are reviewed. You are not a member yet.');
      ackBody =
        'Hi ' + firstName(person.display_name) + ',\n\nThanks for your interest in ' + label + '.\n\n' + message + '\n\n' +
        'Sending this email does not guarantee someone has read your request. If you have not heard back in two weeks, reply to this email or ask on the next monthly call.\n\n' +
        'To withdraw your request: ' + withdrawLink;
      if (routedTo) {
        C.queueNotification(store, ctx, {
          kind: routing === 'group_contact' ? 'group_interest' : 'intake_request',
          to: routedTo,
          subject: '[Canopy] ' + (state === 'waitlisted' ? 'Waitlisted interest: ' : 'New interest: ') + label,
          related: 'Memberships:' + mem.id,
          dedupe_key: 'route:' + mem.id,
          body:
            'A person would like to get involved in ' + label + (state === 'waitlisted' ? ' (the group is paused/full, so this is waitlisted)' : '') + '.\n\n' + details +
            '\n\nPlease acknowledge, welcome or resolve this request here (no login needed, this link is only for you): ' + respondLink +
            '\nOr update the Memberships tab in the Canopy Admin sheet.'
        });
      }
    }

    C.queueNotification(store, ctx, {
      kind: 'acknowledgement', to: p.email, subject: '[Canopy] ' + (state === 'active' ? 'Welcome to ' + group.label : 'We received your request'), related: 'Memberships:' + mem.id, dedupe_key: 'ack:' + mem.id, body: ackBody
    });

    return {
      ok: true,
      status: state === 'active' ? 'joined' : routing === 'unassigned' ? 'recorded_unassigned' : state === 'waitlisted' ? 'waitlisted' : 'routed',
      membership_state: state,
      reference: mem.id,
      message: message,
      refs: ['Memberships:' + mem.id, 'People:' + person.id].concat(affIds.map(function (a) { return 'Affiliations:' + a; }))
    };
  };

  handlers.event = function (store, ctx, p, sub, settings) {
    var errors = {};
    if (!U.str(p.title)) errors.title = 'Event title is required.';
    if (!U.str(p.organizer)) errors.organizer = 'Who is organising it?';
    var d = T.parseDate(p.date);
    if (!d) errors.date = 'Use the date picker or YYYY-MM-DD.';
    if (!T.parseTime(p.start_time)) errors.start_time = 'Start time is required (Central Time).';
    if (p.end_time && !T.parseTime(p.end_time)) errors.end_time = 'End time is not a valid time.';
    if (!U.str(p.venue) && !U.isHttpUrl(p.online_url)) errors.venue = 'Give a venue, or an online link.';
    if (U.str(p.venue) && !U.str(p.city)) errors.city = 'Which city or town?';
    if (COUNTIES.indexOf(U.str(p.county)) < 0) errors.county = 'Choose a county (or Online).';
    if (!U.str(p.relevance)) errors.relevance = 'One sentence on how it connects to sustainability or resilience.';
    if (p.category && C.CATEGORIES.indexOf(U.str(p.category)) < 0) errors.category = 'Choose a topic from the list.';
    if (p.source_url && !U.isHttpUrl(p.source_url)) errors.source_url = 'Links must start with https://';
    if (p.registration_url && !U.isHttpUrl(p.registration_url)) errors.registration_url = 'Links must start with https://';
    if (!U.str(p.submitter_name)) errors.submitter_name = 'Your name is required.';
    if (!U.isEmail(p.submitter_email)) errors.submitter_email = 'An email for questions (kept private).';
    if (d) {
      var start = T.localToDate(p.date, p.start_time || '00:00');
      var now = ctx.now();
      if (start && start.getTime() < now.getTime() - 86400000) errors.date = 'That date has passed.';
      if (start && start.getTime() > now.getTime() + 2 * 366 * 86400000) errors.date = 'Please submit events within the next two years.';
    }
    if (Object.keys(errors).length) return fail(errors);

    var dup = store.list('Events').filter(function (e) {
      return e.date === p.date && U.norm(e.title) === U.norm(p.title) && e.status !== 'archived';
    })[0];
    var token = U.newToken(ctx);
    var org = C.findOrgByName(store, p.organizer);
    var publisher = C.findPublisher(store, p.publisher_key);
    var keyRejected = !!U.str(p.publisher_key) && !publisher;
    var trusted = !!publisher && !dup;
    var ev = store.insert('Events', {
      id: U.makeId('evt', ctx),
      title: U.clip(p.title, 160),
      organizer: U.clip(p.organizer, 160),
      organization_id: org ? org.id : '',
      date: p.date,
      start_time: T.normTime(p.start_time),
      end_date: T.parseDate(p.end_date) ? p.end_date : '',
      end_time: T.normTime(p.end_time),
      venue: U.clip(p.venue, 200),
      city: U.clip(p.city, 80),
      county: U.str(p.county),
      online_url: U.safeUrl(p.online_url),
      source_url: U.safeUrl(p.source_url),
      registration_url: U.safeUrl(p.registration_url),
      relevance: U.clip(p.relevance, 400),
      cost: U.clip(p.cost, 120),
      accessibility: U.clip(p.accessibility, 400),
      submitter_name: U.clip(p.submitter_name, 120),
      submitter_email: U.normEmail(p.submitter_email),
      manage_token_hash: U.tokenHash(token),
      duplicate_of: dup ? dup.id : '',
      category: C.CATEGORIES.indexOf(U.str(p.category)) >= 0 ? U.str(p.category) : 'Other',
      published_via: trusted ? 'trusted publisher' : 'review',
      status: trusted ? 'approved' : 'pending',
      approved_by: trusted ? 'trusted publisher: ' + publisher.display_name : '',
      approved_at: trusted ? U.nowIso(ctx) : '',
      visibility: 'public',
      verification: trusted ? 'verified' : 'self_reported',
      source_ref: sub.id,
      created_at: U.nowIso(ctx),
      updated_at: U.nowIso(ctx)
    });
    if (trusted) C.audit(store, ctx, 'trusted publisher: ' + publisher.display_name, 'status:→approved', 'Events', ev.id, 'published directly');
    var manage = siteLink(settings, 'manage?t=' + token);
    var steward = C.roleEmail(store, 'events_steward');
    if (steward && trusted) {
      C.queueNotification(store, ctx, {
        kind: 'event_published', to: steward, subject: '[Calendar] Published by a trusted publisher: ' + ev.title, related: 'Events:' + ev.id, dedupe_key: 'review:' + ev.id,
        body: publisher.display_name + ' published this event directly (trusted publisher).\n\n' + ev.title + '\n' + T.formatLongDate(ev.date) + ' ' + T.formatTime(ev.start_time) + '\nSource: ' + (ev.source_url || 'none given') + '\n\nNo action needed. To take it down: Events tab → select the row → Canopy → Unpublish.'
      });
    } else if (steward) {
      C.queueNotification(store, ctx, {
        kind: 'event_review', to: steward, subject: '[Canopy] Event to review: ' + ev.title, related: 'Events:' + ev.id, dedupe_key: 'review:' + ev.id,
        body: 'A community-calendar event is waiting for review' + (dup ? ' (possible duplicate of ' + dup.id + ')' : '') + '.\n\n' + ev.title + '\n' + T.formatLongDate(ev.date) + ' ' + T.formatTime(ev.start_time) + '\nOrganizer: ' + ev.organizer + '\nRelevance: ' + ev.relevance + '\nSource: ' + (ev.source_url || 'none given') + '\n\nApprove it in the Canopy Admin sheet → Events tab (select the row → Canopy menu → Approve).'
      });
    }
    C.queueNotification(store, ctx, {
      kind: 'acknowledgement', to: p.submitter_email, subject: '[Canopy] Event received: ' + ev.title, related: 'Events:' + ev.id, dedupe_key: 'ack:' + ev.id,
      body: (trusted ? 'Thanks — your event “' + ev.title + '” is published on the calendar now.\n\n' : 'Thanks — your event “' + ev.title + '” was received and is waiting for a steward to review it. It is not on the public calendar yet.\n\n') +
        (steward ? '' : 'Note: no calendar steward is assigned yet, so review may take until the next monthly call.\n\n') +
        'To correct or cancel this event later, use this private link: ' + manage
    });
    if (trusted) {
      return { ok: true, status: 'published', reference: ev.id, refs: ['Events:' + ev.id], message: 'Published! Your event is on the calendar now. We emailed you a private link to correct or cancel it.' };
    }
    return {
      ok: true, status: 'pending_review', reference: ev.id, refs: ['Events:' + ev.id],
      message: (keyRejected ? 'Your publishing link wasn’t recognized, so this event will be reviewed first. ' : dup && publisher ? 'An event with this title and date already exists, so a steward will check it first. ' : '') + 'Thanks! Your event was received and is pending review — it is not public yet.' + (steward ? ' A calendar steward has been notified.' : ' No calendar steward is assigned yet, so review may wait until the next monthly call.') + ' We emailed you a private link to correct or cancel it.'
    };
  };

  handlers.organization = function (store, ctx, p, sub, settings) {
    var errors = {};
    if (!U.str(p.name)) errors.name = 'Your preferred name is required.';
    if (!U.isEmail(p.email)) errors.email = 'A private coordination email is required (never published).';
    var individual = U.yes(p.as_individual);
    if (!individual && !U.str(p.org_name)) errors.org_name = 'Enter an organization, or tick “participating as an individual”.';
    if (!U.str(p.locality)) errors.locality = 'Where do you or your organization work?';
    if (!U.str(p.description)) errors.description = 'A sentence or two about your work.';
    if (p.website && !U.isHttpUrl(p.website)) errors.website = 'Links must start with https://';
    if (p.logo_url && !U.isHttpUrl(p.logo_url)) errors.logo_url = 'Links must start with https://';
    if (p.public_email && !U.isEmail(p.public_email)) errors.public_email = 'Not a valid email.';
    if (Object.keys(errors).length) return fail(errors);

    var person = C.upsertPerson(store, ctx, Object.assign({}, p, { public_contact: individual ? p.public_email : '' }), sub.id);
    var refs = ['People:' + person.id];
    var orgRow = null, dupOf = '';
    if (!individual) {
      var match = C.findOrgByName(store, p.org_name);
      dupOf = match ? match.id : '';
      // Always a new pending row: an unverified submission never silently overwrites a listing.
      orgRow = store.insert('Organizations', {
        id: U.makeId('org', ctx),
        name: U.clip(p.org_name, 160),
        description: U.clip(p.description, 600),
        mission: U.clip(p.mission, 600),
        website: U.safeUrl(p.website),
        public_email: U.isEmail(p.public_email) && U.yes(p.consent_contact_publish) ? U.normEmail(p.public_email) : '',
        locality: U.clip(p.locality, 160),
        service_area: U.clip(p.service_area, 160),
        interests: U.list(p.interests).join('; '),
        offers: U.clip(p.offers, 400),
        needs: U.clip(p.needs, 400),
        logo_url: U.safeUrl(p.logo_url),
        duplicate_of: dupOf,
        status: 'pending',
        visibility: 'public',
        verification: 'self_reported',
        source_ref: sub.id,
        created_at: U.nowIso(ctx),
        updated_at: U.nowIso(ctx),
        steward_note: dupOf ? 'Possible update/duplicate of ' + dupOf + ' — compare and merge by hand; the existing listing was not changed.' : ''
      });
      refs.push('Organizations:' + orgRow.id);
      var aff = store.insert('Affiliations', {
        id: U.makeId('aff', ctx), person_id: person.id, organization_id: orgRow.id, org_name_reported: orgRow.name, role_title: U.clip(p.role_title, 120),
        authorized_to_represent: ['yes', 'no', 'unsure'].indexOf(U.str(p.authorized)) >= 0 ? U.str(p.authorized) : 'unsure',
        status: 'pending', visibility: 'public', verification: 'self_reported', source_ref: sub.id, created_at: U.nowIso(ctx), updated_at: U.nowIso(ctx)
      });
      refs.push('Affiliations:' + aff.id);
    } else if (p.description && !person.interests) {
      store.update('People', person.id, { interests: U.list(p.interests).join('; ') });
    }
    var steward = C.roleEmail(store, 'directory_steward');
    if (steward) {
      C.queueNotification(store, ctx, {
        kind: 'directory_review', to: steward, subject: '[Canopy] Directory listing to review: ' + (orgRow ? orgRow.name : person.display_name), related: refs[refs.length - 1], dedupe_key: 'review:' + sub.id,
        body: 'A directory listing is waiting for review' + (dupOf ? ' (an organization with this name already exists: ' + dupOf + ' — nothing was overwritten)' : '') + '.\n\n' +
          'Submitted by: ' + person.display_name + (orgRow ? '\nOrganization: ' + orgRow.name + '\nAuthorized to represent: ' + (U.str(p.authorized) || 'unsure') : '\nParticipating as an individual') +
          '\nDirectory consent: ' + U.yn(p.consent_directory) + '\n\nReview in the Canopy Admin sheet (Organizations / People tabs).'
      });
    }
    C.queueNotification(store, ctx, {
      kind: 'acknowledgement', to: p.email, subject: '[Canopy] Directory submission received', related: refs[0], dedupe_key: 'ack:' + sub.id,
      body: 'Hi ' + firstName(p.name) + ',\n\nThanks — your directory submission was received. It is pending review and is not public yet. Your private email will not be published.' +
        (U.yes(p.consent_directory) ? '' : '\n\nYou did not ask to be listed in the public directory, so your name will not appear there.')
    });
    return {
      ok: true, status: 'pending_review', reference: orgRow ? orgRow.id : person.id, refs: refs,
      message: 'Thanks! Your submission is pending review and is not public yet.' + (dupOf ? ' A listing with this name already exists; a steward will compare them — nothing was overwritten.' : '') + ' Your private email will never be published.'
    };
  };

  handlers.update = function (store, ctx, p, sub, settings) {
    var errors = {};
    if (!U.str(p.name)) errors.name = 'Your name is required.';
    if (!U.isEmail(p.email)) errors.email = 'An email for follow-up (kept private).';
    if (!U.str(p.update_text)) errors.update_text = 'Share one update.';
    if (p.link && !U.isHttpUrl(p.link)) errors.link = 'Links must start with https://';
    if (Object.keys(errors).length) return fail(errors);
    var person = C.upsertPerson(store, ctx, p, sub.id);
    var org = p.org_name ? C.findOrgByName(store, p.org_name) : null;
    var meeting = C.nextMeeting(store, ctx);
    var up = store.insert('Updates', {
      id: U.makeId('upd', ctx), meeting_id: meeting ? meeting.id : '', person_id: person.id, organization_id: org ? org.id : '', display_name: U.clip(p.name, 120),
      org_display: U.clip(p.org_name, 160), update_text: U.clip(p.update_text, 1000), upcoming_date: U.clip(p.upcoming_date, 200), ask_offer: U.clip(p.ask_offer, 600),
      link: U.safeUrl(p.link), publish_consent: U.yn(p.consent_publish), status: 'pending', visibility: 'public', verification: 'self_reported', source_ref: sub.id,
      created_at: U.nowIso(ctx), updated_at: U.nowIso(ctx)
    });
    var fac = C.roleEmail(store, 'facilitator');
    if (fac) {
      C.queueNotification(store, ctx, {
        kind: 'update_received', to: fac, subject: '[Canopy] Monthly update from ' + up.display_name, related: 'Updates:' + up.id, dedupe_key: 'review:' + up.id,
        body: 'For the ' + (meeting ? T.formatLongDate(meeting.date) : 'next') + ' call.\n\nFrom: ' + up.display_name + (up.org_display ? ' (' + up.org_display + ')' : '') + '\nUpdate: ' + up.update_text + '\nUpcoming: ' + (up.upcoming_date || '—') + '\nAsk/offer: ' + (up.ask_offer || '—') + '\nOK to publish: ' + up.publish_consent
      });
    }
    C.queueNotification(store, ctx, {
      kind: 'acknowledgement', to: p.email, subject: '[Canopy] Update received', related: 'Updates:' + up.id, dedupe_key: 'ack:' + up.id,
      body: 'Thanks — your update was received for the ' + (meeting ? T.formatLongDate(meeting.date) : 'next') + ' call. ' + (U.yes(p.consent_publish) ? 'It may appear in the public recap after review.' : 'You asked us not to publish it; it will be shared with the facilitator only.')
    });
    return { ok: true, status: 'received', reference: up.id, refs: ['Updates:' + up.id, 'People:' + person.id], message: 'Thanks! Your update was received for the next call' + (fac ? ' and sent to the facilitator.' : '. No facilitator is assigned yet; it will be reviewed when the agenda is prepared.') };
  };

  /** A collaborator proposes a progress update on a published action item (no Sheet access needed). */
  handlers.item_update = function (store, ctx, p, sub, settings) {
    var errors = {};
    var item = store.get('ActionItems', U.str(p.item_id));
    if (!item || item.status !== 'approved') errors.item_id = 'That action item could not be found.';
    if (!U.str(p.name)) errors.name = 'Please tell us who is sending the update.';
    if (p.email && !U.isEmail(p.email)) errors.email = 'Not a valid email.';
    var progress = U.str(p.progress);
    if (progress && ['open', 'in_progress', 'done', 'dropped'].indexOf(progress) < 0) errors.progress = 'Choose a status from the list.';
    if (!progress && !U.str(p.next_step) && !U.str(p.note)) errors.note = 'Share a status, a next step or a short note.';
    if (Object.keys(errors).length) return fail(errors);
    var changes = {};
    if (progress && progress !== item.progress) changes.progress = progress;
    if (U.str(p.next_step) && U.str(p.next_step) !== U.str(item.next_step)) changes.next_step = U.clip(p.next_step, 400);
    var cor = store.insert('Corrections', {
      id: U.makeId('cor', ctx), received_at: U.nowIso(ctx), record_ref: 'ActionItems:' + item.id,
      description: 'Progress update from ' + U.clip(p.name, 120) + (p.note ? ': ' + U.clip(p.note, 1000) : ''),
      proposed_changes: Object.keys(changes).length ? JSON.stringify(changes) : '',
      requester_name: U.clip(p.name, 120), requester_email: U.normEmail(p.email), state: 'open'
    });
    var steward = C.roleEmail(store, 'facilitator') || C.roleEmail(store, 'communications_steward');
    if (steward) {
      C.queueNotification(store, ctx, {
        kind: 'item_update', to: steward, subject: '[Canopy] Update on: ' + U.clip(item.description, 80), related: 'Corrections:' + cor.id, dedupe_key: 'review:' + cor.id,
        body: 'Action item: ' + item.description + '\nCurrent status: ' + (item.progress || 'open') + '\n\nUpdate from ' + U.clip(p.name, 120) + ':\n' +
          (changes.progress ? 'New status: ' + changes.progress + '\n' : '') + (changes.next_step ? 'Next step: ' + changes.next_step + '\n' : '') + (p.note ? 'Note: ' + U.clip(p.note, 1000) + '\n' : '') +
          '\nTo publish it: Canopy Admin → Corrections tab → select this row → Canopy → Apply selected correction.'
      });
    }
    if (U.isEmail(p.email)) {
      C.queueNotification(store, ctx, { kind: 'acknowledgement', to: p.email, subject: '[Canopy] Update received', related: 'Corrections:' + cor.id, dedupe_key: 'ack:' + cor.id, body: 'Thanks — your update on “' + item.description + '” was received and will appear on the site after a quick review.' });
    }
    return {
      ok: true, status: 'pending_review', reference: cor.id, refs: ['Corrections:' + cor.id],
      message: 'Thanks! Your update was received and will appear after a quick review' + (steward ? ' (the facilitator has been notified).' : '. No facilitator is assigned yet, so it will be reviewed before the next call.')
    };
  };

  handlers.correction = function (store, ctx, p, sub, settings) {
    var errors = {};
    if (!U.str(p.description)) errors.description = 'What should be corrected or removed?';
    if (p.email && !U.isEmail(p.email)) errors.email = 'Not a valid email.';
    if (Object.keys(errors).length) return fail(errors);
    var cor = store.insert('Corrections', {
      id: U.makeId('cor', ctx), received_at: U.nowIso(ctx), record_ref: U.clip(p.record_ref, 120), description: U.clip(p.description, 2000), proposed_changes: '',
      requester_name: U.clip(p.name, 120), requester_email: U.normEmail(p.email), state: 'open'
    });
    var steward = C.roleEmail(store, 'communications_steward') || C.roleEmail(store, 'directory_steward');
    if (steward) {
      C.queueNotification(store, ctx, {
        kind: 'correction', to: steward, subject: '[Canopy] Correction request', related: 'Corrections:' + cor.id, dedupe_key: 'review:' + cor.id,
        body: 'Record: ' + (cor.record_ref || 'not specified') + '\nRequest: ' + cor.description + '\nFrom: ' + (cor.requester_name || 'anonymous') + (cor.requester_email ? ' <' + cor.requester_email + '>' : '') + '\n\nResolve it in the Corrections tab.'
      });
    }
    if (U.isEmail(p.email)) {
      C.queueNotification(store, ctx, { kind: 'acknowledgement', to: p.email, subject: '[Canopy] Correction request received', related: 'Corrections:' + cor.id, dedupe_key: 'ack:' + cor.id, body: 'Thanks — your correction request was received and will be reviewed by a steward.' });
    }
    return { ok: true, status: 'received', reference: cor.id, refs: ['Corrections:' + cor.id], message: 'Thanks — your correction request was received.' + (steward ? ' A steward has been notified.' : ' No steward is assigned yet; it is recorded for review.') };
  };

  C.nextMeeting = function (store, ctx) {
    var now = ctx.now().getTime();
    return store
      .list('Meetings')
      .filter(function (m) {
        var end = T.localToDate(m.date, m.end_time || '11:00');
        return m.status === 'approved' && end && end.getTime() >= now;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      })[0] || null;
  };

  C.SUBMISSION_TYPES = Object.keys(handlers);

  /** Entry point for every public form. */
  C.submit = function (store, ctx, payload) {
    payload = payload || {};
    var settings = C.settings(store);
    var type = U.str(payload.type);
    if (C.SUBMISSION_TYPES.indexOf(type) < 0) return { ok: false, code: 'bad_type', message: 'Unknown form.' };
    if (settings.SUBMISSIONS_ENABLED && !U.yes(settings.SUBMISSIONS_ENABLED)) {
      return { ok: false, code: 'paused', message: 'Online submissions are paused right now. Please try again later or ask on the next monthly call.' };
    }
    var clientId = U.clip(payload.client_id, 64);
    if (clientId) {
      var prior = store.list('Submissions').filter(function (s) {
        return s.client_id === clientId;
      })[0];
      if (prior) {
        var stored = U.parseJson(prior.outcome, null);
        if (stored) {
          stored.replayed = true;
          return stored;
        }
      }
    }
    var email = U.normEmail(payload.email || payload.submitter_email);
    // Honeypot: real people never fill the hidden "website_hp" field.
    if (U.str(payload.website_hp)) {
      return { ok: true, status: 'received', message: 'Thanks — your submission was received.' };
    }
    if (email) {
      var hourAgo = ctx.now().getTime() - 3600000;
      var recent = store.list('Submissions').filter(function (s) {
        return s.email_norm === email && new Date(s.received_at).getTime() > hourAgo;
      }).length;
      if (recent >= 12) return { ok: false, code: 'rate_limited', message: 'We have received many submissions from this address in the last hour. Please try again later.' };
    }
    var clean = {};
    Object.keys(payload).forEach(function (k) {
      if (k !== 'website_hp') clean[k] = payload[k];
    });
    var sub = store.insert('Submissions', {
      id: U.makeId('sub', ctx),
      received_at: U.nowIso(ctx),
      type: type,
      client_id: clientId,
      email_norm: email,
      payload_json: U.clip(JSON.stringify(clean), 45000),
      outcome: JSON.stringify({ ok: true, status: 'received', message: 'Received.' })
    });
    var before = store.list('Notifications').map(function (n) {
      return n.id;
    });
    var result;
    try {
      result = handlers[type](store, ctx, payload, sub, settings);
    } catch (e) {
      var msg = U.clip(e && e.message ? e.message : String(e), 500);
      store.update('Submissions', sub.id, { error: msg, processed_at: U.nowIso(ctx), outcome: JSON.stringify({ ok: true, status: 'saved_needs_attention', message: 'Your submission was saved, but something went wrong processing it. A steward will follow up.' }) });
      var exc = C.roleEmail(store, 'exceptions_steward');
      if (exc) C.queueNotification(store, ctx, { kind: 'escalation', to: exc, subject: '[Canopy] Submission needs attention', related: 'Submissions:' + sub.id, dedupe_key: 'err:' + sub.id, body: 'Processing failed: ' + msg + '\nSubmission ' + sub.id + ' is saved in the Submissions tab.' });
      return { ok: true, status: 'saved_needs_attention', reference: sub.id, message: 'Your submission was saved, but something went wrong processing it. A steward will follow up.' };
    }
    var created = store
      .list('Notifications')
      .filter(function (n) {
        return before.indexOf(n.id) < 0;
      })
      .map(function (n) {
        return n.id;
      });
    var publicResult = { ok: result.ok, status: result.status, code: result.code, message: result.message, errors: result.errors, reference: result.reference, membership_state: result.membership_state };
    if (result.ok) {
      store.update('Submissions', sub.id, { outcome: JSON.stringify(publicResult), record_refs: (result.refs || []).join(' '), processed_at: U.nowIso(ctx) });
    } else {
      // A rejected (invalid) submission is kept briefly for abuse checks but never replayed.
      store.update('Submissions', sub.id, { outcome: JSON.stringify({ ok: false, status: 'invalid' }), client_id: '', processed_at: U.nowIso(ctx), error: 'validation: ' + Object.keys(result.errors || {}).join(',') });
    }
    publicResult._notificationIds = created;
    return publicResult;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
