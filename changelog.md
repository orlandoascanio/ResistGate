# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-03-13

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

### Security
- Verified all data stays in `chrome.storage.local`.
- No remote analytics or external network dependencies in core logic.
