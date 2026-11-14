# Status: what works, what's simulated, what's blocked

*As of November 14, 2026.*

## Works and is tested

All of the items below are covered by 39 engine and Apps Script tests and 7 browser tests. Run them with `npm run test:all`.

- **Intake → records → routing → acknowledgement** for:
  - group interest (open and contact-led groups),
  - "help me find a place",
  - events,
  - directory listings,
  - monthly updates,
  - corrections.
- **Truthful outcomes.** "Joined", "routed", "waitlisted" and "recorded, follow-up not yet assigned" each produce a different message. Interest is never described as membership.
- **No duplicates.** Retries are idempotent (same `client_id`). A returning participant gets one person record. A duplicate request creates no new record and sends no email.
- **Unowned items are never routed to Kendra or Ava.** With no role assigned, nobody is emailed and the item appears in the Review queue.
- **Self-reported affiliations are separate from organizations.** They stay `self_reported` and never create or endorse an organization.
- **Public/private separation is enforced server-side** by an allowlist. Tests check that private emails, tokens, notes, restricted events and people without consent never appear in public JSON, iCal, page HTML or browser storage.
- **Steward publishing without code.** Approve, unpublish, cancel and archive all work, with who/when stamped. This is tested through the Apps Script menu functions.
- **Events.** A new submission is pending. A correction updates the right record and leaves others untouched. Cancelling removes it from upcoming views. Past events leave upcoming views but stay in history.
- **Private links (no account needed).** Participants can withdraw, group contacts can welcome/acknowledge/decline, and event submitters can correct or cancel.
- **Outbox.** Simulated while live sending is off, a test-recipient redirect, retry with backoff, escalation once to the exceptions steward, and recovery by a steward.
- **Time.** 13 second-Saturday calls (Dec 12, 2026 – Dec 11, 2027) stay at 10 a.m. Chicago time across daylight-saving changes (checked against the runtime's time-zone database). The iCal feed and Google Calendar links are included.
- **Change sets** (the monthly Claude workflow): preview a diff, apply all-or-nothing, archive instead of delete, and private routing fields are locked.
- **Ava's Google Form.** The mapping and form-submit handler exist and are tested with sample responses. No directory consent is assumed.
- **Spreadsheet safety.** Text that would be a spreadsheet formula is stored as literal text.
- **Backups.** Weekly JSON to Drive, plus a copy of the public data.
- **Site.** Phone-sized layout with no sideways scroll, keyboard access, a skip link, visible focus, and an error summary that is focused and announced. There are honest empty states, "Join link coming soon" when no link is set, and the stable `/join` and `/r/1…10` routes.

## Live checks (November 14, 2026)

- The Apps Script engine is deployed as canopy@decarbondekalb.com, and `?action=health` returns ok.
- The public data returns empty, which is correct because every record is still a draft.
- A test submission was saved, and repeating it exactly returned the same reference without creating a second record.
- The engine sends cross-site permission headers (`Access-Control-Allow-Origin: *`), so the hosted site will be able to call it.
- The 3 triggers are installed, and the 15-minute notification check has run.
- `site/js/config.js` now points at the live engine.

## Community calendar, Phase 1 (built November 14)

- The standalone DeCarbon calendar page is at `/calendar/`:
  - upcoming list, week and month views;
  - search, county, topic, free-only and Canopy-calls filters;
  - a shareable link for every view and every event;
  - event pages with the original source link, a map link, Google Calendar and .ics buttons, and "report a problem";
  - a Subscribe page with feeds filtered by county or topic;
  - an embed mode (`?embed=1`).
- Anyone can submit an event without an account. Trusted publishers post directly through personal links; everyone else's events are reviewed first.
- Tested: 42 engine and Apps Script tests, plus 10 browser tests at phone size.
- **Phase 2 (not built yet):** copying approved events into a public Google Calendar. **Phase 3:** importing partner calendar feeds.

## Simulated or demo only

- **No real email has been sent.** Every notification in testing was `simulated`, or went to a mocked MailApp.
- **The Apps Script bundle was tested against stand-ins for Google's services, not against Google itself.** The live end-to-end check is SETUP.md step 7.
- The **Steward view (demo)** page is a stand-in for the Sheet's Canopy menu. It exists only in demo and local modes.
- **Demo content** (Example Repair Collective, Sam Example, sample events, example.org contacts) is labelled DEMO. It is hidden unless `SHOW_DEMO_CONTENT = yes`.
- The demo shows all 13 meetings, the Nov 14 recap and the room labels as approved so they can be reviewed. **In the production seed every one of them is a draft.**

## Blocked on inputs (placeholders in place; nothing invented)

| Missing | Effect until supplied |
|---|---|
| Owning Workspace account and deployment | No live backend; the site runs in demo mode |
| Main Meet URL | "Join link coming soon" |
| Room links, plus the Meet checks with the real account | Rooms show "No room link yet" |
| Ava's Form URL and ID | The built-in listing form is used instead |
| Steward roles: facilitation, approvals, events, directory, intake, communications, exceptions, backups | Requests are recorded but "not yet assigned", and nobody is emailed |
| Coalition review of the name, room labels, enrollment modes and participation model | All of these are configurable and stay draft |
| Confirmed roster and consent | The directory stays empty except for consenting, approved entries |
| Hosting decision (public repo + GitHub Pages, or Cloudflare Pages) and the Squarespace DNS record | No public URL |
| Decision on the April 10, 2027 Earth Fest conflict | Recorded on the meeting as `decision_needed` |

## Deliberately deferred

Custom accounts, chat or forums, automated transcript publishing, matching algorithms, mass outreach and analytics.
