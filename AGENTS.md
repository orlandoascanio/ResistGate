# Repository Guidelines

## Project Structure & Module Organization
This is a Manifest V3 Chrome extension. No build step is required; everything runs as plain ES2020+ JS/HTML/CSS.

```
ResistGate/
├── manifest.json          — extension entry point, permissions, and page wiring
├── background.js          — service worker (rules, alarms, storage, messaging, Pro gating)
├── popup/                 — quick-actions UI (popup.html, popup.css, popup.js)
├── options/               — full settings UI (options.html, options.css, options.js)
├── friction-page/         — redirect challenge page (index.html, style.css, script.js)
├── welcome/               — first-install onboarding page (welcome.html, welcome.css, welcome.js)
├── icons/                 — extension icon assets (16×16, 48×48, 128×128)
├── tests/                 — Vitest test suite
│   ├── helpers/vm-env.js  — VM context loader and chrome mock factory
│   ├── background.integration.test.js
│   ├── feature-matrix.test.js
│   ├── friction-page.flow.test.js
│   └── ui.logic.test.js
├── package.json           — devDependencies: vitest ^2.1.8, @vitest/coverage-v8
├── vitest.config.js       — test config and coverage thresholds
└── .github/workflows/ci-cd.yml — CI (test gate) + release pipeline
```

## Build, Test, and Development Commands
No build step. Install dev dependencies once, then use npm scripts for testing.

```bash
npm install                  # install vitest (dev only; not included in extension zip)
npm test                     # vitest run (single pass, all tests)
npm run test:watch           # vitest watch mode (re-runs on file changes)
npm run test:coverage        # vitest run --coverage (enforces thresholds; required by CI)
```

**Run a single test file:**
```bash
npx vitest run tests/background.integration.test.js
npx vitest run tests/feature-matrix.test.js
npx vitest run tests/friction-page.flow.test.js
npx vitest run tests/ui.logic.test.js
```

**Run a single test by name** (substring match against `it()`/`test()` description):
```bash
npx vitest run --reporter=verbose -t "opens pricing with the ResistGate product slug"
```

To load the extension locally:
1. `open -a "Google Chrome" chrome://extensions/`
2. Enable **Developer mode** → **Load unpacked** → select this folder.
3. After editing any file, click **Reload** on the extension card.

Manual smoke-test flows to verify after any change:
- Add/remove a blocked site; confirm `declarativeNetRequest` rule activates.
- Navigate to a blocked site; confirm redirect to `friction-page/index.html`.
- Complete the typing challenge; confirm temporary access is granted and expires.
- Test schedule-based blocking (enable schedule, adjust system clock or wait).
- Test Strict Mode toggle and cooldown delay.

## Coding Style & Naming Conventions
- **Indentation:** 2 spaces in all JS, JSON, and CSS files.
  - Exception: `popup/popup.js` currently uses 4-space indentation. Do not widen the gap further; prefer 2 spaces in any new code added to that file.
- **Variable declarations:** `const`/`let` only; never `var`.
- **Naming:** camelCase for all variables and functions (e.g., `loadBlockedSites`, `grantTemporaryAccess`).
- **Constants:** SCREAMING_SNAKE_CASE for module-level constants (e.g., `BLOCK_ALARM_PREFIX`, `MAX_ANALYTICS_EVENTS`).
- **Folder/file names:** kebab-case, one folder per feature (e.g., `friction-page/script.js`).
- **DOM IDs:** kebab-case and descriptive (e.g., `new-blocked-site`, `save-settings-btn`).
- **Object literals and callbacks:** keep compact and readable on a single indentation level; avoid deeply nested inline objects.
- **Module type:** `package.json` sets `"type": "module"`. Test files use ESM `import`/`export`. Extension scripts run as plain globals (no `import`/`export` at the top level of `background.js`, `popup.js`, etc.).

