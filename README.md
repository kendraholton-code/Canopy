# Canopy

**Canopy: Second Saturdays for a More Sustainable DeKalb County, Illinois.** A coordination site and engine for a coalition-led monthly call. It covers the next call, meetings and reviewed recaps, an organization and people directory, a community calendar, ways to get involved (working groups and ten reusable rooms), and collaborations and requests.

Canopy is coalition-led. DeCarbon DeKalb provides the Google Meet platform and shared technical infrastructure; it does not own, lead or govern Canopy.

## How it fits together

```
 Public visitor (phone, no login)
        │  static site  (site/)  ── hosted at canopy.<domain>, linked from Squarespace
        │  GET public snapshot (approved, allowlisted fields only) / POST form
        ▼
 Apps Script web app (apps-script/dist/Code.gs)  ── the engine (core/)
        │  reads/writes                     │ sends (outbox, retries, escalation)
        ▼                                   ▼
 Canopy Admin Google Sheet (private)      Gmail (MailApp) — off until LIVE_SENDING=yes
 stewards approve via status/menu         weekly JSON backup → private Drive folder
```

Start with:
- [docs/RECOMMENDATION.md](docs/RECOMMENDATION.md): the architecture, costs and account owners.
- [docs/SETUP.md](docs/SETUP.md): going live, and the missing inputs.
- [docs/OPERATING-GUIDE.md](docs/OPERATING-GUIDE.md): for stewards, including the monthly hour.
- [docs/STATUS.md](docs/STATUS.md): what works, what's simulated, what's blocked.
- [docs/claude-project-instructions.md](docs/claude-project-instructions.md): monthly transcript processing and the change-set format.

## Repository layout

| Path | What it is |
|---|---|
| `core/` | The engine: plain JavaScript that runs in Apps Script, Node and the browser. It covers schema, intake, routing, outbox, the public projection, steward actions, change sets and seed data |
| `apps-script/src/` | Google adapters: SheetStore, web app, menu, triggers, backup |
| `apps-script/dist/` | **Generated.** The single `Code.gs` to paste into Apps Script, plus `appsscript.json` |
| `site/` | The public website (no build step). `js/config.js` holds the only setting needed to go live |
| `local/server.js` | Local test server: same API, JSON-file store, email simulated |
| `tests/` | Engine, Apps Script bundle (mocked Google services) and browser tests |

## Try it

```bash
npm run demo          # http://localhost:8787 — demo data, "Steward view (demo)" link in the footer
npm test              # engine + Apps Script bundle tests
npm run test:e2e      # browser tests (phone viewport, keyboard, privacy)
npm run build         # regenerate apps-script/dist and site/js/canopy-core.js after editing core/
```

Opening `site/index.html` from any static host with `API_URL: 'demo'` runs the whole engine in the browser with labelled sample data. Nothing is sent.

## Privacy

This repository contains **no contact details or private records**. The only names are first-name owners on the *draft* Nov 14 action items, exactly as stated in the action register. Review those before making the repository public for free hosting. Names heard in transcripts belong only in the private `Verification` tab of the Admin sheet. Private emails never leave Google: the public feed is built server-side from an allowlist.
