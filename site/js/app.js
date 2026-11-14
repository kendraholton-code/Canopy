/* Canopy public site — plain JavaScript, no build step, no third-party code. */
(function () {
  var C = window.Canopy;
  var T = C.time;
  var D = window.CanopyData;
  var main = document.getElementById('main');
  var snap = null;

  /* ---------------- helpers ---------------- */
  function h(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function para(s) {
    return h(s).replace(/\n/g, '<br>');
  }
  function link(url, text, cls) {
    var u = C.util.safeUrl(url);
    if (!u) return '';
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + h(u) + '" rel="noopener" target="_blank">' + text + '<span class="hp"> (opens in a new tab)</span></a>';
  }
  function demoBadge(x) {
    return x && x.demo ? ' <span class="badge demo">DEMO</span>' : '';
  }
  function when(date, start, end) {
    return T.formatLongDate(date) + (start ? ' · ' + T.formatTime(start) + (end ? '–' + T.formatTime(end) : '') + ' <abbr title="' + h(T.zoneLabel(date, start)) + '">CT</abbr>' : '');
  }
  function nowMs() {
    return Date.now();
  }
  function upcomingMeetings() {
    return (snap.meetings || []).filter(function (m) {
      return new Date(m.end_iso).getTime() >= nowMs();
    });
  }
  function nextMeeting() {
    return upcomingMeetings().filter(function (m) { return !m.cancelled; })[0] || null;
  }
  function groupById(id) {
    return (snap.groups || []).filter(function (g) { return g.id === id; })[0];
  }
  function parseHash() {
    var raw = (location.hash || '#/').replace(/^#\/?/, '');
    var q = {};
    var parts = raw.split('?');
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return { path: parts[0].split('/').filter(Boolean), q: q };
  }
  function setTitle(t) {
    document.title = (t ? t + ' — ' : '') + 'Canopy';
  }
  function joinButton(m, big) {
    if (m.cancelled) return '<span class="unavailable">Cancelled' + (m.cancelled_reason ? ': ' + h(m.cancelled_reason) : '') + '</span>';
    if (m.join_url) return '<a class="btn' + (big ? '' : ' small') + '" href="' + h(m.join_url) + '" rel="noopener">Join the ' + h(T.formatShortDate(m.date)) + ' call on Google Meet</a>';
    return '<span class="unavailable" role="note">Join link coming soon</span>';
  }
  function calendarButtons(item, kind) {
    var gc = T.googleCalendarLink({ title: item.title || 'Canopy monthly call', date: item.date, start: item.start_time, end: item.end_time || item.start_time, end_date: item.end_date, description: kind === 'meeting' ? (item.join_url ? 'Join: ' + item.join_url : 'Join link: see the Canopy site') : item.relevance, location: kind === 'meeting' ? 'Google Meet' : [item.venue, item.city].filter(Boolean).join(', ') });
    return '<button type="button" class="secondary small" data-ics="' + h(item.id) + '" data-kind="' + kind + '">Download calendar file (.ics) for ' + h(T.formatShortDate(item.date)) + '</button> ' +
      '<a class="btn secondary small" href="' + h(gc) + '" rel="noopener" target="_blank">Add to Google Calendar<span class="hp"> (opens in a new tab)</span></a>';
  }
  function downloadIcs(id, kind) {
    var list = kind === 'meeting' ? snap.meetings : snap.events;
    var it = list.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var ics = T.buildIcs([{ uid: it.id, date: it.date, start: it.start_time, end: it.end_time || it.start_time, end_date: it.end_date, title: it.title || 'Canopy monthly call', description: kind === 'meeting' ? (it.join_url ? 'Join: ' + it.join_url : 'Join link: see the Canopy site') : it.relevance, location: kind === 'meeting' ? 'Google Meet' : [it.venue, it.city].filter(Boolean).join(', '), url: kind === 'meeting' ? it.join_url : it.source_url }], 'Canopy');
    var blob = new Blob([ics], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'canopy-' + it.date + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- views ---------------- */
  var views = {};

  views.home = function () {
    setTitle('Next call');
    var m = nextMeeting();
    var later = upcomingMeetings().filter(function (x) { return x !== m; }).slice(0, 3);
    var out = '<h1>Next Canopy call</h1>';
    if (!m) {
      out += '<div class="card hero"><p><strong>No upcoming call has been published yet.</strong></p><p class="muted">Monthly calls are planned for the second Saturday of each month, 10–11 a.m. Central Time, on Google Meet. Dates appear here once a coalition steward confirms them.</p></div>';
    } else {
      out += '<section class="card hero" aria-labelledby="next-h"><h2 id="next-h" class="date-big">' + when(m.date, m.start_time, m.end_time) + demoBadge(m) + '</h2>' +
        '<p class="meta">Google Meet · ' + h(m.zone) + '</p>' +
        '<div class="row">' + joinButton(m, true) + '</div>' +
        '<div class="row" style="margin-top:8px">' + calendarButtons(m, 'meeting') + '</div>' +
        '<h3 style="margin-top:14px">What the call is for</h3><p>A one-hour coordination meeting for people working toward a more sustainable DeKalb County: share updates, upcoming dates and asks/offers, spot overlaps, and find collaborators. Project details move to working groups.</p>' +
        (m.agenda ? '<h3>Agenda</h3><pre class="text">' + h(m.agenda) + '</pre>' : m.checkpoint ? '<h3>Possible focus <span class="badge warn">not a fixed agenda</span></h3><p>' + h(m.checkpoint) + '</p>' : '') +
        '<p><a href="#/forms/update">Can’t attend? Send a written update</a> · <a href="#/forms/correction?help=1">Need help joining or an access accommodation?</a></p></section>';
    }
    if (later.length) {
      out += '<h2>Coming up</h2><ul class="plain">' + later.map(function (x) {
        return '<li>' + when(x.date, x.start_time, x.end_time) + (x.cancelled ? ' <span class="badge bad">Cancelled</span>' : '') + demoBadge(x) + (x.checkpoint ? '<br><span class="muted small">Possible focus: ' + h(x.checkpoint) + '</span>' : '') + '</li>';
      }).join('') + '</ul><p><a href="#/meetings">All meetings and notes</a></p>';
    }
    var acc = (snap.groups || []).filter(function (g) { return g.accepting; }).length;
    out += '<h2>Find your way in</h2><div class="grid">' +
      '<div class="card"><h3><a href="#/get-involved">Get involved</a></h3><p>' + (acc ? acc + ' working group' + (acc > 1 ? 's are' : ' is') + ' welcoming people now.' : 'Browse working groups, or ask us to help you find a place.') + ' No organization or account needed.</p></div>' +
      '<div class="card"><h3><a href="#/calendar">Community calendar</a></h3><p>Sustainability and resilience events around the county and online. Submit yours.</p></div>' +
      '<div class="card"><h3><a href="#/directory">Organizations &amp; people</a></h3><p>Who is doing what, with contact details they chose to share.</p></div>' +
      '<div class="card"><h3><a href="#/collaborate">Collaborations &amp; requests</a></h3><p>Offers, needs and shared projects, with owners and next steps.</p></div></div>';
    return out;
  };

  views.join = function () {
    var m = nextMeeting();
    if (m && m.join_url) {
      location.replace(m.join_url);
      return '<h1>Opening the call…</h1><p><a href="' + h(m.join_url) + '">Continue to Google Meet</a></p>';
    }
    setTitle('Join the call');
    return '<h1>Join the monthly call</h1><p>The join link is coming soon. ' + (m ? 'The next call is ' + when(m.date, m.start_time, m.end_time) + '.' : '') + '</p><p><a href="#/">Back to the next call</a></p>';
  };

  views.meetings = function (r) {
    if (r.path[1]) return views.meeting(r.path[1]);
    setTitle('Meetings & notes');
    var q = (r.q.q || '').toLowerCase();
    var up = upcomingMeetings();
    var past = (snap.meetings || []).filter(function (m) { return up.indexOf(m) < 0; }).reverse();
    function recapFor(m) { return (snap.recaps || []).filter(function (x) { return x.meeting_id === m.id; })[0]; }
    function matches(m) {
      if (!q) return true;
      var rc = recapFor(m);
      return [m.date, T.formatLongDate(m.date), m.title, m.checkpoint, m.agenda, rc && rc.summary, rc && rc.decisions].join(' ').toLowerCase().indexOf(q) >= 0;
    }
    var out = '<h1>Meetings &amp; notes</h1><p class="muted">Reviewed recaps only. Raw transcripts are never published. Drafts are not shown until a steward approves them.</p>' +
      '<form class="filters" role="search" data-search="meetings"><label>Search by topic or date<input type="search" name="q" value="' + h(r.q.q || '') + '" placeholder="e.g. repair, March"></label><button class="secondary small" type="submit">Search</button></form>';
    out += '<h2>Upcoming calls</h2>';
    var ups = up.filter(matches);
    out += ups.length ? '<ul class="plain">' + ups.map(function (m) {
      return '<li><a href="#/meetings/' + h(m.id) + '">' + when(m.date, m.start_time, m.end_time) + '</a>' + (m.cancelled ? ' <span class="badge bad">Cancelled</span>' : '') + demoBadge(m) + (m.checkpoint ? '<br><span class="muted small">Possible focus (not adopted): ' + h(m.checkpoint) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">No upcoming calls match.</p>';
    out += '<h2>Past calls and recaps</h2>';
    var ps = past.filter(matches);
    out += ps.length ? '<ul class="plain">' + ps.map(function (m) {
      var rc = recapFor(m);
      return '<li><a href="#/meetings/' + h(m.id) + '">' + h(T.formatLongDate(m.date)) + ' — ' + h(m.title) + '</a> ' + (rc ? '<span class="badge ok">Approved recap</span>' : '<span class="badge warn">No approved recap yet</span>') + demoBadge(m) + '</li>';
    }).join('') + '</ul>' : '<p class="muted">No past calls match.</p>';
    return out;
  };

  views.meeting = function (id) {
    var m = (snap.meetings || []).filter(function (x) { return x.id === id; })[0];
    if (!m) return views.notFound();
    setTitle(T.formatLongDate(m.date));
    var rc = (snap.recaps || []).filter(function (x) { return x.meeting_id === m.id; })[0];
    var acts = (snap.action_items || []).filter(function (a) { return a.meeting_id === m.id; });
    var ups = (snap.updates || []).filter(function (u) { return u.meeting_id === m.id; });
    var isUpcoming = new Date(m.end_iso).getTime() >= nowMs();
    var out = '<p><a href="#/meetings">← All meetings</a></p><h1>' + h(m.title) + ' — ' + h(T.formatLongDate(m.date)) + demoBadge(m) + '</h1><p class="meta">' + when(m.date, m.start_time, m.end_time) + ' · Google Meet</p>';
    if (isUpcoming) out += '<div class="row">' + joinButton(m, true) + '</div><div class="row" style="margin-top:8px">' + (m.cancelled ? '' : calendarButtons(m, 'meeting')) + '</div>';
    if (m.agenda) out += '<h2>Agenda</h2><pre class="text">' + h(m.agenda) + '</pre>';
    else if (m.checkpoint) out += '<h2>Possible focus</h2><p>' + h(m.checkpoint) + ' <span class="badge warn">optional checkpoint, not an adopted agenda</span></p>';
    if (rc) {
      out += '<h2>Recap <span class="badge ok">Approved</span>' + demoBadge(rc) + '</h2><p>' + para(rc.summary) + '</p>' + (rc.decisions ? '<h3>Decisions</h3><p>' + para(rc.decisions) + '</p>' : '') + (rc.next_steps ? '<h3>Next steps</h3><p>' + para(rc.next_steps) + '</p>' : '');
    } else if (!isUpcoming) {
      out += '<p class="alert warn">No approved recap has been published for this call yet.</p>';
    }
    if (acts.length) {
      out += '<h2>Action items</h2><ul class="plain">' + acts.map(function (a) {
        return '<li><strong>' + h(a.description) + '</strong>' + demoBadge(a) + '<br><span class="meta">Owner: ' + h(a.owner_display) + ' · Status: ' + h(a.progress || 'open') + (a.due_date ? ' · Due: ' + h(a.due_date) : '') + '</span>' + (a.next_step ? '<br><span class="small">Next step: ' + h(a.next_step) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (ups.length) {
      out += '<h2>Written updates</h2><ul class="plain">' + ups.map(function (u) {
        return '<li><strong>' + h(u.display_name) + (u.org_display ? ' · ' + h(u.org_display) : '') + '</strong>' + demoBadge(u) + '<br>' + h(u.update_text) + (u.upcoming_date ? '<br><span class="small">Upcoming: ' + h(u.upcoming_date) + '</span>' : '') + (u.ask_offer ? '<br><span class="small">Ask/offer: ' + h(u.ask_offer) + '</span>' : '') + (u.link ? '<br>' + link(u.link, 'Related link') : '') + '</li>';
      }).join('') + '</ul>';
    }
    out += '<p><a href="#/forms/update">Send an update for the next call</a></p>';
    return out;
  };

  views.directory = function (r) {
    setTitle('Organizations & people');
    var tab = r.q.tab === 'people' ? 'people' : 'orgs';
    var q = (r.q.q || '').toLowerCase();
    var loc = r.q.loc || '';
    var orgs = snap.organizations || [];
    var people = snap.people || [];
    var locs = {};
    orgs.concat(people).forEach(function (x) { if (x.locality) locs[x.locality] = 1; });
    function hit(x) {
      var txt = JSON.stringify(x).toLowerCase();
      return (!q || txt.indexOf(q) >= 0) && (!loc || x.locality === loc);
    }
    var formUrl = snap.settings.ORG_FORM_URL;
    var out = '<h1>Organizations &amp; people</h1><p>Groups and individuals working toward a more sustainable DeKalb County. Only details people chose to publish appear here. Individuals can take part without an organization.</p>' +
      '<p class="row"><a class="btn" href="#/forms/listing">Add your organization or yourself</a>' + (formUrl ? link(formUrl, 'Use the original Google Form instead', 'btn secondary') : '') + '</p>' +
      '<form class="filters" role="search" data-search="directory"><input type="hidden" name="tab" value="' + tab + '"><label>Search<input type="search" name="q" value="' + h(r.q.q || '') + '" placeholder="name, interest, offer"></label>' +
      '<label>Locality<select name="loc"><option value="">Anywhere</option>' + Object.keys(locs).sort().map(function (l) { return '<option' + (l === loc ? ' selected' : '') + '>' + h(l) + '</option>'; }).join('') + '</select></label><button class="secondary small" type="submit">Filter</button></form>' +
      '<p class="row" role="group" aria-label="Show"><a class="btn small' + (tab === 'orgs' ? '' : ' secondary') + '" href="#/directory?tab=orgs"' + (tab === 'orgs' ? ' aria-current="true"' : '') + '>Organizations (' + orgs.length + ')</a><a class="btn small' + (tab === 'people' ? '' : ' secondary') + '" href="#/directory?tab=people"' + (tab === 'people' ? ' aria-current="true"' : '') + '>People (' + people.length + ')</a></p>';
    if (tab === 'orgs') {
      var list = orgs.filter(hit);
      out += list.length ? '<div class="grid">' + list.map(function (o) {
        return '<article class="card"><h2 style="margin-top:0">' + h(o.name) + demoBadge(o) + '</h2>' + (o.verification === 'verified' ? '' : '<p><span class="badge warn">Self-reported</span></p>') + '<p class="meta">' + h([o.locality, o.service_area && o.service_area !== o.locality ? 'Serves ' + o.service_area : ''].filter(Boolean).join(' · ')) + '</p><p>' + h(o.description) + '</p>' +
          (o.mission ? '<p class="small"><strong>Mission:</strong> ' + h(o.mission) + '</p>' : '') + (o.interests ? '<p class="small"><strong>Interests:</strong> ' + h(o.interests) + '</p>' : '') + (o.offers ? '<p class="small"><strong>Offers:</strong> ' + h(o.offers) + '</p>' : '') + (o.needs ? '<p class="small"><strong>Needs:</strong> ' + h(o.needs) + '</p>' : '') +
          '<p class="row">' + (o.website ? link(o.website, 'Website of ' + h(o.name)) : '') + (o.public_email ? ' <a href="mailto:' + h(o.public_email) + '">Email ' + h(o.name) + '</a>' : '') + '</p></article>';
      }).join('') + '</div>' : '<p class="card muted">' + (orgs.length ? 'No organizations match these filters.' : 'No organization listings have been approved yet. Listings appear after a steward reviews them.') + '</p>';
    } else {
      var pl = people.filter(hit);
      out += pl.length ? '<ul class="plain">' + pl.map(function (p) {
        return '<li><strong>' + h(p.display_name) + '</strong>' + demoBadge(p) + (p.locality ? ' · ' + h(p.locality) : '') + (p.affiliations.length ? '<br><span class="small">' + p.affiliations.map(function (a) { return h(a.organization) + (a.role_title ? ' (' + h(a.role_title) + ')' : '') + (a.verification === 'verified' ? '' : ' — self-reported'); }).join('; ') + '</span>' : '<br><span class="small muted">Participating as an individual</span>') + (p.interests ? '<br><span class="small">Interests: ' + h(p.interests) + '</span>' : '') + (p.public_contact ? '<br><span class="small">Contact: ' + h(p.public_contact) + '</span>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="card muted">' + (people.length ? 'No people match these filters.' : 'No one is listed yet. People appear only if they ask to be listed and a steward approves it.') + '</p>';
    }
    return out;
  };

  views.calendar = function (r) {
    setTitle('Community calendar');
    var county = r.q.county || '';
    var q = (r.q.q || '').toLowerCase();
    var free = r.q.free === '1';
    var showCanopy = r.q.canopy !== '0';
    var view = r.q.view === 'month' ? 'month' : 'list';
    var now = nowMs();
    var events = (snap.events || []).filter(function (e) {
      if (county === 'Online' ? !e.is_online : county && e.county !== county) return false;
      if (free && !/free/i.test(e.cost || '')) return false;
      if (q && JSON.stringify(e).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var upcoming = events.filter(function (e) { return new Date(e.end_iso).getTime() >= now; });
    var past = events.filter(function (e) { return new Date(e.end_iso).getTime() < now; }).reverse().slice(0, 12);
    var ics = D.icsUrl('events');
    var counties = {};
    (snap.events || []).forEach(function (e) { if (e.county) counties[e.county] = 1; });
    var out = '<h1>Community calendar</h1><p>Sustainability, climate adaptation and community-resilience events in and around DeKalb County. Always check the organizer’s own page before you go.</p>' +
      '<p class="row"><a class="btn" href="#/forms/event">Submit an event</a>' + (ics ? '<a class="btn secondary" href="' + h(ics) + '">Subscribe (iCal feed)</a>' : '') + '</p>' +
      '<form class="filters" data-search="calendar"><label>Search<input type="search" name="q" value="' + h(r.q.q || '') + '"></label><label>County<select name="county"><option value="">All</option>' +
      C.COUNTIES.filter(function (c) { return counties[c] || c === 'Online'; }).map(function (c) { return '<option' + (c === county ? ' selected' : '') + '>' + h(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="check" style="flex-direction:row"><input type="checkbox" name="free" value="1"' + (free ? ' checked' : '') + '> Free only</label>' +
      '<label class="check" style="flex-direction:row"><input type="checkbox" name="canopy" value="1"' + (showCanopy ? ' checked' : '') + '> Show Canopy calls</label>' +
      '<label>View<select name="view"><option value="list">List</option><option value="month"' + (view === 'month' ? ' selected' : '') + '>Month</option></select></label><button class="secondary small" type="submit">Apply</button></form>';
    var meetings = showCanopy ? upcomingMeetings().filter(function (m) { return !m.cancelled; }) : [];
    if (view === 'month') return out + monthView(upcoming, meetings, r.q.m);
    if (meetings.length) {
      var m = meetings[0];
      out += '<h2>Canopy coordination call</h2><div class="card"><strong>' + when(m.date, m.start_time, m.end_time) + '</strong> · Google Meet' + demoBadge(m) + '<div class="row" style="margin-top:8px">' + joinButton(m) + '</div><p class="small muted">Canopy calls repeat on second Saturdays. <a href="#/meetings">All dates</a></p></div>';
    }
    out += '<h2>Upcoming events</h2>';
    out += upcoming.length ? upcoming.map(eventCard).join('') : '<p class="card muted">' + ((snap.events || []).length ? 'No upcoming events match these filters.' : 'No events have been approved yet. Submitted events appear after a steward reviews them.') + '</p>';
    if (past.length) out += '<details><summary>Recent past events (' + past.length + ')</summary>' + past.map(eventCard).join('') + '</details>';
    return out;
  };

  function eventCard(e) {
    var loc = e.is_online && !e.venue ? 'Online' : [e.venue, e.city, e.county && e.county !== 'Online' ? e.county + ' County' : ''].filter(Boolean).join(', ') + (e.is_online ? ' · also online' : '');
    return '<article class="card"><h3>' + h(e.title) + demoBadge(e) + '</h3><p class="meta">' + when(e.date, e.start_time, e.end_time) + '</p><p class="meta">' + h(loc) + ' · Organizer: ' + h(e.organizer) + '</p>' +
      (e.relevance ? '<p>' + h(e.relevance) + '</p>' : '') + '<p class="small"><strong>Cost:</strong> ' + h(e.cost || 'Not stated') + (e.accessibility ? ' · <strong>Access:</strong> ' + h(e.accessibility) : ' · <strong>Access:</strong> not stated — ask the organizer') + '</p>' +
      '<p class="row">' + (e.source_url ? link(e.source_url, 'Organizer’s page for ' + h(e.title), 'btn secondary small') : '') + (e.registration_url ? link(e.registration_url, 'Register', 'btn secondary small') : '') + (e.online_url ? link(e.online_url, 'Online access link', 'btn secondary small') : '') + '</p>' +
      '<p class="row">' + calendarButtons(e, 'event') + '</p><p class="small"><a href="#/forms/correction?ref=' + encodeURIComponent('Events:' + e.id) + '">Report a problem with this listing</a></p></article>';
  }

  function monthView(events, meetings, monthParam) {
    var today = T.todayChicago(new Date());
    var y = +(monthParam || today).slice(0, 4), mo = +(monthParam || today).slice(5, 7);
    var first = T.weekday(y, mo, 1);
    var days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var prev = mo === 1 ? (y - 1) + '-12' : y + '-' + T.pad(mo - 1);
    var next = mo === 12 ? (y + 1) + '-01' : y + '-' + T.pad(mo + 1);
    var byDate = {};
    events.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push({ t: e.title, demo: e.demo }); });
    meetings.forEach(function (m) { (byDate[m.date] = byDate[m.date] || []).push({ t: 'Canopy call ' + T.formatTime(m.start_time), canopy: true }); });
    var label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var out = '<div class="row" style="justify-content:space-between"><a class="btn secondary small" href="#/calendar?view=month&m=' + prev + '">← Previous month</a><h2 style="margin:0" id="month-h">' + h(label) + '</h2><a class="btn secondary small" href="#/calendar?view=month&m=' + next + '">Next month →</a></div>';
    out += '<table class="month" aria-labelledby="month-h"><thead><tr>' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) { return '<th scope="col">' + d + '</th>'; }).join('') + '</tr></thead><tbody><tr>';
    for (var i = 0; i < first; i++) out += '<td class="other"></td>';
    for (var d = 1; d <= days; d++) {
      var key = y + '-' + T.pad(mo) + '-' + T.pad(d);
      var items = byDate[key] || [];
      out += '<td><span' + (key === today ? ' aria-current="date"><strong>' + d + '</strong>' : '>' + d) + '</span>' + items.map(function (it) { return '<span class="ev">' + (it.canopy ? '◆ ' : '• ') + h(it.t) + (it.demo ? ' (DEMO)' : '') + '</span>'; }).join('') + '</td>';
      if ((first + d) % 7 === 0 && d < days) out += '</tr><tr>';
    }
    var tail = (7 - ((first + days) % 7)) % 7;
    for (var j = 0; j < tail; j++) out += '<td class="other"></td>';
    out += '</tr></tbody></table><p class="small muted">◆ Canopy call · • community event. The list view has full details.</p>';
    return out;
  }

  views['get-involved'] = function () {
    setTitle('Get involved');
    var groups = snap.groups || [];
    var active = groups.filter(function (g) { return g.group_status === 'active'; });
    var out = '<h1>Get involved</h1><p>You don’t need to lead or belong to an organization. Pick a working group, or tell us what you care about and someone will help you find a place.</p>' +
      '<div class="card hero"><h2 style="margin-top:0">Not sure where to start?</h2><p>Tell us a little about what you’d like to do. A coalition steward who welcomes newcomers will follow up.</p><a class="btn" href="#/forms/interest?group=help">Help me find a place</a></div>';
    out += '<h2>Working groups</h2>';
    out += active.length ? '<div class="grid">' + active.map(groupCard).join('') + '</div>' : '<p class="card muted">No working groups are active yet. The rooms below are available for groups the coalition agrees to start.</p>';
    out += '<h2>Other ways to take part</h2><ul><li><a href="#/">Join the monthly call</a> — open to organizers, representatives and neighbors willing to take part in a coordination format.</li><li><a href="#/forms/update">Send a written update</a> if you can’t attend.</li><li><a href="#/forms/event">Add an event</a> to the community calendar.</li><li><a href="#/forms/listing">List your organization or yourself</a> in the directory.</li><li><a href="#/collaborate">See open offers and needs</a>.</li></ul>' +
      '<p><a href="#/rooms">See all ten working-group rooms</a></p>';
    return out;
  };

  function groupCard(g) {
    var cta = g.accepting
      ? '<a class="btn" href="#/forms/interest?group=' + h(g.id) + '">' + (g.enrollment_mode === 'open' ? 'Join ' : 'I’m interested in ') + h(g.label) + '</a><p class="small muted">' + (g.enrollment_mode === 'open' ? 'Open group: you’ll be added right away and sent welcome information.' : 'The group contact confirms new members, so this sends your interest first.') + '</p>'
      : '<span class="unavailable">Not taking new requests right now</span><p class="small"><a href="#/forms/interest?group=help">Ask to be connected anyway</a></p>';
    return '<article class="card"><h3>' + h(g.label) + demoBadge(g) + '</h3><p class="meta">Room ' + h(g.slot) + ' · ' + (g.group_status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge warn">' + h(g.group_status === 'paused' ? 'Paused' : 'Reserve — no standing group') + '</span>') + '</p><p>' + h(g.purpose) + '</p>' +
      (g.current_needs ? '<p class="small"><strong>Current needs:</strong> ' + h(g.current_needs) + '</p>' : '') + (g.time_expectation ? '<p class="small"><strong>Time:</strong> ' + h(g.time_expectation) + '</p>' : '') +
      '<p class="small"><strong>Convenor:</strong> ' + h(g.convenor_display) + (g.public_contact ? ' · <strong>Contact:</strong> ' + h(g.public_contact) : '') + '</p>' + (g.next_gathering ? '<p class="small"><strong>Next gathering:</strong> ' + h(g.next_gathering) + '</p>' : '') + cta + '</article>';
  }

  views.rooms = function (r) {
    if (r.path[1]) return views.room(r.path[1]);
    setTitle('Working-group rooms');
    var groups = snap.groups || [];
    var out = '<h1>Working-group rooms</h1><p>Ten reusable online rooms for working groups to meet between monthly calls, without waiting for anyone to open them. A room is infrastructure: it does not mean a committee exists, and an available link does not mean someone is in the room. Agree a time with others first.</p>';
    out += groups.length ? '<div class="grid">' + groups.map(roomCard).join('') + '</div>' : '<p class="card muted">Room details have not been published yet.</p>';
    return out;
  };

  function roomCard(g) {
    var stable = 'r/' + g.slot + '/';
    return '<article class="card"><h2 style="margin-top:0;font-size:1.1rem">Room ' + h(g.slot) + ': ' + h(g.label) + demoBadge(g) + '</h2>' + (g.label_note ? '<p class="small muted">' + h(g.label_note) + '</p>' : '') +
      '<p class="meta">' + (g.group_status === 'active' ? '<span class="badge ok">Active group</span>' : '<span class="badge warn">' + (g.group_status === 'paused' ? 'Paused' : 'Reserve') + '</span>') + ' · Convenor: ' + h(g.convenor_display) + '</p><p>' + h(g.purpose) + '</p>' +
      (g.next_gathering ? '<p class="small"><strong>Next agreed gathering:</strong> ' + h(g.next_gathering) + '</p>' : '<p class="small muted">No gathering scheduled.</p>') +
      '<p class="row">' + (g.meet_url ? '<a class="btn small" href="' + h(stable) + '">Join room ' + h(g.slot) + '</a>' : '<span class="unavailable">No room link yet</span>') + (g.notes_url ? link(g.notes_url, 'Shared notes', 'btn secondary small') : '') + '<a class="btn secondary small" href="#/forms/update?group=' + h(g.id) + '">Submit an update</a></p>' +
      (g.room_convention ? '<p class="small muted">' + h(g.room_convention) + '</p>' : '') + '<p class="small">Stable address: <code>' + h(stable) + '</code></p></article>';
  }

  views.room = function (slot) {
    var g = (snap.groups || []).filter(function (x) { return String(x.slot) === String(slot); })[0];
    if (!g) return views.notFound();
    setTitle('Room ' + g.slot);
    return '<p><a href="#/rooms">← All rooms</a></p>' + roomCard(g).replace('<article class="card">', '<article class="card hero">') + (g.accepting ? '<p><a class="btn" href="#/forms/interest?group=' + h(g.id) + '">Get involved in ' + h(g.label) + '</a></p>' : '');
  };

  views.collaborate = function (r) {
    setTitle('Collaborations & requests');
    var kind = r.q.kind || '';
    var list = (snap.requests || []).filter(function (x) { return !kind || x.kind === kind; });
    var label = { offer: 'Offer', need: 'Need', collaboration: 'Collaboration' };
    var out = '<h1>Collaborations &amp; requests</h1><p>Offers, needs and opt-in collaborations. Listing an idea here does not make it an active project — each shows its owner, status and next step.</p>' +
      '<p class="row"><a class="btn" href="#/forms/update">Share an offer or need</a></p><p class="row" role="group" aria-label="Filter by type">' +
      ['', 'offer', 'need', 'collaboration'].map(function (k) { return '<a class="btn small' + (k === kind ? '' : ' secondary') + '" href="#/collaborate' + (k ? '?kind=' + k : '') + '"' + (k === kind ? ' aria-current="true"' : '') + '>' + (k ? label[k] + 's' : 'All') + '</a>'; }).join('') + '</p>';
    out += list.length ? list.map(function (x) {
      var g = x.group_id && groupById(x.group_id);
      return '<article class="card"><h2 style="margin-top:0;font-size:1.15rem"><span class="badge">' + h(label[x.kind] || x.kind) + '</span> ' + h(x.title) + demoBadge(x) + '</h2><p>' + h(x.description) + '</p><p class="meta">Owner: ' + h(x.owner_display) + ' · Status: ' + h(x.progress || 'open') + (g ? ' · Group: <a href="#/rooms/' + h(g.slot) + '">' + h(g.label) + '</a>' : '') + '</p>' + (x.next_step ? '<p class="small"><strong>Next step:</strong> ' + h(x.next_step) + '</p>' : '') + (x.contact_public ? '<p class="small">Contact: ' + h(x.contact_public) + '</p>' : '') + '</article>';
    }).join('') : '<p class="card muted">Nothing is listed yet.</p>';
    return out;
  };

  views.about = function () {
    setTitle('About');
    return '<h1>About Canopy</h1><p>Canopy helps people working toward a more sustainable DeKalb County, Illinois know what others are doing, share resources, spot gaps and overlaps, and collaborate where useful. Sustainability, climate adaptation and community resilience are the organizing lens; organizations outside the environmental sector are welcome where their work connects.</p>' +
      '<h2>How this site works</h2><ul><li>Everything you submit is reviewed by a coalition steward before it is published.</li><li>Your private email is never published. Contact details appear only when you ask for them to be shown.</li><li>Joining a working group does not subscribe you to anyone else’s mailing list.</li><li>Recaps are reviewed summaries; raw transcripts are not published.</li></ul>' +
      '<p>' + h(snap.settings.PLATFORM_NOTE) + '</p><p><a href="#/forms/correction">Ask for a correction or removal</a></p>';
  };

  views.notFound = function () {
    setTitle('Not found');
    return '<h1>Page not found</h1><p>That page or record isn’t available. It may not be published yet, or it may have been removed.</p><p><a href="#/">Go to the next call</a></p>';
  };

  /* ---------------- forms ---------------- */
  var FORMS = {};
  function interestFields(q) {
    var groups = (snap.groups || []).filter(function (g) { return g.accepting; });
    var opts = [['help', 'Help me find a place']].concat(groups.map(function (g) { return [g.id, g.label + (g.enrollment_mode === 'open' ? ' (open group — join now)' : ' (contact confirms)')]; }));
    if (q.group && q.group !== 'help' && !groups.some(function (g) { return g.id === q.group; })) {
      var g0 = groupById(q.group);
      if (g0) opts.push([g0.id, g0.label + ' (not taking new people now — your interest will be recorded)']);
    }
    return [
      { name: 'group_id', label: 'What would you like to do?', type: 'select', options: opts, required: true, value: q.group || 'help' },
      { name: 'name', label: 'Your name', type: 'text', required: true, autocomplete: 'name', hint: 'What should we call you?' },
      { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', hint: 'Private. Used only to follow up on this request.' },
      { name: 'participation', label: 'How are you taking part?', type: 'radio', options: [['independent', 'Independent community member'], ['canopy', 'Participating through Canopy'], ['organization', 'Through one or more organizations']], value: 'independent' },
      { name: 'affiliations', label: 'Organization(s)', type: 'text', hint: 'Only if you chose organizations. Separate several with semicolons. This is self-reported and doesn’t mean you speak for them.', showIf: 'participation=organization' },
      { name: 'note', label: 'Anything you’d like the contact to know? (optional)', type: 'textarea', hint: 'Skills, availability, questions, access needs.' },
      { name: 'consent_share_with_contact', label: C.CONSENT_TEXT.share_with_contact, type: 'checkbox', required: true },
      { name: 'consent_updates', label: C.CONSENT_TEXT.updates + ' (optional)', type: 'checkbox' }
    ];
  }
  FORMS.interest = { title: 'Get involved', type: 'interest', intro: 'No account or organization needed. You’ll get an email confirming exactly what happened.', fields: interestFields, submitLabel: 'Send my request' };
  FORMS.event = {
    title: 'Submit a community event', type: 'event', intro: 'Events are reviewed before they appear. Times are Central Time (DeKalb County).', submitLabel: 'Submit event for review',
    fields: function () {
      return [
        { name: 'title', label: 'Event title', type: 'text', required: true },
        { name: 'organizer', label: 'Organizer', type: 'text', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'start_time', label: 'Start time (Central Time)', type: 'time', required: true },
        { name: 'end_time', label: 'End time (optional)', type: 'time' },
        { name: 'venue', label: 'Venue (or leave blank if online only)', type: 'text' },
        { name: 'city', label: 'City or town', type: 'text' },
        { name: 'county', label: 'County', type: 'select', required: true, options: [['', 'Choose…']].concat(C.COUNTIES.map(function (c) { return [c, c]; })) },
        { name: 'online_url', label: 'Online access link (optional)', type: 'url' },
        { name: 'relevance', label: 'How does it connect to sustainability or resilience?', type: 'textarea', required: true, hint: 'One or two sentences.' },
        { name: 'cost', label: 'Cost', type: 'text', hint: 'e.g. Free, $10, sliding scale' },
        { name: 'registration_url', label: 'Registration link (optional)', type: 'url' },
        { name: 'source_url', label: 'Organizer’s event page (recommended)', type: 'url' },
        { name: 'accessibility', label: 'Accessibility details', type: 'textarea', hint: 'Step-free access, captions, childcare, transit, etc.' },
        { name: 'submitter_name', label: 'Your name', type: 'text', required: true, autocomplete: 'name' },
        { name: 'submitter_email', label: 'Your email', type: 'email', required: true, autocomplete: 'email', hint: 'Private. We’ll send you a link to correct or cancel the event.' }
      ];
    }
  };
  FORMS.listing = {
    title: 'Add your organization or yourself', type: 'organization', intro: 'Listings are reviewed before they appear. Logos and websites are optional — text-only is fine.', submitLabel: 'Submit for review',
    fields: function () {
      return [
        { name: 'name', label: 'Your preferred name', type: 'text', required: true, autocomplete: 'name' },
        { name: 'email', label: 'Private coordination email', type: 'email', required: true, autocomplete: 'email', hint: 'Never published.' },
        { name: 'as_individual', label: 'I’m participating as an individual (no organization)', type: 'checkbox' },
        { name: 'org_name', label: 'Organization name', type: 'text', showIf: 'as_individual=' },
        { name: 'authorized', label: 'Are you authorized to represent this organization?', type: 'radio', options: [['yes', 'Yes'], ['unsure', 'Not sure'], ['no', 'No — I’m suggesting it']], value: 'unsure', showIf: 'as_individual=' },
        { name: 'role_title', label: 'Your role (optional)', type: 'text', showIf: 'as_individual=' },
        { name: 'locality', label: 'Locality or service area', type: 'text', required: true, hint: 'e.g. Sycamore, DeKalb County, NIU campus' },
        { name: 'description', label: 'Brief description of your work', type: 'textarea', required: true },
        { name: 'mission', label: 'Mission (optional)', type: 'textarea' },
        { name: 'website', label: 'Website (optional)', type: 'url' },
        { name: 'public_email', label: 'Public contact email (optional)', type: 'email', hint: 'Only published if you tick the box below.' },
        { name: 'interests', label: 'Interests (optional)', type: 'text', hint: 'Separate with semicolons.' },
        { name: 'offers', label: 'What you can offer (optional)', type: 'textarea' },
        { name: 'needs', label: 'What you need (optional)', type: 'textarea' },
        { name: 'accessibility', label: 'Accessibility support you’d like from us (optional, private)', type: 'textarea' },
        { name: 'logo_url', label: 'Logo link (optional)', type: 'url' },
        { name: 'consent_directory', label: C.CONSENT_TEXT.directory, type: 'checkbox' },
        { name: 'consent_contact_publish', label: C.CONSENT_TEXT.contact_publish, type: 'checkbox' },
        { name: 'consent_updates', label: C.CONSENT_TEXT.updates, type: 'checkbox' }
      ];
    }
  };
  FORMS.update = {
    title: 'Send a monthly update', type: 'update', intro: 'For the next call — whether or not you can attend.', submitLabel: 'Send update',
    fields: function (q) {
      var g = q.group && groupById(q.group);
      return [
        { name: 'name', label: 'Your name', type: 'text', required: true, autocomplete: 'name' },
        { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', hint: 'Private.' },
        { name: 'org_name', label: 'Organization or group (optional)', type: 'text', value: g ? g.label : '' },
        { name: 'update_text', label: 'One update', type: 'textarea', required: true },
        { name: 'upcoming_date', label: 'One upcoming date (optional)', type: 'text' },
        { name: 'ask_offer', label: 'One ask or offer (optional)', type: 'textarea' },
        { name: 'link', label: 'Related link (optional)', type: 'url' },
        { name: 'consent_publish', label: 'You may publish this update in the public recap.', type: 'checkbox' }
      ];
    }
  };
  FORMS.correction = {
    title: 'Corrections, removals and help', type: 'correction', submitLabel: 'Send', intro: 'Ask for a correction, ask to be removed, or ask for help submitting something. A steward reviews every request.',
    fields: function (q) {
      return [
        { name: 'description', label: q.help ? 'What do you need help with?' : 'What should be corrected or removed?', type: 'textarea', required: true, hint: q.help ? 'Tell us what you want to submit or what access support you need; a steward can enter it for you.' : '' },
        { name: 'record_ref', label: 'Which listing? (optional)', type: 'text', value: q.ref || (q.help ? 'assistance' : '') },
        { name: 'name', label: 'Your name (optional)', type: 'text', autocomplete: 'name' },
        { name: 'email', label: 'Email for a reply (optional, private)', type: 'email', autocomplete: 'email' }
      ];
    }
  };

  function fieldHtml(f, idp) {
    var id = idp + f.name;
    var hint = f.hint ? '<span class="hint" id="' + id + '-hint">' + h(f.hint) + '</span>' : '';
    var req = f.required ? ' <span class="req" aria-hidden="true">*</span><span class="hp"> (required)</span>' : '';
    var desc = ' aria-describedby="' + (f.hint ? id + '-hint ' : '') + id + '-err"';
    var err = '<span class="error-text" id="' + id + '-err" hidden></span>';
    var wrapAttr = ' class="field" data-field="' + f.name + '"' + (f.showIf ? ' data-show-if="' + f.showIf + '"' : '');
    if (f.type === 'checkbox') {
      return '<div' + wrapAttr + '><div class="check"><input type="checkbox" id="' + id + '" name="' + f.name + '" value="yes"' + (f.required ? ' required' : '') + desc + '><label for="' + id + '">' + h(f.label) + req + '</label></div>' + hint + err + '</div>';
    }
    if (f.type === 'radio') {
      return '<fieldset' + wrapAttr + '><legend>' + h(f.label) + req + '</legend>' + hint + f.options.map(function (o, i) {
        return '<div class="check"><input type="radio" id="' + id + i + '" name="' + f.name + '" value="' + h(o[0]) + '"' + (o[0] === f.value ? ' checked' : '') + '><label for="' + id + i + '">' + h(o[1]) + '</label></div>';
      }).join('') + err + '</fieldset>';
    }
    var control;
    if (f.type === 'select') {
      control = '<select id="' + id + '" name="' + f.name + '"' + (f.required ? ' required' : '') + desc + '>' + f.options.map(function (o) { return '<option value="' + h(o[0]) + '"' + (o[0] === f.value ? ' selected' : '') + '>' + h(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + f.name + '"' + (f.required ? ' required' : '') + desc + '>' + h(f.value || '') + '</textarea>';
    } else {
      control = '<input type="' + f.type + '" id="' + id + '" name="' + f.name + '" value="' + h(f.value || '') + '"' + (f.required ? ' required' : '') + (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') + (f.type === 'url' ? ' placeholder="https://"' : '') + desc + '>';
    }
    return '<div' + wrapAttr + '><label for="' + id + '">' + h(f.label) + req + '</label>' + hint + control + err + '</div>';
  }

  views.forms = function (r) {
    var key = r.path[1];
    var spec = FORMS[key];
    if (!spec) return views.notFound();
    setTitle(spec.title);
    var fields = spec.fields(r.q);
    var g = key === 'interest' && r.q.group && r.q.group !== 'help' ? groupById(r.q.group) : null;
    var paused = snap.settings.SUBMISSIONS_ENABLED && !C.util.yes(snap.settings.SUBMISSIONS_ENABLED);
    var extra = '';
    if (key === 'listing' && snap.settings.ORG_FORM_URL) extra = '<p class="small">Prefer the original Google Form? ' + link(snap.settings.ORG_FORM_URL, 'Open the Google Form') + '</p>';
    var out = '<h1>' + h(spec.title) + (g ? ': ' + h(g.label) : '') + '</h1><p>' + h(spec.intro) + '</p>' + extra +
      (D.mode === 'demo' ? '<p class="alert warn">Demo: this form runs against sample data in your browser. Nothing is emailed.</p>' : '') +
      (paused ? '<p class="alert warn">Online submissions are paused right now. Please try again later.</p>' : '') +
      '<div id="form-result" tabindex="-1"></div><form class="canopy" novalidate data-form="' + key + '" data-type="' + spec.type + '" data-client-id="' + D.newClientId() + '">' +
      '<div id="error-summary" class="alert bad" role="alert" tabindex="-1" hidden></div>' +
      '<p class="small muted">Fields marked <span class="req">*</span> are required.</p>' +
      fields.map(function (f) { return fieldHtml(f, 'f-'); }).join('') +
      '<div class="hp" aria-hidden="true"><label for="f-website_hp">Leave this empty</label><input id="f-website_hp" name="website_hp" tabindex="-1" autocomplete="off"></div>' +
      '<p><button type="submit"' + (paused ? ' disabled' : '') + '>' + h(spec.submitLabel) + '</button></p></form>';
    return out;
  };

  function applyShowIf(form) {
    form.querySelectorAll('[data-show-if]').forEach(function (el) {
      var rule = el.getAttribute('data-show-if').split('=');
      var ctl = form.querySelector('[name="' + rule[0] + '"]:checked') || form.querySelector('[name="' + rule[0] + '"]');
      var val = !ctl ? '' : ctl.type === 'checkbox' ? (ctl.checked ? 'yes' : '') : ctl.type === 'radio' ? ((form.querySelector('[name="' + rule[0] + '"]:checked') || {}).value || '') : ctl.value;
      el.hidden = val !== rule[1];
    });
  }

  function collect(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || (el.closest('[hidden]') && el.name !== 'website_hp')) return;
      if (el.type === 'checkbox') data[el.name] = el.checked ? 'yes' : '';
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value.trim();
    });
    return data;
  }

  function showErrors(form, errors) {
    form.querySelectorAll('.error-text').forEach(function (e) { e.hidden = true; e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    var sum = form.querySelector('#error-summary');
    var keys = Object.keys(errors || {});
    if (!keys.length) { sum.hidden = true; return; }
    sum.innerHTML = '<strong>Please fix ' + keys.length + ' thing' + (keys.length > 1 ? 's' : '') + ':</strong><ul>' + keys.map(function (k) {
      var ctl = form.querySelector('[name="' + k + '"]');
      var id = ctl ? ctl.id : '';
      var errEl = form.querySelector('#f-' + k + '-err');
      if (errEl) { errEl.textContent = errors[k]; errEl.hidden = false; }
      if (ctl) ctl.setAttribute('aria-invalid', 'true');
      return '<li>' + (id ? '<a href="#' + id + '" data-focus="' + id + '">' + h(errors[k]) + '</a>' : h(errors[k])) + '</li>';
    }).join('') + '</ul>';
    sum.hidden = false;
    sum.focus();
  }

  function clientValidate(form, fields, data) {
    var errors = {};
    fields.forEach(function (f) {
      var wrap = form.querySelector('[data-field="' + f.name + '"]');
      if (wrap && wrap.hidden) return;
      var v = data[f.name];
      if (f.required && !v) errors[f.name] = f.type === 'checkbox' ? 'Please tick: “' + f.label.replace(/\.$/, '') + '”.' : f.label.replace(/\s*\(.*\)$/, '') + ' is required.';
      else if (v && f.type === 'email' && !C.util.isEmail(v)) errors[f.name] = 'Enter an email like name@example.com.';
      else if (v && f.type === 'url' && !C.util.isHttpUrl(v)) errors[f.name] = 'Links must start with https://';
    });
    return errors;
  }

  function onSubmit(ev) {
    var form = ev.target;
    if (!form.matches('form.canopy')) return;
    ev.preventDefault();
    var key = form.getAttribute('data-form');
    var r = parseHash();
    var fields = FORMS[key].fields(r.q);
    var data = collect(form);
    var errors = clientValidate(form, fields, data);
    if (Object.keys(errors).length) return showErrors(form, errors);
    showErrors(form, {});
    data.action = 'submit';
    data.type = form.getAttribute('data-type');
    data.client_id = form.getAttribute('data-client-id');
    if (data.type === 'interest') data.affiliations = data.participation === 'organization' ? C.util.list(data.affiliations).map(function (n) { return { name: n }; }) : [];
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    D.post(data)
      .then(function (res) {
        if (!res.ok && res.code === 'validation') {
          btn.disabled = false;
          btn.textContent = FORMS[key].submitLabel;
          return showErrors(form, res.errors);
        }
        var box = document.getElementById('form-result');
        box.innerHTML = '<div class="alert ' + (res.ok ? 'ok' : 'bad') + '" role="' + (res.ok ? 'status' : 'alert') + '"><p><strong>' + (res.ok ? (res.status === 'duplicate' ? 'Already received' : 'Received') : 'Not sent') + '</strong></p><p>' + h(res.message) + '</p>' + (res.reference ? '<p class="small">Reference: ' + h(res.reference) + '</p>' : '') + '</div>' + (res.ok ? '<p><a href="#/">Back to the next call</a></p>' : '');
        if (res.ok) {
          form.remove();
          D.getPublic(true).then(function (s) { snap = s; });
        } else {
          btn.disabled = false;
          btn.textContent = FORMS[key].submitLabel;
        }
        box.focus();
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Try again';
        var box = document.getElementById('form-result');
        box.innerHTML = '<div class="alert bad" role="alert"><p><strong>We couldn’t reach the Canopy service.</strong> Your entries are still here — press “Try again”. Trying again will not create a duplicate.</p></div>';
        box.focus();
      });
  }

  /* ---------------- private links ---------------- */
  function tokenView(kind, r) {
    var t = r.q.t || '';
    setTitle(kind === 'withdraw' ? 'Withdraw request' : kind === 'respond' ? 'Respond to request' : 'Manage your event');
    var holder = '<h1>' + (kind === 'withdraw' ? 'Withdraw your request' : kind === 'respond' ? 'Respond to a request' : 'Manage your event') + '</h1><div id="token-area"><p>Checking your link…</p></div>';
    setTimeout(function () {
      var area = document.getElementById('token-area');
      D.get({ action: 'token', kind: kind, t: t }).then(function (info) {
        if (!info.ok) { area.innerHTML = '<p class="alert bad">' + h(info.message) + '</p>'; return; }
        if (kind === 'withdraw') {
          area.innerHTML = '<p>Request: <strong>' + h(info.label) + '</strong> · current status: ' + h(info.state) + '</p>' + (['withdrawn', 'declined'].indexOf(info.state) >= 0 ? '<p>This request is already closed.</p>' : '<button type="button" class="danger" data-token-action="withdraw">Withdraw this request</button>') + '<div id="token-result" tabindex="-1"></div>';
        } else if (kind === 'respond') {
          area.innerHTML = '<p>Request for <strong>' + h(info.label) + '</strong> from ' + h(info.requester_first_name || 'a participant') + ' · current status: ' + h(info.state) + '</p>' + (info.note ? '<p class="card">' + h(info.note) + '</p>' : '') +
            '<div class="field"><label for="resp-msg">Optional message to them</label><textarea id="resp-msg"></textarea></div><p class="row"><button type="button" data-token-action="welcome">Welcome them as a member</button><button type="button" class="secondary" data-token-action="acknowledge">I’ve seen it — I’ll follow up</button><button type="button" class="danger" data-token-action="decline">Decline politely</button></p><div id="token-result" tabindex="-1"></div>';
        } else {
          var e = info.event;
          area.innerHTML = '<p><strong>' + h(e.title) + '</strong> — ' + when(e.date, e.start_time, e.end_time) + ' · status: ' + h(info.status) + '</p>' +
            (info.status === 'cancelled' ? '<p>This event is cancelled.</p>' : '<h2>Cancel the event</h2><div class="field"><label for="cancel-reason">Reason (optional, shown to stewards)</label><input type="text" id="cancel-reason"></div><button type="button" class="danger" data-token-action="cancel">Cancel this event</button>' +
            '<h2>Propose a correction</h2><form id="correct-form" onsubmit="return false">' + ['title', 'date', 'start_time', 'end_time', 'venue', 'city', 'source_url', 'cost', 'accessibility'].map(function (f) {
              return '<div class="field"><label for="c-' + f + '">' + h(f.replace(/_/g, ' ')) + '</label><input type="' + (f === 'date' ? 'date' : /time/.test(f) ? 'time' : 'text') + '" id="c-' + f + '" name="' + f + '" value="' + h(e[f]) + '"></div>';
            }).join('') + '<button type="button" data-token-action="correct">Send correction for review</button></form>') + '<div id="token-result" tabindex="-1"></div>';
        }
      }).catch(function () { area.innerHTML = '<p class="alert bad">We couldn’t reach the Canopy service. Please try again.</p>'; });
    }, 0);
    return holder;
  }
  views.withdraw = function (r) { return tokenView('withdraw', r); };
  views.respond = function (r) { return tokenView('respond', r); };
  views.manage = function (r) { return tokenView('manage', r); };

  function onTokenAction(btn) {
    var r = parseHash();
    var kind = r.path[0];
    var act = btn.getAttribute('data-token-action');
    var payload = { action: 'token', kind: kind, token: r.q.t };
    if (kind === 'respond') { payload.decision = act; payload.message = (document.getElementById('resp-msg') || {}).value || ''; }
    if (kind === 'manage') {
      payload.op = act;
      payload.reason = (document.getElementById('cancel-reason') || {}).value || '';
      if (act === 'correct') {
        payload.changes = {};
        document.querySelectorAll('#correct-form input').forEach(function (i) { payload.changes[i.name] = i.value; });
      }
    }
    btn.disabled = true;
    D.post(payload).then(function (res) {
      var box = document.getElementById('token-result');
      box.innerHTML = '<p class="alert ' + (res.ok ? 'ok' : 'bad') + '" role="status">' + h(res.message) + '</p>';
      box.focus();
      D.getPublic(true).then(function (s) { snap = s; });
    }).catch(function () { btn.disabled = false; });
  }

  /* ---------------- demo steward panel (demo/local only) ---------------- */
  views.steward = function () {
    if (D.mode === 'live') return views.notFound();
    setTitle('Steward view (demo)');
    setTimeout(function () {
      D.steward('list').then(function (res) {
        var t = res.tables;
        var rows = [];
        ['Events', 'Organizations', 'People', 'Updates', 'Meetings', 'Recaps', 'Requests', 'Groups', 'Affiliations', 'ActionItems'].forEach(function (table) {
          t[table].forEach(function (rec) {
            if (rec.status !== 'approved' || table === 'Events') rows.push({ table: table, rec: rec });
          });
        });
        var area = document.getElementById('steward-area');
        area.innerHTML = '<h2>Records (not yet published, plus all events)</h2><div style="overflow-x:auto"><table><thead><tr><th>Table</th><th>Record</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function (x) {
          var label = x.rec.title || x.rec.name || x.rec.display_name || x.rec.label || x.rec.description || x.rec.date || x.rec.id;
          return '<tr><td>' + h(x.table) + '</td><td>' + h(String(label).slice(0, 70)) + '<br><span class="small muted">' + h(x.rec.id) + '</span></td><td>' + h(x.rec.status) + (x.rec.visibility === 'restricted' ? ' (restricted)' : '') + '</td><td class="row">' +
            '<button class="small" data-st="approved" data-t="' + x.table + '" data-id="' + h(x.rec.id) + '">Approve</button><button class="small secondary" data-st="unpublished" data-t="' + x.table + '" data-id="' + h(x.rec.id) + '">Unpublish</button><button class="small danger" data-st="cancelled" data-t="' + x.table + '" data-id="' + h(x.rec.id) + '">Cancel</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
          '<h2>Open corrections</h2>' + (t.Corrections.filter(function (c) { return c.state === 'open'; }).map(function (c) { return '<div class="card"><p>' + h(c.record_ref) + ': ' + h(c.description) + '</p><pre class="text small">' + h(c.proposed_changes) + '</pre>' + (c.proposed_changes ? '<button class="small" data-apply-cor="' + h(c.id) + '">Apply correction</button>' : '') + '</div>'; }).join('') || '<p class="muted">None.</p>') +
          '<h2>Membership requests</h2><div style="overflow-x:auto"><table><thead><tr><th>Request</th><th>Group</th><th>State</th><th>Routing</th></tr></thead><tbody>' + t.Memberships.map(function (m) { return '<tr><td>' + h(m.id) + '</td><td>' + h(m.group_id || '(help me find a place)') + '</td><td>' + h(m.state) + '</td><td>' + h(m.routing) + (m.routed_to ? ' → ' + h(m.routed_to) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<h2>Notification outbox (simulated — nothing sent)</h2>' + t.Notifications.slice().reverse().map(function (n) {
            var body = h(n.body).replace(/(https?:\/\/[^\s<]+|\[SITE_URL not configured\]\/#\/[^\s<]+)/g, function (u) { var hash = u.replace(/^.*?#\//, '#/'); return '<a href="' + hash + '">' + u + '</a>'; });
            return '<details class="card"><summary><strong>' + h(n.subject) + '</strong> → ' + h(n.to) + ' <span class="badge">' + h(n.status) + '</span></summary><pre class="text small">' + body + '</pre></details>';
          }).join('');
      });
    }, 0);
    return '<h1>Steward view <span class="badge demo">DEMO</span></h1><p class="alert warn">This page exists only in the demo and local test server. In the live system, stewards do this in the private Canopy Admin Google Sheet (status column or the Canopy menu). It is a stand-in so the workflow can be reviewed end to end.</p><p class="row"><button class="secondary small" data-reset-demo>Reset demo data</button></p><div id="steward-area"><p>Loading…</p></div>';
  };

  /* ---------------- router ---------------- */
  function render() {
    var r = parseHash();
    var name = r.path[0] || 'home';
    var view = views[name] || views.notFound;
    try {
      main.innerHTML = view(r);
    } catch (e) {
      main.innerHTML = '<h1>Something went wrong</h1><p>Please reload the page.</p>';
      if (window.console) console.error(e);
    }
    var navKey = { meetings: 'meetings', directory: 'directory', calendar: 'calendar', 'get-involved': 'get-involved', rooms: 'get-involved', collaborate: 'collaborate', home: 'home' }[name] || (name === 'forms' && r.path[1] === 'interest' ? 'get-involved' : '');
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === navKey) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var form = main.querySelector('form.canopy');
    if (form) { applyShowIf(form); form.addEventListener('change', function () { applyShowIf(form); }); }
    var nav = document.getElementById('site-nav');
    nav.classList.remove('open');
    document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
    var h1 = main.querySelector('h1');
    if (h1 && render.count++) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
    window.scrollTo(0, 0);
  }
  render.count = 0;

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.matches('form[data-search]')) {
      ev.preventDefault();
      var params = [];
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') params.push(el.name + '=' + (el.checked ? '1' : '0'));
        else if (el.value) params.push(el.name + '=' + encodeURIComponent(el.value));
      });
      location.hash = '#/' + f.getAttribute('data-search') + (params.length ? '?' + params.join('&') : '');
      return;
    }
    onSubmit(ev);
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, a');
    if (!t) return;
    if (t.classList.contains('skip')) { ev.preventDefault(); main.focus(); return; }
    if (t.hasAttribute('data-ics')) downloadIcs(t.getAttribute('data-ics'), t.getAttribute('data-kind'));
    if (t.hasAttribute('data-focus')) { ev.preventDefault(); var el = document.getElementById(t.getAttribute('data-focus')); if (el) el.focus(); }
    if (t.hasAttribute('data-token-action')) onTokenAction(t);
    if (t.hasAttribute('data-st')) {
      D.steward('status', { table: t.getAttribute('data-t'), id: t.getAttribute('data-id'), status: t.getAttribute('data-st'), note: 'demo' }).then(function () { return D.getPublic(true); }).then(function (s) { snap = s; render(); });
    }
    if (t.hasAttribute('data-apply-cor')) {
      D.steward('applyCorrection', { id: t.getAttribute('data-apply-cor') }).then(function () { return D.getPublic(true); }).then(function (s) { snap = s; render(); });
    }
    if (t.hasAttribute('data-reset-demo')) D.steward('reset').then(function () { return D.getPublic(true); }).then(function (s) { snap = s; render(); });
  });
  document.querySelector('.menu-toggle').addEventListener('click', function () {
    var nav = document.getElementById('site-nav');
    var open = nav.classList.toggle('open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', render);

  function chrome() {
    var s = snap.settings || {};
    if (s.SITE_NAME) document.getElementById('site-name').textContent = s.SITE_NAME;
    if (s.SITE_TAGLINE) document.getElementById('site-tagline').textContent = s.SITE_TAGLINE;
    document.getElementById('platform-note').textContent = s.PLATFORM_NOTE || '';
    document.getElementById('footer-contact').innerHTML = C.util.isEmail(s.CORRECTIONS_EMAIL_PUBLIC) ? 'Corrections: <a href="mailto:' + h(s.CORRECTIONS_EMAIL_PUBLIC) + '">' + h(s.CORRECTIONS_EMAIL_PUBLIC) + '</a>' : '';
    var notice = document.getElementById('notice');
    var parts = [];
    if (s.SITE_NOTICE) parts.push(s.SITE_NOTICE);
    if (snap._stale) parts.push('Showing saved information — the live service could not be reached.');
    if (D.mode !== 'demo' && !snap.live_sending) parts.push('Email notifications are not switched on yet.');
    notice.textContent = parts.join(' ');
    notice.hidden = !parts.length;
    document.getElementById('data-stamp').textContent = 'Information updated ' + new Date(snap.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) + ' Central Time.';
    if (D.mode !== 'live') document.getElementById('demo-steward-link').innerHTML = ' · <a href="#/steward">Steward view (demo)</a>';
  }

  D.getPublic()
    .then(function (s) {
      snap = s;
      chrome();
      render();
    })
    .catch(function () {
      main.innerHTML = '<h1>Canopy</h1><p class="alert bad">' + h((window.CANOPY_CONFIG || {}).FALLBACK_MESSAGE) + '</p><p>Monthly calls are on the second Saturday of each month, 10–11 a.m. Central Time.</p>';
    });
})();
