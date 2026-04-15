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

## Technical & Trust Features (All Tiers)

| Feature | Details |
|---|---|
| Manifest V3 + service-worker | Future-proof Chrome extension architecture |
| 100% local storage | `chrome.storage.local` — zero external tracking |
| 81 automated tests | 88.5% coverage, CI-enforced on every PR |
| Sentry error monitoring | No personal data collected |
| Alarm-based scheduling | Survives browser restarts |
| Clean, accessible UI | Plus Jakarta Sans, ARIA labels, responsive |

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
| Quick-add: "Block current tab" button | `popup/popup.js` |
| Options page: full blocklist management + settings | `options/options.js` |
| Free/Pro tier split, plan pill, paywall modal | `options/options.js`, `options/options.html` |
| Daily resistance badge (toolbar, resets at midnight) | `background.js` |
| Per-site resistance counters (daily tracking) | `background.js` |
| Focus/work timer with session persistence | `background.js`, `popup/popup.js` |
| Accountability presets (Light / Balanced / Strict) | `options/options.js` |
| Settings sanitization + storage normalization on boot | `background.js` |
| Test hooks exposed for unit testing | `background.js`, `popup/popup.js`, `friction-page/script.js`, `options/options.js` |
| Vitest test suite (unit + integration + flow) | `tests/` |
| Pricing screen | `options/options.html`, `options/options.js` |
| `activateProPlan` message handler (local flag, no Stripe) | `background.js` |
| Pro: strict mode lock (prevent settings changes during schedule) | `background.js`, `options/options.js` |
| Pro: strict mode disable cooldown | `background.js` |
| Pro: override cooldown system (threshold → lock) | `background.js` |
| Pro: behavioral friction (task intent, timed wait, earn-access) | `background.js`, `friction-page/script.js` |
| Pro: earn-access bonus minutes | `friction-page/script.js` |
| Pro: analytics event logging (blocked, granted, override, etc.) | `background.js` |
| Pro: analytics dashboard (7-day, top domains, override trend) | `background.js`, `options/options.js` |
| Pro: weekly discipline report + focus score | `background.js`, `options/options.js` |
| Pro: commitment mode (1–24 h lockout, no override, no challenge) | `background.js`, `commitment-page/` |
| Pro: intention page (personal goal per domain + 4-7-8 breathing) | `background.js`, `friction-page/script.js` |
| Pro: temptation bundles (time-of-day + work-timer conditions) | `background.js`, `options/options.js` |
| License-based entitlement via RS256 JWT | `background.js` |
| Sentry error monitoring | `vendor/sentry-init.js` |

### ⚠️ Partially implemented / stub

| Feature | Status |
|---|---|
| Real payment backend (Stripe webhook + entitlement API) | To be connected to a payment provider to issue the license keys expected by the extension. |

### ❌ Not yet implemented

