# ResistGate Architecture

Last audited: 2026-07-07
Current extension version: 1.3.3

ResistGate is a Manifest V3 Chrome extension with no build step. The runtime is plain HTML, CSS, and ES2020+ JavaScript loaded directly by Chrome.

## System Model

ResistGate has four runtime layers:

1. `background.js`
   - Service worker and source of truth.
   - Owns storage sanitation, `declarativeNetRequest` rule generation, alarms, analytics aggregation, Pro gating, external activation, and message handlers.

2. Extension pages
   - `popup/`: quick add/remove, block current tab, work timer, commitment status, feedback, outcome tap prompt.
   - `options/`: blocklist, per-site reminders, access conditions, schedule, Pro paywall, analytics, weekly report, stronger locks.
   - `intention-page/`: standalone pause layer and short challenge when the Intention Page is enabled.
   - `friction-page/`: fallback/full challenge page, manual override, Pro behavioral prechecks, temptation bundle progress.
   - `commitment-page/`: lockout page shown while Commitment Mode is active.
   - `welcome/`: lifecycle/support page.

3. Local storage
   - All user and runtime data uses `chrome.storage.local`.
   - No `chrome.storage.sync` is used.

4. External product site
   - The extension opens pricing and feedback pages on `orlandoascanio.com`.
   - Pro activation is accepted only through trusted external messaging from `https://www.orlandoascanio.com` or `https://orlandoascanio.com`.

## Manifest Surface

`manifest.json` declares:

| Area | Current value |
|---|---|
| Manifest version | 3 |
| Background | `background.js` service worker |
| Popup | `popup/popup.html` |
| Options | `options/options.html` |
| Permissions | `declarativeNetRequest`, `storage`, `alarms`, `tabs` |
| Host permissions | `<all_urls>` |
| Web resources | `welcome/`, `commitment-page/`, `intention-page/` |
| External origins | localhost dev URL plus website matches in manifest; handler only trusts the website origins |
| CSP connect-src | Sentry and PostHog ingest endpoints |

The broad host permission is what allows DNR rules to match user-configured domains. Keep it documented because it will be visible during Chrome Web Store review.

## Storage Model

`background.js` defines the storage constants and normalizes persisted data on startup.

| Key constant | Storage key | Purpose | Sanitizer |
|---|---|---|---|
| `SETTINGS_KEY` | `settings` | Blocklist, schedule, challenge settings, subscription tier, Pro feature config | `sanitizeSettings()` |
| `TEMP_ACCESS_KEY` | `temporaryAccess` | Per-domain temporary access grants | `sanitizeTemporaryAccess()` |
| `ANALYTICS_KEY` | `analytics` | Pro analytics event log, capped at 3,000 events | `sanitizeAnalytics()` |
| `OVERRIDE_STATE_KEY` | `overrideState` | Manual override timestamps and lock window | `sanitizeOverrideState()` |
| `INSTALLATION_KEY` | `installation` | Opaque device ID, first-seen timestamp, PostHog dedupe flags | `sanitizeInstallation()` |
| `DAILY_COUNT_KEY` | `dailyBlockCount` | Toolbar badge count for the current day | inline daily reset logic |
| `RESISTANCE_COUNTERS_KEY` | `resistanceCounters` | Per-domain daily resistance counts | inline counter logic |
| `WORK_TIMER_KEY` | `workTimer` | Current-day work timer state | `sanitizeWorkTimer()` |
| `PENDING_OUTCOME_TAP_KEY` | `pendingOutcomeTap` | Recent expired access prompt for popup reflection | `sanitizePendingOutcomeTap()` exists, but startup does not currently normalize this key |
| `WELCOME_SHOWN_KEY` | `welcomeShown` | Declared but currently unused | none |

All storage reads and writes go through `getFromStorage()` and `setInStorage()`, except a few UI-side reads for popup-only ephemeral prompts.

## Rule Pipeline

Rule updates are serialized through `queueRulesUpdate(reason)`. New code should not call `updateBlockingRules()` directly.

```js
let updateQueue = Promise.resolve();
function queueRulesUpdate(reason) {
  updateQueue = updateQueue
    .then(() => updateBlockingRules(reason))
    .catch((error) => {
      console.error('Rule update failed:', error);
    });

  return updateQueue;
}
```

`updateBlockingRules()`:

1. Reads sanitized settings and temporary access.
2. Removes expired blocklist and access entries.
3. Syncs access/block expiry alarms and time-of-day bundle alarms.
4. Reads work timer state.
5. Builds session DNR rules with `buildBlockingRules()`.
6. Replaces existing session rules.

`buildBlockingRules()` skips rules when:

- the extension is disabled;
- schedule blocking is enabled and the current local time is outside the configured window;
- the domain already has active temporary access;
- a per-site access condition is enabled and already satisfied.

When a domain remains blocked, the redirect target is:

| Condition | Redirect |
|---|---|
| Commitment Mode active | `commitment-page/index.html` |
| Intention Page enabled | `intention-page/index.html` |
| Otherwise | `friction-page/index.html` |

