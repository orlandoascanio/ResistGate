# ResistGate Implementation Audit

Last audited: 2026-07-07
Verified version: 1.3.3

This file tracks the current codebase state and the next implementation risks. Last reconciled with the code on 2026-07-12, when billing moved to Paddle and activation became server-verified.

## Verified Commands

```bash
npm test
# 5 test files passed, 152 tests passed

npm run test:coverage
# 5 test files passed, 152 tests passed
```

Coverage from `npm run test:coverage`:

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `background.js` | 88.4% | 76.44% | 96.66% | 88.4% |
| `friction-page/script.js` | 44.07% | 60.74% | 60.37% | 44.07% |
| `options/options.js` | 12.25% | 56.09% | 13.69% | 12.25% |
| `popup/popup.js` | 11.83% | 45.45% | 14.28% | 11.83% |

## Audit Score

| Dimension | Score | Finding |
|---|---:|---|
| Accessibility | 3/4 | Good ARIA/focus coverage on core surfaces; modal focus trap exists; some dynamically rendered controls still need more test coverage. |
| Performance | 3/4 | No build step, lean runtime, DNR rules are serialized. Full rule replacement and repeated storage read-modify-write paths are acceptable at current scale but worth watching. |
| Theming | 3/4 | Shared tokens exist and most surfaces use a coherent purple/neutral system. A few pages duplicate tokens and inline styles remain. |
| Responsive | 3/4 | Layouts include mobile handling and reduced-motion rules, but options/popup visual behavior is lightly covered by automated tests. |
| Anti-patterns | 3/4 | Product tone is specific and disciplined. Some older card-heavy surfaces and decorative gradients remain, but the UI does not read as generic template output. |
| Total | 15/20 | Good, with specific implementation and documentation risks. |

## Current Feature Map

### Free Runtime

- Domain blocking through `declarativeNetRequest`.
- Schedule-based blocking by day and local time window, including overnight windows.
- Graduated typing challenge:
  - Easy: short random code.
  - Moderate: one or two focus sentences.
  - Hard: five focused paragraphs.
- Temporary access windows with auto re-blocking.
- Manual override with configurable 10-15 second delay.
- Popup quick add/remove and "Block this tab's site".
- Options page for blocklist, schedule, challenge level, access window, and per-site reminders.
- Daily resistance badge and per-domain resistance counters.
- Work timer with same-day persistence.
- Per-site access conditions using a time-of-day unlock or required work-timer minutes.
- Intention Page with per-site reminder and optional breathing pause.

### Pro Runtime

- Strict Mode config lock and disable cooldown.
- Commitment Mode 1-24 hour total lockout.
- Override cooldown and temporary lockouts after repeated manual overrides.
- Behavioral friction precheck:
  - task intent input;
  - timed wait;
  - custom challenge prompt;
  - earn-access challenge-time requirement.
- Earn-access bonus minutes for longer challenge sessions.
- Accountability presets.
- 7-day analytics dashboard.
- Weekly report and Focus Score.

## Findings

### P1: Outcome Tap UI Does Not Persist Responses

`background.js` writes `pendingOutcomeTap` when temporary access expires, and `popup/popup.js` renders the "Did your visit serve you?" prompt. The click handler currently sends:

```js
{
  action: 'recordAnalyticsEvent',
  event: { type: 'outcome_tap_response', domain, response }
}
```

The background handler reads `request.type` and `request.domain`, so the response payload is ignored. `recordAnalyticsEvent()` also does not include `outcome_tap_response` in its local Pro analytics allowlist, even though `sanitizeAnalytics()` recognizes the event type.

Impact: users can click the reflection prompt, but the product does not retain the result.

Recommended fix:

- Add a regression test around popup outcome tap response.
- Send `type`, `domain`, and `response` at the top level, or add a dedicated `recordOutcomeTapResponse` action.
- Store a sanitized `response: 'yes' | 'no'` field in analytics.
- Add outcome tap trend handling to the weekly report only after the event is reliably captured.

### P1: Documentation Drift Was Large

The previous `Architecture.md` and `docs/Implementation.md` described a planned Stripe/JWT/license-key system, `chrome.storage.sync`, React/TypeScript types, and an `activateLicense` flow. None of that is the current extension.

Status: fixed in this docs pass.

### P2: Pro Entitlement Is Tied To A Device, With No Account Recovery

