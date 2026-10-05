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
npx vitest run --reporter=verbose -t "makes no network requests across a full session"
```

No build step. The extension is plain HTML/CSS/JS loaded directly into Chrome with "Load unpacked". After editing any extension file, reload the extension card in `chrome://extensions`.

## Architecture

ResistGate is a Manifest V3 Chrome extension with no bundler. Every script runs as a plain global in its Chrome page/service-worker context.

### Core Flow

1. `background.js` is the source of truth. It owns `chrome.storage.local`, storage sanitizers, `declarativeNetRequest` session rules, alarms, local analytics/report aggregation, and message handling.
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
| `analytics` | Local analytics events for Progress and Weekly Review, capped at 3,000 |
| `overrideState` | Override cooldown timestamps and lock window |
| `dailyBlockCount` | Toolbar badge count for the current day |
| `resistanceCounters` | Per-domain daily counters |
| `workTimer` | Current-day focus timer state |
| `pendingOutcomeTap` | Expired-access reflection prompt for popup |
| `gateOutcomes` | Today's gate outcomes (`resisted` / `accessed`), capped at 100; drives the "gone back N of the last M times" streak line |
| `gateReminders` | Pending "remind me in 10 min" destinations, keyed by blocked domain |
| `welcomeShown` | Declared but currently unused |

Storage reads/writes in the service worker go through `getFromStorage()`, `setInStorage()`, and `removeFromStorage()`.

`installation` is a legacy key from the paid tier (device ID, install credential, entitlement). It is deleted on every
startup along with the old `resistgate-entitlement-sync` alarm, so upgraded installs keep no billing or telemetry state.
`settings.subscription` is likewise dropped by `sanitizeSettings()`.

### Rule Updates

Never call `updateBlockingRules()` directly from new code. Use:

```js
queueRulesUpdate(reason)
```

This serializes DNR mutations and prevents overlapping rule refreshes.

### Message Actions

| Action | Description |
|---|---|
| `grantTemporaryAccess` | Grant timed bypass for a domain |
| `getActiveTemporaryAccess` | List active access windows for blocked domains |
| `revokeTemporaryAccess` | Re-block a domain immediately |
| `recordBlockedVisit` | Increment badge/resistance counters and log a local analytics event |
| `getResistanceCount` | Return today's count for a domain |
| `recordGateOutcome` | Record a resisted exit from a gate page; `reversesAccess` turns the last grant for that domain into a resisted visit ("Actually, never mind") |
| `getGateOutcomeSummary` | Return `{ total, resisted }` over today's last five gate outcomes |
| `scheduleGateReminder` | Validate a blocked http(s) destination, record a resisted exit, and reopen it in a new tab after 10 minutes |
| `getTodaySummary` | Return today's blocked-attempt total and top three domains for the options page Today strip |
| `recordAnalyticsEvent` | Log selected local analytics events |
| `getSettings` | Return sanitized settings |
| `getManualOverrideStatus` | Return manual override delay/lock state |
| `updateSettings` | Sanitize, enforce Strict/Commitment locks, save, refresh rules |
| `getAnalyticsDashboard` | Return 7-day analytics dashboard |
| `getWeeklyReport` | Return weekly Focus Score report, hour-of-day urge histogram, per-site hold rates, and one applyable recommendation |
| `activateCommitmentMode` | Start 1-24h lockout |
| `deactivateCommitmentMode` | Always refuses: Commitment cannot end early |
| `getWorkTimerState` | Return work timer state |
| `startWorkTimer` | Start work timer |
| `stopWorkTimer` | Stop timer and accumulate minutes |
| `getCommitmentModeStatus` | Return lockout status/countdown |
| `getWelcomeState` | Return sanitized settings plus the domains that currently have a blocking rule |
| `saveWelcomeSetup` | Add one welcome-flow site and set the challenge level |
| `saveWelcomeReminder` | Save a per-site reminder from the welcome flow |
| `openFeedbackPage` | Open website feedback page |
| `openReviewPage` | Open the Chrome Web Store review page for this extension |

External messages are accepted only from `https://www.orlandoascanio.com` or `https://orlandoascanio.com`, and only for the welcome bridge: `getOnboardingState` and `openOnboarding`. They cannot change settings. Billing actions (`activateProFromWebsite`, `getActivationState`) are gone.