Redirects pass `originalUrl` as a query parameter.

## Message API

Internal pages send `{ action: '...' }` through `chrome.runtime.sendMessage`. Successful responses use `{ success: true, ...payload }`. Failures use `{ success: false, error }`, with optional `proRequired` or `cooldownPending`.

| Action | Pro-gated | Purpose |
|---|---:|---|
| `grantTemporaryAccess` | No | Grant timed access after challenge or manual override |
| `recordBlockedVisit` | No | Increment badge and resistance counters; logs Pro analytics |
| `getResistanceCount` | No | Return today's per-domain resistance count |
| `recordAnalyticsEvent` | Partially | Track allowed PostHog events for all users; store selected local analytics for Pro |
| `getSettings` | No | Return sanitized settings |
| `getManualOverrideStatus` | No | Return current manual override delay/lock state |
| `updateSettings` | No | Sanitize, enforce tier guards, apply Strict/Commitment locks, save, refresh rules |
| `getAnalyticsDashboard` | Yes | Return 7-day dashboard data |
| `getWeeklyReport` | Yes | Return weekly Focus Score report |
| `activateCommitmentMode` | Yes | Start 1-24 hour lockout |
| `deactivateCommitmentMode` | Always refuses | Commitment Mode cannot end early |
| `getWorkTimerState` | No | Return current-day timer state |
| `startWorkTimer` | No | Start focus timer |
| `stopWorkTimer` | No | Stop focus timer and accumulate minutes |
| `getCommitmentModeStatus` | No | Return lockout status and remaining time |
| `openPricingPage` | No | Open website pricing page |
| `openFeedbackPage` | No | Open website feedback page |
| `trackPosthogEvent` | No | Track an allowlisted PostHog event once per installation |

External messages are handled by `chrome.runtime.onMessageExternal`. The only supported external action is `activateProFromWebsite`, and it is accepted only from trusted website origins.

## Alarms

| Alarm name | Purpose |
|---|---|
| `resistgate-block-expire-*` | Refresh rules after a time-limited block expires |
| `resistgate-access-expire-*` | Refresh rules after temporary access expires and write pending outcome tap state |
| `resistgate-bundle-unlock-*` | Refresh rules when a time-of-day access condition becomes true |
| `resistgate-commitment-expire` | End Commitment Mode and refresh rules |
| `resistgate-daily-reset` | Reset badge count and work timer at local midnight |

## Tier Model

The canonical runtime check is `hasProAccess(settings)`, which returns `settings.subscription.tier === 'pro'`.

Free code paths currently include:

- domain blocking;
- schedule-based blocking;
- graduated typing challenges;
- temporary access;
- manual override with 10-15 second delay;
- popup quick actions;
- options page blocklist/settings;
- daily badge and per-site counters;
- work timer;
- per-site access conditions using time-of-day or work timer;
- Intention Page with per-site reminders and optional breathing.

Pro code paths currently include:

- Strict Mode and disable cooldown;
- Commitment Mode;
- override cooldown and lockouts;
- behavioral friction precheck;
- earn-access minimum challenge time and bonus minutes;
- accountability presets;
- analytics dashboard;
- weekly report and Focus Score;
- custom challenge prompt.

Note: older docs referred to per-site access condition setup as Pro-only. Current code and tests treat temptation bundle setup as free.

## Analytics And Telemetry

Local analytics:

- stored in `chrome.storage.local` under `analytics`;
- only populated for Pro users in most code paths;
- capped at 3,000 events;
- used for dashboard and weekly report.

PostHog lifecycle telemetry:

- uses an opaque generated device ID from `installation.deviceId`;
- tracks allowlisted funnel events once per installation where appropriate;
- sends only sanitized primitive properties;
- uses `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` from `background.js`.

Sentry:

- bundled under `vendor/`;
- loaded by extension pages for crash/error diagnostics.

## Known Architecture Risks

- `pendingOutcomeTap` is written by the access-expiry alarm and rendered by the popup, but the popup sends the wrong shape to `recordAnalyticsEvent`, so the response is not currently persisted.
- `WELCOME_SHOWN_KEY` is declared but unused.
- Several UI scripts duplicate domain normalization instead of sharing a module. This is a tradeoff of the no-build-step architecture.
- `options/options.js`, `popup/popup.js`, and `friction-page/script.js` have low line coverage even though background coverage meets the stricter threshold.
- `<all_urls>` is broad and should be justified in Chrome Web Store copy.

## Testing

The suite uses Vitest 2.1.9 and Node VM contexts through `tests/helpers/vm-env.js`.

Current verified state on 2026-07-07:

```bash
npm test
# 5 test files, 152 tests passing

npm run test:coverage
# background.js: 88.4% lines/statements, 76.44% branches, 96.66% functions
```

Coverage thresholds live in `vitest.config.js`:

| Scope | Lines | Statements | Functions | Branches |
|---|---:|---:|---:|---:|
| Global covered files | 43% | 43% | 48% | 70% |
| `background.js` | 85% | 85% | 95% | 70% |
