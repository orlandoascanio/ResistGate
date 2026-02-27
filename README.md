# ResistGate

ResistGate is a Chrome extension for intentional browsing.
It blocks distracting sites and requires a full-accuracy typing challenge before granting temporary access.

## Tagline

**You don’t unblock distractions. You earn access.**

## What it does

- Block domains you choose (for example, `youtube.com`, `reddit.com`).
- Redirect blocked visits to a friction page.
- Require 5 typing rounds with full accuracy to unlock.
- Grant time-limited access after completion.
- Re-block automatically when the access window expires.

## Current behavior

- Default temporary access window: **15 minutes**.
- Access window is configurable in **Options**.
- Challenge flow includes anti-shortcut controls (for example, paste disabled).

## Project structure

- `manifest.json` - Manifest V3 config and permissions.
- `background.js` - service worker for rules, storage, alarms, and unlock/re-block logic.
- `popup/` - quick add + blocked-site preview UI.
- `options/` - full settings and blocklist management.
- `friction-page/` - challenge UI and unlock flow.
- `icons/` - extension icons.

## Local development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Click **Reload** after code changes.

## Permissions (why)

- `declarativeNetRequest` - block/redirect configured domains.
- `storage` - save settings and temporary access locally.
- `alarms` - expire unlock windows and timed blocks reliably.
- `host_permissions: <all_urls>` - apply rules to user-selected domains.

## Privacy

- All data stays in `chrome.storage.local`.
- No remote servers, analytics, or tracking.
- No external network calls for extension functionality.

## Tech

- JavaScript
- HTML/CSS
- Chrome Extension APIs (Manifest V3)
