# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Commands

```bash
npm install              # Install dev dependencies
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Run tests and enforce coverage thresholds
```

Run a single test file:

```bash
npx vitest run tests/background.integration.test.js
npx vitest run tests/feature-matrix.test.js
npx vitest run tests/friction-page.flow.test.js
npx vitest run tests/intention-page.flow.test.js
npx vitest run tests/ui.logic.test.js
```

Run a single test by name:

```bash
npx vitest run --reporter=verbose -t "opens pricing with the ResistGate product slug"
```

No build step. The extension is plain HTML/CSS/JS loaded directly into Chrome with "Load unpacked". After editing any extension file, reload the extension card in `chrome://extensions`.

## Architecture

ResistGate is a Manifest V3 Chrome extension with no bundler. Every script runs as a plain global in its Chrome page/service-worker context.

### Core Flow

1. `background.js` is the source of truth. It owns `chrome.storage.local`, storage sanitizers, `declarativeNetRequest` session rules, alarms, Pro gating, analytics/report aggregation, external activation, and message handling.
2. UI pages send `{ action: '...' }` with `chrome.runtime.sendMessage()` and receive `{ success: true, ...payload }` or `{ success: false, error }`.
3. Blocking rules redirect blocked main-frame requests to one of three pages:
   - `commitment-page/index.html` when Commitment Mode is active.
   - `intention-page/index.html` when the Intention Page is enabled.
   - `friction-page/index.html` otherwise.
4. Redirects pass the destination as `originalUrl`.
5. Temporary access, access conditions, schedule windows, and work timer state all affect whether a DNR rule is written.

### Storage Keys

All storage is local-only. Do not introduce `chrome.storage.sync` without a deliberate product decision.

| Key | Purpose |
|---|---|
| `settings` | Full sanitized settings object |
| `temporaryAccess` | Active temporary access grants |
| `analytics` | Pro local analytics events, capped at 3,000 |
| `overrideState` | Override cooldown timestamps and lock window |
| `installation` | Opaque device ID, first-seen timestamp, PostHog event dedupe flags, Paddle install credential, verified entitlement |
| `dailyBlockCount` | Toolbar badge count for the current day |
| `resistanceCounters` | Per-domain daily counters |
| `workTimer` | Current-day focus timer state |
| `pendingOutcomeTap` | Expired-access reflection prompt for popup |
| `welcomeShown` | Declared but currently unused |
| `whatsNewShown` | Declared but currently unused |

Storage reads/writes in the service worker go through `getFromStorage()` and `setInStorage()`.

### Rule Updates

Never call `updateBlockingRules()` directly from new code. Use:

```js
queueRulesUpdate(reason)
```

This serializes DNR mutations and prevents overlapping rule refreshes.

### Message Actions

| Action | Pro-gated | Description |
|---|---:|---|
| `grantTemporaryAccess` | No | Grant timed bypass for a domain |
| `recordBlockedVisit` | No | Increment badge/resistance counters and optionally local analytics |
| `getResistanceCount` | No | Return today's count for a domain |
| `recordAnalyticsEvent` | Partially | Track allowlisted PostHog events and selected Pro local events |
| `getSettings` | No | Return sanitized settings |
| `getManualOverrideStatus` | No | Return manual override delay/lock state |
| `updateSettings` | No | Sanitize, enforce locks/tier boundaries, save, refresh rules |
| `getAnalyticsDashboard` | Yes | Return 7-day analytics dashboard |
| `getWeeklyReport` | Yes | Return weekly Focus Score report |
| `activateCommitmentMode` | Yes | Start 1-24h lockout |
| `deactivateCommitmentMode` | Always refuses | Commitment cannot end early |
| `getWorkTimerState` | No | Return work timer state |
| `startWorkTimer` | No | Start work timer |
| `stopWorkTimer` | No | Stop timer and accumulate minutes |
| `getCommitmentModeStatus` | No | Return lockout status/countdown |
| `openPricingPage` | No | Validate plan, create a server checkout session, open pricing with only the opaque checkout ID |
| `openFeedbackPage` | No | Open website feedback page |
| `trackPosthogEvent` | No | Track an allowlisted PostHog event once per installation |
| `getBillingState` | No | Return verified tier, plan, and last-checked time for the options page |
| `refreshEntitlement` | No | Force a server entitlement sync (manual "Recheck access") |

External message actions, accepted only from `https://www.orlandoascanio.com` or `https://orlandoascanio.com`:

| Action | Description |
|---|---|
| `activateProFromWebsite` | Requires a signed `activationToken`. Exchanges it plus the local install credential with the server and grants Pro only when the server returns `pro: true`. |
| `getActivationState` | Returns `{ installed: true, pro }` so the pricing page can confirm the extension is reachable. |

### Billing and Activation

Pro is never granted locally. `background.js` creates a server checkout session, hands the website only an opaque
checkout ID, and flips the tier only after `/api/entitlement/activate-install` verifies a short-lived signed token
against a 256-bit install credential stored in `installation.installCredential`. Startup (throttled to hourly) and a
six-hour `resistgate-entitlement-sync` alarm reconcile with the server via `/api/entitlement/install-status`.

Sync outcomes:

- a verified inactive grant revokes Pro;
- a `401`/`403` drops the entitlement and falls to Free, but **keeps** `installCredential` — it is the only handle this
  browser has back to its own purchase, and destroying it would make an erroneous rejection unrecoverable;
- a transient failure preserves the last verified state, but only for `ENTITLEMENT_GRACE_PERIOD_MS` (72 hours). Past
  that, the next failed sync withdraws Pro and marks `installation.entitlement.stale`, which the options page surfaces
  as "reconnect". This bounds the fail-open window: without it, a lapsed subscription would keep Pro forever as long as
  the client never reached the server again.

