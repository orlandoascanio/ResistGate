# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- **The install page on the website now shows the real product.** `orlandoascanio.com/resistgate/installed` (in
  the website repo) uses screenshots of the actual pause, challenge, timed access, toolbar popup, Weekly Review, and
  Commitment Mode. Its tour and level preview match the gate and challenge level the user will actually hit: the
  Intention Page for new installs, or the typing gate if they turned it off.
- **The local setup form shows the same screenshots.** `welcome/welcome.html` (opened from that page's **Add your
  first site** button) bundles them as WebP in `welcome/images/` (about 360KB). Picking Easy, Moderate, or Hard swaps
  in a screenshot of that exact challenge, and after saving, the test button names the site it opens.
- The "Pin the toolbar icon" step moved below setup. It now has an illustration of Chrome's extensions menu and a
  screenshot of the popup.

- Install, update, and feedback now open the final `www.orlandoascanio.com` URLs directly. Install and update
  went to the apex domain (a 307 redirect), and feedback went through `/en/` (a 308 redirect). All website URLs live
  in `RESISTGATE_WEBSITE_URLS`, and the README lists every page the extension opens on the website.

### Fixed
- **Intention Page progress counter wrapped onto three lines.** `.challenge-stats span` also matched the number spans
  inside the counter, so "0 / 55" stacked vertically. The rule now targets only the direct children.

## [2.0.0] - 2026-10-04

ResistGate is now free and open source. There is no paid tier, and the extension no longer makes network requests.

### Changed
- **Every Pro feature is free.** Strict Mode, Commitment Mode, override cooldowns, behavioral friction, earn-access,
  accountability presets, the custom challenge prompt and phrase, the Progress dashboard, and the Weekly Review work
  for everyone. Settings saved under the old Pro tier carry over unchanged.
- **Override cooldown now applies to every install.** Each manual override in a 6-hour window adds 10 seconds to the
  next wait (up to 90), and more than 3 locks manual override for 30 minutes. The typing challenge still works during
  a lock. Users who were on the Free tier will notice this for the first time; there is no setting to turn it off.
- **Local analytics are recorded for everyone**, so Progress and Weekly Review start filling in from the update onward.
- Install and update keep opening the pages on orlandoascanio.com from 1.5.0. A new minor or major version still opens
  the release notes; patch releases, downgrades, and same-version reloads stay quiet. The local What's New page stays removed.
- The options sidebar links to the source code in place of the plan comparison.

### Removed
- **Billing.** Paddle checkout, the pricing page hand-off, entitlement sync, the 6-hour sync alarm, the install
  credential, and the `activateProFromWebsite` / `getActivationState` external messages. The welcome site can still
  read onboarding status and open the local setup page. It cannot change settings.
- **Telemetry.** PostHog funnel events and Sentry crash reporting (including the bundled `vendor/` SDK and the
  `@sentry/browser` dependency). The extension-page CSP no longer allows any `connect-src`.
- **Leftover data.** On update, the `installation` storage key (device ID, install credential, verified entitlement,
  PostHog dedupe flags) is deleted, along with the legacy entitlement sync alarm and `settings.subscription`.
- The paywall modal, plan comparison modal, plan pill, Pro badges, and "Recheck access" control.

### Tests
- Billing mock and purchase handshake removed. Tests prove the extension makes no network requests across a full
  session, refuses the removed billing actions, and deletes billing and telemetry state left by earlier versions.
  232 tests; `background.js` at 92.6% lines, 82.5% branches.

---

## [1.5.0] - 2026-09-18

A settings page that saves itself, tells you what's wrong before it matters, and lets you take your setup with you. Plus a Weekly Review that tells you what to change, not just how you did, and a friction page that is easier to get through honestly and easier to walk away from.

