#!/usr/bin/env node
/*
 * Local test server: serves the public site and the same API the Apps Script web app
 * exposes, backed by a JSON file instead of Google Sheets. Email is never sent:
 * notifications are recorded as "simulated" (LIVE_SENDING is forced off).
 *
 *   node local/server.js [--port 8787] [--data local/data/store.json] [--fresh] [--demo|--production]
 *
 * /dev/steward is a LOCAL-ONLY stand-in for the Canopy menu in the Admin sheet.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../core');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const PORT = +opt('port', process.env.PORT || 8787);
const DATA = path.resolve(opt('data', path.join(__dirname, 'data', 'store.json')));
const SITE = path.join(__dirname, '..', 'site');
const fresh = args.includes('--fresh');
const production = args.includes('--production');
let clockOffset = 0; // tests can shift "now"
const ctx = { now: () => new Date(Date.now() + clockOffset), uuid: () => crypto.randomUUID() };

function load() {
  if (!fresh && fs.existsSync(DATA)) return new C.MemoryStore(JSON.parse(fs.readFileSync(DATA, 'utf8')));
  const s = new C.MemoryStore();
  production ? C.seedProduction(s, ctx) : C.seedDemo(s, ctx);
  return s;
}
const store = load();
C.setSetting(store, 'LIVE_SENDING', 'no');
if (!C.settings(store).SITE_URL) C.setSetting(store, 'SITE_URL', 'http://localhost:' + PORT);
function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(store.toJSON(), null, 1));
}
save();
const sentLog = [];
const mailer = { send: (m) => sentLog.push(m) }; // never reached while LIVE_SENDING = no

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ics': 'text/calendar' };

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => resolve(b)); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api') {
      if (req.method === 'GET') {
        const out = C.handleGet(store, ctx, Object.fromEntries(url.searchParams));
        return send(res, 200, out.type === 'ics' ? 'text/calendar; charset=utf-8' : 'application/json', out.type === 'ics' ? out.body : JSON.stringify(out.body));
      }
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const out = C.handlePost(store, ctx, body, mailer);
        save();
        return send(res, 200, 'application/json', JSON.stringify(out.body));
      }
    }
    if (url.pathname === '/dev/steward' && req.method === 'POST') {
      const { op, args: a } = JSON.parse((await readBody(req)) || '{}');
      let out;
      if (op === 'list') out = { tables: store.toJSON() };
      else if (op === 'status') out = C.setStatus(store, ctx, 'local steward', a.table, a.id, a.status, a.note);
      else if (op === 'applyCorrection') out = C.applyCorrection(store, ctx, 'local steward', a.id);
      else if (op === 'patch') out = store.update(a.table, a.id, a.patch);
      else if (op === 'setting') { C.setSetting(store, a.key, a.value); out = { ok: true }; }
      else if (op === 'changeset') out = a.apply ? C.applyChangeSet(store, ctx, 'local steward', a.cs) : C.previewChangeSet(store, a.cs);
      else if (op === 'outbox') out = C.processOutbox(store, ctx, mailer, {});
      else if (op === 'clock') { clockOffset = +a.offsetMs || 0; out = { now: ctx.now().toISOString() }; }
      else if (op === 'privacy') out = C.privacyAudit(store, ctx);
      else out = { ok: false, message: 'unknown op' };
      C.setSetting(store, 'LIVE_SENDING', 'no');
      save();
      return send(res, 200, 'application/json', JSON.stringify(out));
    }
    if (url.pathname === '/js/config.js') {
      return send(res, 200, TYPES['.js'], "window.CANOPY_CONFIG = { API_URL: '/api', FALLBACK_MESSAGE: 'The local Canopy server is not reachable.' };\n");
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(SITE, p));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  } catch (e) {
    return send(res, 500, 'application/json', JSON.stringify({ ok: false, message: e.message }));
  }
});
server.listen(PORT, () => console.log(`Canopy local server: http://localhost:${PORT}/  (data: ${DATA}, email: simulated)`));
