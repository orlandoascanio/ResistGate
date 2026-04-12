# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-12

### Added
- **Commitment Mode (Pro)**: Total lockout for 1–24 hours — no overrides, no challenge completions, no settings changes possible during the lock period. Auto-expires via Chrome alarm. New message actions: `activateCommitmentMode`, `getCommitmentModeStatus`, `deactivateCommitmentMode` (always refuses early deactivation). Applies globally across **all blocked sites**.
- **Commitment Page** (`commitment-page/`): Dedicated full-screen lockout page shown instead of the friction challenge when Commitment Mode is active. Displays a live countdown to expiry and a motivational lock screen.
- **Popup Commitment Mode Status**: Popup now shows a live countdown when Commitment Mode is active and exposes a one-click **Activate Commitment Mode** button (2-hour default) for Pro users.
- **Intention Page (Pro)**: Replaces the generic friction message with the user's personal goal (e.g., "Ship the MVP by Friday"). Includes an optional 4-7-8 breathing exercise animation to turn temptation into a mindfulness moment. Both features are configurable via simple toggles in the options page.
- **Sentry Error Monitoring**: Added `vendor/sentry.min.js` and `vendor/sentry-init.js`. All five extension pages (popup, options, welcome, friction-page, commitment-page) now initialize Sentry for real-time error reporting in production builds.
- **Feature Matrix Test Suite**: New `tests/feature-matrix.test.js` providing comprehensive integration coverage for Commitment Mode, Intention Page, and Pro-gating across all new message actions.

### Changed
- **Friction Page UI**: Visually separated the Intention/Pause zone from the typing challenge section for clearer layout hierarchy. The personal goal and breathing exercise are now grouped above a distinct challenge card.
- **Pricing**: Updated subscription tiers to improve conversion:
  - Monthly: $5.99/mo → **$3.99/mo**
  - Annual: $34.99/yr → **$29.99/yr**
  - Lifetime: $79 → **$49.99**
- **Paywall Feature List**: Added Commitment Mode and Intention Page to the Pro feature highlights on the pricing screen.

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
- **Pro Entitlement**: Replaced mock local storage upgrade with cryptographic JWT license validation (RS256) using Web Crypto API.
- Added 24-hour periodic entitlement refresh via `chrome.alarms` to detect expired or revoked licenses.
- License key input validation and secure storage in `chrome.storage.local`.
- Verified all data stays in `chrome.storage.local`.
- No remote analytics or external network dependencies in core logic.
- All user data isolated per browser profile (uses `chrome.storage.local`, not `sync`).

---

## Release History

**1.1.0** adds two flagship Pro differentiators, a dedicated lockout page, Sentry monitoring, and launch-friendly pricing:
- Commitment Mode: irrevocable global lockout across all blocked sites (1–24 h)
- Commitment Page: full-screen lockout UI with live countdown (replaces friction challenge)
- Popup status: live Commitment Mode countdown + quick-activate button
- Intention Page: personal goal display + optional 4-7-8 breathing animation
- Friction Page UI: pause zone visually separated from the typing challenge section
- Sentry error monitoring integrated across all extension pages
- Revised pricing: $3.99/mo · $29.99/yr · $49.99 lifetime

**1.0.0** is the stable release candidate with full Pro feature support:
- Core blocking engine with typing challenge friction
- Free & Pro tier split with license-based entitlement
- Analytics dashboard and weekly discipline report (Pro only)
- All test suites passing (81 tests, 88.5% coverage on `background.js`)
- Ready for Chrome Web Store submission
