/*
 * API surface shared by the Apps Script web app, the local server and the in-browser demo.
 *   GET  ?action=public                 -> public snapshot JSON (allowlisted fields only)
 *   GET  ?action=ics[&which=meetings|events]
 *   GET  ?action=token&kind=withdraw|respond|manage&t=TOKEN
 *   GET  ?action=health
 *   POST {action:"submit", ...form fields}
 *   POST {action:"token", kind, token, ...}
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;

  C.VERSION = '1.0.0';

  C.handleGet = function (store, ctx, params) {
    params = params || {};
    var action = U.str(params.action) || 'public';
    if (action === 'public') return { type: 'json', body: C.buildPublicSnapshot(store, ctx) };
    if (action === 'ics') return { type: 'ics', body: C.buildPublicIcs(store, ctx, U.str(params.which), { county: U.str(params.county), category: U.str(params.category) }) };
    if (action === 'token') return { type: 'json', body: C.tokenInfo(store, ctx, U.str(params.kind), U.str(params.t)) };
    if (action === 'health') {
      var s = C.settings(store);
      return { type: 'json', body: { ok: true, version: C.VERSION, live_sending: U.yes(s.LIVE_SENDING), submissions_enabled: !s.SUBMISSIONS_ENABLED || U.yes(s.SUBMISSIONS_ENABLED), time: U.nowIso(ctx) } };
    }
    return { type: 'json', body: { ok: false, message: 'Unknown action' } };
  };

  C.handlePost = function (store, ctx, body, mailer) {
    body = body || {};
    var action = U.str(body.action);
    var out;
    var before = store.list('Notifications').map(function (n) {
      return n.id;
    });
    if (action === 'submit') out = C.submit(store, ctx, body);
    else if (action === 'token') out = C.tokenAction(store, ctx, body);
    else out = { ok: false, message: 'Unknown action' };
    // Send what this request queued right away (records are already saved).
    var ids = store
      .list('Notifications')
      .filter(function (n) {
        return before.indexOf(n.id) < 0;
      })
      .map(function (n) {
        return n.id;
      });
    if (ids.length && mailer) {
      try {
        C.processOutbox(store, ctx, mailer, { ids: ids });
      } catch (e) {
        /* the time-driven trigger retries */
      }
    }
    var clean = {};
    Object.keys(out).forEach(function (k) {
      if (k.charAt(0) !== '_' && out[k] !== undefined) clean[k] = out[k];
    });
    return { type: 'json', body: clean };
  };

  /* ---------- Google Form reuse (Ava's existing form) ----------
   * Maps a Form response (namedValues: {"Question title": ["answer"]}) to an
   * "organization" submission. FORM_MAPPING (Settings, JSON) maps our field names to
   * question titles; without it we match on keywords in the question titles.
   */
  var GUESS = {
    name: /(your|preferred)?\s*name(?!.*organi[sz]ation)/i,
    email: /e-?mail/i,
    org_name: /organi[sz]ation(\s*name)?$|^organi[sz]ation|group name/i,
    description: /describe|description|what.*(do|work)/i,
    mission: /mission/i,
    website: /website|url/i,
    logo_url: /logo/i,
    locality: /city|town|locality|where|service area|county/i
  };

  C.mapFormResponse = function (namedValues, mappingJson) {
    var mapping = U.parseJson(mappingJson || '', null);
    var titles = Object.keys(namedValues || {});
    function val(title) {
      var v = namedValues[title];
      return U.str(Array.isArray(v) ? v.join('; ') : v);
    }
    var p = { type: 'organization', source: 'google_form' };
    Object.keys(GUESS).forEach(function (field) {
      var title = mapping && mapping[field] ? mapping[field] : titles.filter(function (t) {
        return GUESS[field].test(t) && !(field === 'name' && /organi[sz]ation/i.test(t)) && !(field === 'email' && /public/i.test(t));
      })[0];
      if (title && namedValues[title] !== undefined) p[field] = val(title);
    });
    // Logo answers from file-upload questions are Drive links; keep them only as text links.
    if (p.logo_url && !U.isHttpUrl(p.logo_url)) delete p.logo_url;
    if (!p.org_name) p.as_individual = 'yes';
    if (!p.locality) p.locality = 'Not stated (from Google Form)';
    if (!p.description) p.description = p.mission || 'Not stated (from Google Form)';
    // The existing form did not ask for directory consent, so none is assumed.
    p.consent_directory = 'no';
    return p;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
