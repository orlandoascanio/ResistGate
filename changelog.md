# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.1.0] - 2025-04-15

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
- **Pricing**:
  - Monthly: **$3.99/mo**
  - Annual: **$29.99/yr**
  - Lifetime: **$49.99**
- **Paywall Feature List**: Added Commitment Mode and Intention Page to the Pro feature highlights.

---

## [1.0.0] - 2025-04-11

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
- **Pro Entitlement**: Replaced mock local storage upgrade with cryptographic JWT license validation (RS256) using Web Crypto API.
- Added 24-hour periodic entitlement refresh via `chrome.alarms` to detect expired or revoked licenses.
- License key input validation and secure storage in `chrome.storage.local`.
- Verified all data stays in `chrome.storage.local`.
- No remote analytics or external network dependencies in core logic.
- All user data isolated per browser profile (uses `chrome.storage.local`, not `sync`).

---

## Release History

**1.1.0** — Earn access, don't just block it. Behavioral science-backed features:
- Temptation Bundling (Free): Pair distracting sites with work requirements
- Focus Timer (Free): Work minutes automatically unlock bundled sites
- Commitment Mode (Pro): 1–24 hour total lockout — no escape, by design
- Intention Page (Pro): Personal goal reminder + 4-7-8 breathing exercise
- Pricing: $3.99/mo · $29.99/yr · $49.99 lifetime

**1.0.0** is the stable release candidate with full Pro feature support:
- Core blocking engine with typing challenge friction
- Free & Pro tier split with license-based entitlement
- Analytics dashboard and weekly discipline report (Pro only)
- All test suites passing (81 tests, 88.5% coverage on `background.js`)
- Ready for Chrome Web Store submission
