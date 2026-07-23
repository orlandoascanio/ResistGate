# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.4.3] - 2026-07-23

This release gives you more control after opening a blocked site, makes it easier to support ResistGate, and keeps the extension’s intended look consistent everywhere.

### Added (Free)
- **End a distracting visit early.** The popup now shows every blocked site that currently has temporary access, along with a live countdown. Select **Re-block now** to close that access window immediately instead of waiting for it to expire.
- **Leave a review without hunting for the store page.** The popup and Options now include a **Rate ResistGate ⭐** button that opens the Chrome Web Store review screen directly. If ResistGate has helped you, you can leave a review just like the amazing Omar did. Thank you, Omar.

### Fixed
- **The brand typeface silently fell back on every page.** Popup, the friction page, and Commitment Mode fetched Plus Jakarta Sans from `fonts.googleapis.com`; if that request failed (offline, a blocked host, a corporate network) the page rendered in the OS default font with no error and no indication anything was wrong. Options, the Intention Page, and What's New never fetched it at all — `--font-family-base` named the font, but nothing ever loaded it, so those pages were silently on the system stack from the start. The welcome page had the same problem with a second, off-brand font (`Inter`) that was never loaded anywhere. All extension pages now self-host Plus Jakarta Sans (`shared/fonts.css`, ~64KB total) and load nothing from Google at page render — one consistent typeface, no network dependency, no undocumented external call.

---

## [1.4.1] - 2026-07-18

Entitlement hardening, the server finally implements the activation contract, and Pro users can write their own challenge phrase.

### Fixed
- **Checkout could never succeed.** The extension called `/api/checkout/session` and `/api/entitlement/install-status`; the website implemented neither, and was still running PayPal. Clicking Upgrade returned a 404 and never opened the pricing page. The website now implements the contract in `docs/paddle-activation-api-contract.md`, and PayPal is gone.
- **Entitlement sync had never run.** `install-status` was a 404, which fell through to the transient-failure branch on every call. Pro was therefore never revoked for anyone, under any circumstances — the fail-open path was not a fallback, it was the only path.
- **A rejected install could never recover.** A `401`/`403` from the server deleted `installCredential`, which is the only handle a browser has back to its own purchase. One bad response permanently unenrolled the customer, with no self-serve way back — worst of all for Lifetime buyers. The credential now survives rejection: access is withdrawn, the ability to recover is not, and a later successful sync restores Pro with no user action and no second payment.

### Added
- **Write your own challenge phrase (Pro).** Replaces the built-in challenge text with a line the user wrote — a promise in their own words, typed out before a blocked site opens. Enabled from the Pro tab. The phrase is typed once regardless of challenge level, on both the friction page and the Intention Page. It is normalized to a single line, capped at 200 characters, and cannot be enabled without a phrase to type. The tier is checked where the phrase is read, not only where it is saved, so a lapsed subscription falls back to the built-in banks rather than honouring a stale phrase — and Strict Mode blocks edits to it mid-window, since weakening the phrase to `a` would otherwise be an open gate.
- **Bounded grace period.** A verified grant is trusted for 72 hours without server confirmation. Transient failures still preserve the last verified state, but no longer indefinitely: past the ceiling, the next failed sync withdraws Pro and marks the entitlement stale, and the options page asks the user to reconnect. Previously a subscription that lapsed at Paddle kept Pro forever as long as the client never reached the server again.
- **Lifetime is structurally protected from subscription events.** Enforced in SQL rather than in a branch that can be forgotten: lifetime rows are excluded from subscription-lifecycle updates, and cannot be set to `pro = false` without an explicit refund flag. A canceled or paused subscription cannot revoke a purchase made outright.
- Regression tests for all four entitlement behaviours above, plus the custom challenge phrase (182 tests, up from 171).

### Notes
- `db/006_paddle_migration.sql` must be applied in the website repo before the new code runs.
- The Paddle flow has been typechecked and built, but **not yet exercised against real Paddle**.

---

## [1.4.0] - 2026-07-12

Buying Pro is now one continuous action. Pick a plan in the extension, pay on the website, and this browser unlocks itself — no license key, no account, no copy-paste.

### Added
- **Instant activation after checkout**: The extension creates a server-side checkout session, hands the pricing page only an opaque checkout ID, and unlocks Pro once the server verifies a short-lived signed activation token against a credential that never leaves this install.
- **In-extension plan picker**: Monthly, Yearly, and Lifetime are now explicit choices in the upgrade dialog. The selected plan is bound to the checkout session, so the website cannot silently switch prices mid-session. Generic upgrade entry points default to Yearly.
- **Recheck access**: If the website-to-extension handoff is interrupted, the Pro tab offers a manual recheck instead of asking the user to pay again.
- **Entitlement sync**: Startup and a six-hour alarm reconcile Pro with the server. A canceled or paused subscription revokes Pro; a network failure preserves the last verified state.

