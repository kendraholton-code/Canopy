/*
 * Canopy engine — Google Apps Script entry points.
 * Bound to the private "Canopy Admin" spreadsheet. Deploy as a web app:
 *   Execute as: Me (the owning DeCarbon/coalition Workspace account)
 *   Who has access: Anyone
 * Public visitors never see the sheet: they only receive the allowlisted public snapshot.
 */

var CANOPY_CACHE_KEY = 'canopy-public-v1';

function canopyCtx_() {
  return {
    now: function () {
      return new Date();
    },
    uuid: function () {
      return Utilities.getUuid();
    }
  };
}

function canopyMailer_() {
  return {
    send: function (m) {
      var opts = { to: m.to, subject: m.subject, body: m.body, name: 'Canopy' };
      if (m.replyTo) opts.replyTo = m.replyTo;
      MailApp.sendEmail(opts);
    },
    remaining: function () {
      return MailApp.getRemainingDailyQuota();
    }
  };
}

function canopyActor_() {
  var e = '';
  try {
    e = Session.getActiveUser().getEmail();
  } catch (err) {}
  if (!e) {
    try {
      e = Session.getEffectiveUser().getEmail();
    } catch (err2) {}
  }
  return e || 'steward';
}

/* ---------------- public cache (CacheService values max 100 KB → chunked) ---------------- */
function canopyCacheGet_() {
  var cache = CacheService.getScriptCache();
  var n = cache.get(CANOPY_CACHE_KEY + ':n');
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < +n; i++) keys.push(CANOPY_CACHE_KEY + ':' + i);
  var parts = cache.getAll(keys);
  var out = '';
  for (var j = 0; j < keys.length; j++) {
    if (parts[keys[j]] === undefined || parts[keys[j]] === null) return null;
    out += parts[keys[j]];
  }
  return out;
}
function canopyCachePut_(text) {
  var cache = CacheService.getScriptCache();
  var size = 90000;
  var obj = {};
  var n = Math.ceil(text.length / size) || 1;
  for (var i = 0; i < n; i++) obj[CANOPY_CACHE_KEY + ':' + i] = text.slice(i * size, (i + 1) * size);
  obj[CANOPY_CACHE_KEY + ':n'] = String(n);
  cache.putAll(obj, 300);
}
function canopyInvalidate_() {
  CacheService.getScriptCache().remove(CANOPY_CACHE_KEY + ':n');
}

