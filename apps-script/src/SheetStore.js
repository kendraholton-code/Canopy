/*
 * SheetStore — the Store interface on top of the Canopy Admin Google Sheet.
 * One tab per table, header row 1, one record per row. Header names (not positions)
 * are used, so stewards may reorder or hide columns safely.
 */
function SheetStore(spreadsheet) {
  this.ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  this.cache = {};
  this.dirty = false;
}

SheetStore.prototype.sheet = function (table) {
  var sh = this.ss.getSheetByName(table);
  if (!sh) throw new Error('Missing tab "' + table + '". Run Canopy → Set up / repair sheets.');
  return sh;
};

function canopyCellToString_(v, col) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (/(^|_)date$/.test(col) || col === 'date') return Utilities.formatDate(v, 'America/Chicago', 'yyyy-MM-dd');
    if (/_time$/.test(col)) return Utilities.formatDate(v, 'America/Chicago', 'HH:mm');
    return v.toISOString();
  }
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return String(v);
}

/** Text that Sheets would treat as a formula is stored as literal text. */
function canopyStringToCell_(v) {
  var s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

SheetStore.prototype.load = function (table) {
  if (this.cache[table]) return this.cache[table];
  var sh = this.sheet(table);
  var values = sh.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) {
    return String(h).trim();
  });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var empty = true;
    var obj = {};
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      var s = canopyCellToString_(values[i][c], header[c]);
      if (s !== '') empty = false;
      obj[header[c]] = s;
    }
    if (!empty) {
      obj.__row = i + 1;
      rows.push(obj);
    }
  }
  this.cache[table] = { sheet: sh, header: header, rows: rows };
  return this.cache[table];
};

function canopyClean_(table, obj) {
  var out = {};
  Canopy.schema.columns(table).forEach(function (c) {
    out[c] = obj[c] === undefined ? '' : obj[c];
  });
  return out;
}

SheetStore.prototype.list = function (table) {
  return this.load(table).rows.map(function (r) {
    return canopyClean_(table, r);
  });
};

SheetStore.prototype.get = function (table, key) {
  var k = Canopy.schema.keyOf(table);
  var hit = this.load(table).rows.filter(function (r) {
    return r[k] === key;
  })[0];
  return hit ? canopyClean_(table, hit) : null;
};

SheetStore.prototype.insert = function (table, obj) {
  var t = this.load(table);
  var row = Canopy.blankRow(table, obj);
  var k = Canopy.schema.keyOf(table);
  if (row[k] && table !== 'Audit' && this.get(table, row[k])) throw new Error('Duplicate key ' + table + ':' + row[k]);
  var values = t.header.map(function (h) {
    return canopyStringToCell_(h in row ? row[h] : '');
  });
  t.sheet.appendRow(values);
  var stored = Object.assign({}, row);
  stored.__row = t.sheet.getLastRow();
  t.rows.push(stored);
  this.dirty = true;
  return Object.assign({}, row);
};

SheetStore.prototype.update = function (table, key, patch) {
  var t = this.load(table);
  var k = Canopy.schema.keyOf(table);
  var cols = Canopy.schema.columns(table);
  var hit = t.rows.filter(function (r) {
    return r[k] === key;
  })[0];
  if (!hit) throw new Error('Not found ' + table + ':' + key);
  Object.keys(patch).forEach(function (c) {
    if (cols.indexOf(c) >= 0 && c !== k) hit[c] = Canopy.util.str(patch[c] === true ? 'yes' : patch[c] === false ? 'no' : patch[c]);
  });
  var values = t.header.map(function (h) {
    return canopyStringToCell_(h in hit && h !== '__row' ? hit[h] : '');
  });
  t.sheet.getRange(hit.__row, 1, 1, t.header.length).setValues([values]);
  this.dirty = true;
  return canopyClean_(table, hit);
};
