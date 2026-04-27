# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-27

This release makes ResistGate feel less static and more usable day to day. It adds feedback links, tightens the Pro boundary, refreshes onboarding, and gives people a softer way to build discipline.

### Added (Free)
- **Feedback links**: A small `Help improve ResistGate` button now lives in the popup and options page. It opens a dedicated feedback survey that sends directly into the site dashboard, so improvements can come from real user input.
- **Graduated Challenges**: Free users can now pick the level of friction that fits the moment.
  - **Easy**: short character sequence
  - **Moderate**: one or two sentences
  - **Hard**: the original five-paragraph challenge

### Fixed
- **Pro settings access**: Fixed the bug that let free users reach Pro-only settings. The options page now keeps Pro controls behind entitlement.

### Changed
- **Welcome page redesign**: Reworked the onboarding/welcome experience so first-time users get a cleaner, less stale introduction to ResistGate.
- **Feedback flow**: The new survey writes into the feedback dashboard and records structured answers for easier review.

---

## [Unreleased]

### Changed
- **Earn Access UI**: Redesigned the temptation bundling configuration panel in the options page:
  - Removed AI-generated emoji from badges; badge now displays purely typographic status indicators
  - Removed dashed-border panel in favor of cleaner visual hierarchy with chevron expand/collapse indicator and `aria-expanded` accessibility support
  - Grouped condition type and time selectors in a 2-column row layout for tighter composition
  - Rewrote help text with benefit-driven copy ("Earn bonus access by completing longer challenges") and standardized terminology ("access condition", "Access after", "manual overrides")
  - Improved badge hover transitions and added `focus-visible` outline for keyboard accessibility
  - Badge-on colors now use design tokens (`--ok-bg`, `--ok`, `--ok-border`) instead of hard-coded green values

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
- Intention Page (Pro): Personal goal reminder + 4-7-8 breathing exercise
- Pricing: $3.99/mo · $29.99/yr · $49.99 lifetime

**1.0.0** is the initial release with full Pro feature support:
- Core blocking engine with typing challenge friction
- Free & Pro tier split; Pro activates via PayPal checkout on orlandoascanio.com (no license keys, no expiration checks)
- Analytics dashboard and weekly discipline report (Pro only)
- All test suites passing (88.5% line coverage on `background.js`)
- Chrome Web Store submission