| Feature | Notes |
|---|---|
| `chrome.storage.sync` for cross-device settings | All storage uses `chrome.storage.local` |
| Trend charts / streak tracking / heatmaps | Per ROADMAP |
| Email weekly report delivery | Per ROADMAP |
| PDF export of reports | Per ROADMAP |
| Custom paragraph content for typing challenge | Per ROADMAP |
| Custom motivational quotes for friction page | Per ROADMAP |

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
npm test                    # Run all tests once
npm run test:watch          # Watch mode (re-run on file changes)
npm run test:coverage       # Generate coverage report (enforced thresholds: 85% background.js, 45% others)
```

**Test structure**: Vitest runs 81 tests across 4 suites:
- `background.integration.test.js` — Service worker message handling and storage lifecycle
- `feature-matrix.test.js` — Pro features, entitlement, analytics, alarms
- `friction-page.flow.test.js` — Typing challenge, manual override, temporary access grant
- `ui.logic.test.js` — Popup and options page settings logic

**Coverage thresholds** (enforced by CI):
| Scope | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `background.js` | 85% | 85% | 95% | 70% |
| All other files | 45% | 45% | 50% | 70% |

### Billing integration notes

- Run `npm run migrate` from `/Users/orlandoascanio/Desktop/Profesional-Portfolio/client` when the billing backend adds a new SQL migration.
- For fully product-specific billing, set `PAYPAL_PLAN_MAP` in `Profesional-Portfolio/client/.env.local`.

```env
PAYPAL_PLAN_MAP={"resistgate":{"monthly":"P-...","yearly":"P-..."},"another-product":{"monthly":"P-...","yearly":"P-..."}}
```

- Each new extension origin must be added to `ENTITLEMENT_ALLOWED_ORIGINS` in the portfolio backend.
- Each extension manifest must include your site in `externally_connectable`.

### Release process

1. Update version in `manifest.json` and `package.json`.
2. Update `changelog.md` with release notes.
3. Run `npm run test:coverage` to ensure all tests pass and coverage thresholds are met.
4. Commit with message: `Release v1.x.y`
5. Tag and push: `git tag v1.x.y && git push origin v1.x.y`
6. CI automatically creates a GitHub Release with build artifacts (zipped extension).
7. Upload to Chrome Web Store via developer dashboard.

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

## Feature Overview

### Free Tier Features (v1.1.0)

| Feature | Description | SEO Keywords |
|---|---|---|
| Domain Blocking | Block any domain or wildcard via `declarativeNetRequest` | website blocker, site blocker chrome, block youtube chrome |
| Typing Challenge (Friction Page) | 5-paragraph test requiring 100% accuracy; paste disabled | typing challenge blocker, friction browser extension |
| Temporary Access Grant | Configurable time-limited access; auto-reblocks via alarms | temporary access control, timed website blocker |
| Manual Override with Delay | 10–15 s configurable countdown before access (no challenge) | override blocker, anti-procrastination |
| Schedule-Based Blocking | Active days (Mon–Sun) + time windows | scheduled website blocker, focus hours |
| Quick-Add Popup UI | Popup for adding/removing domains + "Block current tab" button | quick website blocker, chrome extension popup |
| Full Settings Page | Complete blocklist, schedule, and access-duration management | website blocker settings |
| Block Current Tab | One-click from popup | block current tab |
| Daily Resistance Badge | Toolbar badge shows daily blocked attempts (resets at midnight) | resistance counter chrome |
| Focus / Work Timer | Built-in timer with session persistence and site-context tracking | focus timer chrome, pomodoro blocker |
| Resistance Counters | Per-site daily resistance tracking | distraction tracker |

### Pro Tier Features (v1.1.0)

| Feature | Description | SEO Keywords |
|---|---|---|
| Strict Mode Lock | Locks settings during active schedule; cooldown to disable | strict website blocker, discipline mode |
| Override Cooldown System | Progressive lock after override threshold | override limit, cooldown blocker |
| Focus Analytics Dashboard | 7-day blocked attempts, override trends, top distracting domains | focus analytics, distraction analytics |
| Focus Score (0–100) | Weekly discipline score based on overrides + disables | focus score, productivity score |
| Weekly Discipline Report | Auto-generated with week-over-week trends and personalized feedback | weekly focus report |
| Earn-Access Bonus Minutes | Extra access time for completing extended challenges | earn screen time |
| Behavioral Friction (Precheck) | Task intent input → timed wait → custom challenge | behavioral friction, intention-based blocking |
| Commitment Mode | Total 1–24 h lockout (no override, no challenge) | commitment mode, focus lock |
| Intention Page | Personal goal/reminder + optional 4-7-8 breathing exercise | intention page blocker |
| Temptation Bundles | Conditional unlocks (after work-timer minutes or specific time) | temptation bundling |
| Accountability Presets | Light / Balanced / Strict friction levels | accountability presets |
| License-Based Entitlement | RS256 JWT + 24 h auto-refresh | secure pro license |
| Event Logging | Full audit of blocks, overrides, challenges for analytics | activity logging |

---

## Release Status

**Version 1.1.0** — Live on Chrome Web Store with active users.

- ✅ Deployed to Chrome Web Store
- ✅ All 81 tests passing (vitest)
- ✅ 88.5% coverage on background.js (exceeds 85% threshold)
- ✅ License-based Pro entitlement via RS256 JWT
- ✅ Free tier + Pro monetization active
- ✅ Collecting real user feedback and analytics

### Pricing (Live)

| Plan | Price |
|---|---|
| Pro Monthly | $3.99/mo |
| Pro Yearly | $29.99/yr |
| Pro Lifetime | $49.99 |

### Competitive Positioning

- **vs Cold Turkey / Freedom**: Clear "friction, not walls" approach — users earn access through typing challenge rather than permanent blocks
- **vs Amethyst**: Ready for cross-promotion — attention data collected can reinforce ResistGate's discipline philosophy

---

## Documentation

- [Changelog](changelog.md)
- [Architecture](Architecture.md)
- [Roadmap](ROADMAP.md)
- [Implementation Notes](docs/Implementation.md)
- [Agent Guidelines](AGENTS.md)