### Features

Every feature is free. There is no tier, entitlement, or paywall (removed in 2.0.0). Settings for the stronger locks
still live under `settings.proFeatures` so that existing installs load unchanged; the name is historical.

- Domain blocking, schedules, graduated typing challenges, temporary access, manual override (10-15s base delay).
- Daily badge, per-site resistance counters, work timer, per-site time/work access conditions.
- Intention Page with per-site reminders and optional breathing.
- Strict Mode and its disable cooldown; Commitment Mode; override cooldown/lockouts (on by default).
- Behavioral friction precheck, earn-access minimum challenge time and bonus minutes, accountability presets.
- Custom challenge prompt and custom challenge phrase (`proFeatures.customChallengePhrase`), which replaces the built-in
  challenge text with the user's own line on both the friction page and the Intention Page.
- Progress dashboard, Weekly Review, and Focus Score, including the urge-timing histogram, per-site hold rates, and the
  "Do this next" recommendation. The recommendation only ever *widens* an existing schedule window — a schedule
  narrows blocking to its hours, so recommending that a user enable one would quietly reduce their protection.
  See `buildWeeklyRecommendation()` in `background.js`.

### Page Scripts

| Script | Role |
|---|---|
| `popup/popup.js` | Quick add/remove, block current tab, work timer, commitment status, feedback, outcome tap prompt |
| `options/options.js` | Full settings UI (autosaves; no Save button), blocklist with bulk add/filter, per-site reminders/access conditions, settings export/import, Stronger Locks, analytics/report tabs |
| `intention-page/script.js` | Standalone pause layer, optional reason/task intent, breathing pause, short challenge |
| `friction-page/script.js` | Full challenge with live mismatch highlighting, access-window picker (shorter window = lighter challenge), manual override with cancel, behavioral precheck, access-condition progress, exits on every step |
| `commitment-page/script.js` | Commitment Mode countdown page |
| `welcome/welcome.js` | Interactive setup flow. Install still opens the website; the site can open this page |

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

Current verified state on 2026-10-04:

- `npm test`: 7 files, 232 tests passing.
- `npm run test:coverage`: passing.
- `background.js`: 92.62% lines/statements, 82.51% branches, 99% functions.

The background suites load `background.js` with a recording `fetch` that throws. Any new network call fails the
"makes no network requests" test, which is deliberate: if one is ever needed, it is a product decision, not a detail.

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
- New settings must be added to `DEFAULT_SETTINGS` and sanitized.

## Release Checklist

1. Bump `manifest.json` and `package.json`.
2. Update `changelog.md`, and add the release to `client/app/lib/resistgate-releases.ts` in the website repo
   (`Profesional-Portfolio`): it feeds both the website changelog and the post-update page. Only a new minor or
   major version opens that page after an update (`isMeaningfulUpdate()` in `background.js`); same-version reloads,
   downgrades, and patch releases do not.
3. Run `npm run test:coverage`.
4. Manually smoke-test popup, options, Intention Page, friction page, Commitment Mode, schedule, temporary access, and work-timer access conditions.
5. Tag with `vX.Y.Z` to trigger the release workflow.

## Security Notes

- All blocking decisions stay local.
- The extension makes no network requests and the extension-page CSP allows no `connect-src`. Adding a network call
  is a product decision: document it in the README's Privacy section and the changelog.
- Never log tokens, emails, checkout identifiers, or other sensitive fields.

## Options Page Autosave

Settings save ~600ms after a change (`scheduleAutosave()` → `saveSettings()`); saves never overlap. While an edit is
pending or invalid, `handleSettingsStorageChange()` refreshes only non-form parts (`renderSettingsExceptForm()`),
and `setInputValue()` never writes to the focused field. New inputs in `#panel-general` / `#panel-pro` are wired
automatically by `initAutosave()`; add an id to `NON_SETTINGS_INPUT_IDS` if an input must not trigger a save.

Settings export/import (`buildSettingsExport()` / `mergeImportedSettings()`) drops a leftover `subscription`
and never carries live lock state (active Commitment Mode, pending Strict Mode disable).

## Known Issues To Respect

- `pendingOutcomeTap` is partially implemented, but popup responses are not currently persisted because the message payload shape is wrong.
- `WELCOME_SHOWN_KEY` is unused.
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
