# Canopy engine: the recommendation

*Prepared November 14, 2026. This covers technical architecture only. It is not coalition policy.*

## In one paragraph

The private records live in one **Google Sheet**, "Canopy Admin". It's owned by a DeCarbon (or coalition) Google Workspace account, and two or more named stewards can edit it. A small **Google Apps Script** program attached to that Sheet is the engine. It receives the website's forms, saves each one before doing anything else, routes notifications by email, and publishes *only approved, allowlisted fields* as public data. The **public website** is a set of plain static files with no build step and no third-party code. They're hosted free on GitHub Pages or Cloudflare Pages at a subdomain such as `canopy.decarbondekalb.com`, which you set up with one DNS record in Squarespace. Squarespace keeps the main website and links to Canopy. It never runs the backend.

## Why this design

| Need | How it's met |
|---|---|
| Anyone can browse without signing in | Static site; the public data feed needs no login |
| Stewards approve, correct, unpublish and cancel without code | They change a `status` cell, or use the **Canopy** menu in the Sheet |
| Who approved what, and when | `approved_by` and `approved_at` are stamped, and every change goes to the `Audit` tab |
| Private submissions are kept apart from public data | Private data never leaves Google. The public feed is built server-side from an explicit field allowlist (`core/40-projection.js`), so hiding things in the browser isn't relied on for access control. A privacy self-check is in the menu and in the tests |
| Submissions reach the right people automatically | An outbox in the `Notifications` tab sends through Gmail (MailApp). It retries, escalates failures to a named exceptions steward, and avoids duplicate emails |
| Live sending stays off during testing | `LIVE_SENDING = no` by default. `TEST_RECIPIENT` sends every email to one test inbox instead |
| Records stay consistent across views | There's one dataset. The meetings, calendar, directory and rooms pages all read the same public feed |
| Recurring admin close to zero | Nothing to patch: no server, database or framework. Backups and retries run on triggers |
| Easy exports | Sheets has File → Download, version history, and a weekly JSON backup to Drive |
| An AI-assisted monthly update | Claude drafts a *change set* (JSON). A steward previews and applies it from the Sheet menu. It's all-or-nothing and archives instead of deleting |

## The components and their roles

1. **Canopy Admin (Google Sheet).** The authoritative store and the steward interface. It has 20 tabs, one per record type.
2. **Apps Script engine.** One file, `apps-script/dist/Code.gs`, deployed as a web app. It runs as the owning account and anyone can reach it, so visitors can submit without an account. It never returns private fields.
3. **Public site (`site/`).** Static HTML, CSS and JS. You go live by editing one setting: `API_URL` in `site/js/config.js`.
4. **Stable routes.** `/join` and `/r/1` … `/r/10` always forward to whatever Meet link is currently in the Sheet. If a link changes, nobody needs to be retrained.
5. **Claude Project (private).** This is where the monthly transcript work happens. It produces a recap draft and a change set. It is *not* the production host. A Claude artifact is useful for previewing, but artifact storage and connectors aren't reachable by public visitors, so it isn't used for live data.
6. **Ava's Google Form.** Optional to reuse. When it's connected, its responses become *pending* directory submissions. The existing Form didn't ask for directory consent, so none is assumed.

## Recurring costs and account owners

| Item | Cost | Owner (recommended) |
|---|---|---|
| Google Workspace account (Sheet, Apps Script, Gmail sending, Meet) | Already paid by DeCarbon | A shared role account, e.g. `canopy@decarbondekalb.com`, **not** a personal one |
| Static hosting (GitHub Pages / Cloudflare Pages) | $0 | GitHub organization or Cloudflare account held by DeCarbon or the coalition, with 2 admins |
| DNS record in Squarespace | $0 (existing domain) | DeCarbon's Squarespace admin |
| Apps Script quotas | $0 | Google lists 1,500 email recipients a day for paid Workspace accounts and 100 a day for consumer accounts. Canopy should need well under 50 |

**Hosting note.** On the free GitHub plan, GitHub Pages only publishes from a *public* repository. This repository contains no personal data on purpose, so it can be made public. If you'd rather keep it private, use Cloudflare Pages (free with private repositories) or upload the `site/` folder by drag and drop to Netlify or Cloudflare.

**Squarespace note.** A subdomain link works on every Squarespace plan. Embedding the calendar *inside* a Squarespace page needs a Code block with an iframe, and third-party guides disagree on whether that requires the Core or Business plan. The plain link is recommended either way.

## One credible fallback

If Apps Script ever becomes unsuitable (for example, the Workspace quota for a new domain stays at 100 a day), keep the Sheet as the admin interface and move only the engine. `core/` is plain JavaScript with no Google dependencies and would run unchanged on a small Cloudflare Worker, with a transactional email service for sending. It's more to maintain, so don't do this unless it's needed.

## Verified on November 14, 2026 (sources)

- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- MailApp: https://developers.google.com/apps-script/reference/mail/mail-app
- Content service (JSON/iCal output from web apps): https://developers.google.com/apps-script/guides/content
- Cross-site POSTs to Apps Script work with a `text/plain` body (community-documented, implemented in `site/js/data.js`): https://tanaikech.github.io/2020/07/15/sample-scripts-for-requesting-to-web-apps-by-various-languages
- GitHub Pages plan requirements: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- Squarespace custom CNAME records (summarized by a third party): https://dev.to/drjoanneskiles/how-to-connect-a-squarespace-domain-to-a-website-hosted-on-github-pages-47i8
- Google Meet link and expiry behavior (from your brief): https://support.google.com/meet/answer/9302870 · https://support.google.com/meet/answer/10710509
- Claude artifact sharing (from your brief): https://support.claude.com/en/articles/9547008-share-artifacts

These limits change. Re-check the quota page if email volume ever grows.
