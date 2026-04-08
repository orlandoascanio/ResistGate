# ResistGate

**ResistGate** is a Manifest V3 Chrome extension for intentional browsing.
It blocks distracting sites and requires a friction challenge before granting temporary access.

## Tagline

**You don't unblock distractions. You earn access.**

---

## What it does

- Block domains you choose (e.g. `youtube.com`, `reddit.com`).
- Redirect blocked visits to a friction/challenge page.
- Require typing **5 paragraphs with 100% accuracy** to unlock access.
- Grant **time-limited temporary access** after the challenge completes.
- Re-block automatically when the access window expires (via `chrome.alarms`).
- **Manual override** available with a configurable delay (10–15 s).
- **Schedule-based blocking** — define active days and hours.
- **Pro tier**: strict mode, behavioral friction, earn-access, analytics dashboard, weekly discipline report.

---

## Current implementation status

### ✅ Fully implemented

| Feature | Location |
|---|---|
| Domain blocking via `declarativeNetRequest` | `background.js` |
| Redirect to friction/challenge page | `background.js`, `manifest.json` |
| Typing challenge (5 paragraphs, 100% accuracy, paste disabled) | `friction-page/script.js` |
| Manual override with configurable delay countdown | `friction-page/script.js` |
| Temporary access grant + auto-expiry via alarms | `background.js` |
| Schedule-based blocking (days + time window) | `background.js` |
| Popup: add/remove/preview blocklist (up to 5 shown) | `popup/popup.js` |
| Options page: full blocklist management + settings | `options/options.js` |
| Free/Pro tier split, plan pill, paywall modal | `options/options.js`, `options/options.html` |
| Pro: strict mode lock (prevent settings changes during schedule) | `background.js`, `options/options.js` |
| Pro: strict mode disable cooldown | `background.js` |
| Pro: override cooldown system (threshold → lock) | `background.js` |
| Pro: behavioral friction (task intent, timed wait, earn-access) | `background.js`, `friction-page/script.js` |
| Pro: earn-access bonus minutes | `friction-page/script.js` |
| Pro: analytics event logging (blocked, granted, override, etc.) | `background.js` |
| Pro: analytics dashboard (7-day, top domains, override trend) | `background.js`, `options/options.js` |
| Pro: weekly discipline report + focus score | `background.js`, `options/options.js` |
| Settings sanitization + storage normalization on boot | `background.js` |
| Test hooks exposed for unit testing | `background.js`, `popup/popup.js`, `friction-page/script.js` |
| Vitest test suite (unit + integration + flow) | `tests/` |
| Pricing screen (monthly $5 / yearly $50) | `options/options.html`, `options/options.js` |
| `activateProPlan` message handler (local flag, no Stripe) | `background.js` |

### ⚠️ Partially implemented / stub

| Feature | Status |
|---|---|
| Real payment backend (Stripe webhook + entitlement API) | To be connected to a payment provider to issue the license keys expected by the extension. |

### ❌ Not yet implemented

| Feature | Notes |
|---|---|
| `chrome.storage.sync` for cross-device settings | All storage uses `chrome.storage.local` |
| Trend charts / streak tracking / heatmaps | Post-v1 per ROADMAP |
| Email weekly report | Post-v1 per ROADMAP |
| PDF export | Post-v1 per ROADMAP |

---

## Project structure

```
manifest.json          — MV3 config, permissions, service worker entry
background.js          — Service worker: blocking rules, storage, alarms, analytics
popup/
  popup.html           — Quick-add UI
  popup.css            — Popup styles
  popup.js             — Add/preview/remove blocked sites
options/
  options.html         — Full settings UI (tabs: General, Analytics, Weekly Report)
  options.css          — Options styles
  options.js           — Settings load/save, plan management, analytics/report render
friction-page/
  index.html           — Blocked-site redirect landing
  style.css            — Friction page styles
  script.js            — Challenge flow, manual override, pro pre-checks
icons/
  16x16.png, 48x48.png, 128x128.png
tests/                 — Vitest unit/integration tests
```

---

## Local development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Click **Reload** after code changes.

No build step required. Plain HTML/CSS/JS.

### Run tests

```bash
npm install
npm test
```

### Billing integration notes

- Run `npm run migrate` from `/Users/orlandoascanio/Desktop/Profesional-Portfolio/client` when the billing backend adds a new SQL migration.
- For fully product-specific billing, set `PAYPAL_PLAN_MAP` in `Profesional-Portfolio/client/.env.local`.

```env
PAYPAL_PLAN_MAP={"resistgate":{"monthly":"P-...","yearly":"P-..."},"another-product":{"monthly":"P-...","yearly":"P-..."}}
```

- Each new extension origin must be added to `ENTITLEMENT_ALLOWED_ORIGINS` in the portfolio backend.
- Each extension manifest must include your site in `externally_connectable`.

---

## Permissions (why)

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | Block / redirect configured domains |
| `storage` | Save settings and temporary access locally |
| `alarms` | Expire unlock windows and timed blocks |
| `host_permissions: <all_urls>` | Apply rules to user-selected domains |

---

## Privacy

- All data stays in `chrome.storage.local`.
- No remote servers, analytics, or tracking (until Stripe entitlement is wired).
- No external network calls for current extension functionality.

---

## Tech

- JavaScript (ES2020+, no TypeScript)
- HTML / CSS
- Chrome Extension APIs (Manifest V3)
- Vitest for testing

---

## Documentation

- [Implementation Plan (Next Steps)](docs/Implementation.md)
- [Changelog](changelog.md)
- [Architecture](Architecture.md)
- [Roadmap](ROADMAP.md)
