# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # Install dev dependencies (vitest, coverage-v8)
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Run tests + enforce coverage thresholds
```

**Run a single test file:**
```bash
npx vitest run tests/background.integration.test.js
```

**Run a single test by name:**
```bash
npx vitest run --reporter=verbose -t "opens pricing with the ResistGate product slug"
```

No build step — the extension is plain HTML/CSS/JS loaded directly into Chrome via "Load unpacked". After editing any file, click **Reload** on the extension card in `chrome://extensions`.

## Architecture

ResistGate is a **Manifest V3 Chrome extension** with no bundler. Every JS file runs natively in its own Chrome context.

### Core data flow

1. **`background.js`** (~2250 lines, service worker) is the single source of truth. It owns all `chrome.storage.local` reads/writes and manages `declarativeNetRequest` rules. All other pages communicate with it via `chrome.runtime.sendMessage`.

2. **Message protocol**: pages send `{ action: 'actionName', ...payload }` and receive `{ success: bool, ...result }`. All actions are handled in the `switch` starting at ~line 189. Responses follow `{ success: true, ...payload }` or `{ success: false, error: string }`. Pro-gated failures add `proRequired: true`. Strict Mode cooldown responses add `cooldownPending: true, remainingSeconds`.

3. **Storage keys** (constants at top of `background.js`):
   - `settings` — full settings object (`DEFAULT_SETTINGS` shape)
   - `temporaryAccess` — map of domain → expiry timestamp
   - `analytics` — capped array of events (max 3000)
   - `overrideState` — override cooldown tracking
   - `welcomeShown` — boolean flag
   - `installation` — install metadata
   - `dailyBlockCount` — `{ date, count }` for badge
   - `resistanceCounters` — per-domain resistance counters
   - `workTimer` — `{ todayMinutes, date, running, startedAt }`

   All storage uses `chrome.storage.local` exclusively (never `sync`). Every key has a `sanitize*()` function that normalizes/defaults. Reads/writes go through `getFromStorage()`/`setInStorage()`.

4. **Blocking**: `declarativeNetRequest` dynamic rules redirect blocked URLs to `friction-page/index.html?url=<original>`. Temporary access entries and commitment mode are checked before writing rules — if access is active for a domain or commitment mode is active, its rule is omitted. Rule updates are serialized through `queueRulesUpdate()` — never call `updateBlockingRules()` directly.

5. **Alarms**:
   - `resistgate-block-expire-*` — per-site blocking window expiry
   - `resistgate-access-expire-*` — temporary access window expiry
   - `resistgate-bundle-unlock-*` — temptation bundle unlock timers
   - `resistgate-commitment-expire` — commitment mode auto-expiry
   - `resistgate-daily-reset` — midnight daily badge counter reset

6. **Pro entitlement**: stored as `subscription.tier = 'pro'` in `chrome.storage.local`. `hasProAccess(settings)` is the canonical check — reads `subscription.tier === 'pro'`. `isProUser()` in `options/options.js` and `isPopupProUser()` in `popup/popup.js` are the UI-side equivalents. Activation happens exclusively via `chrome.runtime.onMessageExternal` — the website sends `activateProFromWebsite` from a trusted origin (`orlandoascanio.com`) after checkout; background sets `tier = 'pro'` and opens the options page with `?activation=success`.

### Message actions (background.js switch)

| Action | Pro-gated | Description |
|---|---|---|
| `grantTemporaryAccess` | No | Grant timed bypass for a URL pattern |
| `recordBlockedVisit` | No | Increment visit counter for a domain |
| `getResistanceCount` | No | Get resistance count for a domain |
| `recordAnalyticsEvent` | No | Append a typed analytics event |
| `getSettings` | No | Return full sanitized settings |
| `getManualOverrideStatus` | No | Return current override state |
| `updateSettings` | No | Validate, apply Strict Mode logic, save, re-queue rules |
| `openPricingPage` | No | Open pricing page in new tab |
| `getAnalyticsDashboard` | Yes | Return analytics dashboard data |
| `getWeeklyReport` | Yes | Return weekly report data |
| `activateCommitmentMode` | Yes | Start irrevocable global lockout (1–24 h) |
| `deactivateCommitmentMode` | Yes | Always refuses — commitment cannot end early |
| `getCommitmentModeStatus` | No | Return active status and remaining time |
| `getWorkTimerState` | No | Return work timer state |
| `startWorkTimer` | No | Start work timer |
| `stopWorkTimer` | No | Stop work timer, accumulate minutes |

External: `activateProFromWebsite` (from `orlandoascanio.com` origins only).

### Page scripts