## Error Handling Patterns
- **Background async handlers:** wrap every `case` block in the message switch with its own `try/catch`; call `sendResponse({ success: false, error: err.message })` in the `catch`.
- **Null/guard checks first:** validate inputs at the top of a function and return early (e.g., `if (!alarm || !alarm.name) return;`).
- **`void` async calls:** fire-and-forget async invocations (event listeners, alarm handlers) are wrapped with `void` — e.g., `void initializeExtension('onStartup')` — so unhandled-promise lint rules are satisfied without swallowing errors.
- **Never swallow errors silently:** always either send a `{ success: false, error }` response, `console.warn`, or re-throw.
- **Defensive defaults:** every `sanitize*()` function must return a full valid object even when given `null`/`undefined` input; use `DEFAULT_SETTINGS` as the canonical shape reference.

## Default Settings Shape
`DEFAULT_SETTINGS` in `background.js` is the authoritative schema. When adding a new setting field:
1. Add the field with its default value to `DEFAULT_SETTINGS`.
2. Update `sanitizeSettings()` (and the relevant nested sanitizer) to merge and validate the new field.
3. If the field is Pro-only, add a guard in the handler using `hasProAccess(settings)`.

## Architecture & Key Patterns

### Storage
All persistence uses `chrome.storage.local` exclusively (never `chrome.storage.sync`). Five storage domains, each with a dedicated constant key and sanitize function:

| Key constant         | Key string          | Sanitize function            |
|----------------------|---------------------|------------------------------|
| `SETTINGS_KEY`       | `'settings'`        | `sanitizeSettings()`         |
| `TEMP_ACCESS_KEY`    | `'temporaryAccess'` | `sanitizeTemporaryAccess()`  |
| `ANALYTICS_KEY`      | `'analytics'`       | `sanitizeAnalytics()`        |
| `OVERRIDE_STATE_KEY` | `'overrideState'`   | *(inline in initializeExtension)* |
| `WELCOME_SHOWN_KEY`  | `'welcomeShown'`    | *(boolean flag)*             |

All reads and writes go through promise-wrapping utilities `getFromStorage(key)` / `setInStorage(key, value)`. On initialization every domain is read, sanitized, and written back if the value changed.

### Rule Update Serialization
All `declarativeNetRequest` rule changes are serialized through a promise queue:

```js
let updateQueue = Promise.resolve();
function queueRulesUpdate(reason) {
  updateQueue = updateQueue.then(() => updateRules(reason));
  return updateQueue;
}
```

Never call `updateRules()` directly from new code; always go through `queueRulesUpdate()`.

### Message Passing
**Background listener** (`chrome.runtime.onMessage`) uses the `void (async () => { ... })(); return true;` pattern to keep the message channel open for async responses.

**UI pages** (popup, options, friction-page) send messages with callback-style `chrome.runtime.sendMessage(request, callback)`.

**All responses** follow one of two shapes:
```js
{ success: true, ...payload }      // happy path
{ success: false, error: string }  // any failure
```

Special extended shapes:
- Pro-gated actions that fail: `{ success: false, proRequired: true, error: '...' }`
- Strict Mode cooldown pending: `{ success: false, cooldownPending: true, remainingSeconds: N, error: '...' }`

### Internal Message Actions (background → handled by switch)
| Action | Description |
|---|---|
| `grantTemporaryAccess` | Grant timed bypass for a URL pattern |
| `recordBlockedVisit` | Increment visit counter for a domain |
| `recordAnalyticsEvent` | Append a typed analytics event |
| `getSettings` | Return full sanitized settings object |
| `getManualOverrideStatus` | Return current override state |
| `updateSettings` | Validate, apply Strict Mode logic, save, re-queue rules |
| `openPricingPage` | Open `orlandoascanio.com/en/pricing` in a new tab |
| `getAnalyticsDashboard` | Return analytics data (Pro only) |
| `getWeeklyReport` | Return weekly report data (Pro only) |

### External Message Actions (`chrome.runtime.onMessageExternal`)
| Action | Trusted origins | Description |
|---|---|---|
| `activateProFromWebsite` | `orlandoascanio.com` (www and apex) | Activate Pro via website activation token |

### Alarms
| Alarm name prefix / name | Purpose |
|---|---|
| `resistgate-block-expire-*` | Per-site blocking window expiry |
| `resistgate-access-expire-*` | Temporary access window expiry |
| `resistgate-bundle-unlock-*` | Temptation bundle unlock timers (time-of-day condition) |
| `resistgate-commitment-expire` | Commitment mode auto-expiry |
| `resistgate-daily-reset` | Midnight daily badge counter reset |