function canopyOutput_(res) {
  if (res.type === 'ics') return ContentService.createTextOutput(res.body).setMimeType(ContentService.MimeType.ICAL);
  return ContentService.createTextOutput(typeof res.body === 'string' ? res.body : JSON.stringify(res.body)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- web app ---------------- */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || 'public';
  try {
    if (action === 'public') {
      var cached = canopyCacheGet_();
      if (cached) return canopyOutput_({ type: 'json', body: cached });
      var res = Canopy.handleGet(new SheetStore(), canopyCtx_(), params);
      var text = JSON.stringify(res.body);
      canopyCachePut_(text);
      return canopyOutput_({ type: 'json', body: text });
    }
    return canopyOutput_(Canopy.handleGet(new SheetStore(), canopyCtx_(), params));
  } catch (err) {
    return canopyOutput_({ type: 'json', body: { ok: false, message: 'The Canopy service is temporarily unavailable.' } });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return canopyOutput_({ type: 'json', body: { ok: false, message: 'Invalid request.' } });
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return canopyOutput_({ type: 'json', body: { ok: false, code: 'busy', message: 'The site is busy. Please try again in a minute — nothing was saved.' } });
  try {
    var store = new SheetStore();
    var res = Canopy.handlePost(store, canopyCtx_(), body, canopyMailer_());
    if (store.dirty) canopyInvalidate_();
    return canopyOutput_(res);
  } catch (err2) {
    return canopyOutput_({ type: 'json', body: { ok: false, message: 'Something went wrong and your submission may not have been saved. Please try again, or ask on the next monthly call.' } });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- time-driven triggers ---------------- */
function canopyProcessOutbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    Canopy.processOutbox(new SheetStore(), canopyCtx_(), canopyMailer_(), {});
  } finally {
    lock.releaseLock();
  }
}

function canopyWeeklyBackup() {
  canopyExportBackup_(false);
}

/* ---------------- installable edit trigger: stamp who changed what ---------------- */
function canopyHandleEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var table = sh.getName();
  if (Canopy.schema.editorial.indexOf(table) < 0 || e.range.getRow() < 2) {
    canopyInvalidate_();
    return;
  }
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var col = header[e.range.getColumn() - 1];
  if (col === 'updated_at' || col === 'updated_by' || col === 'approved_by' || col === 'approved_at') return;
  var actor = (e.user && e.user.getEmail && e.user.getEmail()) || canopyActor_();
  var now = new Date().toISOString();
  for (var r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    var set = function (name, value) {
      var c = header.indexOf(name);
      if (c >= 0) sh.getRange(r, c + 1).setValue(value);
    };
    set('updated_at', now);
    set('updated_by', actor);
    if (col === 'status' && String(sh.getRange(r, header.indexOf('status') + 1).getValue()) === 'approved') {
      set('approved_by', actor);
      set('approved_at', now);
    }
  }
  var idCol = header.indexOf('id');
  var id = idCol >= 0 ? sh.getRange(e.range.getRow(), idCol + 1).getValue() : '';
  var store = new SheetStore();
  Canopy.audit(store, canopyCtx_(), actor, 'edit:' + col, table, String(id), { value: e.value === undefined ? '(multiple)' : String(e.value).slice(0, 200) });
  canopyInvalidate_();
}

/* ---------------- Google Form reuse ---------------- */
function canopyHandleFormSubmit(e) {
  if (!e || !e.response) return;
  var store = new SheetStore();
  var named = {};
  e.response.getItemResponses().forEach(function (ir) {
    named[ir.getItem().getTitle()] = ir.getResponse();
  });
  var payload = Canopy.mapFormResponse(named, Canopy.settings(store).FORM_MAPPING);
  if (!payload.email) {
    try {
      payload.email = e.response.getRespondentEmail();
    } catch (err) {}
  }
  payload.client_id = 'gform-' + e.response.getId();
  payload.action = 'submit';
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    Canopy.handlePost(store, canopyCtx_(), payload, canopyMailer_());
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- menu ---------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Canopy')
    .addItem('Approve selected rows (publish)', 'canopyMenuApprove')
    .addItem('Unpublish selected rows', 'canopyMenuUnpublish')
    .addItem('Cancel selected rows…', 'canopyMenuCancel')
    .addItem('Archive selected rows', 'canopyMenuArchive')
    .addItem('Mark selected rows verified', 'canopyMenuVerify')
    .addSeparator()
    .addItem('Apply selected correction', 'canopyMenuApplyCorrection')
    .addItem('Resolve selected membership request…', 'canopyMenuResolveMembership')
    .addItem('Calendar: create publishing link for selected person', 'canopyMenuPublisherKey')
    .addItem('Calendar: revoke publishing for selected person', 'canopyMenuRevokePublisher')
    .addSeparator()
    .addItem('Preview selected change set', 'canopyMenuPreviewChangeSet')
    .addItem('Apply selected change set', 'canopyMenuApplyChangeSet')
    .addSeparator()
    .addItem('Review queue (what needs a person)', 'canopyMenuReviewQueue')
    .addItem('Send queued notifications now', 'canopyMenuProcessOutbox')
    .addItem('Retry failed notifications', 'canopyMenuRetryFailed')
    .addItem('Refresh public site now', 'canopyMenuRefresh')
    .addItem('Privacy self-check', 'canopyMenuPrivacyCheck')
    .addItem('Export backup now', 'canopyMenuBackup')
    .addSeparator()
    .addItem('Set up / repair sheets', 'canopySetup')
    .addItem('Install automatic triggers', 'canopyInstallTriggers')
    .addItem('Connect Google Form (ORG_FORM_ID)…', 'canopyConnectForm')
    .addItem('Load demo data (test copies only)', 'canopyLoadDemo')
    .addToUi();
}

function canopySelected_() {
  var sh = SpreadsheetApp.getActiveSheet();
  var table = sh.getName();
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var keyCol = header.indexOf(Canopy.schema.tables[table] ? Canopy.schema.keyOf(table) : 'id');
  if (keyCol < 0) throw new Error('Select rows in a Canopy tab first.');
  var ids = [];
  var ranges = sh.getActiveRangeList() ? sh.getActiveRangeList().getRanges() : [sh.getActiveRange()];
  ranges.forEach(function (rg) {
    for (var r = rg.getRow(); r < rg.getRow() + rg.getNumRows(); r++) {
      if (r < 2) continue;
      var v = String(sh.getRange(r, keyCol + 1).getValue());
      if (v && ids.indexOf(v) < 0) ids.push(v);
    }
  });
  if (!ids.length) throw new Error('Select one or more record rows first.');
  return { table: table, ids: ids };
}

function canopyBulk_(fn, label) {
  var ui = SpreadsheetApp.getUi();
  try {
    var sel = canopySelected_();
    var store = new SheetStore();
    var ctx = canopyCtx_();
    var actor = canopyActor_();
    sel.ids.forEach(function (id) {
      fn(store, ctx, actor, sel.table, id);
    });
    canopyInvalidate_();
    ui.alert(label + ': ' + sel.ids.length + ' row(s) in ' + sel.table + '. The public site updates within a minute.');
  } catch (err) {
    ui.alert('Nothing changed: ' + err.message);
  }
}

function canopyMenuApprove() {
  canopyBulk_(Canopy.approve, 'Approved');
}
function canopyMenuUnpublish() {
  canopyBulk_(Canopy.unpublish, 'Unpublished');
}
function canopyMenuArchive() {
  canopyBulk_(Canopy.archive, 'Archived');
}
function canopyMenuVerify() {
  canopyBulk_(Canopy.verify, 'Marked verified');
}
function canopyMenuCancel() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Cancel', 'Reason (shown publicly for meetings):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  canopyBulk_(function (store, ctx, actor, table, id) {
    Canopy.cancel(store, ctx, actor, table, id, r.getResponseText());
  }, 'Cancelled');
}

