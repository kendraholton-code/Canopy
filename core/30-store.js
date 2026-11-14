/*
 * Store interface used by the engine:
 *   list(table) -> [row]          get(table, key) -> row|null
 *   insert(table, row) -> row     update(table, key, patch) -> row
 * Rows are flat objects of strings keyed by schema columns.
 * MemoryStore implements it for tests, the local server and the in-browser demo;
 * apps-script/SheetStore.js implements it on Google Sheets.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var S = C.schema;
  var U = C.util;

  function blankRow(table, obj) {
    var row = {};
    S.columns(table).forEach(function (c) {
      var v = obj && obj[c] !== undefined && obj[c] !== null ? obj[c] : '';
      row[c] = typeof v === 'string' ? v : v === true ? 'yes' : v === false ? 'no' : U.str(v);
    });
    return row;
  }
  C.blankRow = blankRow;

  function MemoryStore(data) {
    this.data = {};
    var self = this;
    S.order.forEach(function (t) {
      self.data[t] = ((data && data[t]) || []).map(function (r) {
        return blankRow(t, r);
      });
    });
  }
  MemoryStore.prototype.list = function (table) {
    S.columns(table);
    return this.data[table].map(function (r) {
      return Object.assign({}, r);
    });
  };
  MemoryStore.prototype.get = function (table, key) {
    var k = S.keyOf(table);
    var found = this.data[table].filter(function (r) {
      return r[k] === key;
    })[0];
    return found ? Object.assign({}, found) : null;
  };
  MemoryStore.prototype.insert = function (table, obj) {
    var row = blankRow(table, obj);
    var k = S.keyOf(table);
    if (row[k] && k !== 'at' && this.get(table, row[k])) throw new Error('Duplicate key ' + table + ':' + row[k]);
    this.data[table].push(row);
    return Object.assign({}, row);
  };
  MemoryStore.prototype.update = function (table, key, patch) {
    var k = S.keyOf(table);
    var cols = S.columns(table);
    for (var i = 0; i < this.data[table].length; i++) {
      if (this.data[table][i][k] === key) {
        var row = this.data[table][i];
        Object.keys(patch).forEach(function (c) {
          if (cols.indexOf(c) >= 0 && c !== k) row[c] = U.str(patch[c] === true ? 'yes' : patch[c] === false ? 'no' : patch[c]);
        });
        return Object.assign({}, row);
      }
    }
    throw new Error('Not found ' + table + ':' + key);
  };
  MemoryStore.prototype.toJSON = function () {
    return this.data;
  };
  C.MemoryStore = MemoryStore;

  /* -------- helpers shared by every store -------- */
  C.settings = function (store) {
    var out = {};
    store.list('Settings').forEach(function (r) {
      out[r.key] = U.str(r.value);
    });
    return out;
  };

  C.setSetting = function (store, key, value, notes) {
    if (store.get('Settings', key)) store.update('Settings', key, { value: value });
    else store.insert('Settings', { key: key, value: value, notes: notes || '' });
  };

  C.roles = function (store) {
    var out = {};
    store.list('Roles').forEach(function (r) {
      out[r.role] = r;
    });
    return out;
  };

  /** Email for a role or '' if unassigned. Never falls back to a named person. */
  C.roleEmail = function (store, role) {
    var r = store.get('Roles', role);
    return r && U.isEmail(r.email) ? U.normEmail(r.email) : '';
  };

  C.audit = function (store, ctx, actor, action, table, id, details) {
    store.insert('Audit', {
      at: U.nowIso(ctx),
      actor: actor || 'system',
      action: action,
      table: table || '',
      record_id: id || '',
      details: typeof details === 'string' ? details : JSON.stringify(details || {})
    });
  };

  C.findBy = function (store, table, fn) {
    return store.list(table).filter(fn);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
