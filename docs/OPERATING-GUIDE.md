# Canopy operating guide (for stewards)

All administration happens in the private **Canopy Admin** Google Sheet. You never need to edit code.

## The one rule

**Only rows with `status = approved` are public** (and never rows with `visibility = restricted`). Even then, only a fixed list of safe fields is published. Private emails, notes and tokens never appear on the site.

| Status | Meaning |
|---|---|
| `pending` | Came in through a public form; waiting for review |
| `draft` | Prepared by a steward or Claude; not public |
| `approved` | Public (if visibility is public) |
| `unpublished` | Taken down; kept for history |
| `cancelled` | Events drop out of upcoming views. Meetings stay listed and are marked "Cancelled" with the reason |
| `archived` | Kept for history; never shown |

## Everyday actions (Canopy menu)

Select one or more rows, then:
- **Approve selected rows** publishes them and records your name and the time.
- **Unpublish**, **Cancel…** (asks for a reason) and **Archive** change the status the same way.
- **Mark verified** is for when you've confirmed an organization, affiliation or name.
- **Apply selected correction** (Corrections tab) applies the proposed changes to the record it refers to.
- **Resolve selected membership request…** (Memberships tab): type `acknowledge`, `welcome`, `decline` or `withdraw`.
- **Review queue** lists what needs a person: pending items, interest nobody has picked up yet, failed emails, open corrections, and a next call with no link.
- **Retry failed notifications**: fix the address or role first, then retry.
- **Privacy self-check** confirms that no private email appears publicly. Run it after any bulk edit.
- **Export backup now** writes a dated JSON file to the private Drive folder.

You can also simply type in cells. Changing `status` to `approved` stamps your name automatically. The site picks up changes within about 5 minutes; **Refresh public site now** makes it immediate.

## What happens automatically

- Every submission is saved first (Submissions tab), then turned into records.
- The submitter gets an honest acknowledgement. "Interested" is never described as "member".
- The right person is notified:

| What came in | Who is notified |
|---|---|
| Interest in a group | The group's `contact_email` |
| Help finding a place, or a full or paused group | The intake steward |
| Events | The events steward |
| Directory listings | The directory steward |
| Monthly updates | The facilitator |
| Corrections | The communications steward |

- **If no one is assigned, nobody is emailed.** The request is recorded and shows up in the Review queue. No default person (including Kendra) is used.
- Group contacts get a private link to acknowledge, welcome or decline without logging in. Participants get a private link to withdraw. Event submitters get a private link to cancel or propose a correction.
- Failed emails retry three times, then alert the exceptions steward once.
- Duplicate submissions and retries don't create duplicate records or extra emails.
- Events disappear from "upcoming" once they've ended, but stay in history.
- A weekly backup runs Monday at 3 a.m.

## The community calendar

The **DeKalb County, Illinois Community Sustainability Calendar** is at `/calendar/` on the site, for example `https://canopy.decarbondekalb.com/calendar/`. It is DeCarbon DeKalb's calendar, and Canopy feeds into it. It uses the same **Events** tab as the Canopy site, and Canopy's monthly calls appear on it automatically.

- **Anyone can submit an event.** Their event lands in the Events tab as `pending` until a steward approves it.
- **Trusted publishers post directly.** Make sure the person has a row in the **People** tab: add one with `display_name` and `private_email` if needed. Then select that row → **Canopy → Calendar: create publishing link for selected person**.
  - Copy the link from the pop-up and send it to them. It's also emailed to them if live sending is on.
  - Events they submit through that link publish immediately, and the events steward gets an FYI email.
  - **Calendar: revoke publishing** stops their link working. Creating a new link also replaces the old one.
  - Someone typing a trusted person's email address is *not* enough to publish; only the personal link works.
  - A trusted publisher's event that duplicates an existing title and date still waits for review.