Expiry and rejection both withdraw access without withdrawing the ability to recover — one successful sync restores Pro
with no user action and no second payment.

The full server contract lives in `docs/paddle-activation-api-contract.md`, and is implemented by the website
(a separate repository, `Profesional-Portfolio`). Payments run through Paddle as merchant of record; PayPal was removed
on 2026-07-12. Change the contract doc before changing either side.

### Tier Behavior

Free:

- domain blocking;
- schedule blocking;
- graduated typing challenges;
- temporary access;
- manual override with 10-15 second delay;
- popup and options settings;
- daily badge and resistance counters;
- work timer;
- per-site time/work access conditions;
- Intention Page with per-site reminders and optional breathing.

Pro:

- Strict Mode and disable cooldown;
- Commitment Mode;
- override cooldown/lockouts;
- behavioral friction precheck;
- earn-access minimum challenge time and bonus minutes;
- accountability presets;
- analytics dashboard;
- weekly report and Focus Score;
- custom challenge prompt.

Note: current code and tests treat per-site access condition setup as free.

### Page Scripts

| Script | Role |
|---|---|
| `popup/popup.js` | Quick add/remove, block current tab, work timer, commitment status, feedback, outcome tap prompt |
| `options/options.js` | Full settings UI, blocklist, per-site reminders/access conditions, Pro paywall, analytics/report tabs |
| `intention-page/script.js` | Standalone pause layer, optional reason/task intent, breathing pause, short challenge |
| `friction-page/script.js` | Full challenge, manual override, Pro precheck, access-condition progress |
| `commitment-page/script.js` | Commitment Mode countdown page |
| `welcome/welcome.js` | Onboarding lifecycle page |
| `whats-new/whats-new.js` | Release notes page actions and update-seen telemetry |

## Testing

Tests run in Node.js through Vitest and `tests/helpers/vm-env.js`. Scripts expose hook globals for pure-function tests:

| Script | Hook |
|---|---|
| `background.js` | `__RESISTGATE_TEST_HOOKS__` |
| `options/options.js` | `__RESISTGATE_OPTIONS_TEST_HOOKS__` |
| `popup/popup.js` | `__RESISTGATE_POPUP_TEST_HOOKS__` |
| `friction-page/script.js` | `__RESISTGATE_FRICTION_TEST_HOOKS__` |
| `intention-page/script.js` | `__RESISTGATE_INTENTION_TEST_HOOKS__` |
| `commitment-page/script.js` | `__RESISTGATE_COMMITMENT_TEST_HOOKS__` |
| `whats-new/whats-new.js` | `__RESISTGATE_WHATSNEW_TEST_HOOKS__` |

Current verified state on 2026-07-12:

- `npm test`: 5 files, 174 tests passing.
- `npm run test:coverage`: passing.
- `background.js`: 88.77% lines/statements, 77.6% branches, 97.11% functions.

`tests/helpers/vm-env.js` exposes `createBillingApiMock()` and `purchaseProInTest()`. Any test that needs a Pro user must
run the real purchase handshake through the mock server — there is no local shortcut to Pro, by design.

`createBillingApiMock()` models the three endpoints in `docs/paddle-activation-api-contract.md`. It is hand-written, so
it can only prove the extension is self-consistent — it cannot prove the server agrees. It once diverged badly: the mock
served endpoints the real website had never implemented, and the whole suite stayed green while checkout was dead in
production. When you change the mock, check the route handlers in the website repo, not just these tests.

Coverage thresholds:

| Scope | Lines | Statements | Functions | Branches |
|---|---:|---:|---:|---:|
| Global covered files | 43% | 43% | 48% | 70% |
| `background.js` | 85% | 85% | 95% | 70% |

For bug fixes, add a regression test that reproduces the failing condition before or alongside the fix.

## Coding Conventions

- 2-space indentation in JS, JSON, and CSS.
- Exception: `popup/popup.js` currently uses 4 spaces. Prefer 2 spaces for new code in that file, but do not reindent unrelated code.
- Use `const`/`let`, never `var`.
- camelCase variables/functions; SCREAMING_SNAKE_CASE module constants; kebab-case folders/files/DOM IDs.
- Extension scripts remain plain globals; do not add top-level imports to runtime scripts.
- Background message handlers should return structured errors instead of swallowing failures.
- New settings must be added to `DEFAULT_SETTINGS`, sanitized, and guarded if Pro-only.

## Release Checklist

1. Bump `manifest.json` and `package.json`.
2. Update `changelog.md`.
3. Run `npm run test:coverage`.
4. Manually smoke-test popup, options, Intention Page, friction page, Commitment Mode, schedule, temporary access, and work-timer access conditions.
5. Tag with `vX.Y.Z` to trigger the release workflow.

## Security Notes

- External activation must stay restricted to trusted website origins.
- Internal messages must never elevate a user to Pro.
- All blocking decisions stay local.
- Document any new network call. Current telemetry surfaces are bundled Sentry diagnostics and allowlisted PostHog lifecycle/funnel events.
- Never log tokens, emails, checkout identifiers, or other sensitive fields.

## Known Issues To Respect

- `pendingOutcomeTap` is partially implemented, but popup responses are not currently persisted because the message payload shape is wrong. See `docs/Implementation.md`.
- `WELCOME_SHOWN_KEY` and `WHATS_NEW_SHOWN_KEY` are unused.
- UI line coverage is much lower than background coverage; add focused tests when touching UI behavior.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