### Changed
- **Settings save themselves.** The two full-width **Save Settings** buttons are gone. Every setting saves about half a second after you change it, and the header shows *Saving… / ✓ Saved*. Before, sites saved instantly while everything else waited for the button, with nothing to tell you which was which. Closing the tab with a change still pending flushes it first.
- **Schedule has a real on/off switch.** The schedule used to be turned on by *expanding* its panel, so collapsing it to tidy the page quietly switched blocking hours off. It now has a switch in the panel header, like Intention pause. Intention pause's duplicate "On" pill and "Enable this pause" checkbox were folded into the same switch.
- **Number fields show their units and limits.** Access window reads `min` and override pause reads `sec`, inside the field. A value outside the allowed range (say, a 30-second override pause on Free) is flagged under the field and not saved, instead of being silently changed to 15. Access window gets 5 / 10 / 15 / 30 presets, and Commitment Mode gets 1 / 2 / 4 / 8 h.
- **Messages you can actually see.** Confirmations and errors used to be added as plain text at the very bottom of the page, under the Save button. They now appear as a toast at the bottom of the window.
- **A quieter header.** *Help improve ResistGate* and *Rate ResistGate ⭐* moved to the sidebar, below your plan.
- **Report dates are readable.** "2026-07-22 to 2026-07-28" is now "Jul 22 – Jul 28, 2026" across Progress and Weekly Review.
- **Charts read as charts.** Top blocked domains lost the gradient fills and pill shapes for solid, rank-shaded bars; the override pattern chart gained a real baseline and narrower columns, with zero-override days shown as a flat tick.
- **Settings cards line up.** The General tab's cards now share a baseline per row instead of relying on fixed heights that drifted as content changed, and the blocklist no longer clips mid-row.
- **"Top distraction domains" was folded into "Where the gate holds".** The Weekly Review no longer shows the same domain ranking twice; the surviving section carries the attempt counts plus what happened at the gate.
- **Dropped the decorative quote glyph** behind the weekly feedback line.
- **The friction page, Intention Page, and welcome page were toned down.** Removed the decorative gradient washes, the graph-paper backdrop, the drenched hero panel with its numbered 01/02/03 ladder, the accent stripe on the challenge quote, and the uppercase letter-spaced labels; reduced display type to a size that suits an interruption. Read-only content is no longer boxed into cards nested inside cards.
- **Mistakes are marked in the text.** The part you have typed is dimmed, the next character is underlined, and a mismatch is marked in red.
- **The destination and your reason stay in view** while you type (*→ reddit.com · "Reply to the mod message"*).
- **Moderate mode is always two sentences**, instead of randomly one or two.
- **Screen readers no longer announce the character count on every keystroke**; they hear when each paragraph is done.
- **The "what's new" tab opens less often.** It now opens only for a new minor or major version, not for patch releases, and never when an extension is reloaded at the same version. It also tells the website which version you moved to, so the page can list every release you skipped.

### Added (Free)
- **Paste a list of sites.** The site box accepts several domains at once, separated by commas, spaces, or new lines (paste a column straight from a note). ResistGate says what it blocked, what was already blocked, and what it couldn't read, and leaves anything unreadable in the box so you can fix it.
- **Quick add.** One-click chips for common distractions (YouTube, Reddit, X, Instagram, TikTok, and more) that you haven't blocked yet. They disappear once your list is established.
- **Filter your blocklist.** Once you block more than eight sites, a filter box appears above the list.
- **Today, at a glance.** A strip at the top of General shows today's blocked attempts and the site that tried hardest. Free users see it too: the full Progress dashboard stays Pro, but you can see the gate is working.
- **Back up and restore your settings.** *Export settings* saves your blocklist, reminders, and settings to a JSON file. *Import settings* restores them after a reinstall or on another computer, after a confirmation that says what will be replaced. A backup never carries your plan or an active lock: importing can't grant Pro, and can't start or extend a Commitment Mode.
- **Choose how long you need: 5, 15, or 30 minutes.** A shorter window than your default gets a lighter challenge; a longer one costs more typing. Manual override is capped at your default window.
- **A way out on every step.** *Go back instead* on Prepare, *Actually, never mind* on the success screen (it closes access again), and *Not now, remind me in 10 min*, which reopens the site later. Every exit counts as a resisted visit.
- **A streak line:** *You've gone back 3 of the last 5 times today.*
- **Manual override can be cancelled** while it counts down.
- **Your resistance count shows on Prepare too**, for users without the Intention Page.
- **Keyboard shortcuts:** Enter runs each step's main action; Esc leaves.
- **The success screen repeats what you said you were there for**, and says *Time's up — close the tab?* when the window ends.

