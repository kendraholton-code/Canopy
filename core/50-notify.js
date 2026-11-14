/*
 * Notification outbox. Every email is first written to the Notifications tab, then sent.
 *  - dedupe_key prevents retries/double-submits from producing email floods
 *  - LIVE_SENDING must be "yes" before anything leaves Google; otherwise status = simulated
 *  - TEST_RECIPIENT (when set) redirects every live email to one test inbox
 *  - failures retry with backoff, then escalate once to the exceptions steward
 * "sent" means handed to the mail service. It does not prove the message was read.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = C.util;

  var MAX_ATTEMPTS = 3;
  var FOOTER =
    '\n\n—\nCanopy · Second Saturdays for a More Sustainable DeKalb County\n' +
    'This message was sent automatically by the Canopy coordination site. Reply to reach the person named above, ' +
    'or use the correction link on the site if something is wrong.';

  C.queueNotification = function (store, ctx, n) {
    if (!U.isEmail(n.to)) return null;
    if (n.dedupe_key) {
      var existing = store.list('Notifications').filter(function (r) {
        return r.dedupe_key === n.dedupe_key;
      })[0];
      if (existing) return existing;
    }
    return store.insert('Notifications', {
      id: U.makeId('ntf', ctx),
      created_at: U.nowIso(ctx),
      kind: n.kind,
      to: U.normEmail(n.to),
      subject: U.clip(n.subject, 200),
      body: U.clip(n.body, 20000) + FOOTER,
      related: n.related || '',
      dedupe_key: n.dedupe_key || '',
      status: 'queued',
      attempts: '0'
    });
  };

  function due(row, now) {
    if (row.status === 'queued') return true;
    if (row.status !== 'retry') return false;
    var attempts = +row.attempts || 0;
    var last = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : 0;
    return now.getTime() - last >= attempts * 10 * 60000;
  }

  function escalate(store, ctx, row, reason) {
    if (row.kind === 'escalation') return 'not_escalated_escalation_failed';
    var to = C.roleEmail(store, 'exceptions_steward');
    if (!to) return 'no_exceptions_steward_assigned';
    C.queueNotification(store, ctx, {
      kind: 'escalation',
      to: to,
      subject: '[Canopy] Notification could not be delivered',
      body:
        'A Canopy notification failed after ' + MAX_ATTEMPTS + ' attempts and needs a person to follow up.\n\n' +
        'Notification: ' + row.id + '\nKind: ' + row.kind + '\nRelated record: ' + row.related + '\nLast error: ' + reason +
        '\n\nOpen the Canopy Admin sheet → Notifications tab, fix the address or role, then use Canopy menu → "Retry failed notifications".',
      related: row.related,
      dedupe_key: 'esc:' + row.id
    });
    return 'escalated';
  }

  /**
   * mailer: { send({to, subject, body, replyTo}) , remaining?() }
   * opts.ids: only process these notification ids (used right after a submission).
   */
  C.processOutbox = function (store, ctx, mailer, opts) {
    opts = opts || {};
    var settings = C.settings(store);
    var live = U.yes(settings.LIVE_SENDING);
    var testTo = U.isEmail(settings.TEST_RECIPIENT) ? settings.TEST_RECIPIENT : '';
    var replyTo = U.isEmail(settings.REPLY_TO) ? settings.REPLY_TO : '';
    var now = ctx.now();
    var result = { sent: 0, simulated: 0, failed: 0, retry: 0, skipped: 0 };

    // Two passes so an escalation queued in pass one is also processed.
    for (var pass = 0; pass < 2; pass++) {
      store.list('Notifications').forEach(function (row) {
        if (opts.ids && opts.ids.indexOf(row.id) < 0 && row.kind !== 'escalation') return;
        if (!due(row, now)) return;
        var attempts = (+row.attempts || 0) + 1;
        if (!live) {
          store.update('Notifications', row.id, { status: 'simulated', attempts: String(attempts), last_attempt_at: now.toISOString(), last_error: 'LIVE_SENDING is off — not sent' });
          result.simulated++;
          return;
        }
        if (mailer.remaining && mailer.remaining() < 1) {
          result.skipped++;
          return;
        }
        var to = testTo || row.to;
        var subject = testTo ? '[TEST → ' + row.to + '] ' + row.subject : row.subject;
        try {
          mailer.send({ to: to, subject: subject, body: row.body, replyTo: replyTo });
          store.update('Notifications', row.id, { status: 'sent', attempts: String(attempts), last_attempt_at: now.toISOString(), sent_at: now.toISOString(), last_error: testTo ? 'redirected to TEST_RECIPIENT' : '' });
          result.sent++;
        } catch (e) {
          var msg = U.clip(e && e.message ? e.message : String(e), 300);
          if (attempts >= MAX_ATTEMPTS) {
            var esc = escalate(store, ctx, row, msg);
            store.update('Notifications', row.id, { status: 'failed', attempts: String(attempts), last_attempt_at: now.toISOString(), last_error: msg, escalated: esc });
            result.failed++;
          } else {
            store.update('Notifications', row.id, { status: 'retry', attempts: String(attempts), last_attempt_at: now.toISOString(), last_error: msg });
            result.retry++;
          }
        }
      });
    }
    return result;
  };

  /** Steward action: put failed notifications back in the queue (after fixing an address/role). */
  C.retryFailed = function (store, ctx, actor, ids) {
    var n = 0;
    store.list('Notifications').forEach(function (row) {
      if (row.status !== 'failed' && row.status !== 'simulated') return;
      if (ids && ids.indexOf(row.id) < 0) return;
      if (!ids && row.status === 'simulated') return;
      store.update('Notifications', row.id, { status: 'queued', attempts: '0', last_error: 'requeued by ' + actor });
      n++;
    });
    C.audit(store, ctx, actor, 'retry_notifications', 'Notifications', '', { count: n });
    return n;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