function canopyMenuApplyCorrection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sel = canopySelected_();
    if (sel.table !== 'Corrections') throw new Error('Select a row in the Corrections tab.');
    var store = new SheetStore();
    var applied = Canopy.applyCorrection(store, canopyCtx_(), canopyActor_(), sel.ids[0]);
    canopyInvalidate_();
    ui.alert('Applied:\n' + JSON.stringify(applied, null, 2));
  } catch (err) {
    ui.alert('Not applied: ' + err.message);
  }
}

function canopyMenuResolveMembership() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sel = canopySelected_();
    if (sel.table !== 'Memberships') throw new Error('Select a row in the Memberships tab.');
    var r = ui.prompt('Resolve request ' + sel.ids[0], 'Type one of: acknowledge, welcome, decline, withdraw', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    var store = new SheetStore();
    var res = Canopy.resolveMembership(store, canopyCtx_(), canopyActor_(), sel.ids[0], r.getResponseText().trim().toLowerCase());
    Canopy.processOutbox(store, canopyCtx_(), canopyMailer_(), {});
    ui.alert(res.changed ? 'Now: ' + res.state : 'No change (already ' + res.state + ').');
  } catch (err) {
    ui.alert('Not changed: ' + err.message);
  }
}

function canopyMenuPublisherKey() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sel = canopySelected_();
    if (sel.table !== 'People') throw new Error('Select a person in the People tab (add a row for them first if needed: display_name and private_email).');
    var store = new SheetStore();
    var res = Canopy.createPublisherKey(store, canopyCtx_(), canopyActor_(), sel.ids[0]);
    Canopy.processOutbox(store, canopyCtx_(), canopyMailer_(), {});
    ui.alert('Publishing link for ' + res.person + ' (copy it now — it is not stored and cannot be shown again):\n\n' + res.link + '\n\nIt was also emailed to them if live sending is on. Any previous link for this person no longer works.');
  } catch (err) {
    ui.alert('Not created: ' + err.message);
  }
}
function canopyMenuRevokePublisher() {
  canopyBulk_(Canopy.revokePublisher, 'Publishing revoked');
}