Status: **partially fixed on 2026-07-12.** Activation is no longer trust-based — it is a signed
activation token exchanged against a per-install credential, verified by the server, with Paddle as
the payment source of truth. Cancellation and refund downgrade now works through
`/api/entitlement/install-status`, bounded by a 72-hour grace period.

Three things were wrong and are now fixed:

- The website implemented none of the endpoints the extension called, so checkout 404'd and
  entitlement sync had never once run. The server now implements
  `docs/paddle-activation-api-contract.md`.
- The fail-open path had no ceiling: a lapsed subscription kept Pro forever if the client never
  reached the server. It is now bounded at 72 hours.
- A `401`/`403` deleted `installCredential`, permanently unenrolling the customer with no way back.
  The credential now survives rejection.

**What remains a genuine gap:** entitlement lives entirely at the device/install level. There is no
account layer and no email recovery. A user who reinstalls Chrome, wipes the extension, or switches
machines loses `installCredential`, and `install-status` then returns `{ skipped: 'no-credential' }` —
"Recheck access" is a no-op. Their only recovery is emailing support. This will produce tickets and
refund requests, and it lands hardest on Lifetime buyers, who are the most likely to still be around
when they change laptops.

Recommended follow-up, in order:

1. **Email-based reactivation.** The server already keys entitlements by `(product_slug, email)` and
   Paddle supplies the email at webhook time, so the data model already supports it. Add an endpoint
   that takes the purchase email, mints a fresh signed activation token, and mails it — reusing the
   existing `activate-install` path. This turns "email Orlando" into a self-serve flow without
   building accounts.
2. Add a test harness to the website repo. The Lifetime-vs-canceled guards are enforced in SQL and
   are currently unverified by any test.
3. Rate-limit `/api/checkout/session` per device and per IP, as the contract requires.

### P2: Tier Split Around Access Conditions Needs Product Confirmation

Current code and tests treat per-site access condition setup as free:

- `options/options.js` renders the access condition editor inside the general blocklist item.
- `background.js` preserves `temptationBundle` values for free users.
- `tests/feature-matrix.test.js` has a "Free: Temptation Bundling" suite.

Older instructions described setup as Pro-only. The docs now describe the code reality. If setup should be Pro-only, the implementation and tests need to change together.

### P2: UI Coverage Is Thin Outside Background Logic

`background.js` has strong coverage and is the highest-risk file. UI files are much lower:

- `options/options.js`: 12.25% lines.
- `popup/popup.js`: 11.83% lines.
- `friction-page/script.js`: 44.07% lines.

Recommended next tests:

- Popup outcome tap regression.
- Options access-condition save/gating behavior.
- Popup work timer visibility and start/stop behavior.
- Friction page manual override unavailable states.

### P3: Unused Storage Constants

`WELCOME_SHOWN_KEY` and `WHATS_NEW_SHOWN_KEY` are declared in `background.js` but are not read or written.

Recommended fix:

- Remove them if not planned.
- Or wire them into lifecycle-page display logic.

### P3: No-Build-Step Duplication

Domain normalization exists in multiple page scripts. That is acceptable while the extension avoids a bundler, but changes to URL/domain parsing must be copied carefully and covered with tests.

## Manual Smoke Test Checklist

Run these after code changes that affect runtime behavior:

1. Load unpacked extension in Chrome.
2. Add and remove a blocked site from popup and options.
3. Block current tab from popup.
4. Visit a blocked site and confirm routing:
   - Intention Page enabled -> `intention-page/index.html`;
   - Intention Page disabled -> `friction-page/index.html`;
   - Commitment Mode active -> `commitment-page/index.html`.
5. Complete the challenge and confirm temporary access expires.
6. Use manual override and confirm the configured delay.
7. Enable schedule and test inside/outside the blocking window.
8. Set a per-site reminder and confirm it appears on the Intention Page.
9. Set a per-site access condition:
   - time-of-day unlock;
   - work-timer unlock.
10. Start/stop work timer from popup when a work-timer condition exists.
11. Activate Pro from trusted website flow or seeded test state, then verify analytics/report tabs.
12. Activate Commitment Mode and confirm settings/access are locked until expiry.

## Release Gate

Before a release:

```bash
npm run test:coverage
```

Then manually verify the smoke checklist above for any touched surfaces.