### Added (Pro)
- **Commitment Mode asks properly.** The browser's plain confirm box was replaced with ResistGate's own dialog. It shows exactly when the lock ends ("until 4:30 PM today") and asks you to type **LOCK** before it starts.
- **The Weekly Review now tells you what to change, not just how you did.** Two new sections replace the old "Weekly summary", which only restated the numbers already on the page:
  - **When the urges hit** — an hour-of-day histogram of your blocked attempts, naming your peak three-hour window and shading the hours your schedule already covers.
  - **Where the gate holds** — per-site hold rate: how many times you hit the gate on each site and how often it actually kept you out.
  - **Do this next** — one concrete setting change derived from the week (widen your schedule to cover the danger window, raise entry difficulty for a site that keeps getting through, or lengthen the override pause), applied with a single button.

### Fixed
- **An unsaved change could be wiped by an unrelated write.** Any settings write (adding a site, a background sync, another open tab) re-rendered the whole form from storage, so a challenge level you had just picked, but not yet saved, snapped back. The form now leaves a field alone while its change is still saving, and never rewrites the field you're typing in.
- **Unchecking every schedule day blocked on weekdays.** The page quietly substituted Mon–Fri for an empty day selection. It now says "Pick at least one day" and doesn't save until you do.
- **What's New told everyone they had just updated from 1.3.3.** The Options button hard-coded `?from=1.3.3`, which the update page reads as "you moved from version 1.3.3". It now opens the page without claiming an update.
- **A rising discipline score was flagged as a warning.** The "Trend vs last week" figure turned amber when the score went *up* and stayed neutral when it fell. Up is now green, down is amber.
- **The challenge progress bar showed 100% before you typed anything.** On single-segment challenges (Easy, Moderate, and custom phrases) the bar rendered full immediately; it is now shown only for multi-paragraph challenges, and tracks paragraphs actually completed.
- **Blocked sites were described by what they lacked.** Each entry read "No access condition · No reminder"; entries now list only the rules they actually have, or "Always blocked" when they have none.
- **The Progress Dashboard drew a divider under empty space.** The scoreboard's separator rule assumed content followed it inside the same card; it is now drawn only when something actually does.
- **The blocklist clipped its last row.** The list had a fixed 240px cap that cut an entry in half; it now fills the space its card has and reserves room for its scrollbar.
- **Errors during the challenge are visible.** The paste warning and the Earn-Access message were written to the Prepare screen, which is hidden while you type, so neither ever appeared.
- **Earn-Access no longer throws away finished work.** Finishing faster than the minimum challenge time used to reload the page after two seconds, losing every paragraph. The **Continue** button now counts down (*Unlocks in 0:34*) and waits.
- **Quit no longer inflates your counters.** It reloaded the page, which counted another blocked visit and restarted the breathing exercise. It now leaves the page. A failed access request stays on the page with an inline message instead of an alert and a reload.
- **The access-condition panel tells the truth.** It said "You can visit this site after 5:00 PM" while the challenge was still available; it now reads *Free access after 5:00 PM — or earn it now*. The time-of-day progress bar, which measured from midnight, is gone.
- **Paste blocking covers Cmd shortcuts and drag-and-drop.**
- **Per-site reminders match the right site.** `x.com` could match an unrelated site; a pattern now matches only its own host and subdomains.
- **Going back from a hand-off skips the Intention Page** instead of landing on it again.

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