function canopyChangeSetSelected_() {
  var sel = canopySelected_();
  if (sel.table !== 'ChangeSets') throw new Error('Select a row in the ChangeSets tab.');
  var store = new SheetStore();
  var row = store.get('ChangeSets', sel.ids[0]);
  var cs = Canopy.util.parseJson(row.json, null);
  if (!cs) throw new Error('The json cell is not valid JSON.');
  return { store: store, row: row, cs: cs };
}
function canopyMenuPreviewChangeSet() {
  var ui = SpreadsheetApp.getUi();
  try {
    var x = canopyChangeSetSelected_();
    var pre = Canopy.previewChangeSet(x.store, x.cs);
    x.store.update('ChangeSets', x.row.id, { preview: pre.text.slice(0, 45000), state: pre.ok ? 'previewed' : 'invalid' });
    ui.alert((pre.ok ? 'Preview — nothing applied yet:\n\n' : '') + pre.text.slice(0, 1800));
  } catch (err) {
    ui.alert(err.message);
  }
}
function canopyMenuApplyChangeSet() {
  var ui = SpreadsheetApp.getUi();
  try {
    var x = canopyChangeSetSelected_();
    if (x.row.state === 'applied') throw new Error('Already applied.');
    if (ui.alert('Apply change set "' + (x.cs.title || x.row.id) + '"?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    var actor = canopyActor_();
    var res = Canopy.applyChangeSet(x.store, canopyCtx_(), actor, x.cs);
    x.store.update('ChangeSets', x.row.id, { state: res.ok ? 'applied' : 'invalid', applied_by: actor, applied_at: new Date().toISOString(), result: JSON.stringify(res).slice(0, 45000) });
    canopyInvalidate_();
    ui.alert(res.ok ? 'Applied ' + res.applied + ' change(s).' : 'Nothing applied:\n' + res.errors.join('\n'));
  } catch (err) {
    ui.alert(err.message);
  }
}

function canopyMenuReviewQueue() {
  var q = Canopy.reviewQueue(new SheetStore(), canopyCtx_());
  var parts = [];
  function sec(title, list) {
    parts.push(title + ' (' + list.length + ')' + (list.length ? '\n  ' + list.slice(0, 25).join('\n  ') : ''));
  }
  sec('Pending review', q.pending);
  sec('Interest with no one assigned', q.unassigned);
  sec('Failed notifications', q.failed);
  sec('Open corrections', q.corrections);
  sec('Next call missing a link', q.upcomingWithoutLink);
  SpreadsheetApp.getUi().alert(parts.join('\n\n'));
}
function canopyMenuProcessOutbox() {
  var r = Canopy.processOutbox(new SheetStore(), canopyCtx_(), canopyMailer_(), {});
  SpreadsheetApp.getUi().alert('Notifications: ' + JSON.stringify(r));
}
function canopyMenuRetryFailed() {
  var store = new SheetStore();
  var n = Canopy.retryFailed(store, canopyCtx_(), canopyActor_());
  var r = Canopy.processOutbox(store, canopyCtx_(), canopyMailer_(), {});
  SpreadsheetApp.getUi().alert('Requeued ' + n + '. Result: ' + JSON.stringify(r));
}
function canopyMenuRefresh() {
  canopyInvalidate_();
  SpreadsheetApp.getUi().alert('Public cache cleared. The site shows the latest approved records on next load.');
}
function canopyMenuPrivacyCheck() {
  var r = Canopy.privacyAudit(new SheetStore(), canopyCtx_());
  SpreadsheetApp.getUi().alert(r.ok ? 'OK — no private addresses or tokens appear in public output.' : 'WARNING — these private values appear in public output:\n' + r.leaks.join('\n'));
}
function canopyMenuBackup() {
  var name = canopyExportBackup_(true);
  SpreadsheetApp.getUi().alert('Backup saved to Drive: ' + name);
}

/* ---------------- backup ---------------- */
function canopyExportBackup_(manual) {
  var store = new SheetStore();
  var settings = Canopy.settings(store);
  var folder;
  if (settings.BACKUP_FOLDER_ID) {
    try {
      folder = DriveApp.getFolderById(settings.BACKUP_FOLDER_ID);
    } catch (e) {}
  }
  if (!folder) {
    folder = DriveApp.createFolder('Canopy backups (private)');
    Canopy.setSetting(store, 'BACKUP_FOLDER_ID', folder.getId());
  }
  var data = { exported_at: new Date().toISOString(), version: Canopy.VERSION, tables: {} };
  Canopy.schema.order.forEach(function (t) {
    data.tables[t] = store.list(t);
  });
  var stamp = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd-HHmm');
  var name = 'canopy-backup-' + stamp + (manual ? '-manual' : '') + '.json';
  folder.createFile(name, JSON.stringify(data, null, 1), MimeType.PLAIN_TEXT);
  folder.createFile('canopy-public-' + stamp + '.json', JSON.stringify(Canopy.buildPublicSnapshot(store, canopyCtx_()), null, 1), MimeType.PLAIN_TEXT);
  var keep = +settings.BACKUP_KEEP || 26;
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files
    .filter(function (f) {
      return /^canopy-backup-.*\.json$/.test(f.getName()) && !/-manual/.test(f.getName());
    })
    .sort(function (a, b) {
      return a.getName() < b.getName() ? 1 : -1;
    })
    .slice(keep)
    .forEach(function (f) {
      f.setTrashed(true);
    });
  return name;
}

/* ---------------- setup ---------------- */
var CANOPY_DROPDOWNS = {
  status: Canopy.schema.STATUS,
  visibility: Canopy.schema.VISIBILITY,
  verification: Canopy.schema.VERIFICATION,
  group_status: ['active', 'reserve', 'paused'],
  enrollment_mode: ['contact_led', 'open'],
  intake: ['open', 'paused'],
  progress: ['open', 'in_progress', 'done', 'dropped', 'closed'],
  state: ['interested', 'acknowledged', 'active', 'waitlisted', 'declined', 'withdrawn', 'open', 'resolved', 'pending', 'previewed', 'applied', 'invalid', 'rejected'],
  directory_consent: ['yes', 'no'],
  trusted_publisher: ['yes', 'no'],
  category: Canopy.CATEGORIES,
  contact_publish_consent: ['yes', 'no'],
  updates_consent: ['yes', 'no'],
  publish_consent: ['yes', 'no'],
  kind: ['offer', 'need', 'collaboration']
};

function canopySetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Canopy.schema.order.forEach(function (table) {
    var sh = ss.getSheetByName(table) || ss.insertSheet(table);
    var cols = Canopy.schema.columns(table);
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean);
    var missing = cols.filter(function (c) {
      return header.indexOf(c) < 0;
    });
    if (missing.length) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8f0e3');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), header.length).setNumberFormat('@');
    Object.keys(CANOPY_DROPDOWNS).forEach(function (col) {
      var c = header.indexOf(col);
      if (c < 0) return;
      if (col === 'kind' && table !== 'Requests') return;
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(CANOPY_DROPDOWNS[col], true).setAllowInvalid(true).build();
      sh.getRange(2, c + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
    });
    if (['Submissions', 'Audit', 'Notifications', 'Consents'].indexOf(table) >= 0) {
      var prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!prot.length) sh.protect().setDescription('System log — edit only if you know why').setWarningOnly(true);
    }
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  Canopy.seedProduction(new SheetStore(ss), canopyCtx_());
  canopyInvalidate_();
  try {
    SpreadsheetApp.getUi().alert('Canopy sheets are ready. Next: Canopy → Install automatic triggers, then Deploy → New deployment → Web app.');
  } catch (e) {}
}

function canopyInstallTriggers() {
  var keep = ['canopyHandleFormSubmit'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (keep.indexOf(t.getHandlerFunction()) < 0) ScriptApp.deleteTrigger(t);
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('canopyProcessOutbox').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('canopyWeeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  ScriptApp.newTrigger('canopyHandleEdit').forSpreadsheet(ss).onEdit().create();
  try {
    SpreadsheetApp.getUi().alert('Triggers installed: notifications every 15 minutes, weekly backup (Monday 3 a.m.), edit stamping.');
  } catch (e) {}
}

function canopyConnectForm() {
  var ui = SpreadsheetApp.getUi();
  var store = new SheetStore();
  var id = Canopy.settings(store).ORG_FORM_ID;
  if (!id) {
    ui.alert('Add a Settings row: key ORG_FORM_ID, value = the ID from the Form edit URL (docs.google.com/forms/d/THIS_PART/edit). You need edit access to the Form.');
    return;
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'canopyHandleFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('canopyHandleFormSubmit').forForm(FormApp.openById(id)).onFormSubmit().create();
  ui.alert('Connected. New Form responses will be added as pending directory submissions (no directory consent is assumed).');
}

function canopyLoadDemo() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Load DEMO data into THIS spreadsheet? Use a copy, not the live admin sheet.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  canopySetup();
  Canopy.seedDemo(new SheetStore(), canopyCtx_());
  canopyInvalidate_();
  ui.alert('Demo data loaded. LIVE_SENDING is still "no".');
}
