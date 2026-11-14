/*
 * Time handling. Canopy is a DeKalb County, Illinois coalition: every stored time is
 * local wall-clock time in America/Chicago ("10:00" on "2027-03-13") and is converted
 * to an absolute instant only when needed. This keeps 10 a.m. at 10 a.m. across
 * daylight-saving changes.
 *
 * The US rule (since 2007) is implemented directly so results do not depend on the
 * runtime's time-zone database: DST starts the 2nd Sunday of March at 02:00 local and
 * ends the 1st Sunday of November at 02:00 local.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var T = (C.time = {});
  T.TZ = 'America/Chicago';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }
  T.pad = pad;

  /** Day of week (0=Sunday) for a calendar date, timezone-independent. */
  T.weekday = function (y, m, d) {
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };

  /** n-th (1-based) given weekday of a month. */
  T.nthWeekday = function (y, m, weekday, n) {
    var first = T.weekday(y, m, 1);
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  };

  T.isChicagoDst = function (y, m, d, hh) {
    hh = hh || 0;
    if (m < 3 || m > 11) return false;
    if (m > 3 && m < 11) return true;
    if (m === 3) {
      var start = T.nthWeekday(y, 3, 0, 2);
      return d > start || (d === start && hh >= 2);
    }
    var end = T.nthWeekday(y, 11, 0, 1);
    return d < end || (d === end && hh < 2);
  };

  /** UTC offset in minutes (negative west of UTC) for Chicago local wall time. */
  T.chicagoOffset = function (y, m, d, hh) {
    return T.isChicagoDst(y, m, d, hh) ? -300 : -360;
  };

  T.parseDate = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCMonth() !== mo - 1) return null;
    return { y: y, m: mo, d: d };
  };

  T.parseTime = function (s) {
    var str = String(s || '').trim().toLowerCase();
    var m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(str);
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (m[3]) {
      var pm = m[3].charAt(0) === 'p';
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    if (h > 23 || mi > 59) return null;
    return { h: h, mi: mi };
  };

  T.normTime = function (s) {
    var t = T.parseTime(s);
    return t ? pad(t.h) + ':' + pad(t.mi) : '';
  };

  /** "2027-03-13", "10:00" -> "2027-03-13T10:00:00-06:00" */
  T.localToIso = function (date, time) {
    var d = T.parseDate(date);
    var t = T.parseTime(time || '00:00');
    if (!d || !t) return '';
    var off = T.chicagoOffset(d.y, d.m, d.d, t.h);
    var sign = off < 0 ? '-' : '+';
    var a = Math.abs(off);
    return d.y + '-' + pad(d.m) + '-' + pad(d.d) + 'T' + pad(t.h) + ':' + pad(t.mi) + ':00' + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  };

  T.localToDate = function (date, time) {
    var iso = T.localToIso(date, time);
    return iso ? new Date(iso) : null;
  };

  /** Absolute instant -> Chicago wall-clock {date:'YYYY-MM-DD', time:'HH:MM'} */
  T.toChicago = function (instant) {
    var ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
    // Try CST first, then check whether DST applies at that wall time.
    var guess = new Date(ms - 360 * 60000);
    var y = guess.getUTCFullYear(), m = guess.getUTCMonth() + 1, d = guess.getUTCDate(), h = guess.getUTCHours();
    if (T.isChicagoDst(y, m, d, h)) {
      guess = new Date(ms - 300 * 60000);
    }
    return {
      date: guess.getUTCFullYear() + '-' + pad(guess.getUTCMonth() + 1) + '-' + pad(guess.getUTCDate()),
      time: pad(guess.getUTCHours()) + ':' + pad(guess.getUTCMinutes())
    };
  };

  T.todayChicago = function (now) {
    return T.toChicago(now || new Date()).date;
  };

  /** Second Saturdays starting at (year, month), count months. */
  T.secondSaturdays = function (year, month, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var y = year + Math.floor((month - 1 + i) / 12);
      var m = ((month - 1 + i) % 12) + 1;
      out.push(y + '-' + pad(m) + '-' + pad(T.nthWeekday(y, m, 6, 2)));
    }
    return out;
  };

  T.formatLongDate = function (date) {
    var d = T.parseDate(date);
    if (!d) return '';
    return DAYS[T.weekday(d.y, d.m, d.d)] + ', ' + MONTHS[d.m - 1] + ' ' + d.d + ', ' + d.y;
  };

  T.formatShortDate = function (date) {
    var d = T.parseDate(date);
    if (!d) return '';
    return DAYS[T.weekday(d.y, d.m, d.d)].slice(0, 3) + ', ' + MONTHS[d.m - 1].slice(0, 3) + ' ' + d.d;
  };

  T.formatTime = function (time) {
    var t = T.parseTime(time);
    if (!t) return '';
    var h12 = t.h % 12 === 0 ? 12 : t.h % 12;
    return h12 + (t.mi ? ':' + pad(t.mi) : '') + (t.h < 12 ? ' a.m.' : ' p.m.');
  };

  T.zoneLabel = function (date, time) {
    var d = T.parseDate(date);
    var t = T.parseTime(time || '12:00');
    if (!d || !t) return 'Central Time';
    return T.isChicagoDst(d.y, d.m, d.d, t.h) ? 'CDT, Central Time' : 'CST, Central Time';
  };

  /* ---------------- iCalendar ---------------- */
  function icsEscape(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }
  function fold(line) {
    var out = [];
    while (line.length > 74) {
      out.push(line.slice(0, 74));
      line = ' ' + line.slice(74);
    }
    out.push(line);
    return out.join('\r\n');
  }
  function icsLocal(date, time) {
    return date.replace(/-/g, '') + 'T' + (T.normTime(time) || '00:00').replace(':', '') + '00';
  }

  var VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  /**
   * items: [{uid, date, start, end, title, description, location, url, cancelled}]
   */
  T.buildIcs = function (items, calName, stampIso) {
    var stamp = (stampIso || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canopy//Coalition calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEscape(calName || 'Canopy'), 'X-WR-TIMEZONE:America/Chicago'];
    lines = lines.concat(VTIMEZONE);
    items.forEach(function (it) {
      if (!T.parseDate(it.date)) return;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + icsEscape(it.uid) + '@canopy');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;TZID=America/Chicago:' + icsLocal(it.date, it.start || '00:00'));
      lines.push('DTEND;TZID=America/Chicago:' + icsLocal(it.end_date || it.date, it.end || it.start || '01:00'));
      lines.push('SUMMARY:' + icsEscape(it.title));
      if (it.description) lines.push('DESCRIPTION:' + icsEscape(it.description));
      if (it.location) lines.push('LOCATION:' + icsEscape(it.location));
      if (it.url) lines.push('URL:' + icsEscape(it.url));
      if (it.cancelled) lines.push('STATUS:CANCELLED');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  };

  /** Google Calendar "add event" link (times given as Chicago local with ctz). */
  T.googleCalendarLink = function (it) {
    var q = [
      'action=TEMPLATE',
      'text=' + encodeURIComponent(it.title || ''),
      'dates=' + icsLocal(it.date, it.start) + '/' + icsLocal(it.end_date || it.date, it.end || it.start),
      'ctz=America%2FChicago'
    ];
    if (it.description) q.push('details=' + encodeURIComponent(it.description));
    if (it.location) q.push('location=' + encodeURIComponent(it.location));
    return 'https://calendar.google.com/calendar/render?' + q.join('&');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
