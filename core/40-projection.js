/*
 * PUBLIC PROJECTION — the access-control boundary.
 * The public snapshot is built here, server-side, from an explicit allowlist of fields.
 * Nothing else in the private store is ever serialised to the public endpoint.
 * Rules:
 *   - only status === 'approved' and visibility !== 'restricted'
 *   - People appear only with directory_consent === 'yes'
 *   - a person's contact appears only with contact_publish_consent === 'yes'
 *   - private_email / submitter_email / contact_email / tokens / notes never appear
 *   - demo rows are labelled and excluded entirely unless Settings.SHOW_DEMO_CONTENT = yes
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;
  var T = C.time;

  function pick(row, fields) {
    var o = {};
    fields.forEach(function (f) {
      o[f] = U.str(row[f]);
    });
    return o;
  }

  C.PUBLIC_FIELDS = {
    Meetings: ['id', 'date', 'start_time', 'end_time', 'title', 'checkpoint', 'agenda'],
    Recaps: ['id', 'meeting_id', 'title', 'summary', 'decisions', 'next_steps', 'approved_at'],
    ActionItems: ['id', 'meeting_id', 'description', 'owner_display', 'due_date', 'progress', 'next_step', 'group_id'],
    Organizations: ['id', 'name', 'description', 'mission', 'website', 'public_email', 'locality', 'service_area', 'interests', 'offers', 'needs', 'logo_url', 'verification'],
    People: ['id', 'display_name', 'locality', 'interests'],
    Events: ['id', 'title', 'organizer', 'organization_id', 'date', 'start_time', 'end_date', 'end_time', 'venue', 'city', 'county', 'online_url', 'source_url', 'registration_url', 'relevance', 'cost', 'accessibility'],
    Groups: ['id', 'slot', 'label', 'label_note', 'purpose', 'group_status', 'enrollment_mode', 'intake', 'convenor_display', 'public_contact', 'meet_url', 'notes_url', 'next_gathering', 'time_expectation', 'current_needs', 'room_convention'],
    Requests: ['id', 'kind', 'title', 'description', 'owner_display', 'group_id', 'organization_id', 'progress', 'next_step', 'contact_public'],
    Updates: ['id', 'meeting_id', 'display_name', 'org_display', 'update_text', 'upcoming_date', 'ask_offer', 'link']
  };

  C.PUBLIC_SETTINGS = ['SITE_NAME', 'SITE_TAGLINE', 'ORG_FORM_URL', 'SITE_NOTICE', 'CORRECTIONS_EMAIL_PUBLIC', 'SUBMISSIONS_ENABLED', 'PLATFORM_NOTE'];

  function isPublic(row, showDemo) {
    if (U.str(row.status) !== 'approved') return false;
    if (U.str(row.visibility) === 'restricted') return false;
    if (U.yes(row.demo) && !showDemo) return false;
    return true;
  }
  C.isPublicRow = isPublic;

  function urlFields(o, fields) {
    fields.forEach(function (f) {
      if (f in o) o[f] = U.safeUrl(o[f]);
    });
    return o;
  }

  C.buildPublicSnapshot = function (store, ctx) {
    var settings = C.settings(store);
    var showDemo = U.yes(settings.SHOW_DEMO_CONTENT);
    var mainUrl = U.safeUrl(settings.MAIN_MEET_URL);

    function rows(table) {
      return store.list(table).filter(function (r) {
        return isPublic(r, showDemo);
      });
    }
    function demoFlag(src, o) {
      if (U.yes(src.demo)) o.demo = true;
      return o;
    }

    var orgsById = {};
    var organizations = rows('Organizations').map(function (r) {
      var o = demoFlag(r, urlFields(pick(r, C.PUBLIC_FIELDS.Organizations), ['website', 'logo_url']));
      if (!U.isEmail(o.public_email)) o.public_email = '';
      orgsById[r.id] = o;
      return o;
    });

    var affs = rows('Affiliations');
    var people = rows('People')
      .filter(function (r) {
        return U.yes(r.directory_consent);
      })
      .map(function (r) {
        var o = demoFlag(r, pick(r, C.PUBLIC_FIELDS.People));
        o.public_contact = U.yes(r.contact_publish_consent) ? U.str(r.public_contact) : '';
        o.affiliations = affs
          .filter(function (a) {
            return a.person_id === r.id && orgsById[a.organization_id];
          })
          .map(function (a) {
            return { organization_id: a.organization_id, organization: orgsById[a.organization_id].name, role_title: U.str(a.role_title), verification: U.str(a.verification) };
          });
        return o;
      });

    var meetings = store
      .list('Meetings')
      .filter(function (r) {
        // Scheduled meetings appear once approved; a cancelled meeting stays visible with its reason
        // so nobody turns up to a call that is not happening.
        return (r.status === 'approved' || r.status === 'cancelled') && r.visibility !== 'restricted' && (!U.yes(r.demo) || showDemo);
      })
      .map(function (r) {
        var o = demoFlag(r, pick(r, ['id', 'date', 'start_time', 'end_time', 'title', 'checkpoint', 'agenda']));
        o.cancelled = r.status === 'cancelled';
        o.cancelled_reason = o.cancelled ? U.str(r.cancelled_reason) : '';
        o.join_url = o.cancelled ? '' : U.safeUrl(r.meet_url) || mainUrl;
        o.start_iso = T.localToIso(r.date, r.start_time);
        o.end_iso = T.localToIso(r.date, r.end_time);
        o.zone = T.zoneLabel(r.date, r.start_time);
        return o;
      })
      .sort(function (a, b) {
        return a.start_iso < b.start_iso ? -1 : 1;
      });

    var events = rows('Events')
      .map(function (r) {
        var o = demoFlag(r, urlFields(pick(r, C.PUBLIC_FIELDS.Events), ['online_url', 'source_url', 'registration_url']));
        o.start_iso = T.localToIso(r.date, r.start_time || '00:00');
        o.end_iso = T.localToIso(r.end_date || r.date, r.end_time || r.start_time || '23:59');
        o.is_online = !!o.online_url;
        return o;
      })
      .sort(function (a, b) {
        return a.start_iso < b.start_iso ? -1 : 1;
      });

    var groups = rows('Groups')
      .map(function (r) {
        var o = demoFlag(r, urlFields(pick(r, C.PUBLIC_FIELDS.Groups), ['meet_url', 'notes_url']));
        o.accepting = o.group_status === 'active' && o.intake === 'open';
        o.has_contact = U.isEmail(r.contact_email);
        o.convenor_display = o.convenor_display || 'Not yet assigned';
        return o;
      })
      .sort(function (a, b) {
        return (+a.slot || 99) - (+b.slot || 99);
      });

    var snapshot = {
      generated_at: U.nowIso(ctx),
      timezone: T.TZ,
      demo_content_shown: showDemo,
      live_sending: U.yes(settings.LIVE_SENDING),
      settings: {},
      meetings: meetings,
      recaps: rows('Recaps').map(function (r) {
        return demoFlag(r, pick(r, C.PUBLIC_FIELDS.Recaps));
      }),
      action_items: rows('ActionItems').map(function (r) {
        var o = demoFlag(r, pick(r, C.PUBLIC_FIELDS.ActionItems));
        o.owner_display = o.owner_display || 'Not yet assigned';
        return o;
      }),
      organizations: organizations,
      people: people,
      events: events,
      groups: groups,
      requests: rows('Requests').map(function (r) {
        var o = demoFlag(r, pick(r, C.PUBLIC_FIELDS.Requests));
        o.owner_display = o.owner_display || 'Not yet assigned';
        return o;
      }),
      updates: rows('Updates')
        .filter(function (r) {
          return U.yes(r.publish_consent);
        })
        .map(function (r) {
          return demoFlag(r, urlFields(pick(r, C.PUBLIC_FIELDS.Updates), ['link']));
        })
    };
    C.PUBLIC_SETTINGS.forEach(function (k) {
      snapshot.settings[k] = U.str(settings[k]);
    });
    snapshot.settings.ORG_FORM_URL = U.safeUrl(settings.ORG_FORM_URL);
    snapshot.settings.MAIN_MEET_CONFIGURED = !!mainUrl;
    return snapshot;
  };

  /** Public iCalendar feed: approved, public Canopy meetings and community events only. */
  C.buildPublicIcs = function (store, ctx, which) {
    var snap = C.buildPublicSnapshot(store, ctx);
    var items = [];
    if (which !== 'events') {
      snap.meetings.forEach(function (m) {
        items.push({
          uid: m.id,
          date: m.date,
          start: m.start_time,
          end: m.end_time,
          title: (m.cancelled ? 'CANCELLED: ' : '') + (m.title || 'Canopy monthly call'),
          description: (m.join_url ? 'Join: ' + m.join_url + '\n' : 'Join link: coming soon\n') + (m.agenda || ''),
          url: m.join_url,
          cancelled: m.cancelled
        });
      });
    }
    if (which !== 'meetings') {
      snap.events.forEach(function (e) {
        items.push({
          uid: e.id,
          date: e.date,
          start: e.start_time || '00:00',
          end_date: e.end_date,
          end: e.end_time || e.start_time,
          title: e.title,
          description: [e.organizer ? 'Organizer: ' + e.organizer : '', e.relevance, e.cost ? 'Cost: ' + e.cost : '', e.accessibility ? 'Access: ' + e.accessibility : ''].filter(Boolean).join('\n'),
          location: [e.venue, e.city].filter(Boolean).join(', ') || (e.online_url ? 'Online' : ''),
          url: e.source_url || e.registration_url
        });
      });
    }
    return T.buildIcs(items, 'Canopy — DeKalb County sustainability', snap.generated_at);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Privacy self-check: no private address or token from the store may appear in public output
 * unless the same address was deliberately published as a public contact. */
(function (root) {
  var C = root.Canopy;
  var U = C.util;
  C.privacyAudit = function (store, ctx) {
    var snap = JSON.stringify(C.buildPublicSnapshot(store, ctx)) + C.buildPublicIcs(store, ctx, '');
    var allowed = {};
    var snapObj = JSON.parse(JSON.stringify(C.buildPublicSnapshot(store, ctx)));
    (snapObj.organizations || []).forEach(function (o) { if (o.public_email) allowed[o.public_email.toLowerCase()] = 1; });
    (snapObj.people || []).forEach(function (p) { (U.str(p.public_contact).match(/[^\s<>()]+@[^\s<>()]+/g) || []).forEach(function (e) { allowed[e.toLowerCase()] = 1; }); });
    (snapObj.groups || []).forEach(function (g) { (U.str(g.public_contact).match(/[^\s<>()]+@[^\s<>()]+/g) || []).forEach(function (e) { allowed[e.toLowerCase()] = 1; }); });
    var secrets = [];
    store.list('People').forEach(function (p) { secrets.push(p.private_email, p.email_norm, p.accessibility_notes); });
    store.list('Events').forEach(function (e) { secrets.push(e.submitter_email, e.manage_token_hash); });
    store.list('Groups').forEach(function (g) { secrets.push(g.contact_email, g.backup_email); });
    store.list('Roles').forEach(function (r) { secrets.push(r.email, r.backup_email); });
    store.list('Memberships').forEach(function (m) { secrets.push(m.withdraw_token_hash, m.respond_token_hash, m.note); });
    store.list('Corrections').forEach(function (c) { secrets.push(c.requester_email); });
    var leaks = [];
    secrets.forEach(function (s) {
      s = U.str(s);
      if (s.length < 6 || allowed[s.toLowerCase()]) return;
      if (snap.indexOf(s) >= 0 && leaks.indexOf(s) < 0) leaks.push(s);
    });
    return { ok: leaks.length === 0, leaks: leaks };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
