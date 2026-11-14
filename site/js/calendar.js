/* DeKalb County, Illinois Community Sustainability Calendar — plain JavaScript, no build step.
 * Reads the same approved public data as the Canopy site; Canopy coalition calls appear as events. */
(function () {
  var C = window.Canopy;
  var T = C.time;
  var U = C.util;
  var D = window.CanopyData;
  var main = document.getElementById('main');
  var snap = null;
  var KEY_STORE = 'canopy-cal-publisher-key';

  function h(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ext(url, text, cls) {
    var u = U.safeUrl(url);
    return u ? '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + h(u) + '" target="_blank" rel="noopener">' + text + '<span class="hp"> (opens in a new tab)</span></a>' : '';
  }
  function parseHash() {
    var raw = (location.hash || '#/').replace(/^#\/?/, '');
    var parts = raw.split('?');
    var q = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return { path: parts[0].split('/').filter(Boolean), q: q };
  }
  function qs(q, drop) {
    var keys = Object.keys(q).filter(function (k) { return q[k] !== '' && q[k] !== undefined && (drop || []).indexOf(k) < 0; });
    return keys.length ? '?' + keys.map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&') : '';
  }
  function storeGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function storeSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function setTitle(t) { document.title = (t ? t + ' — ' : '') + (snap && snap.settings.CAL_NAME || 'DeKalb County, Illinois Community Sustainability Calendar'); }
  function pageUrl() { return location.href.split('#')[0]; }

  /* ---------- data: community events + Canopy calls as one list ---------- */
  function allItems() {
    var events = (snap.events || []).map(function (e) {
      return Object.assign({ kind: 'event' }, e);
    });
    var calls = (snap.meetings || []).filter(function (m) { return !m.cancelled; }).map(function (m) {
      return {
        kind: 'canopy', id: m.id, title: 'Canopy coalition monthly call', organizer: 'Canopy coalition', date: m.date, start_time: m.start_time, end_time: m.end_time,
        start_iso: m.start_iso, end_iso: m.end_iso, is_online: true, online_url: m.join_url, county: 'Online', category: 'Learning & civic life', cost: 'Free',
        relevance: 'Open monthly coordination call for people working toward a more sustainable DeKalb County: updates, upcoming dates, asks and offers.',
        source_url: (snap.settings.SITE_URL ? snap.settings.SITE_URL.replace(/\/$/, '') + '/#/meetings/' + m.id : '../index.html#/meetings/' + m.id)
      };
    });
    return events.concat(calls).sort(function (a, b) { return a.start_iso < b.start_iso ? -1 : 1; });
  }
  function filtered(q) {
    var text = (q.q || '').toLowerCase();
    return allItems().filter(function (e) {
      if (e.kind === 'canopy' && q.canopy === '0') return false;
      if (q.county === 'Online' ? !e.is_online : q.county && e.county !== q.county) return false;
      if (q.topic && e.category !== q.topic) return false;
      if (q.free === '1' && !/free/i.test(e.cost || '')) return false;
      if (text && [e.title, e.organizer, e.venue, e.city, e.relevance, e.category].join(' ').toLowerCase().indexOf(text) < 0) return false;
      return true;
    });
  }
  function upcoming(list) {
    var now = Date.now();
    return list.filter(function (e) { return new Date(e.end_iso).getTime() >= now; });
  }
  function timeLabel(e) {
    return e.start_time ? T.formatTime(e.start_time) + (e.end_time ? '–' + T.formatTime(e.end_time) : '') : 'All day';
  }
  function place(e) {
    if (e.kind === 'canopy') return 'Online (Google Meet)';
    var p = [e.venue, e.city].filter(Boolean).join(', ');
    if (e.county && e.county !== 'Online' && e.county !== 'Regional / multiple') p += (p ? ' · ' : '') + e.county + ' County, IL';
    if (e.is_online) p += (p ? ' · ' : '') + 'Online';
    return p || 'Location not stated';
  }
  function chips(e) {
    return (e.kind === 'canopy' ? '<span class="chip canopy">Canopy call</span>' : '') + (e.category ? '<span class="chip">' + h(e.category) + '</span>' : '') +
      (/free/i.test(e.cost || '') ? '<span class="chip">Free</span>' : '') + (e.demo ? '<span class="badge demo">DEMO</span>' : '');
  }
  function evLink(e) { return '#/event/' + encodeURIComponent(e.id); }

  /* ---------- filters bar (shared by list/week/month) ---------- */
  function filterBar(view, q) {
    var counties = {};
    (snap.events || []).forEach(function (e) { if (e.county) counties[e.county] = 1; });
    var countyOpts = C.COUNTIES.filter(function (c) { return counties[c] || c === 'DeKalb' || c === 'Online'; });
    var active = ['q', 'county', 'topic', 'free'].filter(function (k) { return q[k]; }).length + (q.canopy === '0' ? 1 : 0);
    return '<details class="filter-panel"' + (active ? ' open' : '') + '><summary>Search &amp; filter' + (active ? ' (' + active + ' active)' : '') + '</summary>' +
      '<form class="filters" data-filter="' + view + '" role="search">' +
      '<label>Search<input type="search" name="q" value="' + h(q.q || '') + '" placeholder="repair, seeds, Sycamore…"></label>' +
      '<label>County<select name="county"><option value="">All of northern Illinois</option>' + countyOpts.map(function (c) { return '<option' + (c === q.county ? ' selected' : '') + ' value="' + h(c) + '">' + h(c === 'Online' ? 'Online' : c + ' County') + '</option>'; }).join('') + '</select></label>' +
      '<label>Topic<select name="topic"><option value="">All topics</option>' + C.CATEGORIES.map(function (c) { return '<option' + (c === q.topic ? ' selected' : '') + '>' + h(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="check" style="flex-direction:row"><input type="checkbox" name="free" value="1"' + (q.free === '1' ? ' checked' : '') + '> Free only</label>' +
      '<label class="check" style="flex-direction:row"><input type="checkbox" name="canopy" value="1"' + (q.canopy !== '0' ? ' checked' : '') + '> Include Canopy calls</label>' +
      (q.d ? '<input type="hidden" name="d" value="' + h(q.d) + '">' : '') + (q.embed ? '<input type="hidden" name="embed" value="1">' : '') +
      '<button type="submit" class="secondary small">Apply</button>' + (active ? ' <a class="small" href="#/' + (view === 'list' ? '' : view) + (q.embed ? '?embed=1' : '') + '">Clear filters</a>' : '') + '</form></details>' +
      '<p class="row small"><button type="button" class="secondary small" data-copy="view">Copy link to this view</button><span id="copy-status" role="status" class="muted"></span></p>';
  }

  /* ---------- views ---------- */
  var views = {};

  views.list = function (r) {
    setTitle('Upcoming');
    var list = upcoming(filtered(r.q));
    // Only the next Canopy call in the list; every call still appears in week and month views.
    var seenCall = false;
    list = list.filter(function (e) { if (e.kind !== 'canopy') return true; if (seenCall) return false; seenCall = true; return true; });
    var out = (r.q.embed ? '' : '<h1 class="hp">Upcoming events</h1>') + filterBar('list', r.q);
    if (!list.length) {
      return out + '<div class="card"><p><strong>No upcoming events match.</strong></p><p class="muted">Try a wider search, or <a href="#/submit">add an event</a>.</p></div>';
    }
    var lastDate = '';
    out += list.slice(0, 200).map(function (e) {
      var head = '';
      if (e.date !== lastDate) {
        head = (lastDate ? '</div>' : '') + '<h2 class="day-head">' + h(T.formatLongDate(e.date)) + '</h2><div>';
        lastDate = e.date;
      }
      return head + '<article class="ev-row"><div class="ev-time">' + h(timeLabel(e)) + '</div><div><a class="ev-title" href="' + evLink(e) + '">' + h(e.title) + '</a><div class="meta">' + h(place(e)) + (e.organizer ? ' · ' + h(e.organizer) : '') + '</div><div>' + chips(e) + '</div></div></article>';
    }).join('') + '</div>';
    return out;
  };

  function startOfWeek(dateStr) {
    var d = T.parseDate(dateStr);
    var wd = T.weekday(d.y, d.m, d.d);
    var dt = new Date(Date.UTC(d.y, d.m - 1, d.d - wd));
    return dt;
  }
  function iso(dt) { return dt.getUTCFullYear() + '-' + T.pad(dt.getUTCMonth() + 1) + '-' + T.pad(dt.getUTCDate()); }

  views.week = function (r) {
    setTitle('Week');
    var today = T.todayChicago(new Date());
    var start = startOfWeek(T.parseDate(r.q.d) ? r.q.d : today);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(iso(new Date(start.getTime() + i * 86400000)));
    var list = filtered(r.q);
    var prev = iso(new Date(start.getTime() - 7 * 86400000)), next = iso(new Date(start.getTime() + 7 * 86400000));
    var q2 = Object.assign({}, r.q);
    var out = '<h1 class="hp">Week view</h1>' + filterBar('week', r.q) +
      '<div class="row" style="justify-content:space-between;margin:8px 0"><a class="btn secondary small" href="#/week' + qs(Object.assign(q2, { d: prev })) + '">← Previous week</a>' +
      '<h2 style="margin:0;font-size:1.1rem" id="week-h">Week of ' + h(T.formatShortDate(days[0])) + '</h2>' +
      '<a class="btn secondary small" href="#/week' + qs(Object.assign({}, r.q, { d: next })) + '">Next week →</a></div>';
    out += '<div class="week" aria-labelledby="week-h">' + days.map(function (day) {
      var items = list.filter(function (e) { return e.date === day; });
      return '<section class="week-day' + (day === today ? ' today' : '') + '"><h3>' + h(T.formatShortDate(day)) + (day === today ? ' · Today' : '') + '</h3>' +
        (items.length ? items.map(function (e) { return '<a href="' + evLink(e) + '"><span class="ev-time">' + h(e.start_time ? T.formatTime(e.start_time) : 'All day') + '</span> ' + h(e.title) + '</a>'; }).join('') : '<p class="muted small">No events</p>') + '</section>';
    }).join('') + '</div>';
    return out;
  };

  views.month = function (r) {
    setTitle('Month');
    var today = T.todayChicago(new Date());
    var ym = /^\d{4}-\d{2}$/.test(r.q.m || '') ? r.q.m : today.slice(0, 7);
    var y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
    var first = T.weekday(y, mo, 1);
    var daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var prev = mo === 1 ? (y - 1) + '-12' : y + '-' + T.pad(mo - 1);
    var next = mo === 12 ? (y + 1) + '-01' : y + '-' + T.pad(mo + 1);
    var byDate = {};
    filtered(r.q).forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
    var label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var out = '<h1 class="hp">Month view</h1>' + filterBar('month', r.q) +
      '<div class="row" style="justify-content:space-between;margin:8px 0"><a class="btn secondary small" href="#/month' + qs(Object.assign({}, r.q, { m: prev })) + '">← Previous</a><h2 style="margin:0;font-size:1.1rem" id="month-h">' + h(label) + '</h2><a class="btn secondary small" href="#/month' + qs(Object.assign({}, r.q, { m: next })) + '">Next →</a></div>' +
      '<div style="overflow-x:auto"><table class="month" aria-labelledby="month-h"><thead><tr>' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) { return '<th scope="col">' + d + '</th>'; }).join('') + '</tr></thead><tbody><tr>';
    for (var i = 0; i < first; i++) out += '<td class="other"></td>';
    for (var d = 1; d <= daysIn; d++) {
      var key = y + '-' + T.pad(mo) + '-' + T.pad(d);
      out += '<td><span' + (key === today ? ' aria-current="date"><strong>' + d + '</strong>' : '>' + d) + '</span>' +
        (byDate[key] || []).map(function (e) { return '<a class="ev" href="' + evLink(e) + '">' + (e.kind === 'canopy' ? '◆ ' : '• ') + h(e.title) + '</a>'; }).join('') + '</td>';
      if ((first + d) % 7 === 0 && d < daysIn) out += '</tr><tr>';
    }
    for (var j = 0; j < (7 - ((first + daysIn) % 7)) % 7; j++) out += '<td class="other"></td>';
    return out + '</tr></tbody></table></div><p class="small muted">◆ Canopy coalition call · • community event. Select an event for details.</p>';
  };

  views.event = function (r) {
    var id = r.path[1];
    var e = allItems().filter(function (x) { return x.id === id; })[0];
    if (!e) {
      setTitle('Event not found');
      return '<h1>Event not found</h1><p>This event may have been cancelled, corrected or removed.</p><p><a href="#/">See upcoming events</a></p>';
    }
    setTitle(e.title);
    var past = new Date(e.end_iso).getTime() < Date.now();
    var mapQ = [e.venue, e.city, e.county && e.county !== 'Online' && e.county !== 'Regional / multiple' ? e.county + ' County' : '', 'Illinois'].filter(Boolean).join(', ');
    var gcal = T.googleCalendarLink({ title: e.title, date: e.date, start: e.start_time, end: e.end_time || e.start_time, end_date: e.end_date, description: [e.relevance, e.source_url ? 'More info: ' + e.source_url : ''].filter(Boolean).join('\n'), location: e.kind === 'canopy' ? 'Google Meet' : [e.venue, e.city].filter(Boolean).join(', ') });
    var out = '<p><a href="#/">← All events</a></p><article><h1>' + h(e.title) + '</h1><div>' + chips(e) + (past ? '<span class="badge warn">This event has passed</span>' : '') + '</div>' +
      '<dl class="detail-meta">' +
      '<div><dt>When</dt><dd>' + h(T.formatLongDate(e.date)) + ' · ' + h(timeLabel(e)) + ' <span class="muted">(' + h(T.zoneLabel(e.date, e.start_time)) + ')</span></dd></div>' +
      '<div><dt>Where</dt><dd>' + h(place(e)) + (e.venue || e.city ? ' · <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQ) + '" target="_blank" rel="noopener">Map<span class="hp"> (opens in a new tab)</span></a>' : '') + '</dd></div>' +
      '<div><dt>Organizer</dt><dd>' + h(e.organizer || 'Not stated') + '</dd></div>' +
      '<div><dt>Cost</dt><dd>' + h(e.cost || 'Not stated') + '</dd></div>' +
      '<div><dt>Accessibility</dt><dd>' + h(e.accessibility || 'Not stated — please ask the organizer.') + '</dd></div>' +
      '</dl>' + (e.relevance ? '<p>' + h(e.relevance) + '</p>' : '') +
      '<div class="card"><h2 style="margin-top:0;font-size:1.05rem">Original source</h2>' + (e.source_url ? '<p>' + ext(e.source_url, 'View the organizer’s event page', 'btn') + '</p><p class="small muted">Always check the organizer’s page for the latest details.</p>' : '<p class="muted">No original event page was provided. Please confirm details with the organizer.</p>') +
      (e.registration_url ? '<p>' + ext(e.registration_url, 'Register', 'btn secondary') + '</p>' : '') + (e.online_url && !past ? '<p>' + ext(e.online_url, e.kind === 'canopy' ? 'Join the call on Google Meet' : 'Online access link', 'btn secondary') + '</p>' : '') + '</div>' +
      '<div class="row">' + (past ? '' : '<a class="btn secondary small" href="' + h(gcal) + '" target="_blank" rel="noopener">Add to Google Calendar<span class="hp"> (opens in a new tab)</span></a><button type="button" class="secondary small" data-ics="' + h(e.id) + '">Download .ics (Apple, Outlook)</button>') +
      '<button type="button" class="secondary small" data-copy="event">Copy link to this event</button><span id="copy-status" role="status" class="muted"></span></div>' +
      (e.kind === 'event' ? '<p class="small" style="margin-top:14px"><a href="#/report?ref=' + encodeURIComponent('Events:' + e.id) + '">Report a problem with this listing</a>' + (e.published_via === 'trusted publisher' ? ' · Published by a trusted community group' : '') + '</p>' : '') + '</article>';
    return out;
  };

  views.subscribe = function () {
    setTitle('Subscribe');
    var feed = D.icsUrl('events');
    var all = D.icsUrl('');
    if (!feed) return '<h1>Subscribe</h1><p class="alert warn">Subscription feeds are available once the calendar is connected to its live data.</p>';
    function box(label, url) {
      var webcal = url.replace(/^https?:/, 'webcal:');
      return '<div class="card"><h2 style="margin-top:0;font-size:1.05rem">' + h(label) + '</h2><div class="feed-box"><code>' + h(url) + '</code><button type="button" class="secondary small" data-copy-text="' + h(url) + '">Copy</button></div>' +
        '<p class="row" style="margin-top:8px"><a class="btn small" href="https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal) + '" target="_blank" rel="noopener">Add to Google Calendar<span class="hp"> (opens in a new tab)</span></a><a class="btn secondary small" href="' + h(webcal) + '">Open in Apple / Outlook</a></p></div>';
    }
    return '<h1>Subscribe</h1><p>Add the calendar to Google Calendar, Apple Calendar or Outlook. It updates automatically as new events are approved, so you never have to check back.</p>' +
      box('Community events', feed) + box('Community events + Canopy coalition calls', all) +
      '<details class="card"><summary>Only one county or topic?</summary><p class="small">Add <code>&amp;county=DeKalb</code> or <code>&amp;category=Repair%20%26%20reuse</code> to the end of the address before subscribing.</p></details>' +
      '<p class="small muted">Updates usually appear in Google Calendar within a few hours; Google decides how often it refreshes.</p>';
  };

  views.about = function () {
    setTitle('About');
    return '<h1>About this calendar</h1><p>' + h(snap.settings.CAL_NAME) + ' lists community events connected to sustainability, climate adaptation and community resilience across DeKalb County and northern Illinois — repair cafés, native plants, energy, food and gardening, cleanups, transit, learning and more.</p>' +
      '<p>Anyone can <a href="#/submit">add an event</a>. Trusted community groups publish directly; everything else is reviewed first. Each listing links to the organizer’s own page where one exists — please check it for the latest details.</p>' +
      '<p>The <a href="../index.html">Canopy coalition</a>’s monthly coordination calls appear here too.</p><p><a href="#/report">Report a problem or ask a question</a></p>';
  };

  /* ---------- forms: submit + report ---------- */
  function field(f) {
    var id = 'f-' + f.name;
    var req = f.required ? ' <span class="req" aria-hidden="true">*</span><span class="hp"> (required)</span>' : '';
    var hint = f.hint ? '<span class="hint" id="' + id + '-hint">' + h(f.hint) + '</span>' : '';
    var desc = ' aria-describedby="' + (f.hint ? id + '-hint ' : '') + id + '-err"';
    var err = '<span class="error-text" id="' + id + '-err" hidden></span>';
    var ctl;
    if (f.type === 'select') ctl = '<select id="' + id + '" name="' + f.name + '"' + desc + '>' + f.options.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + h(v) + '"' + (v === f.value ? ' selected' : '') + '>' + h(l) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') ctl = '<textarea id="' + id + '" name="' + f.name + '"' + desc + '>' + h(f.value || '') + '</textarea>';
    else ctl = '<input type="' + f.type + '" id="' + id + '" name="' + f.name + '" value="' + h(f.value || '') + '"' + (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') + (f.type === 'url' ? ' placeholder="https://"' : '') + desc + '>';
    return '<div class="field" data-field="' + f.name + '"><label for="' + id + '">' + h(f.label) + req + '</label>' + hint + ctl + err + '</div>';
  }

  var FORMS = {
    submit: {
      type: 'event', button: 'Submit event',
      fields: function () {
        return [
          { name: 'title', label: 'Event title', type: 'text', required: true },
          { name: 'organizer', label: 'Organizer', type: 'text', required: true },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'start_time', label: 'Start time (Central Time)', type: 'time', required: true },
          { name: 'end_time', label: 'End time', type: 'time' },
          { name: 'category', label: 'Topic', type: 'select', required: true, options: [['', 'Choose…']].concat(C.CATEGORIES) },
          { name: 'venue', label: 'Venue', type: 'text', hint: 'Leave blank if the event is online only.' },
          { name: 'city', label: 'City or town', type: 'text' },
          { name: 'county', label: 'County', type: 'select', required: true, options: [['', 'Choose…']].concat(C.COUNTIES.map(function (c) { return [c, c === 'Online' || c === 'Regional / multiple' ? c : c + ' County']; })) },
          { name: 'online_url', label: 'Online access link', type: 'url' },
          { name: 'source_url', label: 'Link to the original event page (recommended)', type: 'url', hint: 'The organizer’s own page, post or listing. If there isn’t one, leave this blank — your event is still welcome.' },
          { name: 'relevance', label: 'How does it connect to community sustainability?', type: 'textarea', required: true, hint: 'One or two sentences.' },
          { name: 'cost', label: 'Cost', type: 'text', hint: 'e.g. Free, $10, sliding scale' },
          { name: 'registration_url', label: 'Registration link', type: 'url' },
          { name: 'accessibility', label: 'Accessibility details', type: 'textarea', hint: 'Step-free access, captions, childcare, transit, etc.' },
          { name: 'submitter_name', label: 'Your name', type: 'text', required: true, autocomplete: 'name' },
          { name: 'submitter_email', label: 'Your email', type: 'email', required: true, autocomplete: 'email', hint: 'Private. We’ll send you a link to correct or cancel the event.' }
        ];
      }
    },
    report: {
      type: 'correction', button: 'Send',
      fields: function (q) {
        return [
          { name: 'description', label: 'What’s wrong, or what’s your question?', type: 'textarea', required: true },
          { name: 'record_ref', label: 'Which listing? (optional)', type: 'text', value: q.ref || '' },
          { name: 'name', label: 'Your name (optional)', type: 'text', autocomplete: 'name' },
          { name: 'email', label: 'Email for a reply (optional, private)', type: 'email', autocomplete: 'email' }
        ];
      }
    }
  };

  function formView(key, r) {
    var spec = FORMS[key];
    var keyParam = r.q.key || storeGet(KEY_STORE);
    if (key === 'submit' && r.q.key) storeSet(KEY_STORE, r.q.key);
    setTitle(key === 'submit' ? 'Add an event' : 'Report a problem');
    var intro = key === 'submit'
      ? '<h1>Add an event</h1><p>Share a community event connected to sustainability in DeKalb County or northern Illinois. Times are Central Time.</p>' +
        (keyParam ? '<p class="alert ok">You’re using a trusted publishing link: your event will appear on the calendar right away. <button type="button" class="secondary small" data-forget-key>Not you? Forget this link</button></p>' : '<p class="muted">Events are reviewed before they appear, usually within a few days.</p>')
      : '<h1>Report a problem or ask a question</h1><p>Wrong date, cancelled event, broken link, or something that doesn’t belong? Tell us and we’ll fix it.</p>';
    return intro + (D.mode === 'demo' ? '<p class="alert warn">Demo: runs on sample data in your browser. Nothing is emailed.</p>' : '') +
      '<div id="form-result" tabindex="-1"></div><form class="canopy cal-form" novalidate data-cal-form="' + key + '" data-client-id="' + D.newClientId() + '">' +
      '<div id="error-summary" class="alert bad" role="alert" tabindex="-1" hidden></div><p class="small muted">Fields marked <span class="req">*</span> are required.</p>' +
      spec.fields(r.q).map(field).join('') +
      '<div class="hp" aria-hidden="true"><label for="f-website_hp">Leave this empty</label><input id="f-website_hp" name="website_hp" tabindex="-1" autocomplete="off"></div>' +
      '<p><button type="submit">' + h(spec.button) + '</button></p></form>';
  }
  views.submit = function (r) { return formView('submit', r); };
  views.report = function (r) { return formView('report', r); };

  function showErrors(form, errors) {
    form.querySelectorAll('.error-text').forEach(function (e) { e.hidden = true; });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    var sum = form.querySelector('#error-summary');
    var keys = Object.keys(errors || {});
    if (!keys.length) { sum.hidden = true; return; }
    sum.innerHTML = '<strong>Please fix ' + keys.length + ' thing' + (keys.length > 1 ? 's' : '') + ':</strong><ul>' + keys.map(function (k) {
      var ctl = form.querySelector('[name="' + k + '"]');
      var e = form.querySelector('#f-' + k + '-err');
      if (e) { e.textContent = errors[k]; e.hidden = false; }
      if (ctl) ctl.setAttribute('aria-invalid', 'true');
      return '<li>' + (ctl ? '<a href="#' + ctl.id + '" data-focus="' + ctl.id + '">' + h(errors[k]) + '</a>' : h(errors[k])) + '</li>';
    }).join('') + '</ul>';
    sum.hidden = false;
    sum.focus();
  }

  function submitForm(form) {
    var key = form.getAttribute('data-cal-form');
    var spec = FORMS[key];
    var r = parseHash();
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) data[el.name] = el.value.trim(); });
    var errors = {};
    spec.fields(r.q).forEach(function (f) {
      var v = data[f.name];
      if (f.required && !v) errors[f.name] = f.label.replace(/\s*\(.*\)$/, '') + ' is required.';
      else if (v && f.type === 'email' && !U.isEmail(v)) errors[f.name] = 'Enter an email like name@example.com.';
      else if (v && f.type === 'url' && !U.isHttpUrl(v)) errors[f.name] = 'Links must start with https://';
    });
    if (Object.keys(errors).length) return showErrors(form, errors);
    showErrors(form, {});
    data.action = 'submit';
    data.type = spec.type;
    data.client_id = form.getAttribute('data-client-id');
    if (key === 'submit') data.publisher_key = r.q.key || storeGet(KEY_STORE);
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    D.post(data).then(function (res) {
      if (!res.ok && res.code === 'validation') { btn.disabled = false; btn.textContent = spec.button; return showErrors(form, res.errors); }
      var box = document.getElementById('form-result');
      var link = res.status === 'published' ? '<p><a href="#/event/' + encodeURIComponent(res.reference) + '">See your event</a> · <a href="#/submit">Add another</a></p>' : '<p><a href="#/">Back to the calendar</a>' + (key === 'submit' ? ' · <a href="#/submit">Add another</a>' : '') + '</p>';
      box.innerHTML = '<div class="alert ' + (res.ok ? 'ok' : 'bad') + '" role="' + (res.ok ? 'status' : 'alert') + '"><p><strong>' + (res.status === 'published' ? 'Published' : res.ok ? 'Received' : 'Not sent') + '</strong></p><p>' + h(res.message) + '</p></div>' + (res.ok ? link : '');
      if (res.ok) {
        form.remove();
        D.getPublic(true).then(function (s) { snap = s; });
      } else { btn.disabled = false; btn.textContent = spec.button; }
      box.focus();
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = 'Try again';
      var box = document.getElementById('form-result');
      box.innerHTML = '<div class="alert bad" role="alert"><p><strong>We couldn’t reach the calendar service.</strong> Your entries are still here — press “Try again”. Trying again will not create a duplicate.</p></div>';
      box.focus();
    });
  }

  /* ---------- clipboard, ics ---------- */
  function copy(text, statusEl) {
    function done(ok) { if (statusEl) statusEl.textContent = ok ? 'Link copied.' : 'Copy the address from your browser bar.'; }
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } catch (e) { done(false); }
  }
  function downloadIcs(id) {
    var e = allItems().filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var ics = T.buildIcs([{ uid: e.id, date: e.date, start: e.start_time, end: e.end_time || e.start_time, end_date: e.end_date, title: e.title, description: [e.relevance, e.source_url].filter(Boolean).join('\n'), location: place(e), url: e.source_url }], snap.settings.CAL_NAME);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'event-' + e.date + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- router ---------- */
  function render() {
    var r = parseHash();
    var name = r.path[0] || 'list';
    var view = views[name] || views.list;
    document.body.classList.toggle('embed', r.q.embed === '1');
    try { main.innerHTML = view(r); } catch (e) { main.innerHTML = '<h1>Something went wrong</h1><p>Please reload the page.</p>'; if (window.console) console.error(e); }
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (r.q.embed === '1') {
      main.querySelectorAll('a[href^="#/event/"]').forEach(function (a) { a.setAttribute('href', a.getAttribute('href') + '?embed=1'); });
    }
    var h1 = main.querySelector('h1:not(.hp)');
    if (h1 && render.count++) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
    window.scrollTo(0, 0);
  }
  render.count = 0;

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.hasAttribute('data-filter')) {
      ev.preventDefault();
      var q = {};
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') { if (el.name === 'canopy') { if (!el.checked) q.canopy = '0'; } else if (el.checked) q[el.name] = '1'; }
        else if (el.value) q[el.name] = el.value;
      });
      var view = f.getAttribute('data-filter');
      location.hash = '#/' + (view === 'list' ? '' : view) + qs(q);
      return;
    }
    if (f.hasAttribute('data-cal-form')) { ev.preventDefault(); submitForm(f); }
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, a');
    if (!t) return;
    if (t.classList.contains('skip')) { ev.preventDefault(); main.focus(); return; }
    if (t.hasAttribute('data-focus')) { ev.preventDefault(); var el = document.getElementById(t.getAttribute('data-focus')); if (el) el.focus(); }
    if (t.hasAttribute('data-ics')) downloadIcs(t.getAttribute('data-ics'));
    if (t.hasAttribute('data-copy')) copy(location.href.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, ''), document.getElementById('copy-status'));
    if (t.hasAttribute('data-copy-text')) { copy(t.getAttribute('data-copy-text'), null); t.textContent = 'Copied'; }
    if (t.hasAttribute('data-forget-key')) { storeSet(KEY_STORE, ''); location.hash = '#/submit'; render(); }
  });
  window.addEventListener('hashchange', render);

  function chrome() {
    var s = snap.settings || {};
    if (s.CAL_NAME) document.getElementById('cal-name').textContent = s.CAL_NAME;
    if (s.CAL_TAGLINE) document.getElementById('cal-tagline').textContent = s.CAL_TAGLINE;
    document.getElementById('owner-note').textContent = s.CAL_OWNER_NOTE || '';
    document.getElementById('cal-contact').innerHTML = U.isEmail(s.CAL_CONTACT_EMAIL) ? 'Questions or problems: <a href="mailto:' + h(s.CAL_CONTACT_EMAIL) + '">' + h(s.CAL_CONTACT_EMAIL) + '</a>' : '';
    var notice = document.getElementById('notice');
    var parts = [];
    if (s.CAL_NOTICE) parts.push(s.CAL_NOTICE);
    if (D.mode === 'demo') parts.push('DEMO — sample events; nothing is saved or sent.');
    if (snap._stale) parts.push('Showing saved information — the live service could not be reached.');
    notice.textContent = parts.join(' ');
    notice.hidden = !parts.length;
    document.getElementById('data-stamp').textContent = 'Updated ' + new Date(snap.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) + ' Central Time.';
  }

  D.getPublic().then(function (s) {
    snap = s;
    chrome();
    render();
  }).catch(function () {
    main.innerHTML = '<h1>Calendar unavailable</h1><p class="alert bad">The calendar service could not be reached. Please try again shortly.</p>';
  });
})();