### Changed
- **Activation is no longer trust-on-origin**: `activateProFromWebsite` now requires a signed activation token and a server exchange. A message from a trusted origin can no longer grant Pro on its own.
- The extension can no longer be messaged by `localhost`; only the two production website origins remain.
- **Options redesign**: Refreshed settings and plan comparison, moved blocked-site controls into an editor dialog, clarified helper text, and replaced the tab icons with SVGs.
- **Dark-mode action polish**: Improved primary-action contrast across the popup, friction, intention, welcome, What’s New, and options pages.

### Security
- Device ID, extension ID, and the install credential never enter the checkout URL or Paddle custom data.
- Only an explicit `401`/`403` from the server clears local billing credentials. Outages, rate limits, and timeouts leave a paying user's Pro intact.

---

## [1.3.0] - 2026-04-29

This release makes your personal goals impossible to ignore — and the options page easier to navigate. Every pause now starts with remembering why you blocked the site in the first place.

### Added (Free)
- **Intention Page**: Personal goals and optional 4-7-8 breathing are now available to all users, not just Pro. New installs get the Intention Page enabled by default. The blocklist editor in options now supports inline goal setting per site.
- **Welcome page redesign**: Fresh visual design with better information architecture. New users get a clearer understanding of the core value proposition in less time.

### Changed
- **Friction Page Redesign**: Full visual overhaul of the blocked-site challenge page. Progress stepper now clearly shows which phase the user is in (Pause → Prepare → Challenge → Access). The breathing exercise uses a refined ring animation. The challenge section was restructured for better visual hierarchy. Intentional design language throughout.
- **Options page redesign**: Reorganized panel structure, cleaner form layouts, improved accessibility for all interactive elements, and better visual hierarchy throughout.
- **Pro positioning**: The paywall now emphasizes stronger behavioral friction instead of soft intention reminders.
- **Earn Access UI**: Redesigned the temptation bundling configuration panel in the options page:
  - Removed AI-generated emoji from badges; badge now displays purely typographic status indicators
  - Removed dashed-border panel in favor of cleaner visual hierarchy with chevron expand/collapse indicator and `aria-expanded` accessibility support
  - Grouped condition type and time selectors in a 2-column row layout for tighter composition
  - Rewrote help text with benefit-driven copy ("Earn bonus access by completing longer challenges") and standardized terminology ("access condition", "Access after", "manual overrides")
  - Improved badge hover transitions and added `focus-visible` outline for keyboard accessibility
  - Badge-on colors now use design tokens (`--ok-bg`, `--ok`, `--ok-border`) instead of hard-coded green values

---

## [1.2.0] - 2026-04-27

This release makes ResistGate feel less static and more usable day to day. It adds feedback links, tightens the Pro boundary, refreshes onboarding, and gives people a softer way to build discipline.

### Added (Free)
- **Feedback links**: A small `Help improve ResistGate` button now lives in the popup and options page. It opens a dedicated feedback survey that sends directly into the site dashboard, so improvements can come from real user input.
- **Graduated Challenges**: Free users can now pick the level of friction that fits the moment, with a wider prompt bank so the hard mode does not feel repetitive.
  - **Easy**: short character sequence
  - **Moderate**: one or two sentences
  - **Hard**: the original five-paragraph challenge, now pulled from a larger set of unique paragraphs

### Fixed
- **Pro settings access**: Fixed the bug that let free users reach Pro-only settings. The options page now keeps Pro controls behind entitlement.

### Changed
- **Welcome page redesign**: Reworked the onboarding/welcome experience so first-time users get a cleaner, less stale introduction to ResistGate.
- **Feedback flow**: The new survey writes into the feedback dashboard and records structured answers for easier review.

---

## [1.1.0] - 2026-04-15

This update is about earning access — not just blocking it. Every feature here is backed by behavioral science. Not productivity theater.

### Added (Free)
- **Temptation Bundling**: Unlock distracting sites — after you've earned them. Pair the sites you want with the work you need to do. Set a work window or a specific time. ResistGate opens the door when you've held up your end.
- **Focus Timer**: Work minutes unlock bundled sites. A simple timer that tracks focused time. Hit your target — your reward sites unlock automatically. No manual toggling. No negotiating with yourself.

