/*
 * Data access for the public site. The site only ever receives the public snapshot
 * (allowlisted fields) — private records never reach the browser in live mode.
 */
(function () {
  var cfg = window.CANOPY_CONFIG || { API_URL: 'demo' };
  var C = window.Canopy;
  var mode = cfg.API_URL === 'demo' ? 'demo' : /^\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(cfg.API_URL) ? 'local' : 'live';
  var DEMO_KEY = 'canopy-demo-store-v1';

  function uuid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  var ctx = { now: function () { return new Date(); }, uuid: uuid };

  /* ---------- demo backend (engine runs in this browser tab) ---------- */
  var demoStore = null;
  function demo() {
    if (demoStore) return demoStore;
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null');
    } catch (e) {}
    demoStore = saved ? new C.MemoryStore(saved) : C.seedDemo(new C.MemoryStore(), ctx);
    return demoStore;
  }
  function saveDemo() {
    try {
      sessionStorage.setItem(DEMO_KEY, JSON.stringify(demoStore.toJSON()));
    } catch (e) {}
  }

  function apiGet(params) {
    if (mode === 'demo') return Promise.resolve(C.handleGet(demo(), ctx, params).body);
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(cfg.API_URL + (cfg.API_URL.indexOf('?') >= 0 ? '&' : '?') + q, { redirect: 'follow' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return params.action === 'ics' ? r.text() : r.json();
    });
  }

  function apiPost(body) {
    if (mode === 'demo') {
      var res = C.handlePost(demo(), ctx, body, null);
      C.processOutbox(demo(), ctx, { send: function () {} }, {});
      saveDemo();
      return Promise.resolve(res.body);
    }
    // text/plain avoids a CORS preflight, which Apps Script web apps do not answer.
    return fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var snapshotPromise = null;
  function getPublic(force) {
    if (!snapshotPromise || force) {
      snapshotPromise = apiGet({ action: 'public' })
        .then(function (s) {
          try {
            if (mode === 'live') localStorage.setItem('canopy-last-snapshot', JSON.stringify(s));
          } catch (e) {}
          return s;
        })
        .catch(function (err) {
          var cached = null;
          try {
            cached = JSON.parse(localStorage.getItem('canopy-last-snapshot') || 'null');
          } catch (e) {}
          if (cached) {
            cached._stale = true;
            return cached;
          }
          snapshotPromise = null;
          throw err;
        });
    }
    return snapshotPromise;
  }

  /** Steward stand-in (demo/local only): the live equivalent is the Canopy menu in the Admin sheet. */
  function steward(op, args) {
    if (mode === 'demo') {
      var s = demo();
      var out;
      if (op === 'list') out = { tables: s.toJSON() };
      else if (op === 'status') out = C.setStatus(s, ctx, 'demo steward', args.table, args.id, args.status, args.note);
      else if (op === 'applyCorrection') out = C.applyCorrection(s, ctx, 'demo steward', args.id);
      else if (op === 'patch') out = s.update(args.table, args.id, args.patch);
      else if (op === 'reset') {
        try { sessionStorage.removeItem(DEMO_KEY); } catch (e) {}
        demoStore = null;
        out = { ok: true };
      }
      C.processOutbox(demo(), ctx, { send: function () {} }, {});
      saveDemo();
      snapshotPromise = null;
      return Promise.resolve(out);
    }
    if (mode === 'local') {
      return fetch('/dev/steward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: op, args: args || {} }) }).then(function (r) {
        snapshotPromise = null;
        return r.json();
      });
    }
    return Promise.reject(new Error('Steward actions happen in the Canopy Admin Google Sheet.'));
  }

  /** Stable routes /join and /r/<slot>: forward to the current link, or explain why not. */
  function resolveStableRoute(route, up) {
    var msg = document.getElementById('msg');
    getPublic()
      .then(function (s) {
        var url = '';
        var label = '';
        if (route === 'join') {
          var now = Date.now();
          var next = (s.meetings || []).filter(function (m) { return !m.cancelled && new Date(m.end_iso).getTime() >= now; })[0];
          url = next && next.join_url;
          label = next ? 'the ' + C.time.formatLongDate(next.date) + ' call' : 'the next call';
        } else {
          var slot = route.split('/')[1];
          var g = (s.groups || []).filter(function (x) { return String(x.slot) === slot; })[0];
          url = g && g.meet_url;
          label = g ? 'the “' + g.label + '” room' : 'this room';
        }
        if (url) {
          msg.textContent = 'Opening ' + label + '…';
          window.location.replace(url);
        } else {
          msg.textContent = 'There is no link for ' + label + ' yet (link coming soon).';
        }
      })
      .catch(function () {
        msg.textContent = cfg.FALLBACK_MESSAGE;
      });
  }

  window.CanopyData = {
    mode: mode,
    getPublic: getPublic,
    post: apiPost,
    get: apiGet,
    newClientId: uuid,
    steward: steward,
    resolveStableRoute: resolveStableRoute,
    icsUrl: function (which) {
      if (mode === 'live' || mode === 'local') return cfg.API_URL + (cfg.API_URL.indexOf('?') >= 0 ? '&' : '?') + 'action=ics' + (which ? '&which=' + which : '');
      return '';
    }
  };
})();
