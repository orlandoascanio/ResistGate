# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # Install dev dependencies (vitest, coverage-v8)
npm test                 # Run all 81 tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Run tests + enforce coverage thresholds
```

**Run a single test file:**
```bash
npx vitest run tests/background.integration.test.js
```

No build step — the extension is plain HTML/CSS/JS loaded directly into Chrome via "Load unpacked".

## Architecture

ResistGate is a **Manifest V3 Chrome extension** with no bundler. Every JS file runs natively in its own Chrome context.

### Core data flow

1. **`background.js`** (service worker) is the single source of truth. It owns all `chrome.storage.local` reads/writes and manages `declarativeNetRequest` rules. All other pages communicate with it via `chrome.runtime.sendMessage`.

2. **Message protocol**: pages send `{ action: 'actionName', ...payload }` and receive `{ success: bool, ...result }`. All actions are handled in the `switch` in `background.js:123+`.

3. **Storage keys** (defined as constants at top of `background.js`):
   - `settings` — full settings object (DEFAULT_SETTINGS shape)
   - `temporaryAccess` — map of domain → expiry timestamp
   - `analytics` — capped array of events (max 3000)
   - `overrideState` — override cooldown tracking

4. **Blocking**: rules are written to `declarativeNetRequest` dynamic rules. Blocked URLs redirect to `friction-page/index.html?url=<original>`. Temporary access entries are checked before writing rules — if access is active for a domain, its rule is omitted.

5. **Alarms**: `resistgate-access-expire-*` and `resistgate-block-expire-*` trigger `queueRulesUpdate`. `resistgate-entitlement-refresh` triggers a JWT re-validation against the external entitlement API.

6. **Pro entitlement**: verified via RS256 JWT `licenseKey` stored in settings. The extension calls `externally_connectable` origins (`orlandoascanio.com`, `localhost:3000`) to refresh the license. `isProUser(settings)` is the canonical check — reads `subscription.tier === 'pro'` AND validates expiry.

### Testing approach

Tests run in Node.js via Vitest using a `vm`-based sandbox (`tests/helpers/vm-env.js`). Each test file:
1. Calls `createChromeMock()` to get a full fake Chrome API with in-memory storage
2. Loads the target script into a `vm.Script` context with `chrome` injected as a global
3. Calls the exposed `__testHooks__` object to invoke internal functions directly

**Test hooks** are exposed at the bottom of each JS file under `if (typeof __testHooks__ !== 'undefined')`. Do not remove these blocks.

### Free vs Pro split

Pro features are gated by `isProUser(settings)` in `background.js`. The options page (`options/options.js`) shows a paywall modal and calls `activateProPlan` via message when a license key is entered. The billing backend lives outside this repo at `orlandoascanio.com`.

## Release checklist

1. Bump version in both `manifest.json` and `package.json`
2. Update `changelog.md`
3. `npm run test:coverage` — must pass all thresholds (`background.js`: 85% lines/statements, 95% functions; others: 45%/50%)
4. Commit `Release vX.Y.Z`, tag, push → CI zips and creates GitHub Release
5. Upload zip to Chrome Web Store
