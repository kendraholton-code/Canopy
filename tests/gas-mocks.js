/*
 * Minimal in-memory stand-ins for the Google Apps Script services Canopy uses, so the
 * generated apps-script/dist/Code.gs can be executed and tested in Node. These mimic
 * documented behaviour (e.g. a leading "=" makes a formula unless prefixed with "'");
 * they are NOT Google, and passing here is not a substitute for a live test.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function makeSheet(name) {
  const sheet = {
    name,
    cells: [], // 2D array of stored values (strings, or {formula})
    protections: [],
    getName: () => name,
    getLastRow: () => sheet.cells.length,
    getLastColumn: () => sheet.cells.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => Math.max(1000, sheet.cells.length),
    appendRow: (vals) => { sheet.cells.push(vals.map(store)); return sheet; },
    getDataRange: () => range(1, 1, Math.max(sheet.cells.length, 1), Math.max(sheet.getLastColumn(), 1)),
    getRange: (r, c, nr, nc) => range(r, c, nr || 1, nc || 1),
    setFrozenRows: () => {},
    protect: () => { const p = { setDescription: () => p, setWarningOnly: () => p }; sheet.protections.push(p); return p; },
    getProtections: () => sheet.protections,
    getActiveRangeList: () => null,
    getActiveRange: () => sheet._active
  };
  function store(v) {
    if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
    if (typeof v === 'string' && v.startsWith('=')) return { formula: v };
    return v;
  }
  function read(v) {
    if (v && typeof v === 'object' && v.formula) return '#FORMULA:' + v.formula;
    return v === undefined ? '' : v;
  }
  function range(r, c, nr, nc) {
    const rg = {
      getRow: () => r, getColumn: () => c, getNumRows: () => nr, getSheet: () => sheet,
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => read((sheet.cells[r - 1 + i] || [])[c - 1 + j]))),
      getValue: () => rg.getValues()[0][0],
      setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => { while (sheet.cells.length < r + i) sheet.cells.push([]); sheet.cells[r - 1 + i][c - 1 + j] = store(v); })); return rg; },
      setValue: (v) => rg.setValues([[v]]),
      setFontWeight: () => rg, setBackground: () => rg, setNumberFormat: () => rg, setDataValidation: () => rg
    };
    return rg;
  }
  return sheet;
}

function makeEnv() {
  const sheets = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => delete sheets[s.name]
  };
  let active = null;
  const sent = [];
  const alerts = [];
  const cache = new Map();
  const triggers = [];
  const files = [];
  const builder = (fn) => { const b = { getHandlerFunction: () => fn, timeBased: () => b, everyMinutes: () => b, onWeekDay: () => b, atHour: () => b, forSpreadsheet: () => b, onEdit: () => b, forForm: () => b, onFormSubmit: () => b, create: () => { triggers.push(b); return b; } }; return b; };
  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActiveSheet: () => active,
      getUi: () => ({
        alert: (m) => { alerts.push(m); return 'YES'; },
        prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => env.__promptText || '' }),
        createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
        ButtonSet: { OK_CANCEL: 1, YES_NO: 2 }, Button: { OK: 'OK', YES: 'YES' }
      }),
      newDataValidation: () => { const v = { requireValueInList: () => v, setAllowInvalid: () => v, build: () => ({}) }; return v; },
      ProtectionType: { SHEET: 'SHEET' }
    },
    MailApp: { sendEmail: (o) => sent.push(o), getRemainingDailyQuota: () => 100 },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])), putAll: (o) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)), remove: (k) => cache.delete(k) }) },
    ContentService: { MimeType: { JSON: 'json', ICAL: 'ical' }, createTextOutput: (t) => ({ text: t, setMimeType(m) { this.mime = m; return this; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d, tz, f) => d.toISOString().slice(0, 10) },
    Session: { getActiveUser: () => ({ getEmail: () => 'steward.one@example.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.org' }) },
    ScriptApp: { getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1), newTrigger: builder, WeekDay: { MONDAY: 1 } },
    DriveApp: { getFolderById: () => { throw new Error('none'); }, createFolder: (n) => ({ getId: () => 'folder1', createFile: (name, body) => files.push({ name, body }), getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => { const f = files[i++]; return { getName: () => f.name, setTrashed: () => {} }; } }; } }) },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    console
  };
  const context = vm.createContext(env);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'dist', 'Code.gs'), 'utf8');
  vm.runInContext(code, context, { filename: 'Code.gs' });
  return {
    g: context, sheets, sent, alerts, cache, triggers, files,
    select: (table, row) => { active = sheets[table]; active._active = active.getRange(row, 1, 1, 1); },
    rowOf: (table, id) => sheets[table].cells.findIndex((r) => r[0] === id) + 1
  };
}

module.exports = { makeEnv };
