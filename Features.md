# ResistGate Feature Matrix

Last audited: 2026-07-07
Version: 1.3.3

ResistGate is a Chrome website blocker built around intentional friction: users can block distracting domains, pause before access, and earn temporary access through effort instead of reflex.

## Free Features

| Feature | Current implementation | Primary keywords |
|---|---|---|
| Domain blocking | Blocks user-added domains and subdomains through Manifest V3 `declarativeNetRequest` rules. | website blocker, site blocker chrome |
| Popup quick actions | Add/remove domains, block current tab, show up to five blocked sites, open full settings. | quick website blocker, block current tab |
| Schedule blocking | Optional day/time window with overnight schedule support. Outside the active window, rules are not applied. | scheduled website blocker, focus hours |
| Graduated typing challenge | Easy random code, moderate 1-2 sentence prompt, or hard five-paragraph challenge. 100% accuracy required; paste is blocked. | typing challenge, friction browser extension |
| Temporary access | Grants a timed access window, then re-blocks through alarms. | temporary access, timed blocker |
| Manual override | 10-15 second configurable wait before bypassing the challenge. | delayed access, override blocker |
| Intention Page | Standalone pause layer with per-site reminder, optional reason chip, optional breathing pause, and short in-page challenge. New installs enable it by default. | intention setting, mindful browsing |
| Per-site reminders | Each blocked site can store a 200-character reminder shown before access. | personal goal blocker |
| Daily badge | Toolbar badge counts blocked attempts for the current day and resets at midnight. | resistance tracker |
| Resistance counters | Per-domain daily count shown on blocked pages. | discipline tracker |
| Work timer | Popup timer tracks today's focused minutes and persists while running. | focus timer chrome |
| Access conditions | Per-site time-of-day or work-timer condition can let a site load normally after the condition is met. | temptation bundling, earn screen time |
| Feedback links | Popup and options page open the website feedback flow. | user feedback |
| Welcome and What's New pages | Lifecycle pages introduce new users and release changes. | onboarding, release notes |

## Pro Features

| Feature | Current implementation | Primary keywords |
|---|---|---|
| Strict Mode | Locks settings during active focus windows; if schedule is disabled, Strict Mode is globally active. Disable requires a 10-300 second cooldown. | strict website blocker, settings lock |
| Commitment Mode | 1-24 hour lockout across all blocked sites. No override, no challenge, no early disable. | commitment mode, no override blocker |
| Commitment page | Dedicated countdown page shown while Commitment Mode is active. | focus lockout |
| Override cooldown | Progressive delay after repeated manual overrides, then a temporary lockout after threshold. | override cooldown, discipline mode |
| Accountability presets | Light, Balanced, and Strict presets tune Strict Mode and behavioral friction settings. | focus presets |
| Behavioral friction precheck | Task intent input, timed wait, custom challenge prompt, and earn-access rules before the typing challenge. | behavioral friction, intention-based blocking |
| Earn-access challenge time | Requires 30-900 seconds on the challenge before access. Longer challenge effort can grant bonus minutes. | earn access, bonus access |
| Analytics dashboard | 7-day blocked attempts, override trend, top blocked domains, and strict-session minutes. | focus analytics |
| Weekly report | Focus Score, week-over-week trend, top domains, highlights, and risk notes. | weekly focus report, productivity score |
| Pro activation | Website checkout activates Pro through trusted external messaging from `orlandoascanio.com`. | PayPal activation, extension upgrade |

## Technical And Trust Features

| Feature | Current implementation |
|---|---|
| Manifest V3 | Plain MV3 service worker, no bundler or build step. |
| Local-first data | Settings, timers, counters, temporary access, and local analytics use `chrome.storage.local`. |
| Rule serialization | DNR changes go through `queueRulesUpdate()`. |
| Sanitized storage | `sanitize*()` functions normalize persisted settings, analytics, access, timers, bundles, and commitments. |
| Trusted-origin Pro activation | Internal messages cannot self-upgrade to Pro; external activation is origin-checked. |
| Crash telemetry | Extension pages load bundled Sentry diagnostics. |
| Funnel telemetry | Background sends allowlisted PostHog lifecycle events once per installation where applicable. |
| Automated tests | 152 Vitest tests across 5 files; `npm run test:coverage` is green. |

## Known Gaps From Audit

| Priority | Gap | Current status |
|---|---|---|
| P1 | Outcome tap prompt does not persist responses because popup sends the wrong message shape. | Captured in `docs/Implementation.md` and `TODOS.md`. |
| P2 | Pro cancellation/refund downgrade is not handled by this repo. | Website/product decision needed before scale. |
| P2 | UI files have low line coverage compared with `background.js`. | Add focused regression tests as UI behavior changes. |
| P3 | `WELCOME_SHOWN_KEY` and `WHATS_NEW_SHOWN_KEY` are declared but unused. | Remove or wire into lifecycle display logic. |

## Chrome Web Store Keywords

Primary:

- website blocker
- focus extension
- distraction blocker
- productivity tool
- site blocker chrome
- self control extension

Secondary:

- typing challenge blocker
- friction browser extension
- schedule website blocker
- focus timer extension
- discipline tracker chrome
- anti procrastination tool
- temptation bundling extension
- strict mode blocker
- focus analytics chrome

Differentiators to highlight:

- Friction instead of one-click bypasses.
- Free tier includes the blocking engine, reminders, work timer, and access conditions.
- Pro adds hard locks, progressive override consequences, analytics, and weekly reporting.
- Local-first blocking decisions with trusted-origin Pro activation.
