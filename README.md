# ResistGate ;)

**ResistGate** is a Manifest V3 Chrome extension for intentional browsing.
It blocks distracting sites and adds friction (a typing challenge) before granting temporary access.

**Tagline:** _You don't unblock distractions. You earn access._

---

## Product Description

ResistGate is a Manifest V3 Chrome extension that makes it genuinely harder to visit distracting websites. Rather than a simple one-click block you can bypass in two seconds, it redirects you to a typing challenge — five paragraphs of focused text, 100% accuracy required, paste disabled. You cannot shortcut your way through it. Either you earn access or you close the tab.

The extension is built on one behavioral premise: **friction changes behavior**. A 10-second countdown is enough to break an unconscious reflex. Five paragraphs of deliberate typing are enough to make you decide whether this visit is actually worth it. ResistGate is not a nanny filter — it is an accountability layer you configure for yourself.

Free users get the complete blocking and friction engine: schedule-based blocking, configurable temporary access windows, a daily resistance badge, per-site visit counters, per-site intention goals with optional breathing, a work timer, and per-site access conditions that unlock sites after a chosen time or after earned focus minutes. Pro users add Commitment Mode (1-24h hard lockout with no escape), Strict Mode locking, behavioral friction presets, stronger pre-entry prompts, earn-access challenge timing, a 7-day analytics dashboard, and a weekly Focus Score.

---

## Product Info

| Detail | Value |
|---|---|
| **Version** | 1.4.0 |
| **Manifest** | V3 |
| **Platform** | Google Chrome (desktop) |
| **Free tier** | No account required — full blocking engine included |
| **Pro Monthly** | $3.99 / month (Paddle subscription, cancel anytime) |
| **Pro Yearly** | $29.99 / year (Paddle subscription, cancel anytime) |
| **Pro Lifetime** | $49.99 one-time payment |
| **Pro activation** | Paddle checkout on orlandoascanio.com → extension activates automatically |
| **Build step** | None — plain ES2020+ HTML / CSS / JS |
| **Storage** | `chrome.storage.local` only (local-first, per browser profile) |
| **External services** | Sentry crash telemetry + PostHog allowlisted lifecycle/funnel events |
| **Test suite** | 174 tests · 5 files · Vitest 2.1.9 |
| **Background coverage** | 88.4% lines/statements · 76.44% branches · 96.66% functions |
| **License** | See `LICENSE` |

---

## 📊 Additional Details

### Challenge mechanics
| Setting | Default | Range |
|---|---|---|
| Typing challenge | Hard = 5 paragraphs; Moderate = 1-2 sentences; Easy = short random code | Configurable level |
| Required accuracy | 100% | Fixed |
| Paste / clipboard | Disabled | Fixed |
| Manual override delay | 12 seconds | 10-15s (configurable) |
| Temporary access window | 15 minutes | Configurable per site |
| Earn-access min challenge time | 90 seconds | 30-900s (Pro) |
| Commitment Mode duration | 2 hours | 1–24h (Pro) |
| Strict Mode disable delay | 30 seconds | 10-300s (Pro) |

### Override cooldown system (Pro)
| Parameter | Default | Range |
|---|---|---|
| Override threshold | 3 per window | 2–12 |
| Cooldown window | 6 hours | 1–24h |
| Delay step per override | 10 seconds | 5–45s |
| Max delay per override | 90 seconds | 15–180s |
| Lock duration after threshold | 30 minutes | 5–180min |

### Storage domains
| Key | Purpose |
|---|---|
| `settings` | Full settings object (blocklist, schedule, Pro features) |
| `temporaryAccess` | Active per-domain access grants with expiry timestamps |
| `analytics` | Event log (max 3,000 events; Pro only populated) |
| `overrideState` | Override timestamps + lock-until for cooldown system |
| `workTimer` | Today's focus minutes, running state, start timestamp |
| `dailyBlockCount` | Badge counter (resets at midnight) |
| `resistanceCounters` | Per-domain visit counters keyed by date |
| `installation` | Generated device ID (opaque UUID) |
| `pendingOutcomeTap` | Last expired access window that should prompt for reflection in the popup |