- **Source links are recommended, not required.** Events without one say "No original event page was provided — please confirm details with the organizer."
- **Topics and counties.** Topics come from a fixed list (Energy & climate, Repair & reuse, and so on). Counties cover DeKalb first, then northern Illinois, plus Online and Regional.
- **Settings:**
  - `CAL_NAME`, `CAL_TAGLINE` and `CAL_OWNER_NOTE` set the calendar's wording.
  - `CAL_NOTICE` shows an optional banner.
  - `CAL_CONTACT_EMAIL` is the "Questions or problems" address.
  - `CALENDAR_URL` defaults to `SITE_URL` + `/calendar/`.
- **Sharing.** Every view and every event has its own link ("Copy link to this view" and "Copy link to this event").
- **Subscribing.** The calendar's **Subscribe** page gives Google, Apple and Outlook subscription links, which update automatically. Adding `&county=McHenry` or `&category=Repair%20%26%20reuse` to a feed address narrows it to one county or topic.
- **Embedding on Squarespace or partner sites** (Squarespace needs a plan that allows iframes in Code blocks):

  ```html
  <iframe src="https://canopy.decarbondekalb.com/calendar/#/?embed=1" title="DeKalb County, Illinois Community Sustainability Calendar" style="width:100%;height:900px;border:0"></iframe>
  ```

  Swap `#/` for `#/week` or `#/month` to embed a different view.

## Action-item updates from collaborators

Collaborators don't need the Sheet. Every published action item on the site has a **"Post an update on this item"** link. These appear on the meeting page and under **Collaborations & requests → Open action items**.

1. A collaborator picks a status, adds a next step or note, and gives their name.
2. Their update arrives as a row in the **Corrections** tab, and the facilitator gets an email.
3. To publish it, select that row → **Canopy → Apply selected correction**. The item updates on the site.
4. If an update only contains a note, read it and set the Corrections row's `state` to `resolved`.

## Groups: the two enrollment modes

- `contact_led` (the default): the request goes to the contact. The person becomes `active` only after the contact welcomes them.
- `open`: the person is added straight away and sent the `welcome_message`. The contact gets an FYI email.

To stop new requests, set `intake = paused`. Requests are then waitlisted for the intake steward. Setting `capacity` to a number waitlists people automatically once the group is full.

Joining a group never adds anyone to the directory or to any mailing list.

## Kendra's monthly hour (about 30 minutes before and 30 minutes after the call)

**Before the call (30 min)**
1. 10 min: Review queue, and new rows in the Updates tab. Note any missing owners; you don't need to chase them.
2. 10 min: Draft the agenda with the facilitator (Claude can help) and paste it into the meeting's `agenda` cell.
3. 10 min: Approve the meeting row, check the join link and rooms, then **Refresh public site now**.

**After the call (30 min)**
1. 10 min: Give the transcript to the private Claude Project using `docs/claude-project-instructions.md`. You get back a recap draft, a change set and a private verification list.
2. 10 min: Check decisions, owners, dates, consent and scope. Mark unowned work "Not yet assigned".
3. 10 min: Paste the change set JSON into a new ChangeSets row (`id`, `title`, `json`). Run **Preview selected change set**, then **Apply**. Review the site, approve the recap, and send it to the communications steward.

Project leads own their own work. Urgent changes go to a designated backup, not to Kendra.

## Backups and exports

- Sheets keeps full version history: File → Version history.
- There's a weekly JSON backup of every tab (private), plus a copy of the public data, in "Canopy backups (private)" on Drive. The last 26 are kept.
- For a spreadsheet copy: File → Download → Excel.
- The code is versioned in git. `apps-script/dist/Code.gs` is the exact deployed file.

## If something goes wrong

| Symptom | Fix |
|---|---|
| The site says the service isn't reachable | Open `…/exec?action=health`. If that fails, check the deployment exists, that "Who has access" is Anyone, and the Apps Script executions log |
| An email didn't arrive | Check its row in the Notifications tab: `simulated` means LIVE_SENDING is off; `failed` shows the error. Fix it, then retry |
| Something private appeared publicly | Unpublish the row immediately, run the Privacy self-check, then fix the field |
| Pause everything | Set Settings `SUBMISSIONS_ENABLED = no` |
