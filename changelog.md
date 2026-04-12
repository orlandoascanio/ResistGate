# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

**1.0.0** is the stable release candidate with full Pro feature support:
- Core blocking engine with typing challenge friction
- Free & Pro tier split with license-based entitlement
- Analytics dashboard and weekly discipline report (Pro only)
- All test suites passing (81 tests, 88.5% coverage on `background.js`)
- Ready for Chrome Web Store submission
