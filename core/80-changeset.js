/*
 * Change sets: the bridge between the monthly AI-assisted workflow and the records.
 * Claude (in the private Canopy Project) proposes a JSON change set; a steward pastes it
 * into the ChangeSets tab, previews the diff, and applies it. All-or-nothing: if any
 * operation is invalid, nothing is applied. "remove" archives — nothing is hard-deleted.
 *
 * {
 *   "title": "December 12 call — recap and action items",
 *   "operations": [
 *     {"op": "add",    "table": "Recaps", "record": {"meeting_id": "mtg-2026-12-12", "summary": "...", "status": "draft"}},
 *     {"op": "update", "table": "Meetings", "id": "mtg-2027-01-09", "changes": {"agenda": "..."}},
 *     {"op": "remove", "table": "Requests", "id": "req-abc"}
 *   ]
 * }
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;
  var S = C.schema;

  var LOCKED = ['id', 'created_at', 'approved_by', 'approved_at', 'updated_by', 'manage_token_hash', 'submitter_email', 'contact_email', 'backup_email', 'private_email', 'email_norm'];
  // contact_email/backup_email on Groups are routing addresses: allowed only via direct sheet edit,
  // so an AI-drafted change set can never redirect people's private details.

  function check(store, cs) {
    var errors = [];
    var ops = [];
    if (!cs || !Array.isArray(cs.operations)) return { errors: ['Change set must have an "operations" array.'], ops: [] };
    cs.operations.forEach(function (op, i) {
      var where = '#' + (i + 1) + ' ';
      var table = U.str(op.table);
      if (S.changeSetTables.indexOf(table) < 0) {
        errors.push(where + 'table "' + table + '" cannot be changed by a change set.');
        return;
      }
      var cols = S.columns(table);
      var fields = op.op === 'add' ? op.record : op.changes;
      var bad = Object.keys(fields || {}).filter(function (f) {
        return cols.indexOf(f) < 0 || (LOCKED.indexOf(f) >= 0 && !(op.op === 'add' && f === 'id'));
      });
      if (bad.length) errors.push(where + 'fields not allowed on ' + table + ': ' + bad.join(', '));
      if (fields && fields.status && S.STATUS.indexOf(fields.status) < 0 && table !== 'Verification') errors.push(where + 'unknown status "' + fields.status + '"');
      if (op.op === 'add') {
        if (!op.record || typeof op.record !== 'object') errors.push(where + 'add needs a "record" object.');
        else if (op.record.id && store.get(table, op.record.id)) errors.push(where + table + ' ' + op.record.id + ' already exists — use update.');
        ops.push({ op: 'add', table: table, id: (op.record && op.record.id) || '(new)', changes: op.record || {} });
      } else if (op.op === 'update' || op.op === 'remove') {
        var row = store.get(table, U.str(op.id));
        if (!row) {
          errors.push(where + table + ' ' + op.id + ' not found.');
          return;
        }
        var diff = {};
        var ch = op.op === 'remove' ? (table === 'Verification' ? { state: 'resolved' } : { status: 'archived' }) : op.changes || {};
        Object.keys(ch).forEach(function (f) {
          if (U.str(row[f]) !== U.str(ch[f])) diff[f] = { from: U.str(row[f]), to: U.str(ch[f]) };
        });
        ops.push({ op: op.op, table: table, id: row.id, changes: diff, unchanged: !Object.keys(diff).length });
      } else {
        errors.push(where + 'op must be add, update or remove.');
      }
    });
    return { errors: errors, ops: ops };
  }

  C.previewChangeSet = function (store, cs) {
    var r = check(store, cs);
    var lines = [];
    r.ops.forEach(function (o) {
      if (o.op === 'add') {
        lines.push('ADD ' + o.table + ' ' + o.id + ': ' + Object.keys(o.changes).map(function (f) { return f + '=' + JSON.stringify(U.clip(o.changes[f], 80)); }).join(', '));
      } else if (o.unchanged) {
        lines.push('NO CHANGE ' + o.table + ' ' + o.id);
      } else {
        lines.push((o.op === 'remove' ? 'ARCHIVE ' : 'CHANGE ') + o.table + ' ' + o.id + ': ' + Object.keys(o.changes).map(function (f) { return f + ' ' + JSON.stringify(U.clip(o.changes[f].from, 60)) + ' → ' + JSON.stringify(U.clip(o.changes[f].to, 60)); }).join('; '));
      }
    });
    return { ok: !r.errors.length, errors: r.errors, ops: r.ops, text: (r.errors.length ? 'ERRORS — nothing will be applied:\n' + r.errors.join('\n') + '\n\n' : '') + lines.join('\n') };
  };

  C.applyChangeSet = function (store, ctx, actor, cs) {
    var pre = C.previewChangeSet(store, cs);
    if (!pre.ok) return { ok: false, errors: pre.errors, applied: 0 };
    var applied = [];
    cs.operations.forEach(function (op) {
      var table = op.table;
      var now = U.nowIso(ctx);
      if (op.op === 'add') {
        var rec = Object.assign({}, op.record);
        if (!rec.id) rec.id = U.makeId(S.tables[table].prefix || 'rec', ctx);
        if (table !== 'Verification') {
          rec.status = rec.status || 'draft';
          rec.visibility = rec.visibility || 'public';
          rec.verification = rec.verification || 'unverified';
          rec.created_at = now;
          rec.updated_at = now;
          rec.updated_by = actor;
          rec.source_ref = rec.source_ref || 'changeset:' + (cs.title || '');
          if (rec.status === 'approved') {
            rec.approved_by = actor;
            rec.approved_at = now;
          }
        }
        store.insert(table, rec);
        applied.push('add ' + table + ':' + rec.id);
      } else {
        var ch = op.op === 'remove' ? (table === 'Verification' ? { state: 'resolved' } : { status: 'archived' }) : Object.assign({}, op.changes);
        if (table !== 'Verification') {
          ch.updated_at = now;
          ch.updated_by = actor;
          if (ch.status === 'approved') {
            ch.approved_by = actor;
            ch.approved_at = now;
          }
        }
        store.update(table, op.id, ch);
        applied.push(op.op + ' ' + table + ':' + op.id);
      }
    });
    C.audit(store, ctx, actor, 'apply_changeset', 'ChangeSets', '', { title: cs.title || '', applied: applied });
    return { ok: true, applied: applied.length, details: applied };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
