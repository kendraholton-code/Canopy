# Setup: going from prototype to live

This takes about 45–60 minutes, done once by a technical helper. Nothing here sends email. Live sending stays off until step 7.

## What you need first

| Input | Where it goes | Status |
|---|---|---|
| A Google Workspace account to own Canopy (a shared role account is best) | Owns the Sheet and the script | **Needed** |
| Main monthly Google Meet link | Settings → `MAIN_MEET_URL` | **Pending** |
| Up to 10 working-group room links | Groups → `meet_url` | Pending (test them first, see below) |
| Ava's Google Form URL and ID (optional) | Settings → `ORG_FORM_URL`, `ORG_FORM_ID` | **Pending** |
| Names and emails for steward roles | Roles tab | **Coalition decision** |
| Public site address, e.g. `https://canopy.decarbondekalb.com` | Settings → `SITE_URL` | Pending |

Every placeholder is an empty cell, and the site handles empty cells honestly. For example, a missing Meet link shows "Join link coming soon".

## 1. Create the Admin sheet and the engine

1. Signed in as the owning account, create a Google Sheet named **Canopy Admin**.
2. Open **Extensions → Apps Script**. Delete the sample code and paste in the whole of `apps-script/dist/Code.gs`.
3. Open Project Settings (the gear icon), tick **Show "appsscript.json"**, and replace that file's contents with `apps-script/dist/appsscript.json`. This sets the time zone to America/Chicago and turns on the V8 runtime.
4. Save. In the function dropdown pick `canopySetup` → **Run**, and approve the permissions. This creates the 20 tabs and seeds the meetings, rooms and Nov 14 recap, **all as drafts**.
5. Run `canopyInstallTriggers`. This sends queued notifications every 15 minutes, makes a weekly backup, and stamps who edited what.
6. Reload the Sheet. A **Canopy** menu appears.

## 2. Deploy the web app

**Deploy → New deployment → Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Copy the `/exec` URL. Opening `URL?action=health` in a private window should show `{"ok":true,...}`.

When you update the code later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## 3. Point the site at the engine

In `site/js/config.js`, set `API_URL: 'https://script.google.com/macros/s/…/exec'`. Leave it as `'demo'` to keep the sample-data preview.

## 4. Host the site

**GitHub Pages** (requires a public repository on GitHub Free): Settings → Pages → Source: **GitHub Actions**. Then go to Actions → **publish-site** → Run workflow. The workflow is `.github/workflows/pages.yml` and it publishes the `site/` folder.

**Cloudflare Pages** (works with private repositories): create a project from the repo, leave the build command empty, and set the output directory to `site`.

Then add a custom domain such as `canopy.decarbondekalb.com`.

## 5. Connect Squarespace

1. In Squarespace: **Domains → decarbondekalb.com → DNS → Custom records**. Add a `CNAME` record with host `canopy` and data `<your-account>.github.io` (or the Cloudflare Pages target).
2. Add a navigation link, "Canopy", to `https://canopy.decarbondekalb.com`.
3. Optional embed (needs a plan that allows iframes in Code blocks):
   `<iframe src="https://canopy.decarbondekalb.com/#/calendar" title="Canopy community calendar" style="width:100%;height:900px;border:0"></iframe>`.
   Keep the plain link as well, in case the embed fails.

## 6. Fill in Settings and Roles

- Settings: `SITE_URL`, `MAIN_MEET_URL`, `REPLY_TO` (a shared inbox), `CORRECTIONS_EMAIL_PUBLIC` (optional).
- Roles: give each role a person and an email *only after they agree*. Empty roles are fine. The system says "not yet assigned" and **never** falls back to emailing Kendra.
- Groups: for each group the coalition activates, set `group_status = active`, `intake = open`, choose `enrollment_mode` (`contact_led` or `open`), and fill in `contact_email` and `convenor_display`.
- Approve the December 12 meeting: select its row → Canopy → **Approve selected rows**.

## 7. Test, then switch on email

1. Set `TEST_RECIPIENT` to one inbox you control, and `LIVE_SENDING = yes`.
2. On a phone, logged out, submit: an interest request (contact-led group), an event, a directory listing and an update. Every email arrives in the test inbox, with the real recipient shown in the subject.
3. Click the withdraw, respond and manage links in those emails. Approve the event and confirm it appears on the site within about 5 minutes (or use Canopy → **Refresh public site now**).
4. Run Canopy → **Privacy self-check**. It must say OK.
5. Clear `TEST_RECIPIENT`. Live emails now go to real recipients.

Don't claim the live backend works until this end-to-end test has passed.

## 8. Ava's Google Form (optional)

Ava, or someone with edit access to the Form, adds a Settings row `ORG_FORM_ID` and runs Canopy → **Connect Google Form**. Responses arrive as *pending* directory records, with no directory consent assumed. If the question titles aren't detected correctly, set `FORM_MAPPING`, for example `{"name":"Your name","email":"Email","org_name":"Organization"}`.

## 9. Private verification queue

Import the private CSV of names heard in the transcripts (given to Kendra separately and **not stored in this repository**) into the `Verification` tab with File → Import → Append. It never appears on the public site.

## Meet room checks (with the real DeCarbon Workspace account)

Before you label rooms "available anytime", check each of these:
- an external person can enter without Kendra admitting them,
- two rooms work at the same time,
- links still work outside the nominal event time,
- recurring events keep their settings.

Meeting codes can expire depending on how they were created. If a link changes, update the Groups cell. The stable `/r/N` route forwards to the new link automatically.

## Handoff checklist

- [ ] Two stewards have edit access to the Sheet and know the Operating Guide
- [ ] A second person has owner-level access to the Workspace account, the hosting account and the Squarespace DNS
- [ ] The weekly backup folder exists (after the first Monday, or Canopy → Export backup now)
