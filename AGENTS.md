# Repository Guidelines

## Project Structure & Module Organization
This is a Manifest V3 Chrome extension with flat, feature-based folders:
- `manifest.json`: extension entry point, permissions, and page wiring.
- `background.js`: service worker logic (rules, alarms, storage, access windows).
- `popup/`: quick actions UI (`popup.html`, `popup.css`, `popup.js`).
- `options/`: full settings UI (`options.html`, `options.css`, `options.js`).
- `friction-page/`: redirect challenge page shown for blocked sites.
- `icons/`: extension icon assets (`16x16`, `48x48`, `128x128`).

## Build, Test, and Development Commands
No build step is required; this repo runs as plain JS/HTML/CSS.
- `open -a "Google Chrome" chrome://extensions/`: open extension manager.
- Enable **Developer mode** and **Load unpacked** this folder.
- `git status`: verify only intended files changed.
- `git diff`: review functional changes before commit.

## Coding Style & Naming Conventions
- Use 2-space indentation in JS, JSON, and CSS.
- Prefer `const`/`let`; avoid `var`.
- Use camelCase for variables/functions (`loadBlockedSites`, `grantTemporaryAccess`).
- Keep folder/file naming consistent with existing pattern (`feature/feature.js`).
- Keep DOM IDs descriptive and kebab-case (for example, `new-blocked-site`).
- If formatting manually, keep object literals and callbacks readable and compact.

## Testing Guidelines
There is currently no automated test suite.
- Validate changes manually by reloading the unpacked extension after edits.
- Smoke test flows: add/remove blocked site, redirect to friction page, complete challenge, verify temporary access expiry.
- For bug fixes, include exact repro steps in PR notes.

## Commit & Pull Request Guidelines
Recent commits are short and task-focused; keep that pattern but make messages explicit.
- Prefer imperative, scoped commit messages (for example, `Improve blocking rule refresh logic`).
- Keep commits single-purpose; avoid mixing UI and background behavior unless required.
- PRs should include: summary, why the change is needed, manual test steps, and screenshots/GIFs for UI changes (`popup`, `options`, `friction-page`).
- Link related issues when applicable.

## Security & Configuration Tips
- Request only necessary permissions in `manifest.json`.
- Keep all data in `chrome.storage.local`; avoid external network dependencies unless intentionally introduced.