### Alarm types
| Alarm prefix | Trigger |
|---|---|
| `resistgate-block-expire-*` | Per-site time-limited block expiry |
| `resistgate-access-expire-*` | Temporary access window expiry |
| `resistgate-bundle-unlock-*` | Time-of-day temptation bundle unlock |
| `resistgate-commitment-expire` | Commitment Mode end |
| `resistgate-daily-reset` | Midnight badge + work timer daily reset |

### Analytics event types (Pro)
| Event | When logged |
|---|---|
| `blocked_visit` | Every redirect to friction or commitment page |
| `access_granted` | Successful challenge completion or manual override |
| `override_triggered` | Manual override used |
| `manual_disable` | Strict Mode turned off |
| `challenge_failed` | Typing challenge abandoned |
| `challenge_completed` | Typing challenge finished |
| `outcome_tap_response` | Recognized by the sanitizer, but current popup recording is incomplete; see `docs/Implementation.md` |

### Focus Score formula
```
Focus Score = clamp(100 − (overrides × 5) − (manual_disables × 10), 0, 100)
```
Calculated over a rolling 7-day window. Compared week-over-week in the Weekly Report.

---

## Feature matrix (from the codebase)

### Free tier (default)

- **Domain blocking** via `declarativeNetRequest`.
- **Simple schedule** (days + start/end time) that automatically enables blocking during your work window.
- **Friction page typing challenge**
  - 5 paragraphs
  - **100% accuracy** required
  - paste disabled
- **Temporary access windows** (configurable minutes) with **auto re-block** using `chrome.alarms`.
- **Manual override** with a **10–15s delay** (configurable).
- **Popup quick actions**
  - add/remove blocked sites
  - **block current tab**
- **Options page** for full settings (blocklist, schedule, access duration).
- **Daily resistance badge** (toolbar) + **per-site resistance counters** (stored locally).
- **Access conditions per site ("temptation bundles")**
  - allow access only **after a time of day** or **after N minutes on the work timer**
  - if the condition is met, the site loads normally (no redirect)
- **Work timer** (used by Earn Access rules).
- **Intention Page**
  - per-site personal goal reminder
  - optional guided **4-7-8 breathing** exercise

### Pro tier (`settings.subscription.tier === 'pro'`)

- **Strict Mode**
  - locks configuration during your focus window (always-on if schedule is disabled; otherwise only during scheduled hours)
  - **disables manual override** while the strict focus window is active
  - optional **cooldown delay** required to disable Strict Mode
- **Accountability presets** (Light / Balanced / Strict) to quickly tune how much friction you want.
- **Override cooldown system** (progressive delay + temporary lockouts after repeated overrides).
- **Behavioral friction precheck** on the friction page
  - task intent input
  - timed wait gate
  - custom challenge prompt
  - optional **Earn-Access mode** that requires a minimum challenge time and can grant **bonus minutes**
- **Commitment Mode (1–24h)**
  - total lockout during the window (no override, no challenge)
  - redirects blocked sites to `commitment-page/index.html`
- **Analytics dashboard** (last 7 days) + **Weekly discipline report**
  - Focus Score (0–100)
  - blocked attempts, overrides, top domains, trend vs last week

## Pricing (live, Paddle)

| Plan | Price |
|---|---:|
| Free | $0 |
| Pro Monthly | $3.99 / month |
| Pro Yearly | $29.99 / year |
| Pro Lifetime | $49.99 one-time |

Paddle is the merchant of record and the only source of truth for who has paid.

### Pricing sources (keeping things in sync)

- **Extension paywall modal** (the prices shown inside the extension UI): `options/options.html`
- **Website pricing page + Paddle checkout UI** (canonical pricing): `Profesional-Portfolio/client/app/[locale]/pricing/page.tsx`
- **ResistGate landing page copy / feature list**: `Profesional-Portfolio/client/app/[locale]/products/_data/resistgate.ts`
- **Paddle price IDs** (monthly/yearly/lifetime): `Profesional-Portfolio/client/.env.local` → `PADDLE_PRICE_MAP`