### Added (Pro)
- **Commitment Mode**: No escape. That's the point. Lock yourself in for 1 to 24 hours. Access blocked. Settings frozen. You can't disable it early — and that's exactly why it works. For the days when you know future-you will try to cheat.
- **Intention Page**: Pause before you spiral. Before a blocked site loads, ResistGate shows you why you set this block in the first place — your own words, a breathing reset, your goals. Most of the time, that's enough.
- **Commitment Page** (`commitment-page/`): Dedicated full-screen lockout page shown instead of the friction challenge when Commitment Mode is active. Displays a live countdown to expiry and a motivational lock screen.
- **Popup Commitment Mode**: Live countdown when Commitment Mode is active. One-click **Activate** button (2-hour default) for Pro users.

### Changed
- **Friction Page UI**: Intention/Pause zone visually separated from the typing challenge. Personal goal and breathing exercise grouped above a distinct challenge card.
- **Options Page Polish**:
  - Refined color palette with deeper purple primary and warmer neutrals
  - Improved typography hierarchy with tabular numbers and fluid heading sizing
  - Enhanced tab navigation with contained design and subtle active states
  - Richer data visualizations with gradient bar fills and smoother animations
  - Better empty states with icon and helpful messaging
  - Modal transitions with smooth fade and scale animations
  - Consistent focus rings and hover states across all interactive elements
  - Refined analytics insight copy to be more actionable and specific
- **Pricing**:
  - Monthly: **$3.99/mo**
  - Annual: **$29.99/yr**
  - Lifetime: **$49.99**
- **Paywall Feature List**: Added Commitment Mode and Intention Page to the Pro feature highlights.

---

## [1.0.0] - 2026-04-11

### Added
- **Core Engine**: Manifest V3 `declarativeNetRequest` based domain blocking.
- **Friction Flow**: Interactive typing challenge (5 paragraphs) for unlocking sites.
- **Manual Override**: Configurable 10-15s delay fallback for quick access.
- **Scheduling**: Day/Time-based blocking windows.
- **Pro Features (V1 Architecture)**:
  - **Strict Mode**: Locks settings changes during active focus hours.
  - **Behavioral Friction**: Adds task intent logging and timed waits.
  - **Earn-Access**: Bonus minutes awarded for longer challenge sessions.
  - **Analytics**: 7-day dashboard tracking blocks, overrides, and strict session minutes.
  - **Weekly Report**: Automated discipline scoring and focus feedback.
- **UI Surfaces**:
  - Popup for quick domain blocking.
  - Options page with tabs for General, Analytics, and Reports.
  - Pricing screen for Pro subscription tiers.
- **Testing**: Integrated Vitest suite for background logic and UI helpers.

### Fixed
- Codebase audit performed; documentation updated to reflect current state vs. stubs.
- Storage normalization logic added to `background.js` to ensure consistent state on first boot.
- **Strict Mode Reliability**: Fixed an issue where Strict Mode failed to lock if no schedule was active. Strict mode now acts globally when enabled without a schedule.

### Security
- **Trusted-origin external messaging**: Pro activation is accepted only from `https://www.orlandoascanio.com` and `https://orlandoascanio.com`; all other external origins are rejected with an `Unauthorized sender` error.
- All user data (settings, analytics, blocklist, override state, work timer) stays in `chrome.storage.local` — never `chrome.storage.sync`, no cloud backend.
- No remote analytics or user-data network calls in core extension logic. Network traffic is limited to Sentry error telemetry (extension pages only) and the separate PayPal checkout flow on orlandoascanio.com.
- All data is isolated per browser profile (per `chrome.storage.local` semantics).

---

## Release History

**1.1.0** — Earn access, don't just block it. Behavioral science-backed features:
- Temptation Bundling (Free): Pair distracting sites with work requirements
- Focus Timer (Free): Work minutes automatically unlock bundled sites
- Commitment Mode (Pro): 1–24 hour total lockout — no escape, by design
- Intention Page: Personal goal reminder + 4-7-8 breathing exercise
- Pricing: $3.99/mo · $29.99/yr · $49.99 lifetime

**1.0.0** is the initial release with full Pro feature support:
- Core blocking engine with typing challenge friction
- Free & Pro tier split; Pro activates via PayPal checkout on orlandoascanio.com (no license keys, no expiration checks)
- Analytics dashboard and weekly discipline report (Pro only)
- All test suites passing (88.5% line coverage on `background.js`)
- Chrome Web Store submission
