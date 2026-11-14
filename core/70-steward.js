/*
 * Steward actions (no code needed: they are wired to the "Canopy" menu in the Admin
 * sheet) and private-link actions for participants (withdraw / respond / manage event).
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;
  var S = C.schema;
  var T = C.time;

  function stamp(ctx, actor) {
    return { updated_at: U.nowIso(ctx), updated_by: actor };
  }

  /** Change editorial status. Returns the updated row. */
  C.setStatus = function (store, ctx, actor, table, id, status, note) {
    if (S.editorial.indexOf(table) < 0) throw new Error(table + ' has no editorial status.');
    if (S.STATUS.indexOf(status) < 0) throw new Error('Unknown status ' + status);
    var row = store.get(table, id);
    if (!row) throw new Error('Not found: ' + table + ' ' + id);
    var patch = stamp(ctx, actor);
    patch.status = status;
    if (status === 'approved') {
      patch.approved_by = actor;
      patch.approved_at = U.nowIso(ctx);
    }
    if (status === 'cancelled' && note && 'cancelled_reason' in row) patch.cancelled_reason = note;
    var out = store.update(table, id, patch);
    C.audit(store, ctx, actor, 'status:' + row.status + '→' + status, table, id, note || '');
    return out;
  };

  C.approve = function (store, ctx, actor, table, id) {
    var row = store.get(table, id);
    if (table === 'People' && row && !U.yes(row.directory_consent)) {
      // Approving is allowed (verifies the record) but the projection still hides them.
      C.audit(store, ctx, actor, 'note', table, id, 'approved without directory consent — will not be listed');
    }
    return C.setStatus(store, ctx, actor, table, id, 'approved');
  };
  C.unpublish = function (store, ctx, actor, table, id) {
    return C.setStatus(store, ctx, actor, table, id, 'unpublished');
  };
  C.cancel = function (store, ctx, actor, table, id, reason) {
    return C.setStatus(store, ctx, actor, table, id, 'cancelled', reason);
  };
  C.archive = function (store, ctx, actor, table, id) {
    return C.setStatus(store, ctx, actor, table, id, 'archived');
  };
  C.verify = function (store, ctx, actor, table, id) {
    var out = store.update(table, id, Object.assign(stamp(ctx, actor), { verification: 'verified' }));
    C.audit(store, ctx, actor, 'verified', table, id, '');
    return out;
  };

  /** Apply a correction's proposed changes to the record it references. */
  C.applyCorrection = function (store, ctx, actor, correctionId, overrideChanges) {
    var cor = store.get('Corrections', correctionId);
    if (!cor) throw new Error('Correction not found');
    if (cor.state !== 'open') throw new Error('Correction already ' + cor.state);
    var ref = U.str(cor.record_ref).split(':');
    var table = ref[0], id = ref[1];
    if (!S.correctable[table]) throw new Error('Record reference must look like Events:evt-123 (got "' + cor.record_ref + '")');
    var row = store.get(table, id);
    if (!row) throw new Error('Referenced record not found: ' + cor.record_ref);
    var changes = overrideChanges || U.parseJson(cor.proposed_changes, {});
    var patch = stamp(ctx, actor);
    var applied = {};
    Object.keys(changes || {}).forEach(function (f) {
      if (S.correctable[table].indexOf(f) >= 0) {
        patch[f] = U.clip(changes[f], 2000);
        applied[f] = { from: row[f], to: patch[f] };
      }
    });
    if (!Object.keys(applied).length) throw new Error('No correctable fields in this correction. Edit the record directly, then mark the correction resolved.');
    store.update(table, id, patch);
    store.update('Corrections', correctionId, { state: 'resolved', resolved_by: actor, resolved_at: U.nowIso(ctx) });
    C.audit(store, ctx, actor, 'apply_correction', table, id, applied);
    return applied;
  };

  C.resolveMembership = function (store, ctx, actor, membershipId, decision, message) {
    var mem = store.get('Memberships', membershipId);
    if (!mem) throw new Error('Request not found');
    var map = { acknowledge: 'acknowledged', welcome: 'active', decline: 'declined', withdraw: 'withdrawn' };
    var state = map[decision];
    if (!state) throw new Error('Unknown decision');
    if (['withdrawn', 'declined'].indexOf(mem.state) >= 0) return { changed: false, state: mem.state };
    if (mem.state === state) return { changed: false, state: state };
    store.update('Memberships', mem.id, { state: state, resolved_by: actor, resolved_at: U.nowIso(ctx), updated_at: U.nowIso(ctx) });
    C.audit(store, ctx, actor, 'membership:' + mem.state + '→' + state, 'Memberships', mem.id, U.clip(message, 300));
    var person = store.get('People', mem.person_id);
    var group = mem.group_id ? store.get('Groups', mem.group_id) : null;
    var label = group ? group.label : 'Canopy';
    if (person && (state === 'active' || state === 'declined')) {
      C.queueNotification(store, ctx, {
        kind: 'membership_' + state,
        to: person.private_email,
        subject: state === 'active' ? '[Canopy] Welcome to ' + label : '[Canopy] About your request to join ' + label,
        related: 'Memberships:' + mem.id,
        dedupe_key: 'decision:' + mem.id + ':' + state,
        body:
          state === 'active'
            ? 'Good news — the ' + label + ' contact confirmed you as a member.\n\n' + (group && group.welcome_message ? group.welcome_message + '\n\n' : '') + (group && group.meet_url ? 'Room link: ' + group.meet_url + '\n' : '') + (message ? '\nMessage from the contact: ' + U.clip(message, 1000) : '')
            : 'Thanks for your interest in ' + label + '. The group contact wasn’t able to add you right now.' + (message ? '\n\nMessage from the contact: ' + U.clip(message, 1000) : '') + '\n\nYou are welcome on the monthly Canopy call, and you can ask for help finding another place on the site.'
      });
    }
    if (state === 'withdrawn' && mem.routed_to) {
      C.queueNotification(store, ctx, {
        kind: 'membership_withdrawn', to: mem.routed_to, subject: '[Canopy] A request for ' + label + ' was withdrawn', related: 'Memberships:' + mem.id, dedupe_key: 'withdrawn:' + mem.id,
        body: 'The person who asked about ' + label + ' has withdrawn their request (' + mem.id + '). No action is needed.'
      });
    }
    return { changed: true, state: state };
  };

  /* -------- private links (token holders only; no account) -------- */

  function findByToken(store, table, field, token) {
    if (!token || String(token).length < 20) return null;
    var h = U.tokenHash(token);
    return store.list(table).filter(function (r) {
      return r[field] === h;
    })[0] || null;
  }

  C.tokenInfo = function (store, ctx, kind, token) {
    if (kind === 'withdraw' || kind === 'respond') {
      var mem = findByToken(store, 'Memberships', kind === 'withdraw' ? 'withdraw_token_hash' : 'respond_token_hash', token);
      if (!mem) return { ok: false, message: 'This link is not valid or has expired.' };
      var g = mem.group_id ? store.get('Groups', mem.group_id) : null;
      var info = { ok: true, kind: kind, state: mem.state, label: g ? g.label : 'General interest (help finding a place)' };
      if (kind === 'respond') {
        var p = store.get('People', mem.person_id);
        info.requester_first_name = p ? U.str(p.display_name).split(/\s+/)[0] : '';
        info.note = mem.note;
      }
      return info;
    }
    if (kind === 'manage') {
      var ev = findByToken(store, 'Events', 'manage_token_hash', token);
      if (!ev) return { ok: false, message: 'This link is not valid or has expired.' };
      var o = { ok: true, kind: 'manage', status: ev.status, event: {} };
      S.correctable.Events.forEach(function (f) {
        o.event[f] = ev[f];
      });
      return o;
    }
    return { ok: false, message: 'Unknown link.' };
  };

  C.tokenAction = function (store, ctx, body) {
    var kind = U.str(body.kind), token = U.str(body.token);
    if (kind === 'withdraw') {
      var mem = findByToken(store, 'Memberships', 'withdraw_token_hash', token);
      if (!mem) return { ok: false, message: 'This link is not valid.' };
      var r = C.resolveMembership(store, ctx, 'participant (private link)', mem.id, 'withdraw');
      return { ok: true, state: r.state, message: r.changed ? 'Your request has been withdrawn. The contact has been told; no further emails will be sent about it.' : 'This request was already ' + r.state + '.' };
    }
    if (kind === 'respond') {
      var m2 = findByToken(store, 'Memberships', 'respond_token_hash', token);
      if (!m2) return { ok: false, message: 'This link is not valid.' };
      var decision = U.str(body.decision);
      if (['acknowledge', 'welcome', 'decline'].indexOf(decision) < 0) return { ok: false, message: 'Choose acknowledge, welcome or decline.' };
      var r2 = C.resolveMembership(store, ctx, 'contact (private link): ' + m2.routed_to, m2.id, decision, body.message);
      var msgs = { acknowledged: 'Marked as acknowledged. Please follow up with them directly.', active: 'They are now an active member and have been sent the welcome information.', declined: 'Marked as declined. They have been sent a polite note.' };
      return { ok: true, state: r2.state, message: r2.changed ? msgs[r2.state] : 'This request is already ' + r2.state + '.' };
    }
    if (kind === 'manage') {
      var ev = findByToken(store, 'Events', 'manage_token_hash', token);
      if (!ev) return { ok: false, message: 'This link is not valid.' };
      if (body.op === 'cancel') {
        if (ev.status === 'cancelled') return { ok: true, message: 'This event is already cancelled.' };
        C.setStatus(store, ctx, 'submitter (private link)', 'Events', ev.id, 'cancelled', U.clip(body.reason, 300) || 'Cancelled by organizer');
        var st = C.roleEmail(store, 'events_steward');
        if (st) C.queueNotification(store, ctx, { kind: 'event_cancelled', to: st, subject: '[Canopy] Event cancelled by organizer: ' + ev.title, related: 'Events:' + ev.id, dedupe_key: 'cancel:' + ev.id, body: ev.title + ' (' + ev.date + ') was cancelled by its submitter and has been removed from upcoming views.' });
        return { ok: true, message: 'Cancelled. It has been removed from the upcoming calendar.' };
      }
      if (body.op === 'correct') {
        var changes = {};
        S.correctable.Events.forEach(function (f) {
          if (body.changes && body.changes[f] !== undefined && U.str(body.changes[f]) !== U.str(ev[f])) changes[f] = U.clip(body.changes[f], 600);
        });
        if (!Object.keys(changes).length) return { ok: false, message: 'No changes found.' };
        var cor = store.insert('Corrections', {
          id: U.makeId('cor', ctx), received_at: U.nowIso(ctx), record_ref: 'Events:' + ev.id, description: 'Organizer correction via private link', proposed_changes: JSON.stringify(changes),
          requester_name: ev.submitter_name, requester_email: ev.submitter_email, state: 'open'
        });
        var st2 = C.roleEmail(store, 'events_steward');
        if (st2) C.queueNotification(store, ctx, { kind: 'correction', to: st2, subject: '[Canopy] Event correction: ' + ev.title, related: 'Corrections:' + cor.id, dedupe_key: 'review:' + cor.id, body: 'Proposed changes to ' + ev.title + ':\n' + JSON.stringify(changes, null, 2) + '\n\nSelect the row in Corrections → Canopy menu → Apply selected correction.' });
        return { ok: true, message: 'Thanks — your correction was sent for review. The listing will update once a steward applies it.', reference: cor.id };
      }
      return { ok: false, message: 'Unknown action.' };
    }
    return { ok: false, message: 'Unknown link.' };
  };

  /** Steward checklist: what needs a human (shown in the "Canopy → Review queue" sidebar). */
  C.reviewQueue = function (store, ctx) {
    var q = { pending: [], unassigned: [], failed: [], corrections: [], upcomingWithoutLink: [] };
    S.editorial.forEach(function (t) {
      store.list(t).forEach(function (r) {
        if (r.status === 'pending') q.pending.push(t + ':' + r.id + ' — ' + (r.title || r.name || r.display_name || r.label || r.description || '').slice(0, 60));
      });
    });
    store.list('Memberships').forEach(function (m) {
      if (m.routing === 'unassigned' && ['interested', 'waitlisted'].indexOf(m.state) >= 0) q.unassigned.push('Memberships:' + m.id);
    });
    store.list('Notifications').forEach(function (n) {
      if (n.status === 'failed') q.failed.push('Notifications:' + n.id + ' → ' + n.to + ' (' + n.last_error + ')');
    });
    store.list('Corrections').forEach(function (c) {
      if (c.state === 'open') q.corrections.push('Corrections:' + c.id + ' — ' + c.record_ref);
    });
    var settings = C.settings(store);
    var next = C.nextMeeting(store, ctx);
    if (next && !U.safeUrl(next.meet_url) && !U.safeUrl(settings.MAIN_MEET_URL)) q.upcomingWithoutLink.push('Meetings:' + next.id + ' (' + next.date + ') has no join link — site shows “Link coming soon”.');
    return q;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