## How Pro activation works (current implementation)

Pro is **never granted locally**. The extension proves possession of a secret it generated, and the
server tells it the answer.

1. The extension asks the server to open a checkout session (`openPricingPage` → `POST /api/checkout/session`), sending an install credential it generated. The server stores only the credential's hash.
2. The extension opens the pricing page with nothing but an opaque checkout ID, and the Paddle overlay opens on the chosen plan.
3. Paddle's webhook — the only payment source of truth — records the purchase against the session.
4. The pricing page requests a short-lived signed activation token and hands it to the extension via external messaging (`chrome.runtime.sendMessage(extensionId, { action: 'activateProFromWebsite', activationToken })`).
5. `background.js` exchanges that token plus its install credential at `POST /api/entitlement/activate-install`, and flips the tier **only** if the server returns `pro: true`.

A message from a trusted origin cannot grant Pro on its own — without a token the server verifies,
the extension stays Free.

Startup (throttled hourly) and a six-hour alarm reconcile with `POST /api/entitlement/install-status`.
Transient failures preserve the last verified state for up to 72 hours, then Pro lapses and the
options page asks the user to reconnect. A rejected credential drops Pro but is never deleted, so a
later successful sync restores access with no user action and no second payment.

Notes:
- Pro activation is **per-browser profile** (stored in `chrome.storage.local`). There is no account
  layer: a user who switches machines currently has no self-serve way to recover Pro.
- This repo contains the extension logic. The Paddle checkout + entitlement API lives in the separate
  website repo (`Profesional-Portfolio`). The contract between them is
  `docs/paddle-activation-api-contract.md` — change it before changing either side.

## Privacy & telemetry

- **Local-first data**: settings, timers, resistance counters, and analytics live in `chrome.storage.local` (no `chrome.storage.sync`).
- **Crash reporting**: extension pages load Sentry (`vendor/sentry-init.js`) for error diagnostics.
- **Lifecycle telemetry**: `background.js` sends allowlisted PostHog funnel events with an opaque generated device ID and sanitized primitive properties.
- **No remote blocking/unlocking APIs**: the extension does not call a backend to decide whether to block or grant access. Network traffic is limited to Sentry, PostHog lifecycle/funnel telemetry, and separate website pricing/feedback/activation flows.

## Project structure

```
manifest.json          — MV3 config + permissions + externally_connectable
background.js          — service worker: rules, alarms, storage, Pro gating, messaging
popup/                 — quick actions UI (popup.html/css/js)
options/               — full settings UI (options.html/css/js)
intention-page/        — standalone pause + short challenge page
friction-page/         — typing challenge + manual override (index.html/css/js)
commitment-page/       — lockout page for Commitment Mode (index.html/css/js)
welcome/               — onboarding page
whats-new/             — update notes page
shared/                — shared CSS design tokens/utilities
vendor/                — Sentry bundle + init
icons/                 — extension icons
tests/                 — Vitest suite (unit + integration)
```

## Local development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Click **Reload** after code changes.

No build step required (plain HTML/CSS/JS).

### Run tests

```bash
npm install
npm test
npm run test:watch
npm run test:coverage
```

Coverage thresholds are enforced by `vitest.config.js`: global covered files must meet 43% lines/statements, 48% functions, 70% branches; `background.js` must meet 85% lines/statements, 95% functions, 70% branches.

## Permissions (why)

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | block/redirect configured domains |
| `storage` | persist settings and state locally |
| `alarms` | expire temporary access, schedule resets, timed unlock conditions |
| `tabs` | open pricing, feedback, options, lifecycle, and active-tab quick-block flows |
| `host_permissions: <all_urls>` | apply rules to user-selected domains |

## Related docs

- [Agent Guidelines](AGENTS.md)
- [Architecture](Architecture.md)
- [Changelog](changelog.md)
- [Roadmap](ROADMAP.md)
- [Implementation Notes](docs/Implementation.md)