### Pro Gating
- `hasProAccess(settings)` in `background.js`: checks `settings.subscription.tier === 'pro'`.
- `isProUser()` in `options/options.js`: same logic against locally loaded settings.
- `isPopupProUser(settings)` in `popup/popup.js`: same logic for popup context.
- All Pro-only features must guard with one of these before executing.

## Testing Guidelines
The project has a full automated test suite using **Vitest 2.1.8**. All tests must pass (including coverage thresholds) before a PR is merged — CI enforces this.

### Test Structure
Tests live in `tests/` and are loaded by Vitest via `tests/**/*.test.js`.

Scripts under test are executed inside Node.js VM contexts using `loadScriptInVm(relativeScriptPath, globals)` from `tests/helpers/vm-env.js`. This lets each test get a fresh, isolated execution context.

`createChromeMock()` provides a fully functional in-memory `chrome` stub (storage, alarms, tabs, runtime messaging). Use `env.sendMessage({ action: '...' })` to exercise background logic end-to-end.

### Test Hook Pattern
Each script exposes internal functions for unit-level testing via a `globalThis` hook object, set at the bottom of the file inside an `if (typeof globalThis !== 'undefined')` guard:

| Script | Hook global |
|---|---|
| `background.js` | `__RESISTGATE_TEST_HOOKS__` |
| `options/options.js` | `__RESISTGATE_OPTIONS_TEST_HOOKS__` |
| `popup/popup.js` | `__RESISTGATE_POPUP_TEST_HOOKS__` |
| `friction-page/script.js` | `__RESISTGATE_FRICTION_TEST_HOOKS__` |

When adding new logic to any of these files, expose the relevant pure functions through the existing hook object.

### Coverage Thresholds (enforced by `vitest.config.js`)
| Scope | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `background.js` | 85% | 85% | 95% | 70% |
| All other covered files | 45% | 45% | 50% | 70% |

Run `npm run test:coverage` locally before pushing to confirm thresholds pass.

### Writing New Tests
- Prefer integration-style tests (send a message, assert the storage or response) over mocking internal functions.
- Use `beforeEach` to create a fresh `createChromeMock()` + `loadScriptInVm()` environment for each test.
- For pure-function tests, access functions via the appropriate `__RESISTGATE_*_TEST_HOOKS__` object from the VM context.
- For bug fixes, add a regression test that reproduces the exact failing condition before fixing it.

## CI/CD Pipeline (`.github/workflows/ci-cd.yml`)
- **Triggers:** push to `main`, pull requests targeting `main`, manual `workflow_dispatch`, and any `v*` tag.
- **`test` job:** runs on every trigger. Installs dependencies (`npm ci`), then runs `npm run test:coverage`. All PRs must pass this job.
- **`release` job:** runs only on `v*` tags, after `test` passes. Zips the extension (excluding `node_modules/`, `tests/`, `.git/`, `.github/`), uploads as a build artifact, and publishes a GitHub Release with auto-generated notes.

To cut a release: create and push a tag matching `v*` (e.g., `git tag v1.2.0 && git push origin v1.2.0`).

## Commit & Pull Request Guidelines
- Use imperative, scoped commit messages (e.g., `Improve blocking rule refresh logic`, `Fix analytics event deduplication`).
- Keep commits single-purpose; avoid mixing UI changes with background or storage behavior unless they are logically inseparable.
- PRs must include:
  - **Summary** — what changed and why.
  - **Manual test steps** — exact repro or verification steps.
  - **Screenshots or GIFs** for any UI change in `popup/`, `options/`, `friction-page/`, or `welcome/`.
  - **Regression test** for bug fixes (reference the new test file and test name).
- Link related issues when applicable.

## Security & Configuration Tips
- Request only the minimum necessary permissions in `manifest.json`.
- All user data stays in `chrome.storage.local`; do not introduce external network calls unless the feature explicitly requires them (and document the dependency clearly).
- External message origins are validated against `TRUSTED_EXTERNAL_ORIGINS` (`orlandoascanio.com`); do not relax this check.
- Pro activation is exclusively via `activateProFromWebsite` from a trusted external origin — never accept Pro elevation from an internal (`sendMessage`) call.
- Never log sensitive fields (tokens, email addresses) to `console`.