| Script | Lines | Role |
|---|---|---|
| `popup/popup.js` | ~440 | Quick-add/remove blocked sites, view status |
| `options/options.js` | ~1410 | Full settings UI (General, Analytics, Reports tabs), Pro paywall, plan management |
| `friction-page/script.js` | ~994 | Typing challenge, manual override, Pro pre-checks (earn-access, task intent, timed wait) |
| `commitment-page/script.js` | ~128 | Commitment mode status display |
| `welcome/welcome.js` | ~19 | First-install onboarding redirect |

### Pro feature gating

Pro features gated by `hasProAccess(settings)` in background.js:
- **Strict Mode**: Locks settings during active schedule; disable has configurable cooldown
- **Override cooldown**: Threshold-based escalating delay (threshold → lock)
- **Behavioral friction**: Task intent prompt, timed wait, earn-access bonus minutes
- **Analytics dashboard**: 7-day rolling stats, top domains, override trend
- **Weekly discipline report**: Focus score, comparison, feedback line
- **Commitment Mode**: Irrevocable global lockout (1–24 h), no overrides or settings changes
- **Intention Page**: Replace generic friction message with personal goal + optional breathing exercise

### Testing approach

Tests run in Node.js via Vitest using a `vm`-based sandbox (`tests/helpers/vm-env.js`). Each test file:
1. Calls `createChromeMock()` to get a full fake Chrome API with in-memory storage
2. Loads the target script into a `vm.Script` context with `chrome` injected as a global
3. Calls exposed hook objects to invoke internal functions directly

**Test hook globals** (set at bottom of each file under `if (typeof globalThis !== 'undefined')`):
- `background.js` → `__RESISTGATE_TEST_HOOKS__`
- `options/options.js` → `__RESISTGATE_OPTIONS_TEST_HOOKS__`
- `popup/popup.js` → `__RESISTGATE_POPUP_TEST_HOOKS__`
- `friction-page/script.js` → `__RESISTGATE_FRICTION_TEST_HOOKS__`

**Do not remove these blocks.** When adding new logic, expose relevant pure functions through the existing hook object.

**Test suites:**
- `background.integration.test.js` — Service worker message handling and storage lifecycle
- `feature-matrix.test.js` — Pro features, entitlement, analytics, alarms
- `friction-page.flow.test.js` — Typing challenge, manual override, temporary access grant
- `ui.logic.test.js` — Popup and options page settings logic

Prefer integration-style tests (send a message, assert storage/response) over mocking internal functions. Use `beforeEach` for fresh environments. For bug fixes, add regression tests that reproduce the exact failing condition first.

### Coverage thresholds (enforced by CI)

| Scope | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `background.js` | 85% | 85% | 95% | 70% |
| All other covered files | 45% | 45% | 50% | 70% |

### CI/CD (`.github/workflows/ci-cd.yml`)

- **test** job: runs on every push/PR to `main`. `npm ci` → `npm run test:coverage`.
- **release** job: runs on `v*` tags only. Zips extension (excludes `node_modules/`, `tests/`, `.git/`, `.github/`), publishes GitHub Release with auto-generated notes.

To cut a release: `git tag v1.X.Y && git push origin v1.X.Y`

## Coding conventions

- **Indentation**: 2 spaces in all JS, JSON, CSS. Exception: `popup/popup.js` uses 4 spaces — do not widen the gap; use 2 spaces in any new code added there.
- **Variables**: `const`/`let` only; never `var`.
- **Naming**: camelCase for variables/functions; SCREAMING_SNAKE_CASE for module-level constants; kebab-case for folders/files and DOM IDs.
- **Module type**: `package.json` sets `"type": "module"`. Test files use ESM `import`/`export`. Extension scripts run as plain globals (no `import`/`export` at top level).
- **Error handling**: wrap every `case` block in the message switch with its own `try/catch`. Fire-and-forget async calls use `void` prefix. Never swallow errors silently.
- **Defensive defaults**: every `sanitize*()` function returns a full valid object even for `null`/`undefined` input; use `DEFAULT_SETTINGS` as the canonical shape reference.
- **Adding new settings**: add field to `DEFAULT_SETTINGS`, update `sanitizeSettings()` (and relevant nested sanitizer), and add a Pro guard with `hasProAccess(settings)` if Pro-only.

## Release checklist

1. Bump version in both `manifest.json` and `package.json`
2. Update `changelog.md`
3. `npm run test:coverage` — must pass all thresholds
4. Commit `Release vX.Y.Z`, tag, push → CI zips and creates GitHub Release
5. Upload zip to Chrome Web Store

## Security notes

- External message origins validated against `TRUSTED_EXTERNAL_ORIGINS` (`orlandoascanio.com` only) — do not relax.
- Pro activation is exclusively via `activateProFromWebsite` from trusted origins; never trust a locally-sent message to self-elevate to Pro.
- Never log sensitive fields (tokens, email addresses) to `console`.
- All user data stays in `chrome.storage.local`; no external network calls in core logic.
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
